// T5.5 — parity engine. PURE: no fs/network/process; deterministic; NEVER
// throws. It projects the saved RegistryFile (the matcher's persisted output)
// into a flat, severity-sorted parity report the CLI prints and the dashboard
// renders, plus an aggregate summary count.
//
// ── Status rules (mirrors tests/engines/registry/parity.test.ts) ──
//
//   matched, score >= OK_THRESHOLD (0.85)        -> "ok"
//   matched, MATCH_THRESHOLD (0.6) <= score <    -> "prop-mismatch"
//     OK_THRESHOLD                                  (detail: low shape agreement)
//   unmatchedFigma (no code component)           -> "missing-in-code"
//                                                    (detail names top candidate;
//                                                    deprecated names get no row)
//   unmatchedCode  (no figma component)          -> "missing-in-figma"
//
// Compound parts: an unmatched code component exported from the SAME file as
// another code component whose name it extends (`CardHeader` beside `Card`,
// `DialogContent` beside `Dialog`) is a part of that component, not a component
// of its own — it gets no row; its parent's row lists it under "Parts:".
//
// Component name: matches use the code name; unmatchedFigma the figma name;
// unmatchedCode the code name. Rows sort by status SEVERITY then name asc.
import { DEFAULT_DEPRECATED_PATTERN } from "../figma/library-health.js";
import type { ParityStatus } from "../report/types.js";
import { codeExports, compoundParent } from "./parts.js";
import type { RegistryFile } from "./persist.js";

/** One component's parity verdict against its Figma source. */
export interface ParityRow {
	component: string;
	status: ParityStatus;
	/** Human-readable explanation of the verdict (and the gap, when relevant). */
	detail: string;
}

/** Aggregate counts across all parity rows, one per status. */
export interface ParitySummary {
	ok: number;
	missingInCode: number;
	missingInFigma: number;
	propMismatch: number;
}

/** The full parity report: severity-sorted rows plus the aggregate summary. */
export interface ParityReport {
	rows: ParityRow[];
	summary: ParitySummary;
}

/** The dashboard's Parity section shape (see report/types.ts `Parity`). */
export interface ParitySection {
	columns: string[];
	rows: { component: string; cells: { status: ParityStatus }[] }[];
}

// ── Thresholds (kept in step with the matcher's MATCH_THRESHOLD) ──

/** Below this a match is reported as a prop-mismatch rather than ok. */
const OK_THRESHOLD = 0.85;

// ── Ordering: status severity (worst first) then name ascending ──

const SEVERITY_ORDER: Record<ParityStatus, number> = {
	"missing-in-code": 0,
	"missing-in-figma": 1,
	"prop-mismatch": 2,
	ok: 3,
};

function byNameAsc(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Round a score to 3dp for display so float fuzz never leaks into details. */
function show(score: number): string {
	if (!Number.isFinite(score)) return "0";
	return String(Math.round(score * 1000) / 1000);
}

/**
 * Project a saved {@link RegistryFile} into a severity-sorted parity report.
 *
 * Defensive: a malformed registry (missing arrays) degrades to empty buckets
 * rather than throwing — the engine operates on already-validated persistence,
 * but never trusts its input enough to crash a CLI run.
 */
export function buildParity(registry: RegistryFile): ParityReport {
	const matches = Array.isArray(registry?.matches) ? registry.matches : [];
	const unmatchedCode = Array.isArray(registry?.unmatchedCode)
		? registry.unmatchedCode
		: [];
	const unmatchedFigma = Array.isArray(registry?.unmatchedFigma)
		? registry.unmatchedFigma
		: [];

	// Compound parts, keyed by `${importPath}\u0000${parentName}`.
	const codeSide = codeExports(registry);
	const parentOf = (name: string, importPath: string): string | undefined =>
		compoundParent({ name, importPath }, codeSide);
	const partsByParent = new Map<string, string[]>();
	const isPart = new Set<string>();
	for (const entry of unmatchedCode) {
		const parent = parentOf(entry.name, entry.importPath);
		if (parent === undefined) continue;
		const key = `${entry.importPath}\u0000${parent}`;
		partsByParent.set(key, [...(partsByParent.get(key) ?? []), entry.name]);
		isPart.add(`${entry.importPath}\u0000${entry.name}`);
	}
	const withParts = (detail: string, name: string, importPath: string) => {
		const parts = partsByParent.get(`${importPath}\u0000${name}`);
		return parts === undefined
			? detail
			: `${detail} Parts: ${[...parts].sort(byNameAsc).join(", ")}.`;
	};

	const rows: ParityRow[] = [];

	for (const match of matches) {
		const score = typeof match.score === "number" ? match.score : 0;
		if (score >= OK_THRESHOLD) {
			rows.push({
				component: match.codeName,
				status: "ok",
				detail: withParts(
					`Matched ${match.figmaName} (${match.nodeId}) @ ${show(score)}.`,
					match.codeName,
					match.importPath,
				),
			});
		} else {
			rows.push({
				component: match.codeName,
				status: "prop-mismatch",
				detail: withParts(
					`Matched ${match.figmaName} (${match.nodeId}) @ ${show(score)} — low shape agreement; props/variants likely diverge.`,
					match.codeName,
					match.importPath,
				),
			});
		}
	}

	for (const entry of unmatchedFigma) {
		// A deprecated Figma component is on its way out: no code is owed.
		if (DEFAULT_DEPRECATED_PATTERN.test(entry.name)) continue;
		const top = entry.candidates?.[0];
		const detail =
			top !== undefined
				? `No code component matched ${entry.name} (${entry.nodeId}); closest is ${top.codeName} @ ${show(top.score)}.`
				: `No code component matched ${entry.name} (${entry.nodeId}); no candidates.`;
		rows.push({
			component: entry.name,
			status: "missing-in-code",
			detail,
		});
	}

	for (const entry of unmatchedCode) {
		if (isPart.has(`${entry.importPath}\u0000${entry.name}`)) continue;
		const top = entry.candidates?.[0];
		const detail =
			top !== undefined
				? `No Figma component matched ${entry.name} (${entry.importPath}); closest is ${top.figmaName} (${top.nodeId}) @ ${show(top.score)}.`
				: `No Figma component matched ${entry.name} (${entry.importPath}).`;
		rows.push({
			component: entry.name,
			status: "missing-in-figma",
			detail: withParts(detail, entry.name, entry.importPath),
		});
	}

	rows.sort((a, b) => {
		const bySeverity = SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status];
		return bySeverity !== 0 ? bySeverity : byNameAsc(a.component, b.component);
	});

	const summary: ParitySummary = {
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

	return { rows, summary };
}

/**
 * Adapt a {@link ParityReport} into the dashboard's Parity section shape: a
 * single "Status" column, one row per parity row carrying its status cell, in
 * the report's (already severity-sorted) order.
 */
export function toParitySection(report: ParityReport): ParitySection {
	return {
		columns: ["Status"],
		rows: report.rows.map((row) => ({
			component: row.component,
			cells: [{ status: row.status }],
		})),
	};
}

/**
 * One `parity` history line (C3, M2.1): the four counts verbatim from a
 * {@link ParitySummary} plus the persisted pass `score` (100·ok/total,
 * half-up, 0 when total=0), so the scorecard and dashboard read it without
 * re-deriving. THE one builder — `registry build` and `parity` both append it.
 */
export interface ParityHistoryRecord {
	at: string;
	kind: "parity";
	total: number;
	ok: number;
	missingInCode: number;
	missingInFigma: number;
	propMismatch: number;
	/** Pass percentage, 0–100, half-up rounded (0 when total=0). */
	score: number;
}

export function parityHistoryRecord(
	summary: ParitySummary,
	at: string,
): ParityHistoryRecord {
	const { ok, missingInCode, missingInFigma, propMismatch } = summary;
	const total = ok + missingInCode + missingInFigma + propMismatch;
	return {
		at,
		kind: "parity",
		total,
		ok,
		missingInCode,
		missingInFigma,
		propMismatch,
		score: total > 0 ? Math.round((100 * ok) / total) : 0,
	};
}
