// T7.3 — `ds-bridge a11y [path]` command builder. Token-level WCAG contrast
// audit over semantic color pairings across modes (SPEC §11.2).
//
// Impure edge only: it discovers/reads token files and writes to stdout/stderr.
// All judgement is delegated to the pure a11y engines (pairing + contrast);
// bad input becomes an exit code + actionable stderr, never a thrown stack.
//
// Exit codes (lint convention, SPEC §11.7):
//   0  every audited pair passes
//   1  at least one pair fails
//   2  operational error (bad path, no token source, unknown flag, bad modes)
//
// State: a DIRECTORY run appends one a11y line to .ds-bridge/history.jsonl for
// the dashboard (T7.22); a single-file run stays side-effect-free. HTML lives
// in `ds-bridge report`.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import {
	type AuditReport,
	auditContrast,
	type ContrastFinding,
	type ModeTokenMap,
} from "../engines/a11y/audit.js";
import type { ContrastLevel } from "../engines/a11y/contrast.js";
import { detectFormat } from "../engines/tokens/detect.js";
import { parseStyleDictionary } from "../engines/tokens/parse-style-dictionary.js";
import { parseTokensStudio } from "../engines/tokens/parse-tokens-studio.js";
import { parseW3c } from "../engines/tokens/parse-w3c.js";
import type {
	ParseOutcome,
	TokenSourceFormat,
} from "../engines/tokens/types.js";
import { discoverTokenSources } from "../io/discover-tokens.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import {
	renderTable,
	type Severity,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";

type A11yFormat = "json" | "term";

interface A11yOptions {
	modes: string | undefined;
	level: string;
	format: string;
}

const PARSERS: Record<TokenSourceFormat, (source: unknown) => ParseOutcome> = {
	w3c: parseW3c,
	"tokens-studio": parseTokensStudio,
	"style-dictionary": parseStyleDictionary,
};

/** The single mode name used for formats without explicit theme/modes. */
const DEFAULT_MODE = "default";

/** A typed operational failure, translated to exit code 2 at the edge. */
interface RunError {
	kind: "error";
	message: string;
}

function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A Tokens Studio theme as we read it for mode derivation. */
interface StudioTheme {
	name: string;
	selectedTokenSets: Record<string, string>;
}

/** Read the `$themes` array of a Tokens Studio document, or undefined. */
function readThemes(
	source: Record<string, unknown>,
): StudioTheme[] | undefined {
	const raw = source.$themes;
	if (!Array.isArray(raw)) return undefined;
	const themes: StudioTheme[] = [];
	for (const entry of raw) {
		if (!isPlainObject(entry)) continue;
		const name = entry.name;
		const sets = entry.selectedTokenSets;
		if (typeof name !== "string" || !isPlainObject(sets)) continue;
		const selected: Record<string, string> = {};
		for (const [setName, state] of Object.entries(sets)) {
			if (typeof state === "string") selected[setName] = state;
		}
		themes.push({ name, selectedTokenSets: selected });
	}
	return themes.length > 0 ? themes : undefined;
}

/**
 * Build the sub-document for one Tokens Studio theme: only its non-disabled
 * sets, in their declared order, so the per-mode parse sees mode-specific
 * values (set merging would otherwise collapse same-named tokens across modes).
 */
function themeSubDocument(
	source: Record<string, unknown>,
	theme: StudioTheme,
): Record<string, unknown> {
	const sets = Object.entries(theme.selectedTokenSets)
		.filter(([, state]) => state !== "disabled")
		.map(([setName]) => setName)
		.filter((setName) => isPlainObject(source[setName]));
	const doc: Record<string, unknown> = {};
	for (const setName of sets) doc[setName] = source[setName];
	doc.$metadata = { tokenSetOrder: sets };
	return doc;
}

/**
 * Read the token file and project it into one ModeTokenMap per mode. Tokens
 * Studio documents with `$themes` produce one mode per theme; every other shape
 * (and theme-less Tokens Studio) produces a single "default" mode.
 */
function loadModeMaps(
	tokenPath: string,
): { kind: "ok"; modes: ModeTokenMap[] } | RunError {
	let raw: string;
	try {
		raw = readFileSync(tokenPath, "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Could not read token source "${tokenPath}": ${detail}`,
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Token source "${tokenPath}" is not valid JSON: ${detail}`,
		};
	}

	const format = detectFormat(parsed);
	if (format === "unknown") {
		return {
			kind: "error",
			message: `Could not detect a supported token format for "${tokenPath}". Expected W3C, Tokens Studio, or Style Dictionary.`,
		};
	}

	const themes =
		format === "tokens-studio" && isPlainObject(parsed)
			? readThemes(parsed)
			: undefined;

	if (themes !== undefined && isPlainObject(parsed)) {
		const modes: ModeTokenMap[] = [];
		for (const theme of themes) {
			const outcome = parseTokensStudio(themeSubDocument(parsed, theme));
			if (outcome.kind === "error") {
				const lines = outcome.errors.map((e) => {
					const where = e.path !== undefined ? ` (${e.path})` : "";
					return `  ${e.code}${where}: ${e.message}`;
				});
				return {
					kind: "error",
					message: `Failed to parse mode "${theme.name}" of "${tokenPath}":\n${lines.join("\n")}`,
				};
			}
			modes.push({ mode: theme.name, map: outcome.map });
		}
		return { kind: "ok", modes };
	}

	const outcome = PARSERS[format](parsed);
	if (outcome.kind === "error") {
		const lines = outcome.errors.map((e) => {
			const where = e.path !== undefined ? ` (${e.path})` : "";
			return `  ${e.code}${where}: ${e.message}`;
		});
		return {
			kind: "error",
			message: `Failed to parse token source "${tokenPath}" as ${format}:\n${lines.join("\n")}`,
		};
	}
	return { kind: "ok", modes: [{ mode: DEFAULT_MODE, map: outcome.map }] };
}

/**
 * Resolve `[path]` to a single token file. A file path is used directly; a
 * directory is scanned for the shallowest conventional token source.
 */
async function resolveTokenPath(
	target: string,
): Promise<{ kind: "ok"; path: string } | RunError> {
	const abs = resolve(target);
	if (!existsSync(abs)) {
		return { kind: "error", message: `Path "${abs}" does not exist.` };
	}
	if (statSync(abs).isFile()) return { kind: "ok", path: abs };

	const discovered = await discoverTokenSources(abs);
	if (discovered.kind === "explicit-not-found") {
		return {
			kind: "error",
			message: `No token source found at "${discovered.path}".`,
		};
	}
	const first = discovered.sources[0];
	if (first === undefined) {
		return {
			kind: "error",
			message:
				`No design-token source found under "${abs}".\n` +
				"Pass a token file directly, or add a conventional token file (tokens.json, design-tokens.json, *.tokens.json).",
		};
	}
	return { kind: "ok", path: first.path };
}

/** Filter mode maps by the comma-separated `--modes` list, or an error. */
function filterModes(
	all: ModeTokenMap[],
	modesFlag: string | undefined,
): { kind: "ok"; modes: ModeTokenMap[] } | RunError {
	if (modesFlag === undefined || modesFlag.trim() === "") {
		return { kind: "ok", modes: all };
	}
	const requested = modesFlag
		.split(",")
		.map((m) => m.trim())
		.filter((m) => m.length > 0);
	const available = new Set(all.map((m) => m.mode));
	const unknown = requested.filter((m) => !available.has(m));
	if (unknown.length > 0) {
		const list = [...available].sort().join(", ");
		return {
			kind: "error",
			message: `Unknown mode(s): ${unknown.join(", ")}. Available modes: ${list || "(none)"}.`,
		};
	}
	const keep = new Set(requested);
	return { kind: "ok", modes: all.filter((m) => keep.has(m.mode)) };
}

/** A finding's status mapped to a terminal severity for coloring. */
function statusSeverity(status: ContrastFinding["status"]): Severity {
	switch (status) {
		case "pass":
			return "ok";
		case "fail":
			return "error";
		case "unparseable":
			return "warn";
	}
}

/** A short detail string for one finding's term row. */
function findingDetail(finding: ContrastFinding): string {
	if (finding.status === "unparseable") {
		return `${finding.foregroundValue} on ${finding.backgroundValue} — unparseable`;
	}
	const ratio = finding.ratio !== undefined ? finding.ratio.toFixed(2) : "?";
	const base = `${ratio}:1 (need ${finding.required}:1) — ${finding.foregroundValue} on ${finding.backgroundValue}`;
	if (finding.suggestion?.kind === "adjusted") {
		return `${base} → try ${finding.suggestion.value}`;
	}
	if (finding.suggestion?.kind === "none") {
		return `${base} → no lightness-only fix`;
	}
	return base;
}

/** Render the severity-colored term table + summary verdict. */
function renderTerm(report: AuditReport, color: boolean): string {
	if (report.findings.length === 0) {
		return "No semantic color pairings found — nothing to audit.";
	}

	const rows = report.findings.map((finding) => {
		const status = severityColor(
			statusSeverity(finding.status),
			finding.status,
			{ color },
		);
		const pair = `${finding.foreground} / ${finding.background}`;
		return [finding.mode, status, pair, findingDetail(finding)];
	});
	const table = renderTable(["mode", "status", "pair", "detail"], rows, {
		color,
	});

	const { summary } = report;
	const verdict =
		summary.failed === 0 && summary.unparseable === 0
			? severityColor(
					"ok",
					`All ${summary.passed} pair(s) meet ${report.level} contrast.`,
					{ color },
				)
			: severityColor(
					"error",
					`${summary.failed} of ${summary.total} pair(s) fail ${report.level} contrast` +
						(summary.unparseable > 0
							? ` (${summary.unparseable} unparseable).`
							: "."),
					{ color },
				);

	return [table, "", verdict].join("\n");
}

/** Execute the `a11y` command. */
/**
 * One appended a11y history record (read back by `report` for the contrast
 * section — T7.22). Mirrors the lint/tokens-check append pattern.
 */
interface A11yHistoryRecord {
	at: string;
	kind: "a11y";
	level: ContrastLevel;
	modes: { mode: string; passed: number; failed: number }[];
}

/**
 * Tally findings into per-mode pass/fail counts. Unparseable findings are data
 * problems (surfaced by the CLI), not contrast failures — they are excluded.
 * Mode order follows first appearance in the report (already deterministic).
 */
function modeTallies(report: AuditReport): A11yHistoryRecord["modes"] {
	const byMode = new Map<
		string,
		{ mode: string; passed: number; failed: number }
	>();
	for (const finding of report.findings) {
		let tally = byMode.get(finding.mode);
		if (tally === undefined) {
			tally = { mode: finding.mode, passed: 0, failed: 0 };
			byMode.set(finding.mode, tally);
		}
		if (finding.status === "pass") tally.passed += 1;
		else if (finding.status === "fail") tally.failed += 1;
	}
	return [...byMode.values()];
}

/**
 * Append ONE a11y history line to <targetDir>/.ds-bridge/history.jsonl.
 *
 * Only called for a DIRECTORY target (a project-level audit) — a single-file
 * run stays side-effect-free so ad-hoc file checks never pollute a project's
 * history (mirrors lint's directory-only append rule).
 */
function appendA11yHistory(targetDir: string, report: AuditReport): void {
	const stateDir = join(targetDir, ".ds-bridge");
	const record: A11yHistoryRecord = {
		at: new Date().toISOString(),
		kind: "a11y",
		level: report.level,
		modes: modeTallies(report),
	};
	appendHistoryRecord(stateDir, record);
}

async function runA11y(path: string, options: A11yOptions): Promise<void> {
	const format = options.format as A11yFormat;
	if (format !== "json" && format !== "term") {
		fail(`Unknown --format "${options.format}". Expected "term" or "json".`);
		return;
	}

	const level = options.level as ContrastLevel;
	if (level !== "AA" && level !== "AAA") {
		fail(`Unknown --level "${options.level}". Expected "AA" or "AAA".`);
		return;
	}

	const tokenPath = await resolveTokenPath(path);
	if (tokenPath.kind === "error") {
		fail(tokenPath.message);
		return;
	}

	const loaded = loadModeMaps(tokenPath.path);
	if (loaded.kind === "error") {
		fail(loaded.message);
		return;
	}

	const filtered = filterModes(loaded.modes, options.modes);
	if (filtered.kind === "error") {
		fail(filtered.message);
		return;
	}

	const report = auditContrast(filtered.modes, { level });

	// History only for a directory target (project-level audit) — T7.22.
	const resolvedTarget = resolve(path);
	if (existsSync(resolvedTarget) && statSync(resolvedTarget).isDirectory()) {
		appendA11yHistory(resolvedTarget, report);
	}

	if (format === "json") {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		process.stdout.write(`${renderTerm(report, color)}\n`);
	}

	// Exit 1 when any pair fails or is unparseable; else 0.
	const clean = report.summary.failed === 0 && report.summary.unparseable === 0;
	process.exitCode = clean ? 0 : 1;
}

/** Register the `a11y` command on the program. Wiring entry for cli.ts. */
export function registerA11yCommand(program: Command): void {
	program
		.command("a11y")
		.description(
			"Audit token-level WCAG contrast over semantic color pairings across modes",
		)
		.argument(
			"[path]",
			"token file, or a directory to discover a token source in",
			".",
		)
		.option("--modes <modes>", "comma-separated modes to audit (default: all)")
		.option("--level <level>", "WCAG conformance level: AA | AAA", "AA")
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: A11yOptions) => {
			void runA11y(path, options);
		});
}
