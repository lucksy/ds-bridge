// AN2 — debt rollup engine. Test-first: unify the four scattered debt signals
// (deprecated · detached · off-system · duplicate) into one itemized model + a
// normalized 0–100 debt % + directed recommendations (SPEC-analytics §3).
// Pure; empty → a real "no debt" state (NOT no-data); never throws.
import { describe, expect, it } from "vitest";
import { buildDebt } from "../../../src/engines/report/debt.js";

/** Find an item by its subject. */
function item(rollup: ReturnType<typeof buildDebt>, subject: string) {
	return rollup.items.find((i) => i.subject === subject);
}

describe("buildDebt", () => {
	it("empty input → a real no-debt state, not no-data", () => {
		expect(buildDebt({})).toEqual({ pct: 0, level: "low", items: [] });
	});

	it("deprecated usage → one item per group, debt = count·8, directed recommendation", () => {
		const rollup = buildDebt({
			deprecatedUsage: [{ componentName: "LegacyButton", count: 3 }],
		});
		// 3·8 = 24.
		expect(rollup.pct).toBe(24);
		const it = item(rollup, "LegacyButton");
		expect(it).toMatchObject({ kind: "deprecated", count: 3, weight: 8 });
		expect(it?.recommendation).toBe(
			'Replace deprecated "LegacyButton" with its supported DS component',
		);
	});

	it("detached candidate → debt = 1·5 each, recommendation carries the heuristic caveat", () => {
		const rollup = buildDebt({
			detachedCandidates: [{ nodeId: "2:2", name: "Card", heuristic: true }],
		});
		expect(rollup.pct).toBe(5);
		const it = item(rollup, "Card");
		expect(it).toMatchObject({ kind: "detached", count: 1, weight: 5 });
		expect(it?.recommendation).toMatch(/heuristic/i);
	});

	it("off-system literals → one aggregate item, debt = offSystem·2", () => {
		const rollup = buildDebt({ offSystem: 10 });
		// 10·2 = 20.
		expect(rollup.pct).toBe(20);
		const it = item(rollup, "off-system values");
		expect(it).toMatchObject({ kind: "off-system", count: 10, weight: 2 });
		expect(it?.recommendation).toBe(
			"Tokenize 10 off-system values (run /ds-bridge:ds-lint --fix)",
		);
		// Zero off-system → no item at all.
		expect(buildDebt({ offSystem: 0 }).items).toHaveLength(0);
	});

	it("duplicate cluster → debt = (implementations−1)·6, merge recommendation names the count", () => {
		const rollup = buildDebt({
			duplicates: [{ name: "Card", implementations: 4 }],
		});
		// (4−1)·6 = 18.
		expect(rollup.pct).toBe(18);
		const it = item(rollup, "Card");
		expect(it).toMatchObject({ kind: "duplicate", count: 4, weight: 6 });
		expect(it?.recommendation).toBe(
			'Merge 4 implementations of "Card" into one DS component',
		);
		// A single implementation is not a duplicate — no item.
		expect(
			buildDebt({ duplicates: [{ name: "Solo", implementations: 1 }] }).items,
		).toHaveLength(0);
	});

	it("sums every signal into the debt % and sorts items by weight·magnitude desc", () => {
		const rollup = buildDebt({
			deprecatedUsage: [{ componentName: "LegacyButton", count: 3 }], // 24
			offSystem: 10, // 20
			duplicates: [{ name: "Card", implementations: 4 }], // 18
			detachedCandidates: [{ nodeId: "2:2", name: "Ghost", heuristic: true }], // 5
		});
		// 24 + 20 + 18 + 5 = 67.
		expect(rollup.pct).toBe(67);
		expect(rollup.level).toBe("high");
		expect(rollup.items.map((i) => i.subject)).toEqual([
			"LegacyButton",
			"off-system values",
			"Card",
			"Ghost",
		]);
	});

	it("bands the level: <25 low, 25–59 medium, ≥60 high", () => {
		expect(buildDebt({ offSystem: 12 }).level).toBe("low"); // 24
		// 20 (off-system 10) + 5 (one detached) = 25 → medium boundary.
		expect(
			buildDebt({
				offSystem: 10,
				detachedCandidates: [{ nodeId: "a", name: "X", heuristic: true }],
			}).level,
		).toBe("medium");
		expect(
			buildDebt({ deprecatedUsage: [{ componentName: "L", count: 7 }] }).level,
		).toBe("medium"); // 56
		expect(buildDebt({ offSystem: 30 }).level).toBe("high"); // 60 boundary
	});

	it("clamps the debt % at 100", () => {
		expect(buildDebt({ offSystem: 10_000 }).pct).toBe(100);
	});

	it("never throws on malformed entries (skips them)", () => {
		expect(() =>
			buildDebt({
				deprecatedUsage: [
					// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
					{ componentName: 123 as any, count: 2 },
					// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
					null as any,
					{ componentName: "Real", count: 1 },
				],
				// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
				detachedCandidates: [null as any],
				// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
				offSystem: "nope" as any,
			}),
		).not.toThrow();
		// Only the one valid deprecated group survives: 1·8 = 8.
		const rollup = buildDebt({
			deprecatedUsage: [
				// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
				{ componentName: "" as any, count: 9 },
				{ componentName: "Real", count: 1 },
			],
		});
		expect(rollup.items.map((i) => i.subject)).toEqual(["Real"]);
		expect(rollup.pct).toBe(8);
	});
});
