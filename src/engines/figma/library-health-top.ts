// F1 — top-N lists for the library-health history record (SPEC-figma-trends §2).
// PURE: an (uncapped) L1 report in → three per-component lists out. No I/O, no
// throws. The lists let the dashboard trend SPECIFIC components over time, while
// the record's three count keys stay numbers for every existing reader.
//
// Grouping (SPEC §1.2): hotspots by main component (`componentName`, else the
// instance name) summing override counts; deprecated usage is already grouped
// per component; detached candidates by node name (count of frames). Each list
// is ranked count desc, then name asc, and sliced to N.
import type { LibraryHealthReport } from "./library-health.js";

/** One ranked entry: a component (or frame) name and its count. */
export interface TopEntry {
	name: string;
	count: number;
}

/** The list keys a `library-health` history record carries (SPEC §2). */
export interface LibraryHealthTopLists {
	topN: number;
	topOverrides: TopEntry[];
	topDeprecated: TopEntry[];
	topDetached: TopEntry[];
}

/** Rank a name → count map (count desc, name asc) and keep the first `n`. */
function rank(counts: ReadonlyMap<string, number>, n: number): TopEntry[] {
	return [...counts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) =>
			a.count !== b.count
				? b.count - a.count
				: a.name < b.name
					? -1
					: a.name > b.name
						? 1
						: 0,
		)
		.slice(0, Math.max(0, n));
}

/** Add `by` to `name`'s running total. */
function bump(map: Map<string, number>, name: string, by: number): void {
	map.set(name, (map.get(name) ?? 0) + by);
}

/** Build the three top-N lists from a library-health report. */
export function libraryHealthTopLists(
	report: LibraryHealthReport,
	n: number,
): LibraryHealthTopLists {
	const overrides = new Map<string, number>();
	for (const hotspot of report.overrideHotspots) {
		bump(
			overrides,
			hotspot.componentName ?? hotspot.name,
			hotspot.overrideCount,
		);
	}
	const deprecated = new Map<string, number>();
	for (const group of report.deprecatedUsage) {
		bump(deprecated, group.componentName, group.count);
	}
	const detached = new Map<string, number>();
	for (const candidate of report.detachedCandidates) {
		bump(detached, candidate.name, 1);
	}
	return {
		topN: n,
		topOverrides: rank(overrides, n),
		topDeprecated: rank(deprecated, n),
		topDetached: rank(detached, n),
	};
}

/** The default list length (SPEC-figma-trends §2). */
export const DEFAULT_TOP_N = 10;

/** The largest accepted N (keeps a history line bounded). */
export const MAX_TOP_N = 100;

/**
 * Parse a `--top` / `--library-top` value: a whole number in `0..100`
 * (surrounding whitespace allowed). Anything else → undefined (a usage error).
 */
export function parseTopN(raw: string): number | undefined {
	const text = raw.trim();
	if (!/^\d+$/.test(text)) return undefined;
	const n = Number(text);
	return n <= MAX_TOP_N ? n : undefined;
}
