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
//                                                    (detail names top candidate)
//   unmatchedCode  (no figma component)          -> "missing-in-figma"
//
// Component name: matches use the code name; unmatchedFigma the figma name;
// unmatchedCode the code name. Rows sort by status SEVERITY then name asc.
import type { ParityStatus } from "../report/types.js";
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

	const rows: ParityRow[] = [];

	for (const match of matches) {
		const score = typeof match.score === "number" ? match.score : 0;
		if (score >= OK_THRESHOLD) {
			rows.push({
				component: match.codeName,
				status: "ok",
				detail: `Matched ${match.figmaName} (${match.nodeId}) @ ${show(score)}.`,
			});
		} else {
			rows.push({
				component: match.codeName,
				status: "prop-mismatch",
				detail: `Matched ${match.figmaName} (${match.nodeId}) @ ${show(score)} — low shape agreement; props/variants likely diverge.`,
			});
		}
	}

	for (const entry of unmatchedFigma) {
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
		const top = entry.candidates?.[0];
		const detail =
			top !== undefined
				? `No Figma component matched ${entry.name} (${entry.importPath}); closest is ${top.figmaName} (${top.nodeId}) @ ${show(top.score)}.`
				: `No Figma component matched ${entry.name} (${entry.importPath}).`;
		rows.push({
			component: entry.name,
			status: "missing-in-figma",
			detail,
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
