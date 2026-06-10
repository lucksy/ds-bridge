// C11 / M2.4 — unit: `deriveRequirements` (the FigmaNode tree → FrameRequirement[]
// derivation inside the frame-impl command). Pure: walks the tree and emits a
// component requirement per INSTANCE node and a color-token requirement per node
// carrying an UNBOUND solid fill. Bound fills raise no requirement (already
// on-system). Drives a hand-built node tree — no network.
import { describe, expect, it } from "vitest";
import { deriveRequirements } from "../../src/cli-commands/frame-impl.js";
import type { FigmaNode } from "../../src/io/figma/client.js";

/** A solid fill paint with the given 0–1 rgba color. */
function solid(r: number, g: number, b: number, a = 1) {
	return { type: "SOLID", color: { r, g, b, a } };
}

describe("deriveRequirements", () => {
	it("emits a component requirement for each INSTANCE node", () => {
		const root: FigmaNode = {
			id: "1:1",
			name: "Frame",
			type: "FRAME",
			children: [
				{ id: "1:2", name: "Button / Primary", type: "INSTANCE", fills: [] },
				{ id: "1:3", name: "Card / Surface", type: "INSTANCE", fills: [] },
			],
		};
		expect(deriveRequirements(root)).toEqual([
			{ kind: "component", nodeId: "1:2", name: "Button / Primary" },
			{ kind: "component", nodeId: "1:3", name: "Card / Surface" },
		]);
	});

	it("emits a color-token requirement for an UNBOUND solid fill (rgb rawValue)", () => {
		const root: FigmaNode = {
			id: "1:1",
			name: "Rect",
			type: "RECTANGLE",
			// rgb(59,130,246) — the canonical #3b82f6.
			fills: [
				solid(0.23137255012989044, 0.5098039507865906, 0.9647058844566345),
			],
		};
		expect(deriveRequirements(root)).toEqual([
			{
				kind: "token",
				property: "fill",
				rawValue: "rgb(59, 130, 246)",
				valueKind: "color",
			},
		]);
	});

	it("raises NO requirement for a fill bound to a variable (already on-system)", () => {
		const root: FigmaNode = {
			id: "1:1",
			name: "Bound Rect",
			type: "RECTANGLE",
			fills: [solid(1, 1, 1)],
			boundVariables: {
				fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:1:9" }],
			},
		};
		expect(deriveRequirements(root)).toEqual([]);
	});

	it("emits an rgba() rawValue when the fill is translucent", () => {
		const root: FigmaNode = {
			id: "1:1",
			name: "Translucent",
			type: "RECTANGLE",
			fills: [solid(1, 0, 0, 0.5)],
		};
		expect(deriveRequirements(root)).toEqual([
			{
				kind: "token",
				property: "fill",
				rawValue: "rgba(255, 0, 0, 0.5)",
				valueKind: "color",
			},
		]);
	});

	it("walks the whole subtree, preserving document order", () => {
		const root: FigmaNode = {
			id: "1:1",
			name: "Frame",
			type: "FRAME",
			boundVariables: {
				fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:1:2" }],
			},
			fills: [solid(1, 1, 1)],
			children: [
				{
					id: "1:2",
					name: "Accent",
					type: "RECTANGLE",
					fills: [solid(1, 0, 0)],
				},
				{ id: "1:3", name: "Mystery", type: "INSTANCE", fills: [] },
			],
		};
		expect(deriveRequirements(root)).toEqual([
			{
				kind: "token",
				property: "fill",
				rawValue: "rgb(255, 0, 0)",
				valueKind: "color",
			},
			{ kind: "component", nodeId: "1:3", name: "Mystery" },
		]);
	});

	it("raises no requirement for a node with no fills and a non-INSTANCE type", () => {
		const root: FigmaNode = { id: "1:1", name: "Text", type: "TEXT" };
		expect(deriveRequirements(root)).toEqual([]);
	});
});
