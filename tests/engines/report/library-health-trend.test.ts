// C6 / M3.4 — library-health-trend engine. Test-first: folds the dated
// `library-health` history lines into LibraryHealthTrendPoint[] (one point per
// distinct date, ascending, last-of-day wins). Pure: the shared tolerant
// `HistoryRecord[]` in → dated hygiene-count points out. Mirrors parity-trend.
import { describe, expect, it } from "vitest";
import { replayHistory } from "../../../src/engines/report/history-lines.js";
import { buildLibraryHealthTrend } from "../../../src/engines/report/library-health-trend.js";

/** Build one JSONL line from a record object. */
function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

/** Replay raw JSONL into the shared tolerant record list (the engine's input). */
function records(...lines: string[]) {
	return replayHistory(lines.join("\n"));
}

/** A well-formed `library-health` line (the L5 counts-only append shape). */
function lhLine(
	at: string | undefined,
	overrideHotspots: number,
	deprecatedUsage: number,
	detachedCandidates: number,
): string {
	return line({
		...(at !== undefined ? { at } : {}),
		kind: "library-health",
		overrideHotspots,
		deprecatedUsage,
		detachedCandidates,
	});
}

describe("buildLibraryHealthTrend", () => {
	it("returns an empty array when no library-health lines are present", () => {
		expect(buildLibraryHealthTrend(records())).toEqual([]);
		const onlyOther = records(
			line({ at: "2026-06-01T10:00:00.000Z", kind: "lint", byKind: {} }),
		);
		expect(buildLibraryHealthTrend(onlyOther)).toEqual([]);
	});

	it("maps each dated line to a hygiene-count point, ascending by date", () => {
		const trend = buildLibraryHealthTrend(
			records(
				lhLine("2026-06-03T10:00:00.000Z", 5, 4, 3),
				lhLine("2026-06-01T10:00:00.000Z", 9, 8, 7),
			),
		);
		expect(trend).toEqual([
			{ date: "2026-06-01", overrides: 9, deprecated: 8, detached: 7 },
			{ date: "2026-06-03", overrides: 5, deprecated: 4, detached: 3 },
		]);
	});

	it("collapses multiple lines on the same date into one point (last-of-day wins)", () => {
		const trend = buildLibraryHealthTrend(
			records(
				lhLine("2026-06-01T08:00:00.000Z", 1, 1, 1),
				lhLine("2026-06-01T20:00:00.000Z", 2, 3, 4),
			),
		);
		expect(trend).toEqual([
			{ date: "2026-06-01", overrides: 2, deprecated: 3, detached: 4 },
		]);
	});

	it("excludes lines without a string `at` (they cannot anchor a point)", () => {
		const trend = buildLibraryHealthTrend(records(lhLine(undefined, 5, 5, 5)));
		expect(trend).toEqual([]);
	});

	it("coerces corrupt/absent count fields to 0 (asNumber tolerance)", () => {
		const trend = buildLibraryHealthTrend(
			records(
				line({
					at: "2026-06-02T10:00:00.000Z",
					kind: "library-health",
					overrideHotspots: "lots",
					// deprecatedUsage absent
					detachedCandidates: 4,
				}),
			),
		);
		expect(trend).toEqual([
			{ date: "2026-06-02", overrides: 0, deprecated: 0, detached: 4 },
		]);
	});

	it("folds a single dated line into a one-point trend", () => {
		const trend = buildLibraryHealthTrend(
			records(lhLine("2026-06-08T10:00:00.000Z", 3, 3, 3)),
		);
		expect(trend).toEqual([
			{ date: "2026-06-08", overrides: 3, deprecated: 3, detached: 3 },
		]);
	});
});
