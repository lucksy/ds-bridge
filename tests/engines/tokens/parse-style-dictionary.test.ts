// T1.4 — Style Dictionary adapter tests (TDD, written before implementation).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStyleDictionary } from "../../../src/engines/tokens/parse-style-dictionary.js";
import type { TokenMap } from "../../../src/engines/tokens/types.js";

const fixturesRoot = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"tokens",
);

function loadJson(relPath: string): unknown {
	return JSON.parse(readFileSync(join(fixturesRoot, relPath), "utf8"));
}

describe("parseStyleDictionary — golden", () => {
	it("parses the golden fixture deep-equal to its expected.json twin", () => {
		const source = loadJson("style-dictionary/tokens.json");
		const expected = loadJson("style-dictionary/expected.json") as TokenMap;

		const outcome = parseStyleDictionary(source);

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map).toEqual(expected);
	});

	it("emits no warnings for the clean golden fixture", () => {
		const outcome = parseStyleDictionary(
			loadJson("style-dictionary/tokens.json"),
		);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.warnings).toEqual([]);
	});
});

describe("parseStyleDictionary — leaves & metadata", () => {
	it("treats objects with a value key as leaves and maps comment to description", () => {
		const outcome = parseStyleDictionary({
			color: { base: { blue: { value: "#3b82f6", comment: "Primary blue" } } },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens).toEqual([
			{
				name: "color.base.blue",
				type: "color",
				value: "#3b82f6",
				description: "Primary blue",
				group: "color",
			},
		]);
	});

	it("omits description when no comment is present", () => {
		const outcome = parseStyleDictionary({
			color: { gray: { value: "#fff" } },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const token = outcome.map.tokens[0];
		expect(token).toBeDefined();
		expect(token?.description).toBeUndefined();
		expect("description" in (token ?? {})).toBe(false);
	});

	it("sets format to style-dictionary", () => {
		const outcome = parseStyleDictionary({ color: { x: { value: "#000" } } });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.format).toBe("style-dictionary");
	});

	it("preserves numeric values as authored", () => {
		const outcome = parseStyleDictionary({ size: { base: { value: 16 } } });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]?.value).toBe(16);
	});
});

describe("parseStyleDictionary — type heuristics (first path segment)", () => {
	const cases: ReadonlyArray<[string, string]> = [
		["color", "color"],
		["size", "dimension"],
		["space", "dimension"],
		["spacing", "dimension"],
		["time", "duration"],
		["asset", "other"],
		["content", "other"],
		["mysteryCategory", "other"],
	];

	for (const [segment, expectedType] of cases) {
		it(`maps first segment "${segment}" to type "${expectedType}"`, () => {
			const outcome = parseStyleDictionary({
				[segment]: { leaf: { value: "x" } },
			});
			expect(outcome.kind).toBe("ok");
			if (outcome.kind !== "ok") return;
			expect(outcome.map.tokens[0]?.type).toBe(expectedType);
			expect(outcome.map.tokens[0]?.group).toBe(segment);
		});
	}
});

describe("parseStyleDictionary — references / aliases", () => {
	it("strips trailing .value, records aliasOf, and resolves the target value", () => {
		const outcome = parseStyleDictionary({
			color: {
				base: { blue: { value: "#3b82f6" } },
				brand: { primary: { value: "{color.base.blue.value}" } },
			},
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const primary = outcome.map.tokens.find(
			(t) => t.name === "color.brand.primary",
		);
		expect(primary).toEqual({
			name: "color.brand.primary",
			type: "color",
			value: "#3b82f6",
			aliasOf: "color.base.blue",
			group: "color",
		});
	});

	it("resolves transitive alias chains to the terminal value", () => {
		const outcome = parseStyleDictionary({
			color: {
				a: { value: "#111111" },
				b: { value: "{color.a.value}" },
				c: { value: "{color.b.value}" },
			},
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const c = outcome.map.tokens.find((t) => t.name === "color.c");
		expect(c?.value).toBe("#111111");
		expect(c?.aliasOf).toBe("color.b");
	});

	it("returns alias-cycle for cyclic references", () => {
		const outcome = parseStyleDictionary({
			color: {
				a: { value: "{color.b.value}" },
				b: { value: "{color.c.value}" },
				c: { value: "{color.a.value}" },
			},
		});
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "alias-cycle")).toBe(true);
	});

	it("returns unknown-alias for missing references", () => {
		const outcome = parseStyleDictionary({
			color: { brand: { value: "{color.does.not.exist.value}" } },
		});
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "unknown-alias")).toBe(true);
	});
});

describe("parseStyleDictionary — invalid shapes", () => {
	it("rejects a non-object source", () => {
		const outcome = parseStyleDictionary("not an object");
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "invalid-shape")).toBe(true);
	});

	it("rejects null", () => {
		const outcome = parseStyleDictionary(null);
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors[0]?.code).toBe("invalid-shape");
	});

	it("rejects an array source", () => {
		const outcome = parseStyleDictionary([{ value: "x" }]);
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors[0]?.code).toBe("invalid-shape");
	});

	it("rejects a leaf whose value is itself an object (not a simple SD value)", () => {
		const outcome = parseStyleDictionary({
			color: { weird: { value: { nested: true } } },
		});
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "invalid-shape")).toBe(true);
	});

	it("rejects an empty object (no tokens at all)", () => {
		const outcome = parseStyleDictionary({});
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors[0]?.code).toBe("invalid-shape");
	});
});

describe("parseStyleDictionary — ordering", () => {
	it("sorts tokens by name", () => {
		const outcome = parseStyleDictionary({
			color: { zeta: { value: "#000" }, alpha: { value: "#fff" } },
			size: { mid: { value: "8px" } },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const names = outcome.map.tokens.map((t) => t.name);
		expect(names).toEqual([...names].sort());
		expect(names).toEqual(["color.alpha", "color.zeta", "size.mid"]);
	});
});
