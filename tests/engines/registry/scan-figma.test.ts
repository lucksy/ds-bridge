// T5.2 — Figma component model. Pure over recorded design data: the registry's
// design side. The engine accepts the published-components list (REST
// `/components` meta shape) plus the file `document` tree, and produces a
// deterministic, deduped model. It never throws; missing inputs -> [].
//
// These tests drive behavior with synthetic literals rather than the shared
// fixtures (tests/fixtures/figma/{components,file}.json) on purpose: those
// fixtures are locked by other suites — the readiness score snapshot pins
// file.json's document to exactly 6 nodes / score 90, and the io client test
// pins components.json to exactly 2 entries. The engine is pure, so synthetic
// inputs exercise every rule without mutating a contract another agent owns.
import { describe, expect, it } from "vitest";
import {
	buildFigmaComponentModel,
	type FigmaComponentModel,
} from "../../../src/engines/registry/scan-figma.js";

// ── Tiny builders matching the recorded shapes ──

interface PublishedEntry {
	key?: string;
	node_id: string;
	name: string;
	description?: string;
	containing_frame?: { name?: string };
}

function published(entries: PublishedEntry[]): {
	meta: { components: PublishedEntry[] };
} {
	return { meta: { components: entries } };
}

describe("buildFigmaComponentModel — empty / missing input", () => {
	it("returns [] for no input at all", () => {
		expect(buildFigmaComponentModel({})).toEqual([]);
	});

	it("returns [] for empty published list and empty document", () => {
		const result = buildFigmaComponentModel({
			published: published([]),
			fileDocument: { id: "0:0", name: "Document", type: "DOCUMENT" },
		});
		expect(result).toEqual([]);
	});

	it("tolerates a published meta with no components array", () => {
		// Defensive: a malformed response must not throw.
		const result = buildFigmaComponentModel({
			// biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
			published: { meta: {} } as any,
		});
		expect(result).toEqual([]);
	});
});

describe("buildFigmaComponentModel — published plain entries", () => {
	it("maps a plain-named published component to a model with empty variantProps", () => {
		const result = buildFigmaComponentModel({
			published: published([
				{
					node_id: "10:42",
					name: "Button / Primary",
					description: "Primary call-to-action button.",
					containing_frame: { name: "Buttons" },
				},
			]),
		});
		expect(result).toEqual<FigmaComponentModel[]>([
			{
				name: "Button / Primary",
				nodeId: "10:42",
				description: "Primary call-to-action button.",
				variantProps: {},
				source: "published",
			},
		]);
	});

	it("defaults a missing description to an empty string", () => {
		const result = buildFigmaComponentModel({
			published: published([{ node_id: "10:99", name: "Input / Text" }]),
		});
		expect(result[0]?.description).toBe("");
	});
});

describe("buildFigmaComponentModel — variant ('=') name parsing", () => {
	it("parses 'Size=sm, Tone=info' into variantProps", () => {
		const result = buildFigmaComponentModel({
			published: published([
				{
					node_id: "20:1",
					name: "Size=sm, Tone=info",
					description: "",
					containing_frame: { name: "Chip" },
				},
			]),
		});
		expect(result).toHaveLength(1);
		expect(result[0]?.variantProps).toEqual({
			Size: ["sm"],
			Tone: ["info"],
		});
	});

	it("names the model after its containing_frame (the set name)", () => {
		const result = buildFigmaComponentModel({
			published: published([
				{
					node_id: "20:1",
					name: "Size=sm",
					containing_frame: { name: "Chip" },
				},
			]),
		});
		expect(result[0]?.name).toBe("Chip");
	});

	it("trims whitespace around variant keys and values", () => {
		const result = buildFigmaComponentModel({
			published: published([
				{
					node_id: "20:2",
					name: " Size = md ,  Tone = danger ",
					containing_frame: { name: "Chip" },
				},
			]),
		});
		expect(result[0]?.variantProps).toEqual({
			Size: ["md"],
			Tone: ["danger"],
		});
	});
});

describe("buildFigmaComponentModel — component-set merging", () => {
	it("merges variant children sharing a containing_frame into ONE model with unioned variantProps", () => {
		const result = buildFigmaComponentModel({
			published: published([
				{
					node_id: "20:1",
					name: "Size=sm, Tone=info",
					containing_frame: { name: "Chip" },
				},
				{
					node_id: "20:2",
					name: "Size=md, Tone=info",
					containing_frame: { name: "Chip" },
				},
			]),
		});
		expect(result).toHaveLength(1);
		const chip = result[0];
		expect(chip?.name).toBe("Chip");
		expect(chip?.source).toBe("published");
		// Size unions sm+md (sorted); Tone collapses the duplicate info.
		expect(chip?.variantProps).toEqual({
			Size: ["md", "sm"],
			Tone: ["info"],
		});
	});

	it("keeps unioned variant values sorted and deduped", () => {
		const result = buildFigmaComponentModel({
			published: published([
				{ node_id: "21:1", name: "Size=md", containing_frame: { name: "Tag" } },
				{ node_id: "21:2", name: "Size=sm", containing_frame: { name: "Tag" } },
				{ node_id: "21:3", name: "Size=sm", containing_frame: { name: "Tag" } },
			]),
		});
		expect(result[0]?.variantProps).toEqual({ Size: ["md", "sm"] });
	});

	it("uses the merged set's lowest child nodeId as the model nodeId", () => {
		const result = buildFigmaComponentModel({
			published: published([
				{
					node_id: "20:9",
					name: "Size=lg",
					containing_frame: { name: "Chip" },
				},
				{
					node_id: "20:2",
					name: "Size=sm",
					containing_frame: { name: "Chip" },
				},
			]),
		});
		expect(result[0]?.nodeId).toBe("20:2");
	});
});

describe("buildFigmaComponentModel — inline (unpublished) discovery", () => {
	it("discovers a COMPONENT node in the file tree that is not published", () => {
		const result = buildFigmaComponentModel({
			published: published([]),
			fileDocument: {
				id: "0:0",
				name: "Document",
				type: "DOCUMENT",
				children: [
					{
						id: "0:1",
						name: "Page 1",
						type: "CANVAS",
						children: [
							{
								id: "30:1",
								name: "Spinner",
								type: "COMPONENT",
								description: "Loading spinner.",
							},
						],
					},
				],
			},
		});
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual<FigmaComponentModel>({
			name: "Spinner",
			nodeId: "30:1",
			description: "Loading spinner.",
			variantProps: {},
			source: "inline",
		});
	});

	it("takes an inline component's description from the file's components / componentSets maps", () => {
		// GET /v1/files/:key carries descriptions in the top-level maps, never on
		// the document nodes — so unpublished libraries always read "missing".
		const result = buildFigmaComponentModel({
			published: published([]),
			fileDocument: {
				id: "0:0",
				name: "Document",
				type: "DOCUMENT",
				children: [
					{
						id: "0:1",
						name: "Page 1",
						type: "CANVAS",
						children: [
							{ id: "30:1", name: "Label", type: "COMPONENT" },
							{
								id: "40:1",
								name: "Badge",
								type: "COMPONENT_SET",
								children: [
									{ id: "40:2", name: "variant=default", type: "COMPONENT" },
								],
							},
						],
					},
				],
			},
			fileComponents: { "30:1": { name: "Label", description: "Form label." } },
			fileComponentSets: {
				"40:1": { name: "Badge", description: "Status pill." },
			},
		});
		expect(result.map((m) => [m.name, m.description])).toEqual([
			["Badge", "Status pill."],
			["Label", "Form label."],
		]);
	});

	it("reads variantProps from a COMPONENT_SET's variant children", () => {
		const result = buildFigmaComponentModel({
			fileDocument: {
				id: "0:0",
				name: "Document",
				type: "DOCUMENT",
				children: [
					{
						id: "0:1",
						name: "Page 1",
						type: "CANVAS",
						children: [
							{
								id: "40:0",
								name: "Toggle",
								type: "COMPONENT_SET",
								children: [
									{ id: "40:1", name: "Size=sm", type: "COMPONENT" },
									{ id: "40:2", name: "Size=md", type: "COMPONENT" },
								],
							},
						],
					},
				],
			},
		});
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("Toggle");
		expect(result[0]?.source).toBe("inline");
		expect(result[0]?.variantProps).toEqual({ Size: ["md", "sm"] });
		// The set node itself is the model; its variant children are not separate models.
		expect(result[0]?.nodeId).toBe("40:0");
	});

	it("does not double-count COMPONENT children of a COMPONENT_SET", () => {
		const result = buildFigmaComponentModel({
			fileDocument: {
				id: "0:0",
				name: "Document",
				type: "DOCUMENT",
				children: [
					{
						id: "50:0",
						name: "Switch",
						type: "COMPONENT_SET",
						children: [
							{ id: "50:1", name: "State=on", type: "COMPONENT" },
							{ id: "50:2", name: "State=off", type: "COMPONENT" },
						],
					},
				],
			},
		});
		expect(result).toHaveLength(1);
	});

	it("ignores non-component nodes (FRAME/INSTANCE/TEXT)", () => {
		const result = buildFigmaComponentModel({
			fileDocument: {
				id: "0:0",
				name: "Document",
				type: "DOCUMENT",
				children: [
					{ id: "1:2", name: "Card / Primary", type: "FRAME" },
					{ id: "1:7", name: "Button / Primary", type: "INSTANCE" },
					{ id: "1:4", name: "Title", type: "TEXT" },
				],
			},
		});
		expect(result).toEqual([]);
	});
});

describe("buildFigmaComponentModel — dedup (published wins)", () => {
	it("drops an inline node whose id matches a published component", () => {
		const result = buildFigmaComponentModel({
			published: published([
				{
					node_id: "10:42",
					name: "Button / Primary",
					description: "Primary call-to-action button.",
					containing_frame: { name: "Buttons" },
				},
			]),
			fileDocument: {
				id: "0:0",
				name: "Document",
				type: "DOCUMENT",
				children: [
					// Same node id as the published Button -> published wins.
					{
						id: "10:42",
						name: "Button / Primary",
						type: "COMPONENT",
						description: "stale inline copy",
					},
					// A genuinely unpublished one survives.
					{ id: "30:1", name: "Spinner", type: "COMPONENT" },
				],
			},
		});
		const button = result.find((m) => m.nodeId === "10:42");
		expect(button?.source).toBe("published");
		expect(button?.description).toBe("Primary call-to-action button.");
		expect(result).toHaveLength(2);
	});

	it("dedups two inline nodes sharing a nodeId", () => {
		const result = buildFigmaComponentModel({
			fileDocument: {
				id: "0:0",
				name: "Document",
				type: "DOCUMENT",
				children: [
					{ id: "30:1", name: "Spinner", type: "COMPONENT" },
					{ id: "30:1", name: "Spinner", type: "COMPONENT" },
				],
			},
		});
		expect(result).toHaveLength(1);
	});
});

describe("buildFigmaComponentModel — deterministic ordering", () => {
	it("sorts the models by name ascending", () => {
		const result = buildFigmaComponentModel({
			published: published([
				{ node_id: "10:58", name: "Input / Text" },
				{ node_id: "10:42", name: "Button / Primary" },
				{
					node_id: "20:1",
					name: "Size=sm",
					containing_frame: { name: "Chip" },
				},
			]),
		});
		expect(result.map((m) => m.name)).toEqual([
			"Button / Primary",
			"Chip",
			"Input / Text",
		]);
	});

	it("produces the same model array for the same input", () => {
		const input = {
			published: published([
				{ node_id: "10:42", name: "Button / Primary" },
				{
					node_id: "20:1",
					name: "Size=sm",
					containing_frame: { name: "Chip" },
				},
			]),
		};
		expect(buildFigmaComponentModel(input)).toEqual(
			buildFigmaComponentModel(input),
		);
	});
});
