// T6.1 — gaps engine (PURE: no fs/network/process). The anti-invention safety
// net: when the model implements a Figma frame, every requirement the design
// needs is resolved against the SYSTEM (the committed registry + parsed tokens)
// or surfaced as a structured gap — never invented UI.
//
// These tests pin: (1) component requirements resolve via resolveEntry (match ->
// resolved; candidates -> ambiguous gap listing them; not-found -> no-match gap);
// (2) token requirements resolve via the TokenIndex byValue canonical exact,
// preferring the alias-bearing semantic token like the lint matcher does, with
// near-only (color deltaE<=2.5 / dimension +-1px) surfaced as candidates and
// nothing as no-token-match; (3) deterministic ordering (requirements order
// preserved); (4) the GOLDEN gaps report over a realistic mixed input built from
// the existing w3c token fixture + a hand-written registry literal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type FrameRequirement,
	findGaps,
	type GapsReport,
} from "../../../src/engines/registry/gaps.js";
import type { RegistryFile } from "../../../src/engines/registry/persist.js";
import { parseW3c } from "../../../src/engines/tokens/parse-w3c.js";
import type { Token } from "../../../src/engines/tokens/types.js";

// ── Fixtures ──

function loadTokens(): Token[] {
	const text = readFileSync(
		join(
			import.meta.dirname,
			"..",
			"..",
			"fixtures",
			"tokens",
			"w3c",
			"tokens.json",
		),
		"utf8",
	);
	const outcome = parseW3c(JSON.parse(text));
	if (outcome.kind !== "ok") throw new Error("fixture tokens failed to parse");
	return outcome.map.tokens;
}

const TOKENS = loadTokens();

/** A registry with exactly one confident match and one ambiguous figma entry. */
const REGISTRY: RegistryFile = {
	schemaVersion: 1,
	generatedAt: "2026-06-06T10:00:00.000Z",
	matches: [
		{
			codeName: "Button",
			importPath: "components/button.tsx",
			figmaName: "Button / Primary",
			nodeId: "10:42",
			score: 0.92,
		},
	],
	unmatchedCode: [],
	unmatchedFigma: [
		{
			name: "Card",
			nodeId: "20:7",
			candidates: [
				{ codeName: "CardPanel", score: 0.58 },
				{ codeName: "CardSurface", score: 0.55 },
			],
		},
	],
};

const EMPTY_REGISTRY: RegistryFile = {
	schemaVersion: 1,
	generatedAt: "2026-06-06T10:00:00.000Z",
	matches: [],
	unmatchedCode: [],
	unmatchedFigma: [],
};

// ── Requirement builders ──

function comp(name: string, nodeId = `node:${name}`): FrameRequirement {
	return { kind: "component", nodeId, name };
}

function color(property: string, rawValue: string): FrameRequirement {
	return { kind: "token", property, rawValue, valueKind: "color" };
}

function dimension(property: string, rawValue: string): FrameRequirement {
	return { kind: "token", property, rawValue, valueKind: "dimension" };
}

// ── Component requirements ──

describe("findGaps — component requirements", () => {
	it("resolves a node that matches the registry to a registry-match", () => {
		const report = findGaps({
			requirements: [comp("Button / Primary", "10:42")],
			registry: REGISTRY,
			tokens: TOKENS,
		});
		expect(report.gaps).toEqual([]);
		expect(report.resolved).toHaveLength(1);
		const [resolved] = report.resolved;
		expect(resolved?.resolution).toEqual({
			kind: "registry-match",
			codeName: "Button",
			importPath: "components/button.tsx",
		});
	});

	it("surfaces an ambiguous registry node as a gap listing its candidates", () => {
		const report = findGaps({
			requirements: [comp("Card", "20:7")],
			registry: REGISTRY,
			tokens: TOKENS,
		});
		expect(report.resolved).toEqual([]);
		expect(report.gaps).toHaveLength(1);
		const [gap] = report.gaps;
		expect(gap?.reason).toBe("ambiguous-registry-match");
		expect(gap?.candidates).toEqual(["CardPanel", "CardSurface"]);
		expect(gap?.suggestion).toContain("Card");
	});

	it("surfaces an unknown node as a no-registry-match gap with no candidates", () => {
		const report = findGaps({
			requirements: [comp("Mystery")],
			registry: REGISTRY,
			tokens: TOKENS,
		});
		expect(report.resolved).toEqual([]);
		expect(report.gaps).toHaveLength(1);
		const [gap] = report.gaps;
		expect(gap?.reason).toBe("no-registry-match");
		expect(gap?.candidates).toEqual([]);
		expect(gap?.suggestion.toLowerCase()).toContain("publish");
	});

	it("treats an empty registry as no-registry-match for every component", () => {
		const report = findGaps({
			requirements: [comp("Button / Primary", "10:42")],
			registry: EMPTY_REGISTRY,
			tokens: TOKENS,
		});
		expect(report.resolved).toEqual([]);
		expect(report.gaps[0]?.reason).toBe("no-registry-match");
	});
});

// ── Token requirements ──

describe("findGaps — token requirements", () => {
	it("resolves an exact color to its token, preferring the semantic alias", () => {
		const report = findGaps({
			requirements: [color("background", "#3b82f6")],
			registry: REGISTRY,
			tokens: TOKENS,
		});
		expect(report.gaps).toEqual([]);
		expect(report.resolved[0]?.resolution).toEqual({
			kind: "token-exact",
			tokenName: "color.brand.primary",
		});
	});

	it("resolves an exact dimension to its token", () => {
		const report = findGaps({
			requirements: [dimension("padding", "16px")],
			registry: REGISTRY,
			tokens: TOKENS,
		});
		expect(report.gaps).toEqual([]);
		expect(report.resolved[0]?.resolution).toEqual({
			kind: "token-exact",
			tokenName: "space.md",
		});
	});

	it("surfaces a near-only color as a near-token-only gap with ranked candidates", () => {
		const report = findGaps({
			requirements: [color("background", "#3b82f7")],
			registry: REGISTRY,
			tokens: TOKENS,
		});
		expect(report.resolved).toEqual([]);
		const [gap] = report.gaps;
		expect(gap?.reason).toBe("near-token-only");
		// Same distance: the semantic alias ranks ahead of its primitive, as in lint.
		expect(gap?.candidates).toEqual([
			"color.brand.primary",
			"color.base.blue-500",
		]);
		expect(gap?.suggestion).toContain("designer sign-off");
	});

	it("surfaces a near-only dimension (17px ~ 16px) as a near-token-only gap", () => {
		const report = findGaps({
			requirements: [dimension("padding", "17px")],
			registry: REGISTRY,
			tokens: TOKENS,
		});
		expect(report.resolved).toEqual([]);
		const [gap] = report.gaps;
		expect(gap?.reason).toBe("near-token-only");
		expect(gap?.candidates).toEqual(["space.md"]);
	});

	it("surfaces a value with no near token as a no-token-match gap", () => {
		const report = findGaps({
			requirements: [color("background", "#ff00aa")],
			registry: REGISTRY,
			tokens: TOKENS,
		});
		expect(report.resolved).toEqual([]);
		const [gap] = report.gaps;
		expect(gap?.reason).toBe("no-token-match");
		expect(gap?.candidates).toEqual([]);
		expect(gap?.suggestion.toLowerCase()).toContain("#ff00aa");
	});

	it("never throws on an unparseable raw value (degrades to no-token-match)", () => {
		const report = findGaps({
			requirements: [color("background", "not-a-color")],
			registry: REGISTRY,
			tokens: TOKENS,
		});
		expect(report.gaps[0]?.reason).toBe("no-token-match");
	});
});

// ── Ordering ──

describe("findGaps — determinism", () => {
	it("preserves requirement order across resolved and gaps", () => {
		const requirements: FrameRequirement[] = [
			comp("Button / Primary", "10:42"),
			comp("Mystery"),
			color("background", "#3b82f6"),
			color("accent", "#ff00aa"),
		];
		const report = findGaps({
			requirements,
			registry: REGISTRY,
			tokens: TOKENS,
		});
		// resolved keeps the relative order of the two resolved requirements
		expect(report.resolved.map((r) => r.requirement)).toEqual([
			requirements[0],
			requirements[2],
		]);
		// gaps keep the relative order of the two gap requirements
		expect(report.gaps.map((g) => g.requirement)).toEqual([
			requirements[1],
			requirements[3],
		]);
	});

	it("is a pure function — identical inputs yield deep-equal reports", () => {
		const input = {
			requirements: [comp("Card", "20:7"), color("background", "#3b82f7")],
			registry: REGISTRY,
			tokens: TOKENS,
		};
		expect(findGaps(input)).toEqual(findGaps(input));
	});
});

// ── Golden report ──

describe("findGaps — golden gaps report", () => {
	it("matches the full GapsReport for a realistic mixed frame", () => {
		const requirements: FrameRequirement[] = [
			comp("Button / Primary", "10:42"), // -> resolved registry-match
			comp("Card", "20:7"), // -> gap ambiguous-registry-match
			comp("Mystery"), // -> gap no-registry-match
			color("background", "#3b82f6"), // -> resolved token-exact (alias)
			dimension("padding", "16px"), // -> resolved token-exact
			color("border", "#3b82f7"), // -> gap near-token-only
			dimension("gap", "17px"), // -> gap near-token-only
			color("accent", "#ff00aa"), // -> gap no-token-match
		];
		const report = findGaps({
			requirements,
			registry: REGISTRY,
			tokens: TOKENS,
		});

		const golden: GapsReport = {
			resolved: [
				{
					requirement: {
						kind: "component",
						nodeId: "10:42",
						name: "Button / Primary",
					},
					resolution: {
						kind: "registry-match",
						codeName: "Button",
						importPath: "components/button.tsx",
					},
				},
				{
					requirement: {
						kind: "token",
						property: "background",
						rawValue: "#3b82f6",
						valueKind: "color",
					},
					resolution: { kind: "token-exact", tokenName: "color.brand.primary" },
				},
				{
					requirement: {
						kind: "token",
						property: "padding",
						rawValue: "16px",
						valueKind: "dimension",
					},
					resolution: { kind: "token-exact", tokenName: "space.md" },
				},
			],
			gaps: [
				{
					requirement: { kind: "component", nodeId: "20:7", name: "Card" },
					reason: "ambiguous-registry-match",
					candidates: ["CardPanel", "CardSurface"],
					suggestion:
						'Multiple code components could match "Card" (CardPanel, CardSurface) — pick one with a designer/engineer, don\'t guess.',
				},
				{
					requirement: {
						kind: "component",
						nodeId: "node:Mystery",
						name: "Mystery",
					},
					reason: "no-registry-match",
					candidates: [],
					suggestion:
						'No code component matches "Mystery" — build it or publish the Figma component, then rebuild the registry. Do not invent UI.',
				},
				{
					requirement: {
						kind: "token",
						property: "border",
						rawValue: "#3b82f7",
						valueKind: "color",
					},
					reason: "near-token-only",
					candidates: ["color.brand.primary", "color.base.blue-500"],
					suggestion:
						'No exact token for "#3b82f7" — nearest is color.brand.primary; use it only with designer sign-off, otherwise add a token.',
				},
				{
					requirement: {
						kind: "token",
						property: "gap",
						rawValue: "17px",
						valueKind: "dimension",
					},
					reason: "near-token-only",
					candidates: ["space.md"],
					suggestion:
						'No exact token for "17px" — nearest is space.md; use it only with designer sign-off, otherwise add a token.',
				},
				{
					requirement: {
						kind: "token",
						property: "accent",
						rawValue: "#ff00aa",
						valueKind: "color",
					},
					reason: "no-token-match",
					candidates: [],
					suggestion:
						'No token matches "#ff00aa" — add a token for it; never approximate with a raw value.',
				},
			],
		};

		expect(report).toEqual(golden);
	});
});

describe("findGaps — a deprecated instance whose component names its replacement", () => {
	it("resolves to the replacement and carries the deprecation", () => {
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
					description: "DEPRECATED — use Button (variant=primary).",
					candidates: [{ codeName: "Button", score: 0.54 }],
				},
			],
		};
		const report = findGaps({
			requirements: [
				{
					kind: "component",
					nodeId: "2:168",
					name: "Save (legacy)",
					componentName: "Legacy Button",
				},
			],
			registry,
			tokens: [],
		});
		expect(report.gaps).toEqual([]);
		expect(report.resolved[0]?.resolution).toEqual({
			kind: "registry-match",
			codeName: "Button",
			importPath: "@primer/react",
			replaces: { name: "Legacy Button", hint: "variant=primary" },
		});
	});
});

describe("findGaps — text colors resolve to text tokens", () => {
	it("is near-token-only when the exact hex exists only as a surface token", () => {
		const tokens: Token[] = [
			{ name: "bgColor.danger.emphasis", type: "color", value: "#cf222e" },
			{ name: "fgColor.danger", type: "color", value: "#d1242f" },
		];
		const registry: RegistryFile = {
			schemaVersion: 1,
			generatedAt: "2026-10-08T00:00:00.000Z",
			matches: [],
			unmatchedCode: [],
			unmatchedFigma: [],
		};
		const report = findGaps({
			requirements: [
				{
					kind: "token",
					property: "color",
					rawValue: "#cf222e",
					valueKind: "color",
				},
				{
					kind: "token",
					property: "background",
					rawValue: "#cf222e",
					valueKind: "color",
				},
			],
			registry,
			tokens,
		});
		expect(report.gaps.map((g) => [g.reason, g.candidates[0]])).toEqual([
			["near-token-only", "fgColor.danger"],
		]);
		expect(report.resolved).toHaveLength(1);
	});
});
