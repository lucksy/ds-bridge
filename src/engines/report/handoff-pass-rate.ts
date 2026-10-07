// F4 — handoff pass rate (SPEC-figma-trends §3.3). PURE: replayed history + the
// readiness gate in → the share of frames at/above the gate out. No I/O; never
// throws. Each frame (H7 identity with v1 → v2 aliasing, `frameKeyResolver`)
// contributes its LATEST score (file order) — not a per-run rate. A line
// without a finite numeric `score` is skipped (never counted as a 0). The trend
// replays the same rule cumulatively at the end of each dated day (undated
// records: headline only).
import {
	frameKeyResolver,
	isBlockedHandoff,
} from "../history/readiness-frames.js";
import type { HistoryRecord } from "./history-lines.js";

/** One day of the pass-rate trend. */
export interface PassRatePoint {
	date: string;
	frames: number;
	passing: number;
	pct: number;
}

/** The `handoff-pass-rate` section. */
export interface HandoffPassRate {
	threshold: number;
	frames: number;
	passing: number;
	/** round(100 · passing / frames), half-up. */
	pct: number;
	trend: PassRatePoint[];
}

/** Count frames + passing frames over a latest-score map. */
function tally(
	latest: ReadonlyMap<string, number>,
	threshold: number,
): { frames: number; passing: number; pct: number } {
	let passing = 0;
	for (const score of latest.values()) if (score >= threshold) passing += 1;
	const frames = latest.size;
	return {
		frames,
		passing,
		pct: frames === 0 ? 0 : Math.round((100 * passing) / frames),
	};
}

/** The handoff pass rate (latest per frame) and its day-by-day trend. */
export function buildHandoffPassRate(
	records: readonly HistoryRecord[],
	threshold: number,
): HandoffPassRate | undefined {
	const latest = new Map<string, number>();
	const dated: { date: string; key: string; score: number }[] = [];
	const keyOf = frameKeyResolver(records);
	for (const { kind, at, record } of records) {
		if (kind !== "handoff") continue;
		const recorded = record.score;
		if (typeof recorded !== "number" || !Number.isFinite(recorded)) continue;
		// A blocked run (deprecated component in the frame) never passes: it
		// gates as -Infinity. This engine only ever compares scores to the gate.
		const score = isBlockedHandoff(record)
			? Number.NEGATIVE_INFINITY
			: recorded;
		const key = keyOf(record);
		latest.set(key, score);
		if (at !== undefined) dated.push({ date: at.slice(0, 10), key, score });
	}
	if (latest.size === 0) return undefined;

	// Day by day, ONE pass: for each frame keep the file-latest entry dated on
	// or before the day — exactly what re-folding every earlier entry per day
	// gave (O(days × records)), also when a merged history is out of date order.
	const byDate = dated
		.map((entry, index) => ({ ...entry, index }))
		.sort((a, b) =>
			a.date < b.date ? -1 : a.date > b.date ? 1 : a.index - b.index,
		);
	const upTo = new Map<string, { score: number; index: number }>();
	const trend: HandoffPassRate["trend"] = [];
	for (let i = 0; i < byDate.length; i += 1) {
		const entry = byDate[i];
		if (entry === undefined) continue;
		const held = upTo.get(entry.key);
		if (held === undefined || entry.index > held.index) {
			upTo.set(entry.key, { score: entry.score, index: entry.index });
		}
		if (byDate[i + 1]?.date !== entry.date) {
			const scores = new Map([...upTo].map(([key, v]) => [key, v.score]));
			trend.push({ date: entry.date, ...tally(scores, threshold) });
		}
	}
	return { threshold, ...tally(latest, threshold), trend };
}
