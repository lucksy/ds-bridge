// AN1 — consistency engine. Test-first: a pure weighted blend of three on-system
// sub-signals (token usage · component match · override cleanliness) into one
// 0–100 score (SPEC-analytics §2). Mirrors score.ts: present sub-signals only,
// renormalized weights, half-up rounding once, absent-not-zero, never throws.
import { describe, expect, it } from "vitest";
import {
	buildConsistency,
	type ConsistencyOutcome,
} from "../../../src/engines/report/consistency.js";

/** Narrow to the ok shape (test fails loudly if it is no-data). */
function ok(outcome: ConsistencyOutcome) {
	if (outcome.kind !== "ok") {
		throw new Error(`expected ok, got ${outcome.kind}`);
	}
	return outcome;
}

/** The sub-score for one kind, or undefined when that sub-signal is absent. */
function sub(outcome: ConsistencyOutcome, kind: string): number | undefined {
	if (outcome.kind !== "ok") return undefined;
	return outcome.components.find((c) => c.kind === kind)?.score;
}

describe("buildConsistency", () => {
	it("is no-data when no usable sub-signal is present", () => {
		expect(buildConsistency({})).toEqual({ kind: "no-data" });
		// tokens present but a zero denominator → the sub-signal is absent.
		expect(buildConsistency({ tokens: { refs: 0, literals: 0 } })).toEqual({
			kind: "no-data",
		});
		// components present but a zero denominator → absent.
		expect(buildConsistency({ components: { matched: 0, custom: 0 } })).toEqual(
			{ kind: "no-data" },
		);
	});

	it("tokens-only: score is the on-system ratio 100·refs/(refs+literals)", () => {
		const outcome = buildConsistency({ tokens: { refs: 80, literals: 20 } });
		expect(ok(outcome).score).toBe(80);
		expect(ok(outcome).components).toEqual([
			{ kind: "tokens", score: 80, weight: 40 },
		]);
	});

	it("components-only: score is the match ratio 100·matched/(matched+custom)", () => {
		const outcome = buildConsistency({
			components: { matched: 9, custom: 1 },
		});
		expect(ok(outcome).score).toBe(90);
		expect(sub(outcome, "components")).toBe(90);
	});

	it("overrides-only: documented-opinion penalty max(0, 100 − 8·hotspots)", () => {
		expect(ok(buildConsistency({ overrides: { hotspots: 2 } })).score).toBe(84);
		// hotspots = 0 is a PRESENT, perfect signal (not absent).
		expect(ok(buildConsistency({ overrides: { hotspots: 0 } })).score).toBe(
			100,
		);
		// large hotspot count clamps at 0, never negative.
		expect(ok(buildConsistency({ overrides: { hotspots: 50 } })).score).toBe(0);
	});

	it("blends all three present sub-signals by their default weights (40/40/20)", () => {
		const outcome = buildConsistency({
			tokens: { refs: 80, literals: 20 }, // 80
			components: { matched: 9, custom: 1 }, // 90
			overrides: { hotspots: 2 }, // 84
		});
		// (80·40 + 90·40 + 84·20) / 100 = 8480/100 = 84.8 → 85.
		expect(ok(outcome).score).toBe(85);
		expect(ok(outcome).components.map((c) => c.kind)).toEqual([
			"tokens",
			"components",
			"overrides",
		]);
	});

	it("renormalizes weights over present sub-signals when one is absent", () => {
		const outcome = buildConsistency({
			tokens: { refs: 80, literals: 20 }, // 80, weight 40
			components: { matched: 9, custom: 1 }, // 90, weight 40
			// overrides absent → weights renormalize over 40+40.
		});
		// (80·40 + 90·40) / 80 = 6800/80 = 85.
		expect(ok(outcome).score).toBe(85);
	});

	it("rounds the composite half-up, once, at the end", () => {
		// refs 2 / literals 1 → 66.66…; alone → 67.
		expect(
			ok(buildConsistency({ tokens: { refs: 2, literals: 1 } })).score,
		).toBe(67);
	});

	it("rounds each component score for display while the composite uses raw sub-scores", () => {
		const outcome = buildConsistency({
			tokens: { refs: 2, literals: 1 }, // 66.66… → displays 67
			components: { matched: 1, custom: 0 }, // 100
		});
		// Composite from RAW: (66.66…·40 + 100·40)/80 = 83.33… → 83.
		expect(ok(outcome).score).toBe(83);
		// Display score is rounded.
		expect(sub(outcome, "tokens")).toBe(67);
	});

	it("honors a weights override", () => {
		const outcome = buildConsistency({
			tokens: { refs: 80, literals: 20 }, // 80
			components: { matched: 9, custom: 1 }, // 90
			weights: { tokens: 10, components: 90, overrides: 20 },
		});
		// (80·10 + 90·90)/100 = (800 + 8100)/100 = 89.
		expect(ok(outcome).score).toBe(89);
		expect(outcome.kind === "ok" && outcome.components[0]?.weight).toBe(10);
	});

	it("never throws on malformed numeric input (coerces, mirroring score.ts asNumber)", () => {
		expect(() =>
			buildConsistency({
				// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
				tokens: { refs: "80" as any, literals: Number.NaN as any },
				// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
				overrides: { hotspots: undefined as any },
			}),
		).not.toThrow();
		// refs coerces to 0 (non-number) and literals NaN→0 → denom 0 → tokens absent;
		// hotspots undefined→0 → overrides present at 100.
		const outcome = buildConsistency({
			// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
			overrides: { hotspots: undefined as any },
		});
		expect(ok(outcome).score).toBe(100);
	});
});
