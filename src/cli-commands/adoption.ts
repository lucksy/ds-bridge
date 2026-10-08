// A3b — `ds-bridge adoption [path]` command. Owner-facing import-coverage
// report: read the saved registry, scan the project for resolved import sites,
// and answer "of every CODE component the registry knows, how many does the
// project actually import?".
//
// Impure edge only: reads <path>/.ds-bridge/registry.json, lazy-ts-morph-scans
// the project for import sites, writes to stdout/stderr, and appends one
// `adoption` history line for the dashboard (T7.22). All judgement is delegated
// to the pure engines (mapCodeUsage + computeCoverage); bad input becomes an exit
// code + actionable stderr, never a thrown stack trace.
//
// HONEST SCOPE (mirrors the css/scss ratio note in SPEC §1 and the coverage
// engine's doc comment): mapCodeUsage scans resolved `.ts`/`.tsx` imports,
// following barrel re-exports; `.js`/`.jsx` and dynamic imports are not seen,
// so coverage is a floor. The term output surfaces this caveat.
//
// Exit codes (lint convention, SPEC §11.7):
//   0  success (coverage gaps are informational, not a failure)
//   2  operational error (bad path, missing/corrupt registry, unknown flag)
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import type { CodeUsage } from "../engines/impact/usage.js";
import type { CoverageResult } from "../engines/registry/coverage.js";
import { computeCoverage } from "../engines/registry/coverage.js";
import type { RegistryFile } from "../engines/registry/persist.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import {
	renderBarChart,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";

type AdoptionFormat = "json" | "term";

interface AdoptionOptions {
	format: string;
}

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/**
 * Read + parse the saved registry, or undefined with an exit code already set.
 * A missing OR corrupt registry both point the user at `ds-bridge registry
 * build` (mirrors registry.ts's loadRegistry guidance).
 */
function loadRegistry(targetDir: string): RegistryFile | undefined {
	const registryPath = join(targetDir, ".ds-bridge", "registry.json");
	if (!existsSync(registryPath)) {
		fail(
			`No registry found at "${registryPath}". Run "ds-bridge registry build" first.`,
		);
		return undefined;
	}
	let raw: string;
	try {
		raw = readFileSync(registryPath, "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(
			`Could not read registry "${registryPath}": ${detail}. Run "ds-bridge registry build" first.`,
		);
		return undefined;
	}
	try {
		return JSON.parse(raw) as RegistryFile;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(
			`Registry "${registryPath}" is not valid JSON: ${detail}. Run "ds-bridge registry build" first.`,
		);
		return undefined;
	}
}

/**
 * Scan the project for import sites of every registry code component. Deferred
 * import: ts-morph references the CJS globals `__filename`/`__dirname` during its
 * eager module init that the single-file ESM bundle leaves undefined, so we
 * backfill them (mirrors impact.ts) and only load the usage chunk on this path —
 * ts-morph stays out of cli.mjs. computeCoverage then joins by codeName.
 */
async function scanUsage(
	registry: RegistryFile,
	projectDir: string,
): Promise<CodeUsage[]> {
	const globals = globalThis as Record<string, unknown>;
	if (typeof globals.__filename !== "string") {
		const filename = fileURLToPath(import.meta.url);
		globals.__filename = filename;
		globals.__dirname = dirname(filename);
	}
	const { mapCodeUsage } = await import("../engines/impact/usage.js");
	return mapCodeUsage({ registry, projectDir });
}

/**
 * One appended adoption history record (read back by `report` for the
 * import-coverage section — wave-B). Mirrors the a11y/impact append idiom.
 */
interface AdoptionHistoryRecord {
	at: string;
	kind: "adoption";
	imported: number;
	total: number;
	uncovered: string[];
}

/** Append ONE adoption history line to <targetDir>/.ds-bridge/history.jsonl. */
function appendAdoptionHistory(
	targetDir: string,
	coverage: CoverageResult,
): void {
	const stateDir = join(targetDir, ".ds-bridge");
	const record: AdoptionHistoryRecord = {
		at: new Date().toISOString(),
		kind: "adoption",
		imported: coverage.imported,
		total: coverage.total,
		uncovered: coverage.uncovered,
	};
	appendHistoryRecord(stateDir, record);
}

/** Render the human-readable term report: a donut-ish summary line + bar + gaps. */
function renderTerm(coverage: CoverageResult, color: boolean): string {
	const { imported, total, uncovered, uncoveredTotal } = coverage;
	const pct = total > 0 ? Math.round((imported / total) * 100) : 0;
	const clean = uncoveredTotal === 0;

	const summary = severityColor(
		clean ? "ok" : "warn",
		`Import coverage: ${imported}/${total} registry components imported (${pct}%).`,
		{ color },
	);

	const lines = [summary];
	if (coverage.icons !== undefined) {
		lines.push(
			`Icons (counted apart): ${coverage.icons.imported}/${coverage.icons.total} imported.`,
		);
	}

	if (total > 0) {
		// A donut-ish proportional bar over imported vs not-yet-imported.
		lines.push(
			"",
			renderBarChart(
				[
					{ label: "imported", value: imported },
					{ label: "uncovered", value: uncoveredTotal },
				],
				{ width: 24, color },
			),
		);
	}

	if (uncovered.length > 0) {
		lines.push("", "Not yet imported:");
		for (const name of uncovered) lines.push(`  · ${name}`);
		if (uncoveredTotal > uncovered.length) {
			lines.push(`  … and ${uncoveredTotal - uncovered.length} more`);
		}
	}

	// Honest-scope caveat (SPEC §1 / coverage engine doc comment).
	lines.push(
		"",
		"Note: coverage counts resolved .ts/.tsx imports (barrels followed) —",
		".js/.jsx and dynamic imports are not seen, so this is a floor.",
	);

	return lines.join("\n");
}

/** Execute the `adoption` command. */
async function runAdoption(
	path: string,
	options: AdoptionOptions,
): Promise<void> {
	const format = options.format as AdoptionFormat;
	if (format !== "json" && format !== "term") {
		fail(`Unknown --format "${options.format}". Expected "term" or "json".`);
		return;
	}

	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return;
	}

	const registry = loadRegistry(targetDir);
	if (registry === undefined) return; // exit code + stderr already set

	const usage = await scanUsage(registry, targetDir);
	const coverage = computeCoverage(registry, usage);

	if (format === "json") {
		process.stdout.write(`${JSON.stringify(coverage, null, 2)}\n`);
	} else {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		process.stdout.write(`${renderTerm(coverage, color)}\n`);
	}

	// History line for the dashboard (always, for a directory run) — wave-B.
	appendAdoptionHistory(targetDir, coverage);

	// Coverage gaps are informational — the command itself succeeded.
	process.exitCode = 0;
}

/** Register the `adoption` command on the program. Wiring entry for cli.ts. */
export function registerAdoptionCommand(program: Command): void {
	program
		.command("adoption")
		.description(
			"Report which registry components the project's code actually imports",
		)
		.argument(
			"[path]",
			"project directory holding .ds-bridge/registry.json",
			".",
		)
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: AdoptionOptions) => {
			void runAdoption(path, options);
		});
}
