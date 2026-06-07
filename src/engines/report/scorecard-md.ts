// C2 — Scorecard markdown renderer. Pure string building (the changelog
// render-md.ts precedent): a typed ScorecardModel in → golden-tested markdown
// out. No I/O, no clock, no dates beyond the supplied ref labels (SPEC-scorecard
// §2). The exact multi-line output IS the contract — see scorecard-md.test.ts.
//
// Layout: an H3 title, one summary line (the composite score + the single
// strongest mover), a compact metric table (▲▼= arrows + signed deltas; the
// drift now-cell **bolded** when stale exceeds the base — the breaking-token
// callout), and a component sub-table. A `--delta` ref with no committed history
// renders the current-only table plus an `_no baseline at <ref>_` note.
//
// Strongest-mover tie-break is deterministic: largest absolute Δ first, then the
// fixed §2 row order. Rows without a scalar Δ (drift, import-coverage) never
// stand as the mover — drift surfaces instead as the breaking-token callout.
import type {
	DriftCounts,
	ScorecardModel,
	ScorecardRow,
	ScorecardRowId,
} from "./scorecard.js";

/** Caller-supplied ref labels + the no-baseline flag (set by the CLI edge). */
export interface RenderScorecardOptions {
	/** The current side's ref name (e.g. "HEAD"); omitted → "current". */
	currentLabel?: string;
	/** The base side's ref name (e.g. "main"); used in the Δ column + notes. */
	baseLabel?: string;
	/** The base ref had no committed history → append the no-baseline note. */
	noBaseline?: boolean;
}

const TITLE = "### Design-system scorecard";

/** Human display name per row id (the Metric-column label, minus drift's suffix). */
const ROW_LABEL: Record<ScorecardRowId, string> = {
	score: "System score",
	"on-system": "On-system",
	"lint-violations": "Lint violations",
	drift: "Drift (stale/missing/orphan)",
	"import-coverage": "Import coverage",
	contrast: "Contrast",
	readiness: "Readiness",
};

/** Lowercase mover label per row id (used in the summary's mover clause). */
const MOVER_LABEL: Record<ScorecardRowId, string> = {
	score: "score",
	"on-system": "on-system",
	"lint-violations": "lint violations",
	drift: "drift",
	"import-coverage": "import coverage",
	contrast: "contrast",
	readiness: "readiness",
};

/** Component display name (capitalized kind). */
const COMPONENT_LABEL: Record<string, string> = {
	drift: "Drift",
	lint: "Lint",
	readiness: "Readiness",
	a11y: "A11y",
	adoption: "Adoption",
};

/** Direction arrow for a signed delta: ▲ up, ▼ down, = unchanged. */
function arrow(delta: number): string {
	if (delta > 0) return "▲";
	if (delta < 0) return "▼";
	return "=";
}

/** A signed integer string: `+3`, `-3`, `0`. */
function signed(delta: number): string {
	return delta > 0 ? `+${delta}` : `${delta}`;
}

/** "stale/missing/orphan" cell, optionally bolded for the breaking callout. */
function driftCell(counts: DriftCounts, bold: boolean): string {
	const text = `${counts.stale}/${counts.missing}/${counts.orphan}`;
	return bold ? `**${text}**` : text;
}

/** Whether the metric is a percentage (renders a trailing %). */
function isPercent(id: ScorecardRowId): boolean {
	return id === "on-system" || id === "contrast";
}

/** Format a percent/count scalar for display (with % when applicable). */
function scalar(id: ScorecardRowId, value: number): string {
	return isPercent(id) ? `${value}%` : `${value}`;
}

/** The Metric-column label, threading the readiness frame into its parens. */
function metricLabel(row: ScorecardRow): string {
	if (row.id === "readiness") {
		const frame = row.now?.frame ?? row.base?.frame ?? "";
		return frame === "" ? "Readiness" : `Readiness (${frame})`;
	}
	return ROW_LABEL[row.id];
}

/** Whether a row exposes a scalar Δ (drift / import-coverage do not). */
function hasScalarDelta(
	row: ScorecardRow,
): row is Extract<ScorecardRow, { delta?: number }> & { delta: number } {
	return (
		(row.id === "score" ||
			row.id === "on-system" ||
			row.id === "lint-violations" ||
			row.id === "contrast" ||
			row.id === "readiness") &&
		row.delta !== undefined
	);
}

/** The now scalar of a delta-bearing row (score, pct, count, or readiness score). */
function nowScalar(row: ScorecardRow): number | undefined {
	switch (row.id) {
		case "score":
		case "on-system":
		case "lint-violations":
		case "contrast":
			return row.now;
		case "readiness":
			return row.now?.score;
		default:
			return undefined;
	}
}

/** The base scalar of a delta-bearing row. */
function baseScalar(row: ScorecardRow): number | undefined {
	switch (row.id) {
		case "score":
		case "on-system":
		case "lint-violations":
		case "contrast":
			return row.base;
		case "readiness":
			return row.base?.score;
		default:
			return undefined;
	}
}

/** One "<base> → <now> <arrow>" fragment for the summary, with units. */
function moverFragment(
	label: string,
	id: ScorecardRowId,
	row: ScorecardRow,
): string {
	const now = nowScalar(row);
	const base = baseScalar(row);
	const delta = hasScalarDelta(row) ? row.delta : 0;
	return `${label} ${scalar(id, base ?? 0)} → ${scalar(id, now ?? 0)} ${arrow(delta)}`;
}

/** The breaking-token count (now.stale − base.stale) when it INCREASED, else 0. */
function breakingTokenIncrease(rows: ScorecardRow[]): number {
	const drift = rows.find((r) => r.id === "drift");
	if (drift === undefined || drift.id !== "drift") return 0;
	const nowStale = drift.now?.stale ?? 0;
	const baseStale = drift.base?.stale;
	if (baseStale === undefined) return 0;
	return nowStale > baseStale ? nowStale - baseStale : 0;
}

/**
 * Build the summary line. Lead with the System-score fragment when present; then
 * the single strongest mover (largest |Δ|, §2-order tie-break) EXCLUDING the
 * score row itself; then the breaking-token callout when stale increased. With
 * no score row, the lead IS the strongest mover (e.g. a single-row scorecard).
 */
function summaryLine(rows: ScorecardRow[]): string {
	const scoreRow = rows.find((r) => r.id === "score");
	const movers = rows.filter((r) => r.id !== "score" && hasScalarDelta(r));

	// Strongest mover: largest absolute Δ, ties broken by §2 row order (the rows
	// array is already in §2 order, so a stable sort preserves it for ties).
	movers.sort((a, b) => {
		const da = hasScalarDelta(a) ? Math.abs(a.delta) : 0;
		const db = hasScalarDelta(b) ? Math.abs(b.delta) : 0;
		return db - da;
	});
	const topMover = movers[0];

	const fragments: string[] = [];
	if (scoreRow !== undefined && scoreRow.id === "score") {
		if (scoreRow.delta !== undefined) {
			fragments.push(moverFragment("Score", "score", scoreRow));
		} else if (scoreRow.now !== undefined) {
			fragments.push(`Score ${scoreRow.now}`);
		}
		if (topMover !== undefined) {
			fragments.push(
				moverFragment(MOVER_LABEL[topMover.id], topMover.id, topMover),
			);
		}
	} else if (topMover !== undefined) {
		// No score row → the strongest mover leads, capitalized like a row label.
		fragments.push(
			moverFragment(ROW_LABEL[topMover.id], topMover.id, topMover),
		);
	}

	const breaking = breakingTokenIncrease(rows);
	if (breaking > 0) {
		const noun =
			breaking === 1 ? "breaking token change" : "breaking token changes";
		fragments.push(`**${breaking} ${noun}**`);
	}

	return fragments.join(" · ");
}

/**
 * A row's primary current scalar for the summary: the scalar rows' value, or a
 * multi-count row's lead count (drift→stale, import-coverage→imported). undefined
 * only when the row has no `now` at all.
 */
function primaryNow(row: ScorecardRow): number | undefined {
	if (row.id === "drift") return row.now?.stale;
	if (row.id === "import-coverage") return row.now?.imported;
	return nowScalar(row);
}

/** The current-only summary: just the score (or first present row) value. */
function currentOnlySummary(rows: ScorecardRow[]): string {
	const scoreRow = rows.find((r) => r.id === "score");
	if (
		scoreRow !== undefined &&
		scoreRow.id === "score" &&
		scoreRow.now !== undefined
	) {
		return `Score ${scoreRow.now}`;
	}
	// No score row: name the first row with a current value. Multi-count rows lead
	// with their raw count; scalar rows keep their unit (e.g. a trailing %).
	for (const row of rows) {
		const now = primaryNow(row);
		if (now === undefined) continue;
		const value =
			row.id === "drift" || row.id === "import-coverage"
				? `${now}`
				: scalar(row.id, now);
		return `${ROW_LABEL[row.id]} ${value}`;
	}
	return "No movement";
}

/** Render one compare-table data cell pair for the now/base of a row. */
function renderCompareRow(row: ScorecardRow, breaking: boolean): string {
	const label = metricLabel(row);
	// Multi-count rows (drift, import-coverage) format their own now/base cells.
	if (row.id === "drift") {
		const base = row.base !== undefined ? driftCell(row.base, false) : "—";
		const now = row.now !== undefined ? driftCell(row.now, breaking) : "—";
		const delta =
			row.now !== undefined && row.base !== undefined
				? `${signed(row.now.stale - row.base.stale)} ${arrow(row.now.stale - row.base.stale)}`
				: "—";
		return `| ${label} | ${base} | ${now} | ${delta} |`;
	}
	if (row.id === "import-coverage") {
		const base =
			row.base !== undefined ? `${row.base.imported}/${row.base.total}` : "—";
		const now =
			row.now !== undefined ? `${row.now.imported}/${row.now.total}` : "—";
		const delta =
			row.now !== undefined && row.base !== undefined
				? `${signed(row.now.imported - row.base.imported)} ${arrow(row.now.imported - row.base.imported)}`
				: "—";
		return `| ${label} | ${base} | ${now} | ${delta} |`;
	}
	// Scalar rows.
	const now = nowScalar(row);
	const base = baseScalar(row);
	const nowCell = now !== undefined ? scalar(row.id, now) : "—";
	const baseCell = base !== undefined ? scalar(row.id, base) : "—";
	const deltaCell = hasScalarDelta(row)
		? `${signed(row.delta)} ${arrow(row.delta)}`
		: "—";
	return `| ${label} | ${baseCell} | ${nowCell} | ${deltaCell} |`;
}

/** Render one current-only-table data row (no base/Δ columns). */
function renderCurrentRow(row: ScorecardRow): string {
	const label = metricLabel(row);
	if (row.id === "drift") {
		const now = row.now !== undefined ? driftCell(row.now, false) : "—";
		return `| ${label} | ${now} |`;
	}
	if (row.id === "import-coverage") {
		const now =
			row.now !== undefined ? `${row.now.imported}/${row.now.total}` : "—";
		return `| ${label} | ${now} |`;
	}
	const now = nowScalar(row);
	const nowCell = now !== undefined ? scalar(row.id, now) : "—";
	return `| ${label} | ${nowCell} |`;
}

/** The component sub-table block (lines), or [] when no score row/components. */
function componentBlock(rows: ScorecardRow[]): string[] {
	const scoreRow = rows.find((r) => r.id === "score");
	if (scoreRow === undefined || scoreRow.id !== "score") return [];
	if (scoreRow.components.length === 0) return [];
	const lines: string[] = [
		"#### Components",
		"",
		"| Component | Score | Weight |",
		"| --- | --- | --- |",
	];
	for (const c of scoreRow.components) {
		lines.push(
			`| ${COMPONENT_LABEL[c.kind] ?? c.kind} | ${c.score} | ${c.weight} |`,
		);
	}
	return lines;
}

/**
 * Render the scorecard model to markdown (SPEC-scorecard §2). `model` no-data →
 * a typed run-a-check note (defensive: the CLI exits 2 before reaching here).
 */
export function renderScorecardMarkdown(
	model: ScorecardModel,
	options: RenderScorecardOptions,
): string {
	const lines: string[] = [TITLE, ""];

	if (model.kind === "no-data") {
		lines.push(
			"_No design-system history yet — run a check to populate the scorecard._",
			"",
		);
		return lines.join("\n");
	}

	const currentLabel = options.currentLabel ?? "current";
	const compare = !model.currentOnly;

	// Summary line.
	lines.push(
		compare ? summaryLine(model.rows) : currentOnlySummary(model.rows),
		"",
	);

	// Metric table.
	const breaking = breakingTokenIncrease(model.rows) > 0;
	if (compare) {
		const baseLabel = options.baseLabel ?? "base";
		lines.push(
			`| Metric | ${baseLabel} | ${currentLabel} | Δ |`,
			"| --- | --- | --- | --- |",
		);
		for (const row of model.rows) lines.push(renderCompareRow(row, breaking));
	} else {
		lines.push(`| Metric | ${currentLabel} |`, "| --- | --- |");
		for (const row of model.rows) lines.push(renderCurrentRow(row));
	}
	lines.push("");

	// Component sub-table.
	const components = componentBlock(model.rows);
	if (components.length > 0) lines.push(...components, "");

	// No-baseline note.
	if (options.noBaseline === true) {
		const baseLabel = options.baseLabel ?? "base";
		lines.push(`_no baseline at ${baseLabel}_`, "");
	}

	return lines.join("\n");
}
