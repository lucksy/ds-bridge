// AN3 — executive rollup engine. Test-first: a PURE assembler that composes the
// already-computed engine outputs (S1 systemScore · B1 import coverage · AN1
// consistency · AN2 debt) into the leadership headlines (SPEC-analytics §4). It
// MEASURES nothing new — every headline is a pass-through (adoption the lone
// derived ratio). Each headline is independently optional: an absent / no-data /
// zero-denominator source omits its headline (absent-not-zero), never throws.
import { describe, expect, it } from "vitest";
import type { ConsistencyOutcome } from "../../../src/engines/report/consistency.js";
import {
	buildExecutive,
	type ExecutiveInput,
} from "../../../src/engines/report/executive.js";
import type {
	ImportCoverage,
	SystemScore,
} from "../../../src/engines/report/types.js";

/** A minimal ok system score with an explicit current + trend. */
function systemScore(
	current: number,
	trend: SystemScore["trend"] = [],
): SystemScore {
	return { current, components: [], trend };
}

/** A minimal import-coverage summary. */
function coverage(imported: number, total: number): ImportCoverage {
	return { imported, total, uncovered: [], uncoveredTotal: 0 };
}

describe("buildExecutive", () => {
	it("empty input → an empty rollup (every headline absent, never throws)", () => {
		expect(buildExecutive({})).toEqual({});
	});

	it("health + trend come from the system score (threaded verbatim)", () => {
		const trend = [
			{ date: "2026-01-01", score: 80 },
			{ date: "2026-02-01", score: 87 },
		];
		const rollup = buildExecutive({ systemScore: systemScore(87, trend) });
		expect(rollup.health).toBe(87);
		expect(rollup.trend).toEqual(trend);
		// No other source → those headlines stay absent.
		expect(rollup.adoption).toBeUndefined();
		expect(rollup.consistency).toBeUndefined();
		expect(rollup.debt).toBeUndefined();
	});

	it("trend is gated on the system score — no score, no trend", () => {
		const rollup = buildExecutive({
			debt: { pct: 18, level: "low", items: [] },
		});
		expect("trend" in rollup).toBe(false);
	});

	it("adoption = 100·imported/total, half-up rounded once", () => {
		// 100·1/8 = 12.5 → 13 (half-up).
		expect(buildExecutive({ coverage: coverage(1, 8) }).adoption).toBe(13);
		// 100·3/4 = 75.
		expect(buildExecutive({ coverage: coverage(3, 4) }).adoption).toBe(75);
	});

	it("adoption clamps to 0–100 when imported exceeds total", () => {
		expect(buildExecutive({ coverage: coverage(5, 4) }).adoption).toBe(100);
	});

	it("adoption is absent (not 0%) when the denominator is zero", () => {
		const rollup = buildExecutive({ coverage: coverage(0, 0) });
		expect("adoption" in rollup).toBe(false);
	});

	it("consistency is the AN1 score when ok, absent when no-data", () => {
		const ok: ConsistencyOutcome = { kind: "ok", score: 91, components: [] };
		expect(buildExecutive({ consistency: ok }).consistency).toBe(91);

		const noData: ConsistencyOutcome = { kind: "no-data" };
		const rollup = buildExecutive({ consistency: noData });
		expect("consistency" in rollup).toBe(false);
	});

	it("debt is the AN2 pct — including 0, a REAL no-debt headline (not absent)", () => {
		expect(
			buildExecutive({ debt: { pct: 18, level: "low", items: [] } }).debt,
		).toBe(18);
		// The empty/no-debt rollup is a present 0, not an absent headline.
		const rollup = buildExecutive({
			debt: { pct: 0, level: "low", items: [] },
		});
		expect(rollup.debt).toBe(0);
	});

	it("composes all four sources into the three vision headlines + adoption + trend", () => {
		const rollup = buildExecutive({
			systemScore: systemScore(87, [{ date: "2026-02-01", score: 87 }]),
			coverage: coverage(3, 4),
			consistency: { kind: "ok", score: 91, components: [] },
			debt: { pct: 18, level: "low", items: [] },
		});
		expect(rollup).toEqual({
			health: 87,
			adoption: 75,
			consistency: 91,
			debt: 18,
			trend: [{ date: "2026-02-01", score: 87 }],
		});
	});

	it("never throws on malformed inputs — coerces and degrades", () => {
		const garbage = {
			systemScore: { current: "nope", trend: "not-an-array" },
			coverage: { imported: "x", total: "y" },
			consistency: { kind: "ok", score: Number.NaN },
			debt: { pct: undefined },
		} as unknown as ExecutiveInput;
		expect(() => buildExecutive(garbage)).not.toThrow();
		const rollup = buildExecutive(garbage);
		// systemScore present (garbage current) → health coerced to 0, trend to [].
		expect(rollup.health).toBe(0);
		expect(rollup.trend).toEqual([]);
		// coverage total coerces to 0 → adoption absent (zero denominator).
		expect("adoption" in rollup).toBe(false);
		// consistency ok with NaN score → coerced to 0.
		expect(rollup.consistency).toBe(0);
		// debt present with bad pct → coerced to 0.
		expect(rollup.debt).toBe(0);
	});
});
