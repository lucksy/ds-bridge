// T3.6 — `ds-bridge report [path]` command builder.
// Impure edge: reads <path>/.ds-bridge/history.jsonl, aggregates it into the
// pure ReportData model, drives the pure HTML dashboard renderer, then writes
// the result and (optionally) spawns a platform opener. The renderer never
// touches the clock/fs/network; the single fresh `generatedAt` ISO timestamp is
// read here, at the io edge, so the rendered document is otherwise reproducible.
//
// Missing/empty history is NOT an error — it renders an empty-state dashboard
// and exits 0. Corrupted JSONL lines are skipped with one stderr warning each
// and never fatal. Unknown record kinds are skipped silently (forward compat).
//
// Exit codes: 0 success (even with no data) · 2 operational error (path not a
// directory, unwritable --out).
import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { platform } from "node:process";
import type { Command } from "commander";
import type { DriftTrendPoint, LintSummary } from "../engines/report/types.js";
import { renderDashboard } from "../render/html/dashboard.js";

/** A typed operational failure, translated to exit code 2 + stderr at the edge. */
interface ReportError {
	kind: "error";
	message: string;
}

/**
 * One `tokens-check` history record (the T3.5 line shape). Read defensively as
 * a partial because the file is user/forward-version writable.
 */
interface TokensCheckRecord {
	at: string;
	kind: "tokens-check";
	stale: number;
	missing: number;
	orphan: number;
	inSync: boolean;
}

/** One `lint` history record carrying the by-kind violation counts. */
interface LintRecord {
	at: string;
	kind: "lint";
	byKind: {
		exact: number;
		near: number;
		offSystem: number;
	};
}

/** Aggregated, render-ready sections derived from the history log. */
interface Aggregation {
	driftTrend: DriftTrendPoint[];
	lintSummary: LintSummary | undefined;
}

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Read + aggregate <stateDir>/history.jsonl into render-ready sections.
 *
 * Missing/empty file → empty aggregation (caller still renders an empty state).
 * Each corrupted (non-JSON) line is skipped and reported via `onWarning`.
 * Unknown `kind` values are skipped silently for forward compatibility.
 */
function aggregateHistory(
	stateDir: string,
	onWarning: (message: string) => void,
): Aggregation {
	const historyPath = join(stateDir, "history.jsonl");
	let text: string;
	try {
		text = readFileSync(historyPath, "utf8");
	} catch {
		return { driftTrend: [], lintSummary: undefined };
	}

	const driftTrend: DriftTrendPoint[] = [];
	let lint: LintSummary | undefined;

	const lines = text.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const trimmed = (lines[index] ?? "").trim();
		if (trimmed === "") continue;

		let record: { kind?: unknown; at?: unknown } & Record<string, unknown>;
		try {
			record = JSON.parse(trimmed) as typeof record;
		} catch {
			onWarning(
				`warning: skipping corrupted history line ${index + 1} in ${historyPath}`,
			);
			continue;
		}

		if (record.kind === "tokens-check") {
			const r = record as Partial<TokensCheckRecord>;
			const date = typeof r.at === "string" ? r.at.slice(0, 10) : "";
			driftTrend.push({
				date,
				breaking: asNumber(r.stale),
				additive: asNumber(r.missing),
				cosmetic: asNumber(r.orphan),
			});
			continue;
		}

		if (record.kind === "lint") {
			const r = record as Partial<LintRecord>;
			const byKind = r.byKind ?? { exact: 0, near: 0, offSystem: 0 };
			// Last lint record wins — it reflects the most recent run.
			lint = {
				byKind: {
					exact: asNumber(byKind.exact),
					near: asNumber(byKind.near),
					offSystem: asNumber(byKind.offSystem),
				},
				topOffenders: [],
			};
		}

		// Unknown kinds (including missing kind) are skipped silently.
	}

	return { driftTrend, lintSummary: lint };
}

/** Render the dashboard and write it to `outPath`, or fail with exit code 2. */
function writeDashboard(
	outPath: string,
	html: string,
): { kind: "ok" } | ReportError {
	try {
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, html, "utf8");
		return { kind: "ok" };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Could not write report to "${outPath}": ${detail}`,
		};
	}
}

/** The opener command: DS_BRIDGE_OPEN_CMD override, else the platform default. */
function openerCommand(env: NodeJS.ProcessEnv): string {
	const override = env.DS_BRIDGE_OPEN_CMD;
	if (override !== undefined && override.trim() !== "") return override;
	return platform === "darwin" ? "open" : "xdg-open";
}

/**
 * Spawn the opener for `filePath`. Failure is non-fatal: the report already
 * exists on disk, so a missing opener only earns a stderr warning.
 */
function openReport(filePath: string, env: NodeJS.ProcessEnv): void {
	const command = openerCommand(env);
	try {
		const child = spawn(command, [filePath], {
			stdio: "ignore",
			detached: false,
		});
		child.on("error", (error) => {
			process.stderr.write(
				`warning: could not open report with "${command}": ${error.message}\n`,
			);
		});
		child.unref();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`warning: could not open report with "${command}": ${detail}\n`,
		);
	}
}

interface ReportOptions {
	open: boolean;
	out: string | undefined;
}

function failReport(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Execute the `report` command. Exit codes: 0 success · 2 operational error. */
function runReport(path: string, options: ReportOptions): void {
	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		failReport(`Path "${targetDir}" is not a directory.`);
		return;
	}

	const stateDir = join(targetDir, ".ds-bridge");
	const aggregation = aggregateHistory(stateDir, (message) => {
		process.stderr.write(`${message}\n`);
	});

	// The single io-edge clock read — the renderer is otherwise pure.
	// `lintSummary` is only set when present so `exactOptionalPropertyTypes`
	// keeps an absent section a genuine "not provided" rather than `undefined`.
	const generatedAt = new Date().toISOString();
	const html = renderDashboard({
		generatedAt,
		project: basename(targetDir),
		driftTrend: aggregation.driftTrend,
		...(aggregation.lintSummary !== undefined
			? { lintSummary: aggregation.lintSummary }
			: {}),
	});

	const outPath =
		options.out !== undefined
			? resolve(options.out)
			: join(stateDir, "reports", "dashboard.html");

	const written = writeDashboard(outPath, html);
	if (written.kind === "error") {
		failReport(written.message);
		return;
	}

	process.stdout.write(`${outPath}\n`);

	if (options.open) {
		openReport(outPath, process.env);
	}

	process.exitCode = 0;
}

/** Register the `report` command on the program. Wiring entry for cli.ts. */
export function registerReportCommand(program: Command): void {
	program
		.command("report")
		.description("Render an offline HTML dashboard from the project history")
		.argument("[path]", "project directory to report on", ".")
		.option(
			"--out <file>",
			"output file (default <path>/.ds-bridge/reports/dashboard.html)",
		)
		.option(
			"--open",
			'open the report after writing (override the opener with the DS_BRIDGE_OPEN_CMD env var; defaults to "open" on macOS, "xdg-open" elsewhere)',
			false,
		)
		.action((path: string, options: ReportOptions) => {
			runReport(path, options);
		});
}
