// C11 / M2.4 — frame-implementability engine. Test-first: reconstruct a
// FrameImplementability {pct, resolved, total, gaps:[{reason,count}]} from the
// LATEST `frame-impl` history record. Pure: the latest frame-impl record (or
// undefined) in → the implementability rollup out; never throws.
//
// The `frame-impl` line (written by `ds-bridge frame-impl` at its io edge)
// carries resolvedCount / gapCount / pct + a per-reason `byReason` map. This
// engine surfaces the headline pct + a deterministic, capped gaps-by-reason list.
import { describe, expect, it } from "vitest";
import { buildFrameImplementability } from "../../../src/engines/report/frame-implementability.js";

describe("buildFrameImplementability", () => {
	it("returns the empty rollup when the record is absent", () => {
		expect(buildFrameImplementability(undefined)).toEqual({
			pct: 0,
			resolved: 0,
			total: 0,
			gaps: [],
		});
	});

	it("reconstructs pct / resolved / total from a populated frame-impl record", () => {
		const record = {
			at: "2026-06-07T10:00:00.000Z",
			kind: "frame-impl",
			frameName: "Card / Primary",
			fileKey: "ABcdEFghIJklMNopQRstUV",
			resolvedCount: 6,
			gapCount: 4,
			pct: 60,
			byReason: {
				"no-registry-match": 2,
				"no-token-match": 1,
				"near-token-only": 1,
			},
		};
		expect(buildFrameImplementability(record)).toEqual({
			pct: 60,
			resolved: 6,
			total: 10,
			gaps: [
				{ reason: "no-registry-match", count: 2 },
				{ reason: "near-token-only", count: 1 },
				{ reason: "no-token-match", count: 1 },
			],
		});
	});

	it("derives total from resolved + gap counts (resolved + total of byReason)", () => {
		const record = {
			kind: "frame-impl",
			resolvedCount: 3,
			gapCount: 2,
			pct: 60,
			byReason: { "no-registry-match": 2 },
		};
		const result = buildFrameImplementability(record);
		expect(result.resolved).toBe(3);
		expect(result.total).toBe(5);
	});

	it("derives pct from resolved/total when the record omits a precomputed pct", () => {
		const record = {
			kind: "frame-impl",
			resolvedCount: 3,
			gapCount: 1,
			byReason: { "no-token-match": 1 },
		};
		// 3 resolved of 4 total → 75%.
		expect(buildFrameImplementability(record).pct).toBe(75);
	});

	it("orders gaps by descending count, then reason name (deterministic)", () => {
		const record = {
			kind: "frame-impl",
			resolvedCount: 0,
			gapCount: 6,
			pct: 0,
			byReason: {
				"near-token-only": 1,
				"no-registry-match": 3,
				"ambiguous-registry-match": 1,
				"no-token-match": 1,
			},
		};
		const gaps = buildFrameImplementability(record).gaps;
		expect(gaps).toEqual([
			{ reason: "no-registry-match", count: 3 },
			{ reason: "ambiguous-registry-match", count: 1 },
			{ reason: "near-token-only", count: 1 },
			{ reason: "no-token-match", count: 1 },
		]);
	});

	it("caps the gaps list (topGaps) to a bounded number of reasons", () => {
		const byReason: Record<string, number> = {};
		for (let i = 0; i < 12; i += 1) byReason[`reason-${i}`] = i + 1;
		const record = {
			kind: "frame-impl",
			resolvedCount: 0,
			gapCount: 78,
			pct: 0,
			byReason,
		};
		const gaps = buildFrameImplementability(record).gaps;
		expect(gaps.length).toBeLessThanOrEqual(5);
		// The highest-count reason survives the cap (reason-11 = 12).
		expect(gaps[0]).toEqual({ reason: "reason-11", count: 12 });
	});

	it("drops zero/negative/non-numeric byReason buckets", () => {
		const record = {
			kind: "frame-impl",
			resolvedCount: 1,
			gapCount: 1,
			pct: 50,
			byReason: {
				"no-token-match": 1,
				"empty-bucket": 0,
				"bad-bucket": "nope",
			},
		};
		expect(buildFrameImplementability(record).gaps).toEqual([
			{ reason: "no-token-match", count: 1 },
		]);
	});

	it("treats a total of 0 as 0% (no denominator, no NaN)", () => {
		const record = {
			kind: "frame-impl",
			resolvedCount: 0,
			gapCount: 0,
			byReason: {},
		};
		const result = buildFrameImplementability(record);
		expect(result).toEqual({ pct: 0, resolved: 0, total: 0, gaps: [] });
	});
});
