// T1.6 — token diff engine. Classification rules table (the contract, spec'd first):
//
// | Change                                            | Kind          | Impact   |
// |---------------------------------------------------|---------------|----------|
// | new token                                         | added         | additive |
// | token gone (no rename match)                      | removed       | breaking |
// | name gone + name appeared, same canonical value   | renamed       | breaking |
// |   and type, unambiguous 1:1                       |               |          |
// | same name, canonically different value or type    | value-changed | breaking |
// | same name, same canonical value, new spelling     | value-changed | cosmetic |
// | same name+value, description/group changed only   | meta-changed  | cosmetic |
//
// Renames are heuristic: ambiguous candidates (2+ removed sharing the value) fall
// back to added+removed. Entries sort by token name for stable output.
import { describe, expect, it } from "vitest";
import { diffTokenMaps } from "../../../src/engines/tokens/diff.js";
import type { Token, TokenMap } from "../../../src/engines/tokens/types.js";

function color(name: string, value: string, extra?: Partial<Token>): Token {
	return { name, type: "color", value, ...extra };
}

function mapOf(...tokens: Token[]): TokenMap {
	return { format: "w3c", tokens };
}

describe("diffTokenMaps", () => {
	it("reports identical maps as unchanged", () => {
		const a = mapOf(
			color("color.primary", "#3b82f6"),
			color("color.bg", "#ffffff"),
		);
		const result = diffTokenMaps(a, mapOf(...a.tokens));
		expect(result.entries).toEqual([]);
		expect(result.unchanged).toBe(2);
	});

	it("classifies a new token as added/additive", () => {
		const before = mapOf(color("color.primary", "#3b82f6"));
		const after = mapOf(
			color("color.primary", "#3b82f6"),
			color("color.accent", "#dc2626"),
		);
		const result = diffTokenMaps(before, after);
		expect(result.entries).toEqual([
			{ kind: "added", token: after.tokens[1], impact: "additive" },
		]);
	});

	it("classifies a deleted token as removed/breaking", () => {
		const before = mapOf(
			color("color.primary", "#3b82f6"),
			color("color.old", "#000000"),
		);
		const after = mapOf(color("color.primary", "#3b82f6"));
		const result = diffTokenMaps(before, after);
		expect(result.entries).toEqual([
			{ kind: "removed", token: before.tokens[1], impact: "breaking" },
		]);
	});

	it("detects an unambiguous rename (same canonical value + type) as renamed/breaking", () => {
		const before = mapOf(color("color.blue-500", "#3b82f6"));
		const after = mapOf(color("color.brand-primary", "#3B82F6")); // spelling differs, canonical same
		const result = diffTokenMaps(before, after);
		expect(result.entries).toEqual([
			{
				kind: "renamed",
				from: before.tokens[0],
				to: after.tokens[0],
				impact: "breaking",
			},
		]);
	});

	it("falls back to added+removed when a rename would be ambiguous", () => {
		const before = mapOf(
			color("color.a", "#3b82f6"),
			color("color.b", "#3b82f6"), // two removed candidates share the value
		);
		const after = mapOf(color("color.c", "#3b82f6"));
		const result = diffTokenMaps(before, after);
		const kinds = result.entries.map((e) => e.kind).sort();
		expect(kinds).toEqual(["added", "removed", "removed"]);
	});

	it("classifies a canonical value change as value-changed/breaking", () => {
		const before = mapOf(color("color.primary", "#3b82f6"));
		const after = mapOf(color("color.primary", "#2563eb"));
		const result = diffTokenMaps(before, after);
		expect(result.entries).toEqual([
			{
				kind: "value-changed",
				before: before.tokens[0],
				after: after.tokens[0],
				impact: "breaking",
			},
		]);
	});

	it("classifies a type change under the same name as value-changed/breaking", () => {
		const before = mapOf(color("size.weird", "#3b82f6"));
		const after = mapOf({
			name: "size.weird",
			type: "dimension",
			value: "16px",
		});
		const result = diffTokenMaps(before, after);
		expect(result.entries[0]).toMatchObject({
			kind: "value-changed",
			impact: "breaking",
		});
	});

	it("classifies a spelling-only change (same canonical value) as value-changed/cosmetic", () => {
		const before = mapOf(color("color.bg", "#FFF"));
		const after = mapOf(color("color.bg", "#ffffff"));
		const result = diffTokenMaps(before, after);
		expect(result.entries).toEqual([
			{
				kind: "value-changed",
				before: before.tokens[0],
				after: after.tokens[0],
				impact: "cosmetic",
			},
		]);
	});

	it("classifies description-only changes as meta-changed/cosmetic", () => {
		const before = mapOf(color("color.bg", "#ffffff"));
		const after = mapOf(
			color("color.bg", "#ffffff", { description: "Page background" }),
		);
		const result = diffTokenMaps(before, after);
		expect(result.entries).toEqual([
			{
				kind: "meta-changed",
				before: before.tokens[0],
				after: after.tokens[0],
				impact: "cosmetic",
			},
		]);
	});

	it("compares dimension values canonically (1rem == 16px is cosmetic)", () => {
		const before = mapOf({
			name: "space.md",
			type: "dimension",
			value: "16px",
		});
		const after = mapOf({ name: "space.md", type: "dimension", value: "1rem" });
		const result = diffTokenMaps(before, after);
		expect(result.entries[0]).toMatchObject({
			kind: "value-changed",
			impact: "cosmetic",
		});
	});

	it("sorts entries by token name for stable output", () => {
		const before = mapOf(
			color("color.z", "#000001"),
			color("color.a", "#000002"),
		);
		const after = mapOf(
			color("color.z", "#000003"),
			color("color.a", "#000004"),
			color("color.m", "#000005"),
		);
		const result = diffTokenMaps(before, after);
		const names = result.entries.map((e) =>
			e.kind === "added" || e.kind === "removed"
				? e.token.name
				: e.kind === "renamed"
					? e.to.name
					: e.after.name,
		);
		expect(names).toEqual(["color.a", "color.m", "color.z"]);
	});

	it("handles composite (object) values via deep equality", () => {
		const shadow = { color: "#11182733", blur: "8px" };
		const before = mapOf({
			name: "shadow.card",
			type: "shadow",
			value: shadow,
		});
		const after = mapOf({
			name: "shadow.card",
			type: "shadow",
			value: { ...shadow, blur: "12px" },
		});
		const result = diffTokenMaps(before, after);
		expect(result.entries[0]).toMatchObject({
			kind: "value-changed",
			impact: "breaking",
		});
	});
});
