// T1.3 — Tokens Studio parser tests. Written test-first (red) against the
// frozen contract in src/engines/tokens/types.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTokensStudio } from "../../../src/engines/tokens/parse-tokens-studio.js";
import type { TokenMap } from "../../../src/engines/tokens/types.js";

const fixturesRoot = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"tokens",
	"tokens-studio",
);

function loadJson(relPath: string): unknown {
	return JSON.parse(readFileSync(join(fixturesRoot, relPath), "utf8"));
}

describe("parseTokensStudio — golden master", () => {
	it("parses the tokens-studio fixture into its expected.json twin", () => {
		const source = loadJson("tokens.json");
		const expected = loadJson("expected.json") as TokenMap;

		const outcome = parseTokensStudio(source);

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map).toEqual(expected);
	});

	it("emits the tokens-studio format tag", () => {
		const outcome = parseTokensStudio(loadJson("tokens.json"));
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.format).toBe("tokens-studio");
	});

	it("returns tokens sorted by name", () => {
		const outcome = parseTokensStudio(loadJson("tokens.json"));
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const names = outcome.map.tokens.map((t) => t.name);
		expect(names).toEqual([...names].sort());
	});
});

describe("parseTokensStudio — sets and naming", () => {
	it("uses the dot path WITHIN the set as the name (set name is not part of it)", () => {
		const outcome = parseTokensStudio({
			ui: {
				colors: { primary: { value: "#000000", type: "color" } },
			},
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const token = outcome.map.tokens.find((t) => t.name === "colors.primary");
		expect(token).toBeDefined();
		expect(token?.group).toBe("ui");
	});

	it("records the set the final value came from as group", () => {
		const outcome = parseTokensStudio(loadJson("tokens.json"));
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const aliasToken = outcome.map.tokens.find(
			(t) => t.name === "action.primary",
		);
		// action.primary lives in the `semantic` set even though it points at global
		expect(aliasToken?.group).toBe("semantic");
	});

	it("processes sets in $metadata.tokenSetOrder order with later sets overriding earlier ones", () => {
		const outcome = parseTokensStudio({
			base: { brand: { color: { value: "#111111", type: "color" } } },
			theme: { brand: { color: { value: "#222222", type: "color" } } },
			$metadata: { tokenSetOrder: ["base", "theme"] },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const matches = outcome.map.tokens.filter((t) => t.name === "brand.color");
		expect(matches).toHaveLength(1);
		expect(matches[0]?.value).toBe("#222222");
		expect(matches[0]?.group).toBe("theme");
	});

	it("falls back to object key order when $metadata is absent", () => {
		const outcome = parseTokensStudio({
			first: { brand: { color: { value: "#aaaaaa", type: "color" } } },
			second: { brand: { color: { value: "#bbbbbb", type: "color" } } },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const match = outcome.map.tokens.find((t) => t.name === "brand.color");
		// `second` comes later in key order, so it wins
		expect(match?.value).toBe("#bbbbbb");
		expect(match?.group).toBe("second");
	});

	it("honors tokenSetOrder even when it differs from object key order", () => {
		const outcome = parseTokensStudio({
			theme: { brand: { color: { value: "#222222", type: "color" } } },
			base: { brand: { color: { value: "#111111", type: "color" } } },
			$metadata: { tokenSetOrder: ["base", "theme"] },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const match = outcome.map.tokens.find((t) => t.name === "brand.color");
		// theme is last in tokenSetOrder → wins, regardless of key order
		expect(match?.value).toBe("#222222");
		expect(match?.group).toBe("theme");
	});
});

describe("parseTokensStudio — leaf shapes", () => {
	it("accepts classic value/type leaves", () => {
		const outcome = parseTokensStudio({
			set: { a: { value: "#123456", type: "color" } },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]?.value).toBe("#123456");
		expect(outcome.map.tokens[0]?.type).toBe("color");
	});

	it("accepts newer $value/$type leaves", () => {
		const outcome = parseTokensStudio({
			set: { a: { $value: "#abcdef", $type: "color" } },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]?.value).toBe("#abcdef");
		expect(outcome.map.tokens[0]?.type).toBe("color");
	});

	it("keeps composite (object) values as-is", () => {
		const shadow = {
			x: "0",
			y: "2",
			blur: "4",
			spread: "0",
			color: "#000000",
		};
		const outcome = parseTokensStudio({
			set: { card: { value: shadow, type: "boxShadow" } },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]?.type).toBe("shadow");
		expect(outcome.map.tokens[0]?.value).toEqual(shadow);
	});

	it("carries the description when authored", () => {
		const outcome = parseTokensStudio({
			set: { a: { value: "1", type: "number", description: "count" } },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]?.description).toBe("count");
	});
});

describe("parseTokensStudio — type mapping", () => {
	const cases: ReadonlyArray<readonly [string, string]> = [
		["spacing", "dimension"],
		["sizing", "dimension"],
		["borderRadius", "dimension"],
		["borderWidth", "dimension"],
		["dimension", "dimension"],
		["fontWeights", "fontWeight"],
		["fontFamilies", "fontFamily"],
		["color", "color"],
		["opacity", "number"],
		["number", "number"],
		["boxShadow", "shadow"],
		["typography", "typography"],
		["lineHeights", "other"],
		["somethingUnknown", "other"],
	];

	it.each(cases)("maps source type %s → %s", (sourceType, expectedType) => {
		const value = sourceType === "boxShadow" ? { x: "0" } : "1";
		const outcome = parseTokensStudio({
			set: { a: { value, type: sourceType } },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]?.type).toBe(expectedType);
	});
});

describe("parseTokensStudio — aliases", () => {
	it("resolves an alias against the merged view and records aliasOf", () => {
		const outcome = parseTokensStudio({
			global: { base: { value: "#0a0a0a", type: "color" } },
			semantic: { fg: { value: "{base}", type: "color" } },
			$metadata: { tokenSetOrder: ["global", "semantic"] },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const fg = outcome.map.tokens.find((t) => t.name === "fg");
		expect(fg?.value).toBe("#0a0a0a");
		expect(fg?.aliasOf).toBe("base");
	});

	it("resolves transitive aliases (chain) to the final value", () => {
		const outcome = parseTokensStudio({
			set: {
				a: { value: "#ff0000", type: "color" },
				b: { value: "{a}", type: "color" },
				c: { value: "{b}", type: "color" },
			},
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const c = outcome.map.tokens.find((t) => t.name === "c");
		expect(c?.value).toBe("#ff0000");
		expect(c?.aliasOf).toBe("b");
	});

	it("resolves aliases across sets in set order (later set overrides target)", () => {
		const outcome = parseTokensStudio({
			global: { brand: { value: "#111111", type: "color" } },
			override: { brand: { value: "#999999", type: "color" } },
			semantic: { fg: { value: "{brand}", type: "color" } },
			$metadata: { tokenSetOrder: ["global", "override", "semantic"] },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const fg = outcome.map.tokens.find((t) => t.name === "fg");
		expect(fg?.value).toBe("#999999");
		expect(fg?.aliasOf).toBe("brand");
	});

	it("returns unknown-alias for a missing target", () => {
		const outcome = parseTokensStudio({
			set: { fg: { value: "{does.not.exist}", type: "color" } },
		});
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "unknown-alias")).toBe(true);
	});

	it("returns alias-cycle for a cyclic reference", () => {
		const outcome = parseTokensStudio({
			set: {
				a: { value: "{b}", type: "color" },
				b: { value: "{a}", type: "color" },
			},
		});
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "alias-cycle")).toBe(true);
	});
});

describe("parseTokensStudio — $themes (v1 decision)", () => {
	it("acknowledges $themes but emits NO tokens from it (not modeled in v1)", () => {
		const outcome = parseTokensStudio({
			global: { a: { value: "#000000", type: "color" } },
			$themes: [
				{
					id: "x",
					name: "light",
					selectedTokenSets: { global: "enabled" },
				},
			],
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens).toHaveLength(1);
		expect(outcome.map.tokens[0]?.name).toBe("a");
	});

	it("does not treat $metadata as a token set", () => {
		const outcome = parseTokensStudio({
			global: { a: { value: "#000000", type: "color" } },
			$metadata: { tokenSetOrder: ["global"] },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens.every((t) => !t.name.startsWith("$"))).toBe(true);
		expect(outcome.map.tokens).toHaveLength(1);
	});
});

describe("parseTokensStudio — invalid shapes", () => {
	it("returns invalid-shape for a non-object source", () => {
		for (const bad of [null, undefined, 42, "str", true, []]) {
			const outcome = parseTokensStudio(bad);
			expect(outcome.kind).toBe("error");
			if (outcome.kind !== "error") continue;
			expect(outcome.errors.some((e) => e.code === "invalid-shape")).toBe(true);
		}
	});

	it("returns invalid-shape when a token set is not an object", () => {
		const outcome = parseTokensStudio({ global: 5 });
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "invalid-shape")).toBe(true);
	});

	it("returns invalid-shape when a leaf value is missing", () => {
		const outcome = parseTokensStudio({
			set: { a: { type: "color" } },
		});
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "invalid-shape")).toBe(true);
	});

	it("never throws on adversarial input", () => {
		expect(() => parseTokensStudio({ a: { b: { c: () => 1 } } })).not.toThrow();
		expect(() => parseTokensStudio(Symbol("x"))).not.toThrow();
	});
});
