// T7.17 — docs merge engine. PURE join of the registry's match topology with the
// rich code (props/variants) and figma (descriptions) source shapes plus tokens,
// producing a deterministic ComponentDoc[] with typed gaps. The registry alone
// carries neither props/variants nor figma descriptions, so the rich shapes are
// joined back in here.
import { describe, expect, it } from "vitest";
import { mergeComponentDocs } from "../../../src/engines/docs/merge.js";
import type { RegistryFile } from "../../../src/engines/registry/persist.js";
import type { CodeComponent } from "../../../src/engines/registry/scan-code.js";
import type { FigmaComponentModel } from "../../../src/engines/registry/scan-figma.js";
import type { TokenMap } from "../../../src/engines/tokens/types.js";

const EMPTY_TOKENS: TokenMap = { format: "w3c", tokens: [] };

function codeComponent(over: Partial<CodeComponent>): CodeComponent {
	return {
		name: "Button",
		importPath: "components/button.tsx",
		props: [],
		variants: {},
		...over,
	};
}

function figmaModel(over: Partial<FigmaComponentModel>): FigmaComponentModel {
	return {
		name: "Button",
		nodeId: "10:1",
		description: "",
		variantProps: {},
		source: "published",
		...over,
	};
}

function emptyRegistry(over: Partial<RegistryFile> = {}): RegistryFile {
	return {
		schemaVersion: 1,
		generatedAt: "2026-06-06T00:00:00.000Z",
		matches: [],
		unmatchedCode: [],
		unmatchedFigma: [],
		...over,
	};
}

describe("mergeComponentDocs", () => {
	it("joins a matched component's code shape + figma description", () => {
		const code = codeComponent({
			name: "Button",
			importPath: "components/button.tsx",
			props: [{ name: "label", type: "string", required: true }],
			variants: { variant: ["primary", "secondary"] },
		});
		const figma = figmaModel({
			name: "Button",
			nodeId: "10:1",
			description: "Primary call to action.",
		});
		const registry = emptyRegistry({
			matches: [
				{
					codeName: "Button",
					importPath: "components/button.tsx",
					figmaName: "Button",
					nodeId: "10:1",
					score: 0.92,
				},
			],
		});

		const docs = mergeComponentDocs({
			registry,
			code: [code],
			figma: [figma],
			tokens: EMPTY_TOKENS,
		});

		expect(docs).toHaveLength(1);
		const doc = docs[0];
		expect(doc?.name).toBe("Button");
		expect(doc?.code).toEqual({
			importPath: "components/button.tsx",
			props: [{ name: "label", type: "string", required: true }],
			variants: { variant: ["primary", "secondary"] },
		});
		expect(doc?.figma).toEqual({
			nodeId: "10:1",
			description: "Primary call to action.",
		});
		expect(doc?.gaps).toEqual([]);
	});

	it("flags a matched figma component with an empty description", () => {
		const registry = emptyRegistry({
			matches: [
				{
					codeName: "Card",
					importPath: "components/card.tsx",
					figmaName: "Card",
					nodeId: "10:2",
					score: 0.9,
				},
			],
		});
		const docs = mergeComponentDocs({
			registry,
			code: [
				codeComponent({ name: "Card", importPath: "components/card.tsx" }),
			],
			figma: [figmaModel({ name: "Card", nodeId: "10:2", description: "" })],
			tokens: EMPTY_TOKENS,
		});

		expect(docs[0]?.figma).toEqual({ nodeId: "10:2", description: "" });
		expect(docs[0]?.gaps).toEqual(["missing-figma-description"]);
	});

	it("emits an unmatched-in-figma gap for a code-only component", () => {
		const registry = emptyRegistry({
			unmatchedCode: [
				{
					name: "HeroPanel",
					importPath: "components/hero-panel.tsx",
					candidates: [],
				},
			],
		});
		const docs = mergeComponentDocs({
			registry,
			code: [
				codeComponent({
					name: "HeroPanel",
					importPath: "components/hero-panel.tsx",
					props: [{ name: "title", type: "string", required: true }],
				}),
			],
			figma: [],
			tokens: EMPTY_TOKENS,
		});

		expect(docs).toHaveLength(1);
		expect(docs[0]?.name).toBe("HeroPanel");
		expect(docs[0]?.code.props).toEqual([
			{ name: "title", type: "string", required: true },
		]);
		expect(docs[0]?.figma).toBeUndefined();
		expect(docs[0]?.gaps).toEqual(["unmatched-in-figma"]);
	});

	it("emits an unmatched-in-code gap for a figma-only component (with description)", () => {
		const registry = emptyRegistry({
			unmatchedFigma: [{ name: "Tooltip", nodeId: "10:9", candidates: [] }],
		});
		const docs = mergeComponentDocs({
			registry,
			code: [],
			figma: [
				figmaModel({
					name: "Tooltip",
					nodeId: "10:9",
					description: "On-hover hint.",
					variantProps: { Placement: ["bottom", "top"] },
				}),
			],
			tokens: EMPTY_TOKENS,
		});

		expect(docs).toHaveLength(1);
		const doc = docs[0];
		expect(doc?.name).toBe("Tooltip");
		// No code side: importPath empty, no props, variants surfaced from figma.
		expect(doc?.code.importPath).toBe("");
		expect(doc?.code.props).toEqual([]);
		expect(doc?.code.variants).toEqual({ Placement: ["bottom", "top"] });
		expect(doc?.figma).toEqual({
			nodeId: "10:9",
			description: "On-hover hint.",
		});
		expect(doc?.gaps).toEqual(["unmatched-in-code"]);
	});

	it("a figma-only component with an empty description gets both gaps", () => {
		const registry = emptyRegistry({
			unmatchedFigma: [{ name: "Spinner", nodeId: "10:7", candidates: [] }],
		});
		const docs = mergeComponentDocs({
			registry,
			code: [],
			figma: [figmaModel({ name: "Spinner", nodeId: "10:7", description: "" })],
			tokens: EMPTY_TOKENS,
		});
		expect(docs[0]?.gaps).toEqual([
			"unmatched-in-code",
			"missing-figma-description",
		]);
	});

	it("orders docs by name ascending, deterministically", () => {
		const registry = emptyRegistry({
			matches: [
				{
					codeName: "Button",
					importPath: "components/button.tsx",
					figmaName: "Button",
					nodeId: "10:1",
					score: 0.9,
				},
			],
			unmatchedCode: [
				{ name: "Avatar", importPath: "components/avatar.tsx", candidates: [] },
			],
			unmatchedFigma: [{ name: "Zebra", nodeId: "10:99", candidates: [] }],
		});
		const docs = mergeComponentDocs({
			registry,
			code: [
				codeComponent({ name: "Button" }),
				codeComponent({ name: "Avatar", importPath: "components/avatar.tsx" }),
			],
			figma: [
				figmaModel({ name: "Button", nodeId: "10:1", description: "x" }),
				figmaModel({ name: "Zebra", nodeId: "10:99", description: "z" }),
			],
			tokens: EMPTY_TOKENS,
		});
		expect(docs.map((d) => d.name)).toEqual(["Avatar", "Button", "Zebra"]);
	});

	it("falls back to registry-only data when the rich shapes are missing", () => {
		// A code component in the registry but absent from the scan-code list:
		// the doc still appears, carrying only what the registry persisted.
		const registry = emptyRegistry({
			unmatchedCode: [
				{ name: "Ghost", importPath: "components/ghost.tsx", candidates: [] },
			],
		});
		const docs = mergeComponentDocs({
			registry,
			code: [],
			figma: [],
			tokens: EMPTY_TOKENS,
		});
		expect(docs).toHaveLength(1);
		expect(docs[0]?.name).toBe("Ghost");
		expect(docs[0]?.code).toEqual({
			importPath: "components/ghost.tsx",
			props: [],
			variants: {},
		});
		expect(docs[0]?.gaps).toEqual(["unmatched-in-figma"]);
	});

	it("never throws on a malformed registry (missing arrays)", () => {
		const docs = mergeComponentDocs({
			registry: { schemaVersion: 1, generatedAt: "x" } as RegistryFile,
			code: [],
			figma: [],
			tokens: EMPTY_TOKENS,
		});
		expect(docs).toEqual([]);
	});
});

describe("mergeComponentDocs — a real library's conventions (Simple Design System)", () => {
	const registry = {
		schemaVersion: 1 as const,
		generatedAt: "2026-10-08T00:00:00.000Z",
		matches: [
			{
				codeName: "Button",
				importPath: "src/ui/Button.tsx",
				figmaName: "Button",
				nodeId: "1:1",
				score: 1,
			},
			{
				codeName: "IconStar",
				importPath: "src/ui/icons/IconStar.tsx",
				figmaName: "Star",
				nodeId: "2:1",
				score: 1,
				kind: "icon" as const,
			},
		],
		unmatchedCode: [
			{
				name: "Section",
				importPath: "src/ui/Section.tsx",
				candidates: [],
				composes: ["Page Accordion"],
			},
		],
		unmatchedFigma: [
			{
				name: "Legacy Button",
				nodeId: "3:1",
				description: "Deprecated — use Button (Variant=Neutral) instead.",
				candidates: [],
			},
		],
		composed: [{ name: "Page Accordion", nodeId: "4:1", codeName: "Section" }],
	};
	const docs = mergeComponentDocs({
		registry,
		code: [],
		figma: [],
		tokens: { format: "w3c", tokens: [] },
	});
	const by = Object.fromEntries(docs.map((d) => [d.name, d]));

	it("documents a deprecated component by its replacement, owing no code", () => {
		expect(by["Legacy Button"]?.deprecated).toEqual({
			replacement: "Button (Variant=Neutral)",
		});
		expect(by["Legacy Button"]?.gaps).not.toContain("unmatched-in-code");
	});

	it("documents a Code Connect recipe as composed in code", () => {
		expect(by["Page Accordion"]?.composedWith).toBe("Section");
		expect(by["Page Accordion"]?.gaps).toEqual([]);
		expect(by.Section?.gaps).toEqual([]);
	});

	it("does not ask icons for a Figma description", () => {
		expect(by.IconStar?.gaps).toEqual([]);
	});
});
