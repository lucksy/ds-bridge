// C8 / M3.5 — score-velocity engine. Test-first: a pure derivation over the
// system-score trend — the windowed delta + direction + regression streak. Pure:
// trend + injected `nowIso` + windowDays in → a `ScoreVelocity | undefined` out.
// No fs/clock/network; deterministic. < 2 trend points → undefined.
import { describe, expect, it } from "vitest";
import type { SystemScoreTrendPoint } from "../../../src/engines/report/types.js";
import { computeVelocity } from "../../../src/engines/report/velocity.js";

/** Build a trend from [date, score] pairs (ascending by date in the source). */
function trend(...pairs: [string, number][]): SystemScoreTrendPoint[] {
	return pairs.map(([date, score]) => ({ date, score }));
}

describe("computeVelocity", () => {
	it("returns undefined for fewer than two trend points", () => {
		expect(computeVelocity([], "2026-06-10T00:00:00.000Z", 30)).toBeUndefined();
		expect(
			computeVelocity(
				trend(["2026-06-01", 80]),
				"2026-06-10T00:00:00.000Z",
				30,
			),
		).toBeUndefined();
	});

	it("computes a positive delta as `up`", () => {
		const v = computeVelocity(
			trend(["2026-06-01", 75], ["2026-06-08", 79]),
			"2026-06-10T00:00:00.000Z",
			30,
		);
		expect(v).toEqual({
			delta: 4,
			windowDays: 30,
			direction: "up",
			regressionStreak: 0,
		});
	});

	it("computes a negative delta as `down`", () => {
		const v = computeVelocity(
			trend(["2026-06-01", 79], ["2026-06-08", 75]),
			"2026-06-10T00:00:00.000Z",
			30,
		);
		expect(v?.delta).toBe(-4);
		expect(v?.direction).toBe("down");
	});

	it("computes a zero delta as `flat`", () => {
		const v = computeVelocity(
			trend(["2026-06-01", 80], ["2026-06-08", 80]),
			"2026-06-10T00:00:00.000Z",
			30,
		);
		expect(v?.delta).toBe(0);
		expect(v?.direction).toBe("flat");
	});

	it("measures the delta from the latest point BEFORE the window start (half-open)", () => {
		// Window = 7 days ending 2026-06-10 → start 2026-06-03. The 06-01 point is
		// before the window (the baseline); 06-05 and 06-09 are inside it. Delta is
		// latest (90) − baseline (60) = 30.
		const v = computeVelocity(
			trend(["2026-06-01", 60], ["2026-06-05", 70], ["2026-06-09", 90]),
			"2026-06-10T00:00:00.000Z",
			7,
		);
		expect(v?.delta).toBe(30);
		expect(v?.direction).toBe("up");
	});

	it("falls back to the earliest point when none precedes the window start", () => {
		// Window = 30 days ending 2026-06-10 → start 2026-05-11. All points are inside
		// the window (no pre-window baseline), so the earliest in-window point (70) is
		// the baseline: delta = 85 − 70 = 15.
		const v = computeVelocity(
			trend(["2026-06-01", 70], ["2026-06-05", 80], ["2026-06-09", 85]),
			"2026-06-10T00:00:00.000Z",
			30,
		);
		expect(v?.delta).toBe(15);
	});

	it("counts the consecutive trailing down-moves as the regression streak", () => {
		// Moves: 70→80 (up), 80→78 (down), 78→75 (down) → 2 trailing down-moves.
		const v = computeVelocity(
			trend(
				["2026-06-01", 70],
				["2026-06-02", 80],
				["2026-06-03", 78],
				["2026-06-04", 75],
			),
			"2026-06-10T00:00:00.000Z",
			30,
		);
		expect(v?.regressionStreak).toBe(2);
	});

	it("a flat trailing move breaks the regression streak", () => {
		// Last move 78→78 is flat (not a down-move) → streak 0.
		const v = computeVelocity(
			trend(["2026-06-01", 80], ["2026-06-02", 78], ["2026-06-03", 78]),
			"2026-06-10T00:00:00.000Z",
			30,
		);
		expect(v?.regressionStreak).toBe(0);
	});

	it("reports the regression streak over the FULL trend (all-down)", () => {
		const v = computeVelocity(
			trend(["2026-06-01", 90], ["2026-06-02", 85], ["2026-06-03", 80]),
			"2026-06-10T00:00:00.000Z",
			30,
		);
		expect(v?.regressionStreak).toBe(2);
		expect(v?.direction).toBe("down");
	});

	it("carries the windowDays through verbatim", () => {
		const v = computeVelocity(
			trend(["2026-06-01", 75], ["2026-06-08", 79]),
			"2026-06-10T00:00:00.000Z",
			14,
		);
		expect(v?.windowDays).toBe(14);
	});
});
