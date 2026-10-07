// T5.3 — Figma<->code component matcher. PURE: no fs/network/process; the
// registry's brain. Given the scanned code components and the Figma component
// models, produce a deterministic match result with explicit unmatched buckets
// carrying ranked candidates. The engine NEVER throws and — by its CRITICAL
// safety property — NEVER silently picks an ambiguous match.
//
// ── Scoring contract (the table these tests pin) ──
//
// Name normalization: strip every non-alphanumeric, lowercase. So
//   "Button / Primary" ~ "PrimaryButton" ~ "button-primary" all share tokens.
//
// nameScore(a, b):
//   • 1.0 when normalize(a) === normalize(b) (exact normalized equality)
//   • otherwise token-set Jaccard-ish: split each raw name into word tokens by
//     PascalCase boundaries / slashes / dashes / spaces, lowercase them, then
//       score = 2 * |A ∩ B| / (|A| + |B|)
//   • a token-set score below 0.3 collapses to 0
//
// shapeScore(code.variants, figma.variantProps): overlap of variant dimensions
//   • for each figma variantProp key that normalized-matches a code variants
//     key, take the value-set Jaccard |∩| / |∪|
//   • average across the UNION of (normalized) keys (missing-on-one-side key
//     contributes 0 to the average)
//   • both sides empty -> 0.5 (neutral, no shape signal)
//   • exactly one side empty -> 0.25
//
// score = 0.7 * nameScore + 0.3 * shapeScore
//
// Assignment: greedy descending score, strictly 1:1, threshold >= 0.6 to count
// as a MATCH. Ambiguity guard (zero silent wrong matches): if a code
// component's best candidate is AMBIGUOUS — second-best within 0.1 of best AND
// both >= 0.6 — do NOT match it; emit it as unmatchedCode carrying both
// candidates ranked. Determinism: ties broken by name ascending; every result
// array sorted by name ascending.
//
// Worked anchors (verified by hand against the table):
//   • "Button"/{}  vs  "Button"/{} : name 1.0, shape 0.5 (both empty) ->
//       score = 0.7*1 + 0.3*0.5 = 0.85
//   • "Button"/{variant:[primary,secondary]} vs same figma variantProps:
//       name 1.0, shape 1.0 -> 1.0
//   • "Button / Primary" vs code "Button": tokens [button,primary] vs [button]
//       name = 2*1/(2+1) = 0.6667; if shapes match on `variant` -> shape 1.0 ->
//       score = 0.7*0.6667 + 0.3*1.0 = 0.7667  (a MATCH, >= 0.6)
import { describe, expect, it } from "vitest";
import { matchComponents } from "../../../src/engines/registry/match.js";
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
	variantProps: Record<string, string[]> = {},
	nodeId = `1:${name}`,
): FigmaComponentModel {
	return {
		name,
		nodeId,
		description: "",
		variantProps,
		source: "published",
	};
}

describe("matchComponents — empty inputs", () => {
	it("returns all-empty for empty code and empty figma", () => {
		expect(matchComponents([], [])).toEqual({
			matches: [],
			unmatchedCode: [],
			unmatchedFigma: [],
		});
	});

	it("emits unmatchedCode with empty candidates when there is no figma at all", () => {
		const result = matchComponents([code("Button")], []);
		expect(result.matches).toEqual([]);
		expect(result.unmatchedFigma).toEqual([]);
		expect(result.unmatchedCode).toHaveLength(1);
		expect(result.unmatchedCode[0]?.code.name).toBe("Button");
		expect(result.unmatchedCode[0]?.candidates).toEqual([]);
	});

	it("emits unmatchedFigma with empty candidates when there is no code at all", () => {
		const result = matchComponents([], [figma("Button")]);
		expect(result.matches).toEqual([]);
		expect(result.unmatchedCode).toEqual([]);
		expect(result.unmatchedFigma).toHaveLength(1);
		expect(result.unmatchedFigma[0]?.figma.name).toBe("Button");
		expect(result.unmatchedFigma[0]?.candidates).toEqual([]);
	});
});

describe("matchComponents — exact normalized name match", () => {
	it("matches identical names with neutral (both-empty) shape at 0.85", () => {
		const result = matchComponents([code("Button")], [figma("Button")]);
		expect(result.matches).toHaveLength(1);
		const m = result.matches[0];
		expect(m?.code.name).toBe("Button");
		expect(m?.figma.name).toBe("Button");
		expect(m?.nameScore).toBe(1);
		expect(m?.shapeScore).toBeCloseTo(0.5, 10);
		expect(m?.score).toBeCloseTo(0.85, 10);
		expect(result.unmatchedCode).toEqual([]);
		expect(result.unmatchedFigma).toEqual([]);
	});

	it("scores a perfect name+shape match at 1.0", () => {
		const variants = { variant: ["primary", "secondary"] };
		const result = matchComponents(
			[code("Button", variants)],
			[figma("Button", variants)],
		);
		expect(result.matches).toHaveLength(1);
		const m = result.matches[0];
		expect(m?.nameScore).toBe(1);
		expect(m?.shapeScore).toBeCloseTo(1, 10);
		expect(m?.score).toBeCloseTo(1, 10);
	});

	it("treats casing/punctuation differences as exact normalized equality", () => {
		// "button-primary" code vs "Button / Primary" figma both normalize to
		// "buttonprimary" -> nameScore 1.0 (exact), not the token-set path.
		const result = matchComponents(
			[code("button-primary")],
			[figma("Button / Primary")],
		);
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]?.nameScore).toBe(1);
	});
});

describe("matchComponents — Figma boolean variant axes", () => {
	it("ignores a true/false Figma axis (a boolean prop in code, never a string variant)", () => {
		const result = matchComponents(
			[code("Checkbox")],
			[figma("Checkbox", { checked: ["false", "true"] })],
		);
		expect(result.matches[0]?.shapeScore).toBeCloseTo(0.5, 10);
		expect(result.matches[0]?.score).toBeCloseTo(0.85, 10);
	});

	it("still compares the other axes", () => {
		const result = matchComponents(
			[code("Switch", { size: ["default", "sm"] })],
			[
				figma("Switch", {
					checked: ["false", "true"],
					size: ["default", "sm"],
				}),
			],
		);
		expect(result.matches[0]?.shapeScore).toBeCloseTo(1, 10);
	});
});

describe("matchComponents — token-set name matches", () => {
	it("matches 'Button / Primary' figma to code 'Button' with shared variant", () => {
		// tokens [button, primary] vs [button] -> name 2*1/3 = 0.6667;
		// shape on `variant` matching -> 1.0; score 0.7667 (a MATCH).
		const result = matchComponents(
			[code("Button", { variant: ["primary"] })],
			[figma("Button / Primary", { variant: ["primary"] })],
		);
		expect(result.matches).toHaveLength(1);
		const m = result.matches[0];
		expect(m?.nameScore).toBeCloseTo(2 / 3, 10);
		expect(m?.shapeScore).toBeCloseTo(1, 10);
		expect(m?.score).toBeCloseTo(0.7 * (2 / 3) + 0.3, 10);
	});

	it("matches PascalCase code 'PrimaryButton' to figma 'Button / Primary'", () => {
		// Tokens [primary, button] vs [button, primary] -> identical set ->
		// 2*2/(2+2) = 1.0 token-set score (but not exact: 'primarybutton' !=
		// 'buttonprimary').
		const result = matchComponents(
			[code("PrimaryButton")],
			[figma("Button / Primary")],
		);
		expect(result.matches).toHaveLength(1);
		const m = result.matches[0];
		expect(m?.nameScore).toBeCloseTo(1, 10);
		// neutral shape (both empty) -> 0.5 -> score 0.85
		expect(m?.score).toBeCloseTo(0.85, 10);
	});

	it("collapses a weak token overlap (< 0.3) to nameScore 0 -> no match", () => {
		// "Card" tokens [card] vs "Button / Primary / Large" tokens
		// [button, primary, large]: intersection 0 -> 0; unrelated.
		// Use a name that overlaps just barely below threshold:
		// "DataTableHeaderCell" [data,table,header,cell] vs "Cell" [cell]:
		// 2*1/(4+1) = 0.4 (>=0.3, kept) — instead use one with score < 0.3.
		// "AlphaBetaGammaDelta" vs "Delta": 2*1/(4+1)=0.4 still kept.
		// "AlphaBetaGammaDeltaEpsilonZeta" [6] vs "Zeta" [1]: 2*1/7=0.2857 < 0.3.
		const result = matchComponents(
			[code("AlphaBetaGammaDeltaEpsilonZeta")],
			[figma("Zeta")],
		);
		expect(result.matches).toEqual([]);
		expect(result.unmatchedCode).toHaveLength(1);
		expect(result.unmatchedFigma).toHaveLength(1);
		// candidate score is purely shape-driven (name collapsed to 0):
		// 0.7*0 + 0.3*0.5 = 0.15
		expect(result.unmatchedCode[0]?.candidates[0]?.score).toBeCloseTo(0.15, 10);
	});
});

describe("matchComponents — shapeScore behavior", () => {
	it("lowers score when variant dimensions disagree", () => {
		// Same name (1.0) but disjoint variant VALUES on shared key `variant`:
		// Jaccard of {primary} vs {ghost} = 0 -> shape 0 -> score 0.7.
		const result = matchComponents(
			[code("Button", { variant: ["primary"] })],
			[figma("Button", { variant: ["ghost"] })],
		);
		expect(result.matches).toHaveLength(1);
		const m = result.matches[0];
		expect(m?.nameScore).toBe(1);
		expect(m?.shapeScore).toBeCloseTo(0, 10);
		expect(m?.score).toBeCloseTo(0.7, 10);
	});

	it("partial value overlap yields a partial shape score", () => {
		// {primary,secondary,ghost} vs {primary,secondary}: Jaccard 2/3.
		const result = matchComponents(
			[code("Button", { variant: ["primary", "secondary", "ghost"] })],
			[figma("Button", { variant: ["primary", "secondary"] })],
		);
		const m = result.matches[0];
		expect(m?.shapeScore).toBeCloseTo(2 / 3, 10);
		expect(m?.score).toBeCloseTo(0.7 + 0.3 * (2 / 3), 10);
	});

	it("averages over the union of keys, penalizing keys present on only one side", () => {
		// figma keys: {size}; code keys: {variant}. Union {size, variant}.
		// Neither key matches on the other side -> both contribute 0 ->
		// shape average 0 -> score 0.7 (name still 1.0).
		const result = matchComponents(
			[code("Button", { variant: ["primary"] })],
			[figma("Button", { size: ["sm", "md"] })],
		);
		const m = result.matches[0];
		expect(m?.shapeScore).toBeCloseTo(0, 10);
		expect(m?.score).toBeCloseTo(0.7, 10);
	});

	it("matches variant keys case-insensitively (normalized key compare)", () => {
		// code key 'Variant' vs figma key 'variant' normalize-match; same values.
		const result = matchComponents(
			[code("Button", { Variant: ["primary"] })],
			[figma("Button", { variant: ["primary"] })],
		);
		const m = result.matches[0];
		expect(m?.shapeScore).toBeCloseTo(1, 10);
	});

	it("gives 0.25 shape when exactly one side declares variants", () => {
		// code has variants, figma has none -> one-empty -> 0.25.
		const result = matchComponents(
			[code("Button", { variant: ["primary"] })],
			[figma("Button", {})],
		);
		const m = result.matches[0];
		expect(m?.shapeScore).toBeCloseTo(0.25, 10);
		expect(m?.score).toBeCloseTo(0.7 + 0.3 * 0.25, 10);
	});
});

describe("matchComponents — threshold misses", () => {
	it("leaves both sides unmatched (with candidates) when best score < 0.6", () => {
		// "Button" code vs "Buttonish" figma: tokens — "Button"=[button],
		// "Buttonish"=[buttonish] (no boundary) -> intersection 0 -> name 0;
		// but to get a *candidate* (non-zero) we want a near-miss below 0.6.
		// Use token overlap that lands name in [0.3, 0.6): "IconButton"
		// [icon,button] vs "Button"[button] = 2*1/3 = 0.6667 -> too high.
		// "PrimaryGhostButton" [primary,ghost,button] vs "Button" [button] =
		// 2*1/(3+1) = 0.5; both shapes empty -> shape 0.5; score
		// 0.7*0.5 + 0.3*0.5 = 0.5 (< 0.6) -> unmatched both sides.
		const result = matchComponents(
			[code("PrimaryGhostButton")],
			[figma("Button")],
		);
		expect(result.matches).toEqual([]);
		expect(result.unmatchedCode).toHaveLength(1);
		expect(result.unmatchedFigma).toHaveLength(1);
		expect(result.unmatchedCode[0]?.candidates[0]?.figma.name).toBe("Button");
		expect(result.unmatchedCode[0]?.candidates[0]?.score).toBeCloseTo(0.5, 10);
		expect(result.unmatchedFigma[0]?.candidates[0]?.code.name).toBe(
			"PrimaryGhostButton",
		);
		expect(result.unmatchedFigma[0]?.candidates[0]?.score).toBeCloseTo(0.5, 10);
	});

	it("includes at most the top 3 candidates for an unmatched code component", () => {
		// One code with 4 weak figma candidates, all below 0.6.
		const result = matchComponents(
			[code("PrimaryGhostButton")],
			[
				figma("Button", {}, "1:a"),
				figma("Button", {}, "1:b"),
				figma("Button", {}, "1:c"),
				figma("Button", {}, "1:d"),
			],
		);
		expect(result.matches).toEqual([]);
		expect(result.unmatchedCode[0]?.candidates).toHaveLength(3);
	});
});

describe("matchComponents — ambiguity guard (zero silent wrong matches)", () => {
	it("does NOT pick when two strong candidates are within 0.1 of each other", () => {
		// code "Button" vs figma "Button" (score 0.85) and "Buttons" (tokens
		// [buttons] vs [button] -> 0 token match... not close). Instead make two
		// figma that BOTH score >= 0.6 within 0.1:
		//   figma A "Button" -> name 1.0, shape 0.5 -> 0.85
		//   figma B "Button" (same name) with disagreeing variant -> name 1.0,
		//     shape 0.25 (one-empty) ... we need both within 0.1 and >= 0.6.
		// Use A "Button" {} -> 0.85 and B "Button" {variant:[x]} (code empty) ->
		// shape one-empty 0.25 -> 0.7*1 + 0.3*0.25 = 0.775. |0.85-0.775|=0.075
		// < 0.1 and both >= 0.6 -> AMBIGUOUS, no match.
		const result = matchComponents(
			[code("Button")],
			[figma("Button", {}, "1:a"), figma("Button", { variant: ["x"] }, "1:b")],
		);
		expect(result.matches).toEqual([]);
		expect(result.unmatchedCode).toHaveLength(1);
		const cands = result.unmatchedCode[0]?.candidates ?? [];
		expect(cands.length).toBeGreaterThanOrEqual(2);
		// ranked: best first
		expect(cands[0]?.score).toBeCloseTo(0.85, 10);
		expect(cands[1]?.score).toBeCloseTo(0.775, 10);
		expect(cands[0]?.score).toBeGreaterThanOrEqual(cands[1]?.score ?? 0);
	});

	it("DOES pick when the best clearly beats the runner-up (gap > 0.1)", () => {
		// A "Button" {} -> 0.85; B "Btn" tokens [btn] vs [button] -> 0 -> name 0
		// -> score 0.15. Gap 0.7 -> unambiguous -> A matches.
		const result = matchComponents(
			[code("Button")],
			[figma("Button", {}, "1:a"), figma("Btn", {}, "1:b")],
		);
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]?.figma.nodeId).toBe("1:a");
		// B is left as unmatchedFigma with Button as a (low) candidate.
		expect(result.unmatchedFigma).toHaveLength(1);
		expect(result.unmatchedFigma[0]?.figma.name).toBe("Btn");
	});

	it("ranks both ambiguous candidates and lists them on the unmatched code", () => {
		const result = matchComponents(
			[code("Button")],
			[figma("Button", {}, "1:a"), figma("Button", { variant: ["x"] }, "1:b")],
		);
		const cands = result.unmatchedCode[0]?.candidates ?? [];
		expect(cands.map((c) => c.figma.nodeId)).toEqual(["1:a", "1:b"]);
	});
});

describe("matchComponents — greedy 1:1 assignment", () => {
	it("assigns the globally-best pair first, then the next best", () => {
		// code: Alpha, Beta. figma: Alpha, Beta. Each pairs exactly.
		const result = matchComponents(
			[code("Alpha"), code("Beta")],
			[figma("Alpha"), figma("Beta")],
		);
		expect(result.matches).toHaveLength(2);
		expect(result.matches.map((m) => m.code.name)).toEqual(["Alpha", "Beta"]);
		expect(result.unmatchedCode).toEqual([]);
		expect(result.unmatchedFigma).toEqual([]);
	});

	it("does not reuse a figma already claimed by a stronger code match", () => {
		// Two code want the same single figma; the stronger pair wins, the other
		// code is unmatched. code "Button" (exact) and "ButtonGroup" both eye
		// figma "Button". "Button"x"Button" = 0.85; "ButtonGroup"[button,group]
		// x "Button"[button] = name 2/3 -> 0.667 -> score 0.7*0.667+0.3*0.5 = 0.617.
		// Button wins the single Button figma; ButtonGroup left unmatched.
		const result = matchComponents(
			[code("Button"), code("ButtonGroup")],
			[figma("Button")],
		);
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]?.code.name).toBe("Button");
		expect(result.unmatchedCode).toHaveLength(1);
		expect(result.unmatchedCode[0]?.code.name).toBe("ButtonGroup");
		// the consumed figma should NOT appear in unmatchedFigma
		expect(result.unmatchedFigma).toEqual([]);
	});

	it("sorts result arrays by name ascending", () => {
		const result = matchComponents(
			[code("Zeta"), code("Alpha")],
			[figma("Zeta"), figma("Alpha")],
		);
		expect(result.matches.map((m) => m.code.name)).toEqual(["Alpha", "Zeta"]);
	});

	it("sorts unmatched buckets by name ascending", () => {
		const result = matchComponents(
			[code("Zed"), code("Abe")],
			[figma("Yan"), figma("Bob")],
		);
		// none match (all unrelated tokens) -> all unmatched, name-sorted.
		expect(result.unmatchedCode.map((u) => u.code.name)).toEqual([
			"Abe",
			"Zed",
		]);
		expect(result.unmatchedFigma.map((u) => u.figma.name)).toEqual([
			"Bob",
			"Yan",
		]);
	});
});

describe("matchComponents — determinism", () => {
	it("produces deep-equal results for the same input run twice", () => {
		const codes = [
			code("Button", { variant: ["primary"] }),
			code("Card"),
			code("PrimaryGhostButton"),
		];
		const figmas = [
			figma("Button", { variant: ["primary"] }),
			figma("Card / Default"),
			figma("Buttonish"),
		];
		const a = matchComponents(codes, figmas);
		const b = matchComponents(codes, figmas);
		expect(a).toEqual(b);
	});

	it("is insensitive to input order (same logical result)", () => {
		const a = matchComponents(
			[code("Alpha"), code("Beta")],
			[figma("Beta"), figma("Alpha")],
		);
		const b = matchComponents(
			[code("Beta"), code("Alpha")],
			[figma("Alpha"), figma("Beta")],
		);
		expect(a.matches.map((m) => m.code.name)).toEqual(
			b.matches.map((m) => m.code.name),
		);
		expect(a).toEqual(b);
	});

	it("breaks score ties by name ascending in assignment", () => {
		// Two code names tie on score against one figma each at equal scores;
		// deterministic resolution picks by name asc. Alpha & Gamma both match
		// their own figma at 0.85; order in matches is name-sorted.
		const result = matchComponents(
			[code("Gamma"), code("Alpha")],
			[figma("Alpha"), figma("Gamma")],
		);
		expect(result.matches.map((m) => m.code.name)).toEqual(["Alpha", "Gamma"]);
	});
});

// Real-user finding (Material 3 library): Figma names variant values in Title
// case (`Style=Filled`) and often names the axis differently from the code
// prop (`Style` / `variant`, `Type` / `kind`). The same value set on both sides
// is the same axis; a Figma `State` axis (Enabled / Disabled / Hover) is
// interaction state that code expresses with booleans or CSS.
describe("matchComponents — Figma naming conventions", () => {
	it("compares variant values case-insensitively", () => {
		const result = matchComponents(
			[code("Fab", { size: ["small", "medium", "large"] })],
			[figma("FAB", { Size: ["Small", "Medium", "Large"] })],
		);
		expect(result.matches[0]?.shapeScore).toBeCloseTo(1, 10);
	});

	it("pairs differently named axes whose values agree", () => {
		const result = matchComponents(
			[code("Chip", { kind: ["assist", "filter", "input", "suggestion"] })],
			[
				figma("Chip", {
					Type: ["Assist", "Filter", "Input", "Suggestion"],
					Selected: ["False", "True"],
				}),
			],
		);
		expect(result.matches[0]?.shapeScore).toBeCloseTo(1, 10);
		expect(result.matches[0]?.variantGaps).toEqual([]);
	});

	it("ignores a Figma State axis code does not declare", () => {
		const result = matchComponents(
			[code("Button", { variant: ["filled", "tonal", "outlined"] })],
			[
				figma("Button", {
					Style: ["Filled", "Tonal", "Outlined"],
					State: ["Enabled", "Disabled"],
				}),
			],
		);
		expect(result.matches[0]?.shapeScore).toBeCloseTo(1, 10);
	});

	it("does not pair axes whose values barely overlap", () => {
		const result = matchComponents(
			[code("Button", { variant: ["primary"] })],
			[figma("Button", { size: ["sm", "md"] })],
		);
		expect(result.matches[0]?.shapeScore).toBeCloseTo(0, 10);
	});

	it("names each axis that still differs", () => {
		const result = matchComponents(
			[code("ListItem", { lines: ["one", "two", "three"] })],
			[figma("List item", { Lines: ["1", "2", "3"] })],
		);
		expect(result.matches[0]?.variantGaps).toEqual([
			"lines: code one|two|three ≠ Figma Lines 1|2|3",
		]);
	});

	it("names an axis only one side has, and values one side lacks", () => {
		const result = matchComponents(
			[
				code("Fab", {
					size: ["small", "medium", "large"],
					color: ["primary", "surface"],
				}),
			],
			[
				figma("FAB", {
					Size: ["Small", "Medium", "Large", "Extended"],
					Elevation: ["Raised", "Lowered"],
				}),
			],
		);
		expect(result.matches[0]?.variantGaps).toEqual([
			"color: code only (primary|surface)",
			"size: Figma also has Extended",
			"Elevation: Figma only (Raised|Lowered)",
		]);
	});
});
