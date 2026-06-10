// M10.1 — labeled status grid (the terminal twin of the HTML heat grid). PURE
// string building over `renderTable`'s alignment. Each cell is a domain-agnostic
// status (ok/warn/fail/none) → a severity-colored glyph (✓/△/✗/·), so the same
// primitive serves the parity matrix, the targets RAG grid, and component-health.
import { type Severity, severityColor } from "./severity.js";
import { renderTable } from "./table.js";

/** A domain-agnostic cell status: the caller maps its own enum to one of these. */
export type MatrixStatus = "ok" | "warn" | "fail" | "none";

/** Glyph per status (✓ pass · △ partial · ✗ fail · · absent). */
const GLYPH: Record<MatrixStatus, string> = {
	ok: "✓",
	warn: "△",
	fail: "✗",
	none: "·",
};

/** Severity per status, for coloring (none → info, the neutral track color). */
const SEVERITY: Record<MatrixStatus, Severity> = {
	ok: "ok",
	warn: "warn",
	fail: "error",
	none: "info",
};

/** One labeled row of statuses (one per column). */
export interface MatrixRow {
	label: string;
	cells: MatrixStatus[];
}

export interface MatrixOptions {
	color: boolean;
}

/** Render a status glyph, severity-colored when `color` is on. */
function glyphFor(status: MatrixStatus, color: boolean): string {
	return severityColor(SEVERITY[status], GLYPH[status], { color });
}

/**
 * Render rows of statuses as a labeled grid: a leading row-label column followed
 * by one glyph column per `columns` header. An empty `rows` → "" (the caller
 * substitutes its own empty-state). Built on `renderTable` so alignment + the box
 * frame match every other terminal table.
 */
export function renderMatrix(
	rows: MatrixRow[],
	columns: string[],
	opts: MatrixOptions,
): string {
	if (rows.length === 0) return "";
	const headers = ["", ...columns];
	const tableRows = rows.map((row) => [
		row.label,
		...row.cells.map((cell) => glyphFor(cell, opts.color)),
	]);
	return renderTable(headers, tableRows, { color: opts.color });
}
