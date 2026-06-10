// C3 / M2.1 — parity-trend engine. PURE: the shared tolerant `HistoryRecord[]`
// in → a dated pass-% series out. No fs/network/process; deterministic; never
// throws. Mirrors the adoption-trend pattern (one point per distinct date,
// ascending, last-of-day wins) but reads the NEW `parity` history line (appended
// by `registry build`), whose persisted `score` is 100·ok/total.
//
// Each `parity` line that carries a string `at` anchors one trend point; lines
// sharing a date collapse to the last-of-day (file order) value, matching how the
// score engine's trend replay treats same-date records. A `total` of 0 yields 0%
// rather than a NaN (the point is still plotted — "measured, nothing matched").
import type { HistoryRecord } from "./history-lines.js";

/** One parity-trend point: a dated pass percentage, 0–100. */
export interface ParityTrendPoint {
	/** ISO date (YYYY-MM-DD); the x-axis category label. */
	date: string;
	/** On-parity percentage, 0–100, half-up rounded. */
	pct: number;
}

/** Coerce an unknown to a finite number, else 0 (mirrors the score engine). */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Clamp to the 0–100 display range. */
function clamp01(value: number): number {
	return Math.min(100, Math.max(0, value));
}

/**
 * The parity pass-% for one parity record: the persisted `score` verbatim when
 * present, else derived from `ok`/`total`. `total <= 0` → 0 (no denominator).
 */
function recordPct(record: Record<string, unknown>): number {
	if (typeof record.score === "number" && Number.isFinite(record.score)) {
		return clamp01(record.score);
	}
	const total = asNumber(record.total);
	if (total <= 0) return 0;
	return clamp01((100 * asNumber(record.ok)) / total);
}

/**
 * Fold the dated `parity` history lines into a parity-trend series: one
 * `{date, pct}` point per distinct date, ascending, last-of-day wins. Records
 * without a string `at` are skipped (they cannot anchor a point).
 */
export function buildParityTrend(
	records: readonly HistoryRecord[],
): ParityTrendPoint[] {
	// Last-of-day wins: a Map keyed by date, overwritten in file order.
	const byDate = new Map<string, number>();
	for (const entry of records) {
		if (entry.kind !== "parity") continue;
		if (entry.at === undefined) continue; // no anchorable date
		const date = entry.at.slice(0, 10);
		byDate.set(date, Math.round(recordPct(entry.record)));
	}

	return [...byDate.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([date, pct]) => ({ date, pct }));
}
