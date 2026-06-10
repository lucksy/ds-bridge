// C6 / M3.4 — library-health-trend engine. PURE: the shared tolerant
// `HistoryRecord[]` in → a dated hygiene-count series out. No fs/network/process;
// deterministic; never throws. Mirrors the parity-trend/adoption-trend pattern:
// one point per distinct date, ascending, last-of-day wins (file order).
//
// Folds EVERY dated `library-health` line (not last-wins) into the trend; a
// dateless line (numeric/absent `at`) cannot anchor a point and is excluded. No
// new history is written — this is a derivation over the same counts-only L5 lines
// the latest-wins library-health section already reads.
import type { HistoryRecord } from "./history-lines.js";
import type { LibraryHealthTrendPoint } from "./types.js";

/** Coerce an unknown to a finite number, else 0 (mirrors the score engine). */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Fold the dated `library-health` history lines into a hygiene-count series: one
 * `{date, overrides, deprecated, detached}` point per distinct date, ascending,
 * last-of-day wins. Records without a string `at` are skipped (they cannot anchor
 * a point). Corrupt/absent count fields coerce to 0.
 */
export function buildLibraryHealthTrend(
	records: readonly HistoryRecord[],
): LibraryHealthTrendPoint[] {
	// Last-of-day wins: a Map keyed by date, overwritten in file order.
	const byDate = new Map<string, LibraryHealthTrendPoint>();
	for (const entry of records) {
		if (entry.kind !== "library-health") continue;
		if (entry.at === undefined) continue; // no anchorable date
		const date = entry.at.slice(0, 10);
		byDate.set(date, {
			date,
			overrides: asNumber(entry.record.overrideHotspots),
			deprecated: asNumber(entry.record.deprecatedUsage),
			detached: asNumber(entry.record.detachedCandidates),
		});
	}

	return [...byDate.values()].sort((a, b) =>
		a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
	);
}
