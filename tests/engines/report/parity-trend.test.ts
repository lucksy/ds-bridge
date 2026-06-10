// C3 / M2.1 — parity-trend engine. Test-first: folds the dated `parity` history
// lines into ParityTrendPoint[] (one point per distinct date, ascending,
// last-of-day wins on `pct`), mirroring the adoption-trend pattern. Pure: the
// shared tolerant `HistoryRecord[]` in → dated pass-% points out.
import { describe, expect, it } from "vitest";
import { replayHistory } from "../../../src/engines/report/history-lines.js";
import { buildParityTrend } from "../../../src/engines/report/parity-trend.js";

/** Build one JSONL line from a record object. */
function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

/** Replay raw JSONL into the shared tolerant record list (the engine's input). */
function records(...lines: string[]) {
	return replayHistory(lines.join("\n"));
}

describe("buildParityTrend", () => {
	it("returns an empty array when no parity lines are present", () => {
		expect(buildParityTrend(records())).toEqual([]);
		const onlyOther = records(
			line({ at: "2026-06-01T10:00:00.000Z", kind: "lint", byKind: {} }),
		);
		expect(buildParityTrend(onlyOther)).toEqual([]);
	});

	it("maps each dated parity line to a {date, pct} point, ascending by date", () => {
		const trend = buildParityTrend(
			records(
				line({
					at: "2026-06-03T10:00:00.000Z",
					kind: "parity",
					ok: 6,
					total: 10,
					score: 60,
				}),
				line({
					at: "2026-06-01T10:00:00.000Z",
					kind: "parity",
					ok: 9,
					total: 10,
					score: 90,
				}),
			),
		);
		expect(trend).toEqual([
			{ date: "2026-06-01", pct: 90 },
			{ date: "2026-06-03", pct: 60 },
		]);
	});

	it("uses the recorded `score` pct verbatim (rounded to an integer)", () => {
		const trend = buildParityTrend(
			records(
				line({
					at: "2026-06-01T10:00:00.000Z",
					kind: "parity",
					ok: 2,
					total: 3,
					score: 66.6667,
				}),
			),
		);
		expect(trend).toEqual([{ date: "2026-06-01", pct: 67 }]);
	});

	it("derives pct from ok/total when `score` is absent", () => {
		const trend = buildParityTrend(
			records(
				line({
					at: "2026-06-01T10:00:00.000Z",
					kind: "parity",
					ok: 3,
					total: 4,
				}),
			),
		);
		expect(trend).toEqual([{ date: "2026-06-01", pct: 75 }]);
	});

	it("collapses multiple lines on the same date into one point (last-of-day wins)", () => {
		const trend = buildParityTrend(
			records(
				line({
					at: "2026-06-01T08:00:00.000Z",
					kind: "parity",
					ok: 1,
					total: 10,
					score: 10,
				}),
				line({
					at: "2026-06-01T20:00:00.000Z",
					kind: "parity",
					ok: 8,
					total: 10,
					score: 80,
				}),
			),
		);
		expect(trend).toEqual([{ date: "2026-06-01", pct: 80 }]);
	});

	it("treats total=0 as 0% (no denominator, no NaN)", () => {
		const trend = buildParityTrend(
			records(
				line({
					at: "2026-06-01T10:00:00.000Z",
					kind: "parity",
					ok: 0,
					total: 0,
				}),
			),
		);
		expect(trend).toEqual([{ date: "2026-06-01", pct: 0 }]);
	});

	it("skips parity lines without a string `at` (they cannot anchor a point)", () => {
		const trend = buildParityTrend(
			records(line({ kind: "parity", ok: 5, total: 10, score: 50 })),
		);
		expect(trend).toEqual([]);
	});
});
