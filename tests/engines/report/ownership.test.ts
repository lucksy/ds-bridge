// C9 / M3.6 — ownership-leaderboard engine. Test-first: a pure re-fold of the
// adoption `byDirectory` refs/literals onto named owners (glob/prefix match),
// summed per owner into an on-system %, worst-pct-first. Pure: byDirectory +
// ownership rules in → OwnershipRow[] out. No fs/clock/network; deterministic.
import { describe, expect, it } from "vitest";
import type { OwnerRule } from "../../../src/config.js";
import {
	matchOwner,
	parseCodeowners,
	rollupByOwner,
} from "../../../src/engines/report/ownership.js";

/** One adoption byDirectory bucket. */
interface DirBucket {
	dir: string;
	refs: number;
	literals: number;
}

function dirs(...buckets: [string, number, number][]): DirBucket[] {
	return buckets.map(([dir, refs, literals]) => ({ dir, refs, literals }));
}

function rules(...pairs: [string, string[]][]): OwnerRule[] {
	return pairs.map(([owner, paths]) => ({ owner, paths }));
}

describe("matchOwner (glob/prefix directory → owner)", () => {
	const ownership = rules(
		["@core", ["src/**"]],
		["@team-checkout", ["src/checkout/**"]],
	);

	it("matches a directory under a `**` glob", () => {
		expect(matchOwner("src/components", ownership)).toBe("@core");
	});

	it("LAST matching rule wins (CODEOWNERS semantics)", () => {
		// src/checkout matches BOTH src/** and src/checkout/** — the later rule wins.
		expect(matchOwner("src/checkout/cart", ownership)).toBe("@team-checkout");
	});

	it("returns undefined for a directory matching no rule", () => {
		expect(matchOwner("vendor/lib", ownership)).toBeUndefined();
	});

	it("matches a plain prefix (no glob) against a nested directory", () => {
		expect(matchOwner("src/ui/button", rules(["@ui", ["src/ui"]]))).toBe("@ui");
	});

	it("matches a single-segment `*` glob but not a deeper path", () => {
		const r = rules(["@top", ["src/*"]]);
		expect(matchOwner("src/button", r)).toBe("@top");
		expect(matchOwner("src/ui/button", r)).toBeUndefined();
	});

	it("matches an exact path", () => {
		expect(matchOwner("src/legacy", rules(["@old", ["src/legacy"]]))).toBe(
			"@old",
		);
	});
});

describe("rollupByOwner", () => {
	it("empty byDirectory → []", () => {
		expect(rollupByOwner([], rules(["@core", ["src/**"]]))).toEqual([]);
	});

	it("no ownership rules → []", () => {
		expect(rollupByOwner(dirs(["src/a", 3, 1]), [])).toEqual([]);
	});

	it("maps each directory to its owner and sums refs/literals", () => {
		const rows = rollupByOwner(
			dirs(
				["src/checkout/cart", 4, 0],
				["src/checkout/pay", 2, 2],
				["src/components", 9, 1],
			),
			rules(["@core", ["src/**"]], ["@team-checkout", ["src/checkout/**"]]),
		);
		expect(rows).toEqual([
			// @team-checkout: refs 6, literals 2 → 75%
			{ owner: "@team-checkout", refs: 6, literals: 2, pct: 75 },
			// @core: refs 9, literals 1 → 90%
			{ owner: "@core", refs: 9, literals: 1, pct: 90 },
		]);
	});

	it("sorts worst-pct-first", () => {
		const rows = rollupByOwner(
			dirs(["a/x", 9, 1], ["b/y", 1, 9]),
			rules(["@good", ["a/**"]], ["@bad", ["b/**"]]),
		);
		expect(rows.map((r) => r.owner)).toEqual(["@bad", "@good"]);
		expect(rows[0]?.pct).toBe(10);
		expect(rows[1]?.pct).toBe(90);
	});

	it("breaks a pct tie by owner name ascending", () => {
		const rows = rollupByOwner(
			dirs(["z/x", 1, 1], ["a/y", 1, 1]),
			rules(["@zed", ["z/**"]], ["@alpha", ["a/**"]]),
		);
		// Both 50% → tie broken by name asc: @alpha before @zed.
		expect(rows.map((r) => r.owner)).toEqual(["@alpha", "@zed"]);
	});

	it("buckets directories matching no rule into `unowned`", () => {
		const rows = rollupByOwner(
			dirs(["src/a", 3, 1], ["vendor/x", 0, 4]),
			rules(["@core", ["src/**"]]),
		);
		expect(rows).toEqual([
			// unowned: 0 refs / 4 literals → 0%
			{ owner: "unowned", refs: 0, literals: 4, pct: 0 },
			// @core: 3 / 1 → 75%
			{ owner: "@core", refs: 3, literals: 1, pct: 75 },
		]);
	});

	it("pct is 0 when an owner's refs+literals denominator is 0", () => {
		const rows = rollupByOwner(
			dirs(["src/a", 0, 0]),
			rules(["@core", ["src/**"]]),
		);
		expect(rows).toEqual([{ owner: "@core", refs: 0, literals: 0, pct: 0 }]);
	});

	it("LAST-matching-rule-wins folds a dir onto the more-specific owner", () => {
		// src/checkout matches src/** (then) src/checkout/** → @team-checkout owns it.
		const rows = rollupByOwner(
			dirs(["src/checkout/cart", 1, 3], ["src/other", 4, 0]),
			rules(["@core", ["src/**"]], ["@team-checkout", ["src/checkout/**"]]),
		);
		const checkout = rows.find((r) => r.owner === "@team-checkout");
		const core = rows.find((r) => r.owner === "@core");
		expect(checkout).toEqual({
			owner: "@team-checkout",
			refs: 1,
			literals: 3,
			pct: 25,
		});
		expect(core).toEqual({ owner: "@core", refs: 4, literals: 0, pct: 100 });
	});

	it("tolerates malformed bucket fields (coerces non-finite to 0)", () => {
		const rows = rollupByOwner(
			[
				{ dir: "src/a", refs: Number.NaN, literals: 2 },
				{ dir: "src/b", refs: 3, literals: Number.POSITIVE_INFINITY },
			],
			rules(["@core", ["src/**"]]),
		);
		// NaN→0, Infinity→0: refs 3, literals 2 → 60%.
		expect(rows).toEqual([{ owner: "@core", refs: 3, literals: 2, pct: 60 }]);
	});
});

describe("parseCodeowners (CODEOWNERS line grammar)", () => {
	it("parses `<path-glob> @owner` lines into ownership rules", () => {
		const rules = parseCodeowners(
			["src/checkout/** @team-checkout", "src/** @core"].join("\n"),
		);
		expect(rules).toEqual([
			{ owner: "@team-checkout", paths: ["src/checkout/**"] },
			{ owner: "@core", paths: ["src/**"] },
		]);
	});

	it("expands a multi-owner line into one rule per owner", () => {
		const rules = parseCodeowners("src/** @core @reviewers");
		expect(rules).toEqual([
			{ owner: "@core", paths: ["src/**"] },
			{ owner: "@reviewers", paths: ["src/**"] },
		]);
	});

	it("skips comment (#) and blank lines", () => {
		const rules = parseCodeowners(
			["# top-level comment", "", "  ", "src/** @core", "# trailing"].join(
				"\n",
			),
		);
		expect(rules).toEqual([{ owner: "@core", paths: ["src/**"] }]);
	});

	it("preserves source order (so LAST-match-wins later folds correctly)", () => {
		const rules = parseCodeowners(
			["src/** @core", "src/checkout/** @team-checkout"].join("\n"),
		);
		expect(rules.map((r) => r.owner)).toEqual(["@core", "@team-checkout"]);
		// And rolling up honors last-match-wins for a checkout dir.
		expect(matchOwner("src/checkout/cart", rules)).toBe("@team-checkout");
	});

	it("skips a line with a path but no owner", () => {
		expect(parseCodeowners("src/**")).toEqual([]);
	});

	it("empty / whitespace-only text → []", () => {
		expect(parseCodeowners("")).toEqual([]);
		expect(parseCodeowners("\n  \n")).toEqual([]);
	});
});
