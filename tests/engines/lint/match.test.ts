// T2.3 — token matcher for the lint engine (pure, no I/O).
// The master spec loads the sample-project tokens, builds the index + composite
// color lookup, extracts every literal from the fixture sources, matches each,
// and asserts the (file,line,col,kind,suggestion) set EXACTLY equals
// expected-findings.json: 3 exact, 3 near, 1 off-system, nothing extra.
// Targeted unit cases cover the matcher edges: near-color ascending ranking,
// dimension boundary behavior (17px near 16px), exact beats near, off-system
// color far from all tokens, and an empty index degrading to off-system.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type ExtractedLiteral,
	extractLiterals,
} from "../../../src/engines/lint/extract.js";
import {
	buildCompositeColorLookup,
	type LiteralMatch,
	matchLiteral,
} from "../../../src/engines/lint/match.js";
import { parseW3c } from "../../../src/engines/tokens/parse-w3c.js";
import {
	buildTokenIndex,
	type TokenIndex,
} from "../../../src/engines/tokens/token-index.js";
import type { Token } from "../../../src/engines/tokens/types.js";

const projectRoot = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"sample-project",
);
const srcRoot = join(projectRoot, "src");

interface ExpectedFinding {
	file: string;
	line: number;
	col: number;
	raw: string;
	property: string;
	kind: "exact" | "near" | "off-system";
	expectedToken?: string;
	expectedCandidates?: string[];
}

function loadExpected(): ExpectedFinding[] {
	const text = readFileSync(
		join(projectRoot, "expected-findings.json"),
		"utf8",
	);
	return JSON.parse(text) as ExpectedFinding[];
}

function loadFixtureTokens(): Token[] {
	const text = readFileSync(join(projectRoot, "tokens.json"), "utf8");
	const outcome = parseW3c(JSON.parse(text));
	if (outcome.kind !== "ok") {
		throw new Error("fixture tokens.json failed to parse");
	}
	return outcome.map.tokens;
}

function extractAllSourceFiles(): ExtractedLiteral[] {
	const out: ExtractedLiteral[] = [];
	for (const entry of readdirSync(srcRoot)) {
		const abs = join(srcRoot, entry);
		const content = readFileSync(abs, "utf8");
		out.push(...extractLiterals({ path: `src/${entry}`, content }));
	}
	return out;
}

/** The single token name a match suggests, or undefined for off-system. */
function suggestion(match: LiteralMatch): string | undefined {
	if (match.kind === "exact") return match.token.name;
	if (match.kind === "near") return match.candidates[0]?.token.name;
	return undefined;
}

describe("matchLiteral — master fixture contract", () => {
	const expected = loadExpected();
	const tokens = loadFixtureTokens();
	const index = buildTokenIndex(tokens);
	const compositeColors = buildCompositeColorLookup(tokens);
	const literals = extractAllSourceFiles();

	// Match every extracted literal, keyed by position for set comparison.
	function actualFindings(): {
		file: string;
		line: number;
		col: number;
		kind: LiteralMatch["kind"];
		suggested: string | undefined;
	}[] {
		return literals.map((lit) => {
			const match = matchLiteral(lit, index, { compositeColors });
			return {
				file: lit.file,
				line: lit.line,
				col: lit.col,
				kind: match.kind,
				suggested: suggestion(match),
			};
		});
	}

	it("produces exactly 3 exact, 3 near, 1 off-system — nothing extra", () => {
		const findings = actualFindings();
		expect(findings).toHaveLength(expected.length);
		const counts = { exact: 0, near: 0, "off-system": 0 };
		for (const f of findings) counts[f.kind] += 1;
		expect(counts).toEqual({ exact: 3, near: 3, "off-system": 1 });
	});

	it("matches each seeded position to the expected kind and suggestion", () => {
		const findings = actualFindings();
		for (const exp of expected) {
			const got = findings.find(
				(f) => f.file === exp.file && f.line === exp.line && f.col === exp.col,
			);
			expect(
				got,
				`no match at ${exp.file}:${exp.line}:${exp.col}`,
			).toBeDefined();
			if (got === undefined) continue;
			expect(got.kind, `kind at ${exp.file}:${exp.line}`).toBe(exp.kind);
			const wantSuggestion =
				exp.kind === "exact"
					? exp.expectedToken
					: exp.kind === "near"
						? exp.expectedCandidates?.[0]
						: undefined;
			expect(got.suggested, `suggestion at ${exp.file}:${exp.line}`).toBe(
				wantSuggestion,
			);
		}
	});

	it("the entire finding set equals expected-findings.json exactly", () => {
		const norm = (f: {
			file: string;
			line: number;
			col: number;
			kind: string;
			suggested: string | undefined;
		}): string => `${f.file}:${f.line}:${f.col}:${f.kind}:${f.suggested ?? ""}`;
		const want = expected
			.map((e) =>
				norm({
					file: e.file,
					line: e.line,
					col: e.col,
					kind: e.kind,
					suggested:
						e.kind === "exact"
							? e.expectedToken
							: e.kind === "near"
								? e.expectedCandidates?.[0]
								: undefined,
				}),
			)
			.sort();
		const have = actualFindings().map(norm).sort();
		expect(have).toEqual(want);
	});

	it("resolves the composite shadow color #11182733 to shadow.card (exact)", () => {
		const lit = literals.find(
			(l) => l.file === "src/card.module.css" && l.raw === "#11182733",
		);
		expect(lit).toBeDefined();
		if (lit === undefined) return;
		const match = matchLiteral(lit, index, { compositeColors });
		expect(match.kind).toBe("exact");
		if (match.kind === "exact") expect(match.token.name).toBe("shadow.card");
	});
});

// ---- Targeted unit cases ----

function colorLiteral(raw: string, property = "color"): ExtractedLiteral {
	return {
		file: "x.css",
		line: 1,
		col: 1,
		raw,
		property,
		valueKind: "color",
		context: "css-declaration",
	};
}

function dimLiteral(raw: string, property = "padding"): ExtractedLiteral {
	return {
		file: "x.css",
		line: 1,
		col: 1,
		raw,
		property,
		valueKind: "dimension",
		context: "css-declaration",
	};
}

const colorToken = (name: string, value: string, aliasOf?: string): Token => ({
	name,
	type: "color",
	value,
	...(aliasOf !== undefined ? { aliasOf } : {}),
});

const dimToken = (name: string, value: string): Token => ({
	name,
	type: "dimension",
	value,
});

describe("matchLiteral — exact colors", () => {
	it("matches a canonical color value to its token", () => {
		const index = buildTokenIndex([colorToken("color.blue", "#3b82f6")]);
		const match = matchLiteral(colorLiteral("#3b82f6"), index);
		expect(match.kind).toBe("exact");
		if (match.kind === "exact") expect(match.token.name).toBe("color.blue");
	});

	it("normalizes spelling before comparing (rgb form is exact)", () => {
		const index = buildTokenIndex([colorToken("color.blue", "#3b82f6")]);
		const match = matchLiteral(colorLiteral("rgb(59, 130, 246)"), index);
		expect(match.kind).toBe("exact");
	});

	it("prefers the semantic alias over the primitive at the same value", () => {
		const tokens = [
			colorToken("color.base.blue-500", "#3b82f6"),
			colorToken("color.brand.primary", "#3b82f6", "color.base.blue-500"),
		];
		const index = buildTokenIndex(tokens);
		const match = matchLiteral(colorLiteral("#3b82f6"), index);
		expect(match.kind).toBe("exact");
		if (match.kind === "exact") {
			expect(match.token.name).toBe("color.brand.primary");
		}
	});
});

describe("matchLiteral — exact ties by property role", () => {
	// shadcn light: chart-2 and muted-foreground share #737373; primary and
	// accent-foreground share #171717.
	const index = buildTokenIndex([
		colorToken("accent-foreground", "#171717"),
		colorToken("chart-2", "#737373"),
		colorToken("muted-foreground", "#737373"),
		colorToken("primary", "#171717"),
	]);
	const name = (raw: string, property: string) => {
		const match = matchLiteral(colorLiteral(raw, property), index);
		return match.kind === "exact" ? match.token.name : match.kind;
	};

	it("suggests a foreground token for a text color", () => {
		expect(name("#737373", "color")).toBe("muted-foreground");
	});

	it("suggests a surface token for a background or border", () => {
		expect(name("#171717", "backgroundColor")).toBe("primary");
		expect(name("#171717", "border-color")).toBe("primary");
	});

	it("keeps the first token when the property has no role", () => {
		expect(name("#737373", "fill")).toBe("chart-2");
	});
});

describe("matchLiteral — near colors", () => {
	it("returns candidates ranked by ascending deltaE", () => {
		const tokens = [
			colorToken("color.far", "#2f6fd6"),
			colorToken("color.near", "#3a81f5"),
			colorToken("color.mid", "#3576ea"),
		];
		const index = buildTokenIndex(tokens);
		const match = matchLiteral(colorLiteral("#3b82f6"), index);
		expect(match.kind).toBe("near");
		if (match.kind === "near") {
			const distances = match.candidates.map((c) => c.distance);
			const ascending = [...distances].sort((a, b) => a - b);
			expect(distances).toEqual(ascending);
			expect(match.candidates[0]?.token.name).toBe("color.near");
		}
	});

	it("limits near color candidates to 3", () => {
		const tokens = [
			colorToken("a", "#3b82f6"),
			colorToken("b", "#3b82f7"),
			colorToken("c", "#3b82f5"),
			colorToken("d", "#3b81f6"),
			colorToken("e", "#3b83f6"),
		].map((t, i) => ({ ...t, name: `color.${"abcde"[i]}` }));
		// Use a query that is near (deltaE<=2.5) to all five but exact to none.
		const index = buildTokenIndex(tokens);
		const match = matchLiteral(colorLiteral("#3b82f4"), index);
		expect(match.kind).toBe("near");
		if (match.kind === "near")
			expect(match.candidates.length).toBeLessThanOrEqual(3);
	});

	it("treats a color far from every token as off-system", () => {
		const index = buildTokenIndex([colorToken("color.blue", "#3b82f6")]);
		const match = matchLiteral(colorLiteral("#ff00aa"), index);
		expect(match.kind).toBe("off-system");
	});

	it("exact beats near when both are possible", () => {
		const tokens = [
			colorToken("color.exact", "#3b82f6"),
			colorToken("color.close", "#3b82f7"),
		];
		const index = buildTokenIndex(tokens);
		const match = matchLiteral(colorLiteral("#3b82f6"), index);
		expect(match.kind).toBe("exact");
		if (match.kind === "exact") expect(match.token.name).toBe("color.exact");
	});
});

describe("matchLiteral — composite colors", () => {
	it("matches a literal to a composite token via the lookup after byValue miss", () => {
		const shadow: Token = {
			name: "shadow.card",
			type: "shadow",
			value: { color: "#11182733", offsetX: "0px", blur: "8px" },
		};
		const tokens = [colorToken("color.blue", "#3b82f6"), shadow];
		const index = buildTokenIndex(tokens);
		const composite = buildCompositeColorLookup(tokens);
		const match = matchLiteral(colorLiteral("#11182733", "box-shadow"), index, {
			compositeColors: composite,
		});
		expect(match.kind).toBe("exact");
		if (match.kind === "exact") expect(match.token.name).toBe("shadow.card");
	});

	it("prefers a direct byValue token over a composite match", () => {
		const shadow: Token = {
			name: "shadow.card",
			type: "shadow",
			value: { color: "#3b82f6" },
		};
		const tokens = [colorToken("color.blue", "#3b82f6"), shadow];
		const index = buildTokenIndex(tokens);
		const composite = buildCompositeColorLookup(tokens);
		const match = matchLiteral(colorLiteral("#3b82f6"), index, {
			compositeColors: composite,
		});
		expect(match.kind).toBe("exact");
		if (match.kind === "exact") expect(match.token.name).toBe("color.blue");
	});
});

describe("buildCompositeColorLookup", () => {
	it("indexes only composite (object-valued) tokens with a color key", () => {
		const tokens: Token[] = [
			colorToken("color.blue", "#3b82f6"),
			{ name: "shadow.card", type: "shadow", value: { color: "#11182733" } },
			{ name: "type.body", type: "typography", value: { fontWeight: 400 } },
		];
		const lookup = buildCompositeColorLookup(tokens);
		expect(lookup.has("#11182733")).toBe(true);
		// The simple color token is NOT in the composite lookup.
		expect(lookup.has("#3b82f6")).toBe(false);
		// The typography token has no color key → not indexed.
		expect([...lookup.values()].flat().map((t) => t.name)).toEqual([
			"shadow.card",
		]);
	});

	it("normalizes the composite inner color to the canonical key", () => {
		const tokens: Token[] = [
			{
				name: "shadow.card",
				type: "shadow",
				value: { color: "rgb(59, 130, 246)" },
			},
		];
		const lookup = buildCompositeColorLookup(tokens);
		expect(lookup.has("#3b82f6")).toBe(true);
	});
});

describe("matchLiteral — dimensions", () => {
	it("matches an identical px dimension exactly", () => {
		const index = buildTokenIndex([dimToken("space.md", "16px")]);
		const match = matchLiteral(dimLiteral("16px"), index);
		expect(match.kind).toBe("exact");
		if (match.kind === "exact") expect(match.token.name).toBe("space.md");
	});

	it("17px is NOT exact against 16px but IS near (abs diff 1)", () => {
		const index = buildTokenIndex([dimToken("space.md", "16px")]);
		const match = matchLiteral(dimLiteral("17px"), index);
		expect(match.kind).toBe("near");
		if (match.kind === "near") {
			expect(match.candidates[0]?.token.name).toBe("space.md");
			expect(match.candidates[0]?.distance).toBe(1);
		}
	});

	it("a unitless dimension literal (17) is near 16px", () => {
		const index = buildTokenIndex([dimToken("space.md", "16px")]);
		const match = matchLiteral(dimLiteral("17"), index);
		expect(match.kind).toBe("near");
		if (match.kind === "near") expect(match.candidates[0]?.distance).toBe(1);
	});

	it("a dimension > 1px away from all tokens is off-system", () => {
		const index = buildTokenIndex([dimToken("space.md", "16px")]);
		const match = matchLiteral(dimLiteral("20px"), index);
		expect(match.kind).toBe("off-system");
	});

	it("ranks dimension candidates by ascending abs diff, limited to 3", () => {
		const tokens = [
			dimToken("space.md", "16px"),
			dimToken("space.smd", "17.5px"),
			dimToken("space.alt", "16.5px"),
		];
		const index = buildTokenIndex(tokens);
		const match = matchLiteral(dimLiteral("17px"), index);
		expect(match.kind).toBe("near");
		if (match.kind === "near") {
			const diffs = match.candidates.map((c) => c.distance);
			expect(diffs).toEqual([...diffs].sort((a, b) => a - b));
			expect(match.candidates.length).toBeLessThanOrEqual(3);
		}
	});
});

describe("matchLiteral — empty index", () => {
	it("an empty index yields off-system for any color", () => {
		const index: TokenIndex = buildTokenIndex([]);
		expect(matchLiteral(colorLiteral("#3b82f6"), index).kind).toBe(
			"off-system",
		);
	});

	it("an empty index yields off-system for any dimension", () => {
		const index: TokenIndex = buildTokenIndex([]);
		expect(matchLiteral(dimLiteral("16px"), index).kind).toBe("off-system");
	});
});
