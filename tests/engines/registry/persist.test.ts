// T5.4 — registry persistence model. PURE: no fs/network/process. Turns a
// ComponentMatchResult into the on-disk RegistryFile (stable, deterministic,
// numbers rounded to 3dp) and resolves a node name/id against a saved registry.
//
// These tests pin: (1) the projection from match buckets to the flat persisted
// shape; (2) stable sorting + 3dp rounding so two builds of the same inputs are
// byte-identical (modulo generatedAt); (3) resolveEntry's three-way outcome —
// exact match (by nodeId / exact figmaName / normalized name), candidates (from
// unmatchedFigma), or not-found — and that it NEVER throws on odd input.
import { describe, expect, it } from "vitest";
import type {
	ComponentMatch,
	ComponentMatchResult,
	UnmatchedCode,
	UnmatchedFigma,
} from "../../../src/engines/registry/match.js";
import {
	type RegistryFile,
	resolveEntry,
	toRegistryFile,
} from "../../../src/engines/registry/persist.js";
import type { CodeComponent } from "../../../src/engines/registry/scan-code.js";
import type { FigmaComponentModel } from "../../../src/engines/registry/scan-figma.js";

// ── Tiny builders ──

function code(
	name: string,
	variants: Record<string, string[]> = {},
	importPath = `components/${name.toLowerCase()}.tsx`,
): CodeComponent {
	return { name, importPath, props: [], variants };
}

function figma(
	name: string,
	nodeId = `1:${name}`,
	variantProps: Record<string, string[]> = {},
): FigmaComponentModel {
	return { name, nodeId, description: "", variantProps, source: "published" };
}

function match(
	codeComponent: CodeComponent,
	figmaModel: FigmaComponentModel,
	score: number,
): ComponentMatch {
	return {
		code: codeComponent,
		figma: figmaModel,
		score,
		nameScore: score,
		shapeScore: score,
		variantGaps: [],
	};
}

function unmatchedCode(
	codeComponent: CodeComponent,
	candidates: { figma: FigmaComponentModel; score: number }[],
): UnmatchedCode {
	return { code: codeComponent, candidates };
}

function unmatchedFigma(
	figmaModel: FigmaComponentModel,
	candidates: { code: CodeComponent; score: number }[],
): UnmatchedFigma {
	return { figma: figmaModel, candidates };
}

const EMPTY: ComponentMatchResult = {
	matches: [],
	unmatchedCode: [],
	unmatchedFigma: [],
};

describe("toRegistryFile — schema & projection", () => {
	it("stamps schemaVersion 1 and the supplied generatedAt", () => {
		const file = toRegistryFile(EMPTY, "2026-06-05T10:00:00.000Z");
		expect(file.schemaVersion).toBe(1);
		expect(file.generatedAt).toBe("2026-06-05T10:00:00.000Z");
		expect(file.matches).toEqual([]);
		expect(file.unmatchedCode).toEqual([]);
		expect(file.unmatchedFigma).toEqual([]);
	});

	it("flattens a match to {codeName, importPath, figmaName, nodeId, score}", () => {
		const result: ComponentMatchResult = {
			matches: [
				match(code("Button"), figma("Button / Primary", "10:42"), 0.766_66),
			],
			unmatchedCode: [],
			unmatchedFigma: [],
		};
		const file = toRegistryFile(result, "2026-06-05T10:00:00.000Z");
		expect(file.matches).toEqual([
			{
				codeName: "Button",
				importPath: "components/button.tsx",
				figmaName: "Button / Primary",
				nodeId: "10:42",
				score: 0.767,
			},
		]);
	});

	it("keeps a match's variant gaps, and omits an empty list", () => {
		const gapped = {
			...match(code("Fab"), figma("FAB", "3:68"), 0.7),
			variantGaps: ["size: Figma also has Extended"],
		};
		const clean = match(code("Badge"), figma("Badge", "4:107"), 1);
		const file = toRegistryFile(
			{ matches: [gapped, clean], unmatchedCode: [], unmatchedFigma: [] },
			"2026-10-07T00:00:00.000Z",
		);
		expect(file.matches.map((m) => m.variantGaps)).toEqual([
			undefined,
			["size: Figma also has Extended"],
		]);
	});

	it("keeps a non-empty Figma description on matches and unmatched figma entries (empty is omitted)", () => {
		const described = (name: string, nodeId: string, description: string) => ({
			...figma(name, nodeId),
			description,
		});
		const result: ComponentMatchResult = {
			matches: [
				match(
					code("Button"),
					described("Button", "10:1", "Primary action."),
					0.9,
				),
				match(code("Card"), figma("Card", "10:2"), 0.9),
			],
			unmatchedCode: [],
			unmatchedFigma: [
				unmatchedFigma(described("Tooltip", "10:9", "Hover hint."), []),
			],
		};
		const file = toRegistryFile(result, "2026-06-05T10:00:00.000Z");
		expect(file.matches.map((m) => m.description)).toEqual([
			"Primary action.",
			undefined,
		]);
		expect("description" in (file.matches[1] ?? {})).toBe(false);
		expect(file.unmatchedFigma[0]?.description).toBe("Hover hint.");
	});

	it("flattens unmatchedCode with its ranked figma candidates", () => {
		const target = figma("Button / Primary", "10:42");
		const result: ComponentMatchResult = {
			matches: [],
			unmatchedCode: [
				unmatchedCode(code("Button"), [{ figma: target, score: 0.541_77 }]),
			],
			unmatchedFigma: [],
		};
		const file = toRegistryFile(result, "2026-06-05T10:00:00.000Z");
		expect(file.unmatchedCode).toEqual([
			{
				name: "Button",
				importPath: "components/button.tsx",
				candidates: [
					{ figmaName: "Button / Primary", nodeId: "10:42", score: 0.542 },
				],
			},
		]);
	});

	it("flattens unmatchedFigma with its ranked code candidates", () => {
		const result: ComponentMatchResult = {
			matches: [],
			unmatchedCode: [],
			unmatchedFigma: [
				unmatchedFigma(figma("Input / Text", "10:58"), [
					{ code: code("Button"), score: 0.123_45 },
				]),
			],
		};
		const file = toRegistryFile(result, "2026-06-05T10:00:00.000Z");
		expect(file.unmatchedFigma).toEqual([
			{
				name: "Input / Text",
				nodeId: "10:58",
				candidates: [{ codeName: "Button", score: 0.123 }],
			},
		]);
	});

	it("rounds every score to 3 decimal places (half-up)", () => {
		const result: ComponentMatchResult = {
			matches: [match(code("A"), figma("A", "1:1"), 0.766_66)],
			unmatchedCode: [
				unmatchedCode(code("B"), [
					{ figma: figma("X", "2:2"), score: 0.123_45 },
				]),
			],
			unmatchedFigma: [
				unmatchedFigma(figma("C", "3:3"), [
					{ code: code("D"), score: 0.999_99 },
				]),
			],
		};
		const file = toRegistryFile(result, "2026-06-05T10:00:00.000Z");
		expect(file.matches[0]?.score).toBe(0.767);
		expect(file.unmatchedCode[0]?.candidates[0]?.score).toBe(0.123);
		expect(file.unmatchedFigma[0]?.candidates[0]?.score).toBe(1);
	});
});

describe("toRegistryFile — determinism (stable sort)", () => {
	it("sorts matches by codeName ascending regardless of input order", () => {
		const result: ComponentMatchResult = {
			matches: [
				match(code("Zebra"), figma("Zebra", "9:9"), 0.9),
				match(code("Apple"), figma("Apple", "1:1"), 0.8),
			],
			unmatchedCode: [],
			unmatchedFigma: [],
		};
		const file = toRegistryFile(result, "t");
		expect(file.matches.map((m) => m.codeName)).toEqual(["Apple", "Zebra"]);
	});

	it("sorts unmatchedCode by name and unmatchedFigma by name ascending", () => {
		const result: ComponentMatchResult = {
			matches: [],
			unmatchedCode: [
				unmatchedCode(code("Zed"), []),
				unmatchedCode(code("Ace"), []),
			],
			unmatchedFigma: [
				unmatchedFigma(figma("Yak", "2:2"), []),
				unmatchedFigma(figma("Box", "1:1"), []),
			],
		};
		const file = toRegistryFile(result, "t");
		expect(file.unmatchedCode.map((c) => c.name)).toEqual(["Ace", "Zed"]);
		expect(file.unmatchedFigma.map((f) => f.name)).toEqual(["Box", "Yak"]);
	});

	it("produces byte-identical JSON for the same inputs and generatedAt", () => {
		const result: ComponentMatchResult = {
			matches: [match(code("Button"), figma("Button", "1:1"), 0.85)],
			unmatchedCode: [
				unmatchedCode(code("Card"), [
					{ figma: figma("Box", "2:2"), score: 0.3 },
				]),
			],
			unmatchedFigma: [
				unmatchedFigma(figma("Input", "3:3"), [
					{ code: code("Card"), score: 0.2 },
				]),
			],
		};
		const a = JSON.stringify(toRegistryFile(result, "t"));
		const b = JSON.stringify(toRegistryFile(result, "t"));
		expect(a).toBe(b);
	});
});

describe("resolveEntry — match outcomes", () => {
	const file: RegistryFile = {
		schemaVersion: 1,
		generatedAt: "t",
		matches: [
			{
				codeName: "Button",
				importPath: "components/button.tsx",
				figmaName: "Button / Primary",
				nodeId: "10:42",
				score: 0.85,
			},
		],
		unmatchedCode: [],
		unmatchedFigma: [
			{
				name: "Input / Text",
				nodeId: "10:58",
				candidates: [{ codeName: "TextField", score: 0.4 }],
			},
		],
	};

	it("resolves by exact figma nodeId", () => {
		const outcome = resolveEntry(file, "10:42");
		expect(outcome.kind).toBe("match");
		if (outcome.kind === "match") {
			expect(outcome.entry.codeName).toBe("Button");
			expect(outcome.entry.nodeId).toBe("10:42");
		}
	});

	it("resolves by exact figmaName", () => {
		const outcome = resolveEntry(file, "Button / Primary");
		expect(outcome.kind).toBe("match");
		if (outcome.kind === "match") {
			expect(outcome.entry.figmaName).toBe("Button / Primary");
		}
	});

	it("resolves by normalized name (case/punctuation insensitive)", () => {
		const outcome = resolveEntry(file, "button-primary");
		expect(outcome.kind).toBe("match");
		if (outcome.kind === "match") {
			expect(outcome.entry.codeName).toBe("Button");
		}
	});

	it("returns candidates when the query hits an unmatched figma entry by nodeId", () => {
		const outcome = resolveEntry(file, "10:58");
		expect(outcome.kind).toBe("candidates");
		if (outcome.kind === "candidates") {
			expect(outcome.entries).toEqual([{ codeName: "TextField", score: 0.4 }]);
		}
	});

	it("returns candidates when the query hits an unmatched figma entry by name", () => {
		const outcome = resolveEntry(file, "Input / Text");
		expect(outcome.kind).toBe("candidates");
	});

	it("returns candidates for a normalized unmatched figma name", () => {
		const outcome = resolveEntry(file, "inputtext");
		expect(outcome.kind).toBe("candidates");
	});

	it("returns not-found for an unknown node name/id", () => {
		expect(resolveEntry(file, "Nope").kind).toBe("not-found");
		expect(resolveEntry(file, "99:99").kind).toBe("not-found");
	});

	it("prefers a match over an unmatched-figma candidate hit on the same query", () => {
		const ambiguous: RegistryFile = {
			...file,
			matches: [
				{
					codeName: "Shared",
					importPath: "components/shared.tsx",
					figmaName: "Shared",
					nodeId: "5:5",
					score: 0.9,
				},
			],
			unmatchedFigma: [
				{
					name: "Shared",
					nodeId: "6:6",
					candidates: [{ codeName: "X", score: 0.3 }],
				},
			],
		};
		// "Shared" matches both, but a confident match wins.
		const outcome = resolveEntry(ambiguous, "Shared");
		expect(outcome.kind).toBe("match");
	});

	it("never throws on odd queries (empty string, whitespace)", () => {
		expect(() => resolveEntry(file, "")).not.toThrow();
		expect(() => resolveEntry(file, "   ")).not.toThrow();
		expect(resolveEntry(file, "").kind).toBe("not-found");
	});
});

// Primer testbed (frame-impl): an instance of the deprecated "Legacy Button",
// whose Figma description says "DEPRECATED — use Button (variant=primary)",
// resolved as ambiguous (Button 0.54 vs OldButton 0.5) and the page lost its
// Save button. A deprecated component that names a matched replacement
// resolves to that replacement, carrying the deprecation and the variant hint.
describe("resolveEntry — deprecated component naming its replacement", () => {
	const registry: RegistryFile = {
		schemaVersion: 1,
		generatedAt: "2026-10-08T00:00:00.000Z",
		matches: [
			{
				codeName: "Button",
				importPath: "@primer/react",
				figmaName: "Button",
				nodeId: "1:109",
				score: 0.81,
			},
		],
		unmatchedCode: [],
		unmatchedFigma: [
			{
				name: "Legacy Button",
				nodeId: "2:99",
				description:
					"DEPRECATED — use Button (variant=primary). Kept for the old Hub settings page.",
				candidates: [
					{ codeName: "Button", score: 0.542 },
					{ codeName: "OldButton", score: 0.5 },
				],
			},
			{
				name: "Old Card",
				nodeId: "3:1",
				description: "Legacy — use NewCard instead.",
				candidates: [{ codeName: "Card", score: 0.6 }],
			},
			{
				name: "Promo",
				nodeId: "4:1",
				description: "Use this for marketing callouts.",
				candidates: [{ codeName: "PromoBox", score: 0.6 }],
			},
		],
	};

	it("resolves to the named replacement with its hint", () => {
		expect(resolveEntry(registry, "2:99")).toEqual({
			kind: "match",
			entry: registry.matches[0],
			replaces: { name: "Legacy Button", hint: "variant=primary" },
		});
		expect(resolveEntry(registry, "Legacy Button").kind).toBe("match");
	});

	it("stays candidates when the named replacement is not in the registry", () => {
		expect(resolveEntry(registry, "3:1").kind).toBe("candidates");
	});

	it("never reads 'use' in a description that is not a deprecation", () => {
		expect(resolveEntry(registry, "4:1").kind).toBe("candidates");
	});
});

describe("resolveEntry — components composed in code (Code Connect recipes)", () => {
	it("resolves a composed Figma component to the code component that builds it", () => {
		const registry: RegistryFile = {
			schemaVersion: 1,
			generatedAt: "2026-10-08T00:00:00.000Z",
			matches: [],
			unmatchedCode: [
				{
					name: "Section",
					importPath: "src/ui/Section.tsx",
					candidates: [],
					composes: ["Card Grid Icon"],
				},
			],
			unmatchedFigma: [],
			composed: [
				{ name: "Card Grid Icon", nodeId: "348:13221", codeName: "Section" },
			],
		};
		for (const query of ["Card Grid Icon", "348:13221"]) {
			expect(resolveEntry(registry, query)).toEqual({
				kind: "composed",
				name: "Card Grid Icon",
				nodeId: "348:13221",
				codeName: "Section",
				importPath: "src/ui/Section.tsx",
			});
		}
	});
});

describe("resolveEntry — a node id in URL form", () => {
	it("resolves 4185-3778 like 4185:3778", () => {
		const registry: RegistryFile = {
			schemaVersion: 1,
			generatedAt: "2026-10-08T00:00:00.000Z",
			matches: [
				{
					codeName: "Button",
					importPath: "b.tsx",
					figmaName: "Button",
					nodeId: "4185:3778",
					score: 1,
				},
			],
			unmatchedCode: [],
			unmatchedFigma: [],
		};
		expect(resolveEntry(registry, "4185-3778").kind).toBe("match");
	});
});
