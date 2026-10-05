// T5.5 — `ds-bridge parity [component] [path]` command builder. Reads the saved
// .ds-bridge/registry.json, projects it through the pure parity engine, and
// reports the verdict (term table + summary bars · json · markdown), gating the
// exit code so CI fails on any non-ok component.
//
// Impure edge only: it reads the registry file and writes to stdout/stderr. All
// judgement is delegated to the pure parity engine; bad input becomes an exit
// code + actionable stderr, never a thrown stack trace.
//
// Exit codes:
//   0  every (filtered) row is ok
//   1  at least one non-ok row — CI gate
//   2  operational error (missing registry → "run registry build first", bad
//      path, invalid --format)
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import type { Command } from "commander";
import {
	buildParity,
	type ParityReport,
	type ParityRow,
} from "../engines/registry/parity.js";
import type { RegistryFile } from "../engines/registry/persist.js";
import { replayHistory } from "../engines/report/history-lines.js";
import type { ParityStatus } from "../engines/report/types.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import {
	renderBarChart,
	type Severity,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";

type ParityFormat = "json" | "term";

interface ParityOptions {
	format: string;
	markdown: boolean;
	/** Commander maps the negatable `--no-history` flag to `history: false`. */
	history: boolean;
}

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Strip every non-alphanumeric and lowercase: the normalized identity key. */
function normalizeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Map a parity status to a terminal severity for coloring. */
function statusSeverity(status: ParityStatus): Severity {
	switch (status) {
		case "ok":
			return "ok";
		case "prop-mismatch":
			return "warn";
		case "missing-in-code":
		case "missing-in-figma":
			return "error";
	}
}

/** Read + parse the saved registry, or undefined with an exit code already set. */
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
		fail(`Could not read registry "${registryPath}": ${detail}`);
		return undefined;
	}
	try {
		return JSON.parse(raw) as RegistryFile;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Registry "${registryPath}" is not valid JSON: ${detail}`);
		return undefined;
	}
}

/** Keep only rows whose normalized name contains the normalized filter. */
function filterRows(
	rows: ParityRow[],
	component: string | undefined,
): ParityRow[] {
	if (component === undefined || component === "") return rows;
	const needle = normalizeName(component);
	if (needle === "") return rows;
	return rows.filter((row) => normalizeName(row.component).includes(needle));
}

/** Recompute the summary over a (possibly filtered) row subset. */
function summarize(rows: ParityRow[]): ParityReport["summary"] {
	const summary = {
		ok: 0,
		missingInCode: 0,
		missingInFigma: 0,
		propMismatch: 0,
	};
	for (const row of rows) {
		switch (row.status) {
			case "ok":
				summary.ok += 1;
				break;
			case "missing-in-code":
				summary.missingInCode += 1;
				break;
			case "missing-in-figma":
				summary.missingInFigma += 1;
				break;
			case "prop-mismatch":
				summary.propMismatch += 1;
				break;
		}
	}
	return summary;
}

/** Render the severity-colored term table + summary bars. */
function renderTerm(report: ParityReport, color: boolean): string {
	if (report.rows.length === 0) {
		return "No components in the registry — nothing to compare.";
	}

	// A simple severity-colored list (status, component, detail), aligned by the
	// widest status label, so the worst rows lead and read at a glance.
	const statusWidth = Math.max(
		...report.rows.map((row) => row.status.length),
		"status".length,
	);
	const componentWidth = Math.max(
		...report.rows.map((row) => row.component.length),
		"component".length,
	);

	const lines: string[] = [];
	for (const row of report.rows) {
		const status = row.status.padEnd(statusWidth);
		const component = row.component.padEnd(componentWidth);
		const coloredStatus = severityColor(statusSeverity(row.status), status, {
			color,
		});
		lines.push(`${coloredStatus}  ${component}  ${row.detail}`);
	}

	const { summary } = report;
	const bars = renderBarChart(
		[
			{ label: "ok", value: summary.ok },
			{ label: "prop-mismatch", value: summary.propMismatch },
			{ label: "missing-in-code", value: summary.missingInCode },
			{ label: "missing-in-figma", value: summary.missingInFigma },
		],
		{ width: 24, color },
	);

	const total = report.rows.length;
	const allOk = total > 0 && summary.ok === total;
	const verdict = allOk
		? severityColor("ok", "All components in parity.", { color })
		: severityColor(
				"error",
				`${total - summary.ok} of ${total} component(s) out of parity.`,
				{ color },
			);

	return [...lines, "", "Summary:", bars, "", verdict].join("\n");
}

/** Escape a markdown table cell: pipes break the grid, newlines collapse rows. */
function mdCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Render a GitHub-flavored markdown table of the parity rows. */
function renderMarkdown(report: ParityReport): string {
	const header = "| Component | Status | Detail |";
	const separator = "| --- | --- | --- |";
	const rows = report.rows.map(
		(row) =>
			`| ${mdCell(row.component)} | ${mdCell(row.status)} | ${mdCell(row.detail)} |`,
	);
	const { summary } = report;
	const summaryLine = `_ok: ${summary.ok} · prop-mismatch: ${summary.propMismatch} · missing-in-code: ${summary.missingInCode} · missing-in-figma: ${summary.missingInFigma}_`;
	return [header, separator, ...rows, "", summaryLine].join("\n");
}

/** Does this directory hold a saved registry? */
function hasRegistry(candidate: string): boolean {
	return existsSync(
		join(resolvePath(candidate), ".ds-bridge", "registry.json"),
	);
}

/**
 * Disambiguate `[component] [path]`: both are optional, so a lone positional is
 * ambiguous. When `path` was left at its default and the supplied `component`
 * names a directory that holds a registry — while the cwd does not — treat it as
 * the path (the common `parity <dir>` call) and drop the filter. An explicit
 * second positional is always honored verbatim.
 */
function disambiguate(
	component: string | undefined,
	path: string,
): { component: string | undefined; path: string } {
	if (
		component !== undefined &&
		component !== "" &&
		path === "." &&
		!hasRegistry(".") &&
		hasRegistry(component)
	) {
		return { component: undefined, path: component };
	}
	return { component, path };
}

/**
 * Append ONE parity history line for this registry snapshot (H7, G5) — unless
 * the latest parity line already describes the same snapshot (`registry build`
 * stamps its line with the registry's `generatedAt`; ours carry `registryAt`).
 * One parity point per registry snapshot, never a double. Counts and the pass
 * `score` follow registry.ts's parityRecordFrom exactly. Fail-quiet: the report
 * already printed; a history hiccup must not change the gate.
 */
function appendParityHistory(
	targetDir: string,
	registry: RegistryFile,
	report: ParityReport,
): void {
	try {
		const stateDir = join(targetDir, ".ds-bridge");
		const snapshot =
			typeof registry.generatedAt === "string"
				? registry.generatedAt
				: undefined;
		let text = "";
		try {
			text = readFileSync(join(stateDir, "history.jsonl"), "utf8");
		} catch {
			text = "";
		}
		const latest = replayHistory(text)
			.filter((r) => r.kind === "parity")
			.at(-1);
		if (
			snapshot !== undefined &&
			latest !== undefined &&
			(latest.at === snapshot || latest.record.registryAt === snapshot)
		) {
			return;
		}
		const { ok, missingInCode, missingInFigma, propMismatch } = report.summary;
		const total = ok + missingInCode + missingInFigma + propMismatch;
		appendHistoryRecord(stateDir, {
			at: new Date().toISOString(),
			kind: "parity",
			total,
			ok,
			missingInCode,
			missingInFigma,
			propMismatch,
			score: total > 0 ? Math.round((100 * ok) / total) : 0,
			...(snapshot !== undefined ? { registryAt: snapshot } : {}),
		});
	} catch {
		// Non-fatal: the parity report itself is the command's product.
	}
}

/** Execute the `parity` command. */
function runParity(
	rawComponent: string | undefined,
	rawPath: string,
	options: ParityOptions,
): void {
	const format = options.format as ParityFormat;
	if (format !== "json" && format !== "term") {
		fail(`Unknown --format "${options.format}". Expected "json" or "term".`);
		return;
	}

	const { component, path } = disambiguate(rawComponent, rawPath);

	const targetDir = resolvePath(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return;
	}

	const registry = loadRegistry(targetDir);
	if (registry === undefined) return; // exit code + stderr already set

	const full = buildParity(registry);
	const rows = filterRows(full.rows, component);
	const report: ParityReport = { rows, summary: summarize(rows) };

	if (options.markdown) {
		process.stdout.write(`${renderMarkdown(report)}\n`);
	} else if (format === "json") {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		process.stdout.write(`${renderTerm(report, color)}\n`);
	}

	// H7 (SPEC-history-v2 §1.6): an UNFILTERED run records parity (a filtered
	// run is a partial view and must not enter the trend).
	if (options.history && (component === undefined || component === "")) {
		appendParityHistory(targetDir, registry, full);
	}

	// CI gate semantics: exit 1 when any (filtered) row is non-ok, else 0.
	const allOk = report.rows.every((row) => row.status === "ok");
	process.exitCode = allOk ? 0 : 1;
}

/** Register the `parity` command on the program. Wiring entry for cli.ts. */
export function registerParityCommand(program: Command): void {
	program
		.command("parity")
		.description(
			"Compare code components against the Figma library via the saved registry",
		)
		.argument("[component]", "filter rows by normalized name substring")
		.argument(
			"[path]",
			"project directory holding .ds-bridge/registry.json",
			".",
		)
		.option("--format <format>", "output format: term | json", "term")
		.option(
			"--markdown",
			"emit a GitHub-flavored markdown table to stdout",
			false,
		)
		.option(
			"--no-history",
			"do not append a parity record to .ds-bridge/history.jsonl (filtered runs never do)",
		)
		.action(
			(component: string | undefined, path: string, options: ParityOptions) => {
				runParity(component, path, options);
			},
		);
}
