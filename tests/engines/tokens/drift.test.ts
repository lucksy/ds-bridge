// T3.4 — drift classifier. Source-vs-built-outputs classification table (spec'd first):
//
// | Situation                                              | Entry          |
// |--------------------------------------------------------|----------------|
// | token + matching output, canonically equal value       | (none, inSync) |
// | token + matching output, canonically different value   | stale-output   |
// | token with no matching output                          | missing-output |
// | output with no matching token                          | orphan-output  |
// | composite token (object value: shadow/typography)      | skipped        |
//
// Matching is name-based and notation-insensitive: token "color.brand.primary"
// matches CSS "--color-brand-primary" (kebab) and TS "color.brand.primary" (dotted).
// Value comparison is type-aware canonical (hex case, rgb() spelling, rem/px).
import { describe, expect, it } from "vitest";
import { classifyDrift } from "../../../src/engines/tokens/drift.js";
import type { OutputValue } from "../../../src/engines/tokens/scan-outputs.js";
import type { Token, TokenMap } from "../../../src/engines/tokens/types.js";

function mapOf(...tokens: Token[]): TokenMap {
	return { format: "w3c", tokens };
}

const primary: Token = {
	name: "color.brand.primary",
	type: "color",
	value: "#3b82f6",
};
const spaceMd: Token = { name: "space.md", type: "dimension", value: "16px" };

describe("classifyDrift", () => {
	it("counts canonically equal pairs as in sync (kebab CSS name)", () => {
		const outputs: OutputValue[] = [
			{ name: "color-brand-primary", raw: "#3B82F6" }, // case differs, canonical same
		];
		const result = classifyDrift(mapOf(primary), outputs);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(1);
	});

	it("matches dotted TS output names too", () => {
		const outputs: OutputValue[] = [
			{ name: "color.brand.primary", raw: "rgb(59, 130, 246)" },
		];
		const result = classifyDrift(mapOf(primary), outputs);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(1);
	});

	it("treats 1rem output as in sync with a 16px dimension token", () => {
		const outputs: OutputValue[] = [{ name: "space-md", raw: "1rem" }];
		const result = classifyDrift(mapOf(spaceMd), outputs);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(1);
	});

	it("classifies a canonically different output value as stale-output", () => {
		const outputs: OutputValue[] = [
			{ name: "color-brand-primary", raw: "#2563eb" },
		];
		const result = classifyDrift(mapOf(primary), outputs);
		expect(result.entries).toEqual([
			{ kind: "stale-output", token: primary, output: outputs[0] },
		]);
		expect(result.inSync).toBe(0);
	});

	it("classifies a token without any output as missing-output", () => {
		const result = classifyDrift(mapOf(primary), []);
		expect(result.entries).toEqual([
			{ kind: "missing-output", token: primary },
		]);
	});

	it("classifies an output without any token as orphan-output", () => {
		const orphan: OutputValue = { name: "color-legacy", raw: "#000000" };
		const result = classifyDrift(mapOf(), [orphan]);
		expect(result.entries).toEqual([{ kind: "orphan-output", output: orphan }]);
	});

	it("skips composite tokens entirely (no missing-output noise)", () => {
		const shadow: Token = {
			name: "shadow.card",
			type: "shadow",
			value: { color: "#11182733", blur: "8px" },
		};
		const result = classifyDrift(mapOf(shadow), []);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(0);
	});

	it("compares numeric token values as strings (fontWeight 700)", () => {
		const bold: Token = {
			name: "font.weight.bold",
			type: "fontWeight",
			value: 700,
		};
		const result = classifyDrift(mapOf(bold), [
			{ name: "font-weight-bold", raw: "700" },
		]);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(1);
	});

	it("sorts entries by token/output name for stable reports", () => {
		const a: Token = { name: "color.a", type: "color", value: "#000001" };
		const z: Token = { name: "color.z", type: "color", value: "#000002" };
		const orphan: OutputValue = { name: "color-m", raw: "#000003" };
		const result = classifyDrift(mapOf(z, a), [orphan]);
		const names = result.entries.map((e) =>
			e.kind === "orphan-output" ? e.output.name : e.token.name,
		);
		expect(names).toEqual(["color.a", "color-m", "color.z"]);
	});
});
