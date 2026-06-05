// T1.5 — TokenIndex: byName / byValue lookups and nearest-color search by deltaE.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTokenIndex } from "../../../src/engines/tokens/token-index.js";
import type { Token, TokenMap } from "../../../src/engines/tokens/types.js";

function token(partial: Partial<Token> & Pick<Token, "name" | "value">): Token {
	return { type: "color", ...partial };
}

const tokens: Token[] = [
	token({ name: "color.brand.primary", value: "#3b82f6" }),
	token({ name: "color.brand.primary-alt", value: "rgb(59, 130, 246)" }),
	token({ name: "color.feedback.danger", value: "#dc2626" }),
	token({ name: "space.md", type: "dimension", value: "16px" }),
	token({ name: "space.md-rem", type: "dimension", value: "1rem" }),
	token({ name: "font.weight.bold", type: "fontWeight", value: 700 }),
];

describe("buildTokenIndex", () => {
	it("byName finds tokens by canonical name", () => {
		const index = buildTokenIndex(tokens);
		expect(index.byName.get("color.brand.primary")?.value).toBe("#3b82f6");
		expect(index.byName.get("nope")).toBeUndefined();
	});

	it("byValue groups tokens under canonical color values across spellings", () => {
		const index = buildTokenIndex(tokens);
		const hits = index.byValue.get("#3b82f6") ?? [];
		expect(hits.map((t) => t.name).sort()).toEqual([
			"color.brand.primary",
			"color.brand.primary-alt",
		]);
	});

	it("byValue groups dimensions under canonical px form", () => {
		const index = buildTokenIndex(tokens);
		const hits = index.byValue.get("16px") ?? [];
		expect(hits.map((t) => t.name).sort()).toEqual([
			"space.md",
			"space.md-rem",
		]);
	});

	it("byValue indexes numeric values under their string form", () => {
		const index = buildTokenIndex(tokens);
		expect((index.byValue.get("700") ?? []).map((t) => t.name)).toEqual([
			"font.weight.bold",
		]);
	});

	it("nearest finds close colors within maxDeltaE, sorted ascending", () => {
		const index = buildTokenIndex(tokens);
		const near = index.nearest("#3a81f5", { maxDeltaE: 2.5, limit: 3 });
		expect(near.length).toBeGreaterThan(0);
		expect(near[0]?.token.name).toBe("color.brand.primary");
		expect(near[0]?.deltaE).toBeGreaterThanOrEqual(0);
		expect(near[0]?.deltaE).toBeLessThanOrEqual(2.5);
		const deltas = near.map((n) => n.deltaE);
		expect(deltas).toEqual([...deltas].sort((a, b) => a - b));
	});

	it("nearest returns empty for colors far from every token", () => {
		const index = buildTokenIndex(tokens);
		expect(index.nearest("#00ff00", { maxDeltaE: 2.5, limit: 3 })).toEqual([]);
	});

	it("nearest respects the limit", () => {
		const index = buildTokenIndex(tokens);
		const near = index.nearest("#3b82f6", { maxDeltaE: 100, limit: 2 });
		expect(near.length).toBeLessThanOrEqual(2);
	});

	it("nearest ignores non-color tokens and non-color queries", () => {
		const index = buildTokenIndex(tokens);
		const near = index.nearest("#3b82f6", { maxDeltaE: 100, limit: 50 });
		expect(near.every((n) => n.token.type === "color")).toBe(true);
		expect(index.nearest("16px", { maxDeltaE: 2.5, limit: 3 })).toEqual([]);
	});

	it("indexes a full golden TokenMap (w3c expected twin)", () => {
		const map = JSON.parse(
			readFileSync(
				join(
					import.meta.dirname,
					"..",
					"..",
					"fixtures",
					"tokens",
					"w3c",
					"expected.json",
				),
				"utf8",
			),
		) as TokenMap;
		const index = buildTokenIndex(map.tokens);
		expect(index.byName.get("color.brand.primary")?.aliasOf).toBe(
			"color.base.blue-500",
		);
		// alias + its target share a canonical value bucket
		const hits = index.byValue.get("#3b82f6") ?? [];
		expect(hits.length).toBe(2);
	});
});
