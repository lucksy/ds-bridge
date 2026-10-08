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
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import {
	type AuditReport,
	auditContrast,
	type ContrastFinding,
	type ModeTokenMap,
} from "../engines/a11y/audit.js";
import type { ContrastLevel } from "../engines/a11y/contrast.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import { loadTokens } from "../io/load-tokens.js";
import { findTokenSource } from "../io/token-set.js";
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

/**
 * Read the token source (file or folder) and project it into one ModeTokenMap
 * per mode: Tokens Studio `$themes`, or a folder's per-mode files (Material's
 * `*.light.*` / `*.dark.*`). A source with no modes is one "default" mode.
 */
function loadModeMaps(
	tokenPath: string,
): { kind: "ok"; modes: ModeTokenMap[] } | RunError {
	const loaded = loadTokens(tokenPath);
	if (loaded.kind === "error") return loaded;
	// A mode the loader repaired or skipped is part of what this audit covers.
	for (const warning of loaded.warnings) {
		if (warning.startsWith("mode "))
			process.stderr.write(`warning: ${warning}\n`);
	}
	return {
		kind: "ok",
		modes: loaded.modes ?? [{ mode: DEFAULT_MODE, map: loaded.map }],
	};
}

/**
 * Resolve `[path]` to a token source. A file path is used directly; a
 * directory resolves to its token file, or its multi-file token folder.
 */
function resolveTokenPath(
	target: string,
): { kind: "ok"; path: string } | RunError {
	const abs = resolve(target);
	if (!existsSync(abs)) {
		return { kind: "error", message: `Path "${abs}" does not exist.` };
	}
	if (statSync(abs).isFile()) return { kind: "ok", path: abs };

	const discovered = findTokenSource(abs);
	if (discovered === undefined) {
		return {
			kind: "error",
			message:
				`No design-token source found under "${abs}".\n` +
				"Pass a token file or folder directly, or add a conventional token file (tokens.json, design-tokens.json, *.tokens.json).",
		};
	}
	return { kind: "ok", path: discovered };
}

/**
 * Modes whose colors are all the default mode's — Figma's responsive
 * `mobile` / `tablet` modes change sizes, not colors — audit nothing new, so
 * the default run leaves them out (with a note on stderr).
 */
function colorDistinctModes(all: ModeTokenMap[]): {
	modes: ModeTokenMap[];
	same: string[];
} {
	const [first, ...rest] = all;
	if (first === undefined) return { modes: all, same: [] };
	const colors = (m: ModeTokenMap): string =>
		JSON.stringify(
			m.map.tokens
				.filter((t) => t.type === "color")
				.map((t) => [t.name, t.value]),
		);
	const base = colors(first);
	const same = rest.filter((m) => colors(m) === base).map((m) => m.mode);
	return {
		modes: all.filter((m) => !same.includes(m.mode)),
		same,
	};
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
	// A default named for two mode axes (`sds-light/desktop`) answers to
	// either part: `--modes sds-light` selects it.
	const resolveName = (name: string): string | undefined =>
		available.has(name)
			? name
			: [...available].find((m) => m.split("/").includes(name));
	const unknown = requested.filter((m) => resolveName(m) === undefined);
	if (unknown.length > 0) {
		const list = [...available].sort().join(", ");
		return {
			kind: "error",
			message: `Unknown mode(s): ${unknown.join(", ")}. Available modes: ${list || "(none)"}.`,
		};
	}
	const keep = new Set(requested.map((m) => resolveName(m) ?? m));
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

	const tokenPath = resolveTokenPath(path);
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

	let modes = filtered.modes;
	if (options.modes === undefined || options.modes.trim() === "") {
		const distinct = colorDistinctModes(modes);
		modes = distinct.modes;
		if (distinct.same.length > 0) {
			process.stderr.write(
				`note: mode${distinct.same.length === 1 ? "" : "s"} ${distinct.same.join(", ")} not audited — same colors as ${modes[0]?.mode ?? "the default"}\n`,
			);
		}
	}
	const report = auditContrast(modes, { level });

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
