// H6 — `ds-bridge history stats|compact|migrate [path]` (SPEC-history-v2 §4,
// gap G4). Impure edge only: reads/rewrites <path>/.ds-bridge/history.jsonl.
// H12 — `history init [path]` (SPEC-history-v2 §8.3): the ONLY writer of a
// project's .gitattributes, and only when asked (adds the merge=union line).
// All judgement lives in the pure engines (src/engines/history/*).
//
// compact/migrate rewrite atomically (temp file + rename) while holding the
// history lock; a held lock is exit 2 (never a half-rewritten file). An absent
// history is not an error: stats prints zeros, compact/migrate have nothing to do.
//
// Exit codes: 0 ok · 2 bad flag / invalid project config / locked / write error.
import {
	appendFileSync,
	existsSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import { compactHistory } from "../engines/history/compact.js";
import {
	type ExportFilter,
	exportRows,
	resolveUntil,
	toCsv,
	toJsonl,
} from "../engines/history/export.js";
import {
	ensureUnionMerge,
	UNION_MERGE_LINE,
} from "../engines/history/gitattributes.js";
import { migrateHistory } from "../engines/history/migrate.js";
import {
	type FrameReadiness,
	readinessByFrame,
} from "../engines/history/readiness-frames.js";
import { historyStats } from "../engines/history/stats.js";
import { parseSince } from "../engines/report/digest.js";
import { replayHistory } from "../engines/report/history-lines.js";
import {
	acquireHistoryLock,
	historyFilePath,
	rewriteHistoryAtomic,
} from "../io/history-writer.js";
import { renderInstant } from "./report.js";

type HistoryFormat = "term" | "json";

interface BaseOptions {
	format: string;
}
interface RewriteOptions extends BaseOptions {
	dryRun: boolean;
}
interface CompactCliOptions extends RewriteOptions {
	keepPerDay: boolean;
}
interface ExportCliOptions {
	format: string;
	kind: string | undefined;
	since: string | undefined;
	until: string | undefined;
	out: string | undefined;
}

function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Validate --format and the project path; undefined after reporting a failure. */
function prepare(
	path: string,
	options: BaseOptions,
): { format: HistoryFormat; targetDir: string; stateDir: string } | undefined {
	const format = options.format as HistoryFormat;
	if (format !== "term" && format !== "json") {
		fail(`Unknown --format "${options.format}". Expected "term" or "json".`);
		return undefined;
	}
	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return undefined;
	}
	return { format, targetDir, stateDir: join(targetDir, ".ds-bridge") };
}

function readText(file: string): string | undefined {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
}

/** The configured readiness threshold (default when no/blank project config). */
function readinessThreshold(targetDir: string): number | undefined {
	const projectFileText = readText(join(targetDir, ".ds-bridge.json"));
	const resolved = resolveConfig({
		env: process.env,
		...(projectFileText !== undefined ? { projectFileText } : {}),
	});
	if (resolved.kind !== "ok") {
		fail(resolved.message);
		return undefined;
	}
	return resolved.config.readinessThreshold;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function runStats(path: string, options: BaseOptions): void {
	const ctx = prepare(path, options);
	if (ctx === undefined) return;
	const threshold = readinessThreshold(ctx.targetDir);
	if (threshold === undefined) return;

	const file = historyFilePath(ctx.stateDir);
	const text = readText(file);
	const bytes = text === undefined ? 0 : statSync(file).size;
	const stats = historyStats(text ?? "", bytes);
	const frames: FrameReadiness[] = readinessByFrame(
		replayHistory(text ?? ""),
		threshold,
	);
	const result = {
		path: file,
		exists: text !== undefined,
		...stats,
		readinessThreshold: threshold,
		readinessByFrame: frames,
	};

	if (ctx.format === "json") {
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		process.exitCode = 0;
		return;
	}
	const lines = [`History: ${file}`];
	if (!result.exists) {
		lines.push(
			"No history yet — run `ds-bridge record` (or any check) to start one.",
		);
	} else {
		lines.push(
			`${stats.records} records · ${formatBytes(bytes)} · v1 ${stats.v1} · v2 ${stats.v2}${stats.corrupt > 0 ? ` · ${stats.corrupt} unreadable` : ""}`,
			`Range: ${stats.firstAt ?? "—"} → ${stats.lastAt ?? "—"} · runs ${stats.runs}`,
		);
		const sources = Object.entries(stats.bySource)
			.map(([s, n]) => `${s} ${n}`)
			.join(" · ");
		if (sources !== "") lines.push(`Sources: ${sources}`);
		lines.push("", "By kind:");
		for (const [kind, n] of Object.entries(stats.byKind).sort()) {
			lines.push(`  ${kind.padEnd(16)} ${n}`);
		}
		if (frames.length > 0) {
			lines.push("", `Readiness by frame (pass ≥ ${threshold}):`);
			for (const f of frames) {
				lines.push(
					`  ${f.frameName || f.key}${f.fileKey !== undefined ? ` [${f.key}]` : ""}  latest ${f.latest} · ${f.runs} runs · pass ${f.passRate}%`,
				);
			}
		}
		if (stats.v1 > 0) {
			lines.push(
				"",
				"Tip: `ds-bridge history migrate` upgrades v1 lines to v2.",
			);
		}
	}
	process.stdout.write(`${lines.join("\n")}\n`);
	process.exitCode = 0;
}

/**
 * Shared rewrite flow for compact/migrate: read under the lock, transform, write
 * atomically unless --dry-run. Returns false after reporting a failure.
 */
function rewriteUnderLock(
	stateDir: string,
	dryRun: boolean,
	transform: (text: string) => { text: string },
): { ok: true; existed: boolean } | { ok: false } {
	const file = historyFilePath(stateDir);
	if (!existsSync(file)) return { ok: true, existed: false };
	const release = acquireHistoryLock(stateDir, { timeoutMs: 2000 });
	if (release === undefined) {
		fail(
			`History is locked (${file}.lock) — another ds-bridge run is writing. Retry, or remove a stale lock.`,
		);
		return { ok: false };
	}
	try {
		const text = readFileSync(file, "utf8");
		const next = transform(text);
		if (!dryRun && next.text !== text)
			rewriteHistoryAtomic(stateDir, next.text);
		return { ok: true, existed: true };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not rewrite ${file}: ${detail}`);
		return { ok: false };
	} finally {
		release();
	}
}

function runCompact(path: string, options: CompactCliOptions): void {
	const ctx = prepare(path, options);
	if (ctx === undefined) return;
	let counts = { before: 0, after: 0, removed: 0 };
	const outcome = rewriteUnderLock(ctx.stateDir, options.dryRun, (text) => {
		const result = compactHistory(text, { keepPerDay: options.keepPerDay });
		counts = {
			before: result.before,
			after: result.after,
			removed: result.removed,
		};
		return result;
	});
	if (!outcome.ok) return;
	const result = {
		path: historyFilePath(ctx.stateDir),
		...counts,
		keepPerDay: options.keepPerDay,
		dryRun: options.dryRun,
	};
	if (ctx.format === "json") {
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} else if (!outcome.existed) {
		process.stdout.write("No history to compact.\n");
	} else {
		const verb = options.dryRun ? "Would remove" : "Removed";
		process.stdout.write(
			`${verb} ${counts.removed} of ${counts.before} lines (${counts.after} kept) in ${result.path}\n`,
		);
	}
	process.exitCode = 0;
}

function runMigrate(path: string, options: RewriteOptions): void {
	const ctx = prepare(path, options);
	if (ctx === undefined) return;
	let counts = { migrated: 0, unchanged: 0 };
	const outcome = rewriteUnderLock(ctx.stateDir, options.dryRun, (text) => {
		const result = migrateHistory(text);
		counts = { migrated: result.migrated, unchanged: result.unchanged };
		return result;
	});
	if (!outcome.ok) return;
	const result = {
		path: historyFilePath(ctx.stateDir),
		...counts,
		dryRun: options.dryRun,
	};
	if (ctx.format === "json") {
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} else if (!outcome.existed) {
		process.stdout.write("No history to migrate.\n");
	} else {
		const verb = options.dryRun ? "Would migrate" : "Migrated";
		process.stdout.write(
			`${verb} ${counts.migrated} v1 records to v2 (${counts.unchanged} unchanged) in ${result.path}\n`,
		);
	}
	process.exitCode = 0;
}

function runInit(path: string, options: RewriteOptions): void {
	const ctx = prepare(path, options);
	if (ctx === undefined) return;
	const file = join(ctx.targetDir, ".gitattributes");
	// Not readText(): an unreadable existing file must never be treated as
	// absent and replaced (§8.3 — only append or create).
	let current: string | undefined;
	try {
		current = readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			const detail = error instanceof Error ? error.message : String(error);
			fail(`Could not read ${file}: ${detail}`);
			return;
		}
	}
	const next = ensureUnionMerge(current);
	if (next.changed && !options.dryRun) {
		try {
			if (current === undefined) {
				// Exclusive create: a file that appeared since the read is kept.
				writeFileSync(file, next.text, { encoding: "utf8", flag: "wx" });
			} else {
				// ensureUnionMerge only appends; write just the delta.
				appendFileSync(file, next.text.slice(current.length), "utf8");
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			fail(`Could not write ${file}: ${detail}`);
			return;
		}
	}
	const result = {
		path: file,
		line: UNION_MERGE_LINE,
		status: next.changed ? "added" : "present",
		dryRun: options.dryRun,
	};
	if (ctx.format === "json") {
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} else if (!next.changed) {
		process.stdout.write(`Already present in ${file}: ${UNION_MERGE_LINE}\n`);
	} else {
		const verb = options.dryRun ? "Would add" : "Added";
		process.stdout.write(`${verb} "${UNION_MERGE_LINE}" to ${file}\n`);
		if (!options.dryRun) {
			process.stdout.write(
				"Commit .gitattributes so history appends from different machines merge line-by-line instead of conflicting.\n",
			);
		}
	}
	process.exitCode = 0;
}

/** E2 — `history export`: tidy rows (SPEC-analytics-export §4). */
function runExport(path: string, options: ExportCliOptions): void {
	const format = options.format;
	if (format !== "csv" && format !== "jsonl") {
		fail(`Unknown --format "${format}". Expected "csv" or "jsonl".`);
		return;
	}
	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return;
	}
	const nowIso = renderInstant();
	const filter: ExportFilter = {};
	if (options.kind !== undefined) {
		filter.kinds = options.kind
			.split(",")
			.map((k) => k.trim())
			.filter((k) => k !== "");
	}
	if (options.since !== undefined) {
		const since = parseSince(options.since, nowIso);
		if (since.kind !== "ok") {
			fail(`Invalid --since "${options.since}". ${since.message}`);
			return;
		}
		filter.sinceMs = Date.parse(since.sinceIso);
	}
	if (options.until !== undefined) {
		const until = resolveUntil(options.until, nowIso);
		if (until.kind !== "ok") {
			fail(`Invalid --until "${options.until}". ${until.message}`);
			return;
		}
		filter.untilMs = until.untilMs;
		filter.untilExclusive = until.exclusive;
	}
	const text = readText(historyFilePath(join(targetDir, ".ds-bridge"))) ?? "";
	const rows = exportRows(text, filter);
	const output = format === "csv" ? toCsv(rows) : toJsonl(rows);
	if (options.out !== undefined) {
		const outPath = resolve(options.out);
		try {
			writeFileSync(outPath, output, "utf8");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			fail(`Could not write ${outPath}: ${detail}`);
			return;
		}
		process.stdout.write(`${outPath}\n`);
	} else {
		process.stdout.write(output);
	}
	process.exitCode = 0;
}

/** Register the `history` command group on the program. Wiring entry for cli.ts. */
export function registerHistoryCommand(program: Command): void {
	const history = program
		.command("history")
		.description(
			"Inspect, maintain and export .ds-bridge/history.jsonl (stats, compact, migrate, init, export)",
		);

	history
		.command("stats")
		.description(
			"Counts per kind, v1/v2 split, sources, runs, date range, size, per-frame readiness",
		)
		.argument("[path]", "project directory", ".")
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: BaseOptions) => {
			runStats(path, options);
		});

	history
		.command("compact")
		.description(
			"Drop identical consecutive same-kind records (latest kept); atomic, locked",
		)
		.argument("[path]", "project directory", ".")
		.option(
			"--keep-per-day",
			"also keep only the last record per kind per UTC day",
			false,
		)
		.option("--dry-run", "report what would change without writing", false)
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: CompactCliOptions) => {
			runCompact(path, options);
		});

	history
		.command("migrate")
		.description(
			'Rewrite v1 records as v2 (source "local", git null); atomic, locked, idempotent',
		)
		.argument("[path]", "project directory", ".")
		.option("--dry-run", "report what would change without writing", false)
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: RewriteOptions) => {
			runMigrate(path, options);
		});

	history
		.command("init")
		.description(
			"Opt-in: add `.ds-bridge/history.jsonl merge=union` to the project's .gitattributes (idempotent)",
		)
		.argument("[path]", "project directory", ".")
		.option("--dry-run", "report what would change without writing", false)
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: RewriteOptions) => {
			runInit(path, options);
		});

	history
		.command("export")
		.description(
			"Tidy rows for Sheets/Looker/BigQuery: one row per metric per record (at, date, runId, sha, branch, source, kind, subject, metric, value); subject names the frame for per-frame records, arrays keyed by mode/dir/componentName/name flatten as <path>.<id>.<leaf>",
		)
		.argument("[path]", "project directory", ".")
		.option("--format <format>", "output format: csv | jsonl", "csv")
		.option("--kind <kinds>", "comma-separated record kinds to keep")
		.option(
			"--since <when>",
			'keep records at or after: an ISO date "YYYY-MM-DD" or a relative "<N>d" / "<N>w"',
		)
		.option(
			"--until <when>",
			'keep records up to: an ISO date "YYYY-MM-DD" (whole day) or a relative "<N>d" / "<N>w"',
		)
		.option(
			"--out <file>",
			"write the export to a file (and print the path) instead of stdout",
		)
		.action((path: string, options: ExportCliOptions) => {
			runExport(path, options);
		});
}
