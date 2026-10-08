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
				rawValue: "#3b82f6",
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

	it("emits an 8-digit hex rawValue when the fill is translucent", () => {
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
				rawValue: "#ff000080",
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
				rawValue: "#ff0000",
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

// Real-user finding (Primer testbed): instances renamed in the screen ("Cancel",
// "Repository name") were resolved by their layer name and read as gaps, and
// the instances nested inside a component (PageHeader's "actions" button) were
// counted as the frame's own requirements. A clean frame scored 67%.
describe("deriveRequirements — main components and nesting", () => {
	const root: FigmaNode = {
		id: "2:148",
		name: "Settings",
		type: "FRAME",
		children: [
			{
				id: "2:150",
				name: "Page header",
				type: "INSTANCE",
				componentId: "2:71",
				children: [
					{
						id: "I2:150;2:75",
						name: "actions",
						type: "INSTANCE",
						componentId: "1:61",
					},
				],
			},
			{ id: "2:166", name: "Cancel", type: "INSTANCE", componentId: "1:61" },
		],
	};
	const maps = {
		components: {
			"2:71": { name: "PageHeader" },
			"1:61": { name: "variant=default, size=medium", componentSetId: "1:109" },
		},
		componentSets: { "1:109": { name: "Button" } },
	};

	it("names each requirement by its main component (set) and skips nested instances", () => {
		expect(deriveRequirements(root, maps)).toEqual([
			{
				kind: "component",
				nodeId: "2:150",
				name: "Page header",
				componentName: "PageHeader",
			},
			{
				kind: "component",
				nodeId: "2:166",
				name: "Cancel",
				componentName: "Button",
			},
		]);
	});
});

// Primer testbed: the CLI said 100% while the frame had a raw fill override on
// the Delete button instance and danger text whose exact hex is only a surface
// token. Instance fill overrides are requirements; text fills are `color`.
describe("deriveRequirements — overrides and text color", () => {
	it("adds an instance's own unbound fill override, and names text fills `color`", () => {
		const root: FigmaNode = {
			id: "2:148",
			name: "Settings",
			type: "FRAME",
			children: [
				{
					id: "2:170",
					name: "Delete",
					type: "INSTANCE",
					componentId: "1:61",
					fills: [solid(1, 0.92, 0.91)],
					overrides: [{ id: "2:170", overriddenFields: ["fills"] }],
				},
				{
					id: "2:176",
					name: "Danger zone",
					type: "TEXT",
					fills: [solid(0.81, 0.13, 0.18)],
				},
			],
		};
		const reqs = deriveRequirements(root);
		expect(reqs.map((r) => (r.kind === "token" ? r.property : r.kind))).toEqual(
			["component", "fill", "color"],
		);
	});
});

describe("deriveRequirements — detached copies (Simple Design System)", () => {
	it("turns a frame with a component's exact layers into a detached requirement", () => {
		const root: FigmaNode = {
			id: "screen",
			name: "Settings",
			type: "FRAME",
			children: [
				{
					id: "3003:608",
					name: "Archive",
					type: "FRAME",
					children: [
						{ id: "a", name: "Star", type: "INSTANCE", visible: false },
						{ id: "b", name: "Button", type: "TEXT" },
						{ id: "c", name: "X", type: "INSTANCE", visible: false },
					],
				},
			],
		} as FigmaNode;
		const requirements = deriveRequirements(root, {}, [
			{
				figmaName: "Button",
				layers: ["Star:INSTANCE", "Button:TEXT", "X:INSTANCE"],
			},
			{
				figmaName: "Button Danger",
				layers: ["Star:INSTANCE", "Button:TEXT", "X:INSTANCE"],
			},
			{ figmaName: "Tag", layers: ["Label:TEXT", "X:INSTANCE"] },
		]);
		expect(requirements).toEqual([
			{
				kind: "component",
				nodeId: "3003:608",
				name: "Archive",
				detachedFrom: ["Button", "Button Danger"],
			},
		]);
	});
});
