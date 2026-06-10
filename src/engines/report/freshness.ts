// C4 / M3.2 — data-freshness engine. PURE: the shared tolerant `HistoryRecord[]`
// + an injected `nowIso` + a (partial) per-kind threshold map in → one
// `FreshnessRow` per tracked check-kind out. No fs/clock/network; deterministic;
// never throws.
//
// data-freshness is the trust gauge: for every check-kind the dashboard cares
// about, it answers "when did this last run, how stale is that, and is a green
// panel green-because-clean or green-because-the-check-stopped-running."
//
// Mechanics (per tracked LOGICAL kind):
//   - take the MAX dated `at` across all history lines that map to the kind
//     (raw `tokens-check` → drift, `handoff` → readiness; the rest pass through);
//   - `lastRun` = that date's day (YYYY-MM-DD); `ageDays` = whole days from
//     lastRun to `nowIso` (floor of the ms delta / MS_PER_DAY);
//   - a kind whose only lines are dateless (numeric/absent `at`) carries presence
//     but no anchorable age → no lastRun/ageDays, band "unknown";
//   - a kind with NO line at all → a never-run row (band "unknown");
//   - band from the kind's `{aging, stale}`: green < aging ≤ amber < stale ≤ red
//     (aging and stale are inclusive lower bounds of amber and red respectively).
//
// The threshold map is the user's PARTIAL `freshness_thresholds` config (or
// undefined); the engine merges it onto the per-kind DEFAULTS so an absent kind
// always has a band. The `now` instant is injected (the io-edge `generatedAt`),
// never read here.
import {
	DEFAULT_FRESHNESS_THRESHOLDS,
	type FreshnessBand,
	type FreshnessKind,
	type FreshnessThresholds,
} from "../../config.js";
import type { HistoryRecord } from "./history-lines.js";
import type { FreshnessRow } from "./types.js";

/** Milliseconds in one whole day (UTC; freshness ages on calendar-day deltas). */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The canonical tracked check-kinds, in display order. These are the LOGICAL
 * kinds (the `freshness_thresholds` config vocabulary + the row labels); the raw
 * history kind for each is mapped in {@link logicalKindFor}. Exactly the kinds
 * the SPEC §5 C4 design enumerates.
 */
export const FRESHNESS_TRACKED_KINDS: readonly FreshnessKind[] = [
	"drift",
	"lint",
	"readiness",
	"a11y",
	"impact",
	"adoption",
	"parity",
	"library-health",
	"changelog",
	"frame-impl",
];

/**
 * Map a raw history `kind` to its logical freshness kind, or undefined when the
 * kind is not tracked (forward-compat: unknown kinds are simply ignored). The
 * two remaps mirror the score engine's `componentKindFor` (`tokens-check`→drift,
 * `handoff`→readiness); every other tracked kind is its own logical name.
 */
function logicalKindFor(rawKind: string): FreshnessKind | undefined {
	switch (rawKind) {
		case "tokens-check":
			return "drift";
		case "handoff":
			return "readiness";
		case "lint":
		case "a11y":
		case "impact":
		case "adoption":
		case "parity":
		case "library-health":
		case "changelog":
		case "frame-impl":
			return rawKind;
		default:
			return undefined;
	}
}

/** Resolve the band for a kind: the user override if present, else the default. */
function bandFor(
	kind: FreshnessKind,
	thresholds: FreshnessThresholds | undefined,
): FreshnessBand {
	return thresholds?.[kind] ?? DEFAULT_FRESHNESS_THRESHOLDS[kind];
}

/** Classify an age against a kind's bands: green < aging ≤ amber < stale ≤ red. */
function classify(ageDays: number, band: FreshnessBand): FreshnessRow["band"] {
	if (ageDays >= band.stale) return "red";
	if (ageDays >= band.aging) return "amber";
	return "green";
}

/**
 * Whole days from a `YYYY-MM-DD` last-run day to `nowIso`, floored, clamped at 0.
 * A `now` earlier than the last run (clock skew) reads as age 0 rather than a
 * negative number. Returns undefined when either side fails to parse.
 */
function ageInDays(lastRunDay: string, nowIso: string): number | undefined {
	const last = Date.parse(`${lastRunDay}T00:00:00.000Z`);
	const now = Date.parse(nowIso);
	if (Number.isNaN(last) || Number.isNaN(now)) return undefined;
	return Math.max(0, Math.floor((now - last) / MS_PER_DAY));
}

/**
 * Build one {@link FreshnessRow} per tracked check-kind from the history records.
 * See the module header for the full contract. `thresholds` is the user's
 * partial `freshness_thresholds` (or undefined) merged onto the per-kind defaults.
 */
export function buildFreshness(
	records: readonly HistoryRecord[],
	nowIso: string,
	thresholds: FreshnessThresholds | undefined,
): FreshnessRow[] {
	// Per logical kind: the latest anchorable day (max), plus whether ANY line of
	// the kind was seen (presence, even when dateless).
	const latestDay = new Map<FreshnessKind, string>();
	const present = new Set<FreshnessKind>();

	for (const entry of records) {
		const kind = logicalKindFor(entry.kind);
		if (kind === undefined) continue; // untracked / unknown — ignore
		present.add(kind);
		if (entry.at === undefined) continue; // dateless — presence only, no age
		const day = entry.at.slice(0, 10);
		const prior = latestDay.get(kind);
		if (prior === undefined || day > prior) latestDay.set(kind, day);
	}

	return FRESHNESS_TRACKED_KINDS.map((kind): FreshnessRow => {
		const day = latestDay.get(kind);
		if (day === undefined) {
			// Never run (no line) OR only dateless lines → cannot age → unknown.
			return { kind, band: "unknown" };
		}
		const ageDays = ageInDays(day, nowIso);
		if (ageDays === undefined) {
			// A present date we could not parse (e.g. nowIso malformed) → unknown.
			return { kind, lastRun: day, band: "unknown" };
		}
		return {
			kind,
			lastRun: day,
			ageDays,
			band: classify(ageDays, bandFor(kind, thresholds)),
		};
	});
}
