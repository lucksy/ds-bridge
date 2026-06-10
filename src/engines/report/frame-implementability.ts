// C11 / M2.4 — frame-implementability engine. PURE: the LATEST `frame-impl`
// history record (or undefined) in → a FrameImplementability {pct, resolved,
// total, gaps:[{reason,count}]} out. No fs/network/process; deterministic; never
// throws.
//
// The `frame-impl` line (written by `ds-bridge frame-impl` at its io edge) carries
// resolvedCount / gapCount / a precomputed pct + a per-reason `byReason` map. This
// engine surfaces the headline pct (verbatim when present, else derived from
// resolved/total), the resolved/total counts, and a deterministic, capped
// gaps-by-reason list (the "topGaps", most-frequent first).
//
// An absent record → the empty rollup (pct 0, no gaps), which keeps the section's
// empty state (and the no-config golden byte-identical when no frame-impl line
// exists, since the caller only spreads a present rollup into ReportData).
import type { FrameImplementability } from "./types.js";

/** How many gap reasons the rollup surfaces (the "topGaps" cap). */
const TOP_GAPS_CAP = 5;

const EMPTY: FrameImplementability = {
	pct: 0,
	resolved: 0,
	total: 0,
	gaps: [],
};

/** A non-null object record, or undefined. */
function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

/** Coerce an unknown to a finite number, else 0. */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Clamp to the 0–100 display range. */
function clamp01(value: number): number {
	return Math.min(100, Math.max(0, value));
}

/**
 * Project the record's `byReason` map into deterministically-ordered buckets:
 * descending count, then reason name (ascending) as the stable tiebreak. Buckets
 * with a non-positive / non-numeric count are dropped. Returned UNCAPPED so the
 * total can sum every bucket; the caller caps the displayed list.
 */
function bucketsFromByReason(
	byReason: Record<string, unknown> | undefined,
): { reason: string; count: number }[] {
	if (byReason === undefined) return [];
	const buckets: { reason: string; count: number }[] = [];
	for (const [reason, raw] of Object.entries(byReason)) {
		const count = asNumber(raw);
		if (count > 0) buckets.push({ reason, count });
	}
	return buckets.sort(
		(a, b) =>
			b.count - a.count ||
			(a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0),
	);
}

/**
 * Reconstruct the frame-implementability rollup from the latest frame-impl
 * record. `total = resolved + gap-count` (gap-count derived from `byReason`, or
 * the recorded `gapCount` when no buckets remain). `pct` is the recorded value
 * verbatim when finite, else `round(100 * resolved / total)` (total 0 → 0%).
 */
export function buildFrameImplementability(
	latest: Record<string, unknown> | undefined,
): FrameImplementability {
	if (latest === undefined) return EMPTY;

	const byReason = asObject(latest.byReason);
	const buckets = bucketsFromByReason(byReason);
	// The displayed gaps list is capped (topGaps); the total sums EVERY bucket.
	const gaps = buckets.slice(0, TOP_GAPS_CAP);

	const resolved = asNumber(latest.resolvedCount);
	// Prefer the byReason sum (the authoritative per-reason tally over all buckets);
	// fall back to the recorded gapCount when byReason is absent/empty.
	const byReasonSum = buckets.reduce((sum, g) => sum + g.count, 0);
	const gapCount = byReasonSum > 0 ? byReasonSum : asNumber(latest.gapCount);
	const total = resolved + gapCount;

	const recordedPct =
		typeof latest.pct === "number" && Number.isFinite(latest.pct)
			? clamp01(latest.pct)
			: undefined;
	const pct =
		recordedPct ??
		(total <= 0 ? 0 : clamp01(Math.round((100 * resolved) / total)));

	return { pct, resolved, total, gaps };
}
