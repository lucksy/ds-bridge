// C8 / M3.5 — score-velocity engine. PURE: the system-score trend + an injected
// `nowIso` + a window in days → a windowed velocity (or undefined). No
// fs/clock/network; deterministic; never throws. `now` is injected (the report's
// `generatedAt`) so the result is reproducible.
//
// delta = latest score − the score at/just-before the window start, where the
// window is the HALF-OPEN day interval `[now − windowDays, now)` (the digest's
// windowing discipline). The baseline is the latest trend point dated BEFORE the
// window start; when no point precedes the window (the whole trend is inside it)
// it degrades to the EARLIEST point — the oldest score we can compare against,
// so a young history still reports honest motion rather than no velocity.
//
// direction is the sign of delta (up / down / flat). regressionStreak is the run
// of consecutive down-moves ending at the latest point (a flat or up move breaks
// it). Fewer than two trend points → undefined (no motion to measure).
import type { ScoreVelocity, SystemScoreTrendPoint } from "./types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the windowed score velocity over the system-score trend. `nowIso` is
 * the injected render instant; `windowDays` the look-back window (config/flag,
 * default 30). Returns `undefined` when there are fewer than two trend points.
 */
export function computeVelocity(
	trend: readonly SystemScoreTrendPoint[],
	nowIso: string,
	windowDays: number,
): ScoreVelocity | undefined {
	if (trend.length < 2) return undefined;

	const latest = trend[trend.length - 1];
	if (latest === undefined) return undefined;

	// Window start date (YYYY-MM-DD) = now − windowDays. A malformed `nowIso`
	// degrades to the earliest-point baseline (windowStartDate stays undefined).
	const nowMs = Date.parse(nowIso);
	let windowStartDate: string | undefined;
	if (!Number.isNaN(nowMs)) {
		windowStartDate = new Date(nowMs - windowDays * MS_PER_DAY)
			.toISOString()
			.slice(0, 10);
	}

	// Baseline: the latest point dated BEFORE the window start (half-open lower
	// bound). None before the window → fall back to the earliest point.
	let baseline: SystemScoreTrendPoint | undefined;
	if (windowStartDate !== undefined) {
		for (const point of trend) {
			if (point.date < windowStartDate) baseline = point;
		}
	}
	if (baseline === undefined) baseline = trend[0];
	if (baseline === undefined) return undefined;

	const delta = latest.score - baseline.score;
	const direction: ScoreVelocity["direction"] =
		delta > 0 ? "up" : delta < 0 ? "down" : "flat";

	// regressionStreak: consecutive down-moves ending at the latest point.
	let regressionStreak = 0;
	for (let i = trend.length - 1; i > 0; i -= 1) {
		const cur = trend[i];
		const prev = trend[i - 1];
		if (cur === undefined || prev === undefined) break;
		if (cur.score < prev.score) regressionStreak += 1;
		else break;
	}

	return { delta, windowDays, direction, regressionStreak };
}
