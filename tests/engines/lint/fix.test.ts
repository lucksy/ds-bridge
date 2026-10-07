// T2.4 — fix planner for the lint engine (PURE: no fs/network/process).
//
// RULES (the contract this spec enforces):
//   1. ONLY kind "exact" findings produce edits. "near" and "off-system" NEVER
//      produce an edit — asserted explicitly below.
//   2. Replacement is chosen by the literal's context:
//        - css-declaration / styled-template:
//            -> var(--<token-name with dots replaced by hyphens>)
//            e.g. color.brand.primary -> var(--color-brand-primary)
//        - style-object STRING value (raw includes its quotes):
//            -> "var(--color-brand-primary)" (the quotes are preserved)
//        - style-object BARE NUMBER (dimension, raw has no quotes):
//            -> "var(--space-md)" (a quoted string; custom properties are valid
//               JSX inline-style values)
//   3. Composite-token exact matches (e.g. #11182733 -> shadow.card) get NO edit:
//      a composite has no single var() for its inner color (unfixable in v1).
//   4. Edits are deterministic: sorted by file (asc), then within a file by
//      line/col DESCENDING (so applying from the end never shifts earlier cols).
//   5. applyEdits(content, edits) applies a single file's edits via line/col/length
//      and returns new content. Re-running extract+match on the fixed button.css
//      yields ZERO exact findings on the changed lines (idempotency seed for T2.5).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type ExtractedLiteral,
	extractLiterals,
} from "../../../src/engines/lint/extract.js";
import { applyEdits, planFixes } from "../../../src/engines/lint/fix.js";
import {
	buildCompositeColorLookup,
	type LiteralMatch,
	matchLiteral,
} from "../../../src/engines/lint/match.js";
import { parseW3c } from "../../../src/engines/tokens/parse-w3c.js";
import { buildTokenIndex } from "../../../src/engines/tokens/token-index.js";
import type { Token } from "../../../src/engines/tokens/types.js";

const projectRoot = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"sample-project",
);

function loadFixtureTokens(): Token[] {
	const text = readFileSync(join(projectRoot, "tokens.json"), "utf8");
	const outcome = parseW3c(JSON.parse(text));
	if (outcome.kind !== "ok") {
		throw new Error("fixture tokens.json failed to parse");
	}
	return outcome.map.tokens;
}

const colorToken = (name: string, value: string): Token => ({
	name,
	type: "color",
	value,
});

const dimToken = (name: string, value: string): Token => ({
	name,
	type: "dimension",
	value,
});

const compositeToken = (name: string, color: string): Token => ({
	name,
	type: "shadow",
	value: { color, offsetX: "0px", offsetY: "2px", blur: "8px" },
});

function literal(
	over: Partial<ExtractedLiteral> & Pick<ExtractedLiteral, "raw">,
): ExtractedLiteral {
	return {
		file: "src/x.css",
		line: 1,
		col: 1,
		property: "color",
		valueKind: "color",
		context: "css-declaration",
		...over,
	};
}

type Finding = { literal: ExtractedLiteral; match: LiteralMatch };

function exactFinding(lit: ExtractedLiteral, token: Token): Finding {
	return { literal: lit, match: { kind: "exact", token } };
}

describe("planFixes — rule 1: only exact findings produce edits", () => {
	it("a near finding produces no edit", () => {
		const lit = literal({ raw: "#3a81f5", property: "background" });
		const candidates = [
			{ token: colorToken("color.brand.primary", "#3b82f6"), distance: 1.2 },
		];
		const edits = planFixes([
			{ literal: lit, match: { kind: "near", candidates } },
		]);
		expect(edits).toEqual([]);
	});

	it("an off-system finding produces no edit", () => {
		const lit = literal({ raw: "#ff00aa" });
		const edits = planFixes([{ literal: lit, match: { kind: "off-system" } }]);
		expect(edits).toEqual([]);
	});

	it("mixed findings emit edits only for the exact ones", () => {
		const exactLit = literal({ raw: "#3b82f6", line: 2, col: 9 });
		const nearLit = literal({ raw: "#3a81f5", line: 3, col: 14 });
		const offLit = literal({ raw: "#ff00aa", line: 4, col: 9 });
		const edits = planFixes([
			exactFinding(exactLit, colorToken("color.brand.primary", "#3b82f6")),
			{
				literal: nearLit,
				match: {
					kind: "near",
					candidates: [
						{
							token: colorToken("color.brand.primary", "#3b82f6"),
							distance: 1.2,
						},
					],
				},
			},
			{ literal: offLit, match: { kind: "off-system" } },
		]);
		expect(edits).toHaveLength(1);
		expect(edits[0]?.line).toBe(2);
	});
});

describe("planFixes — rule 2: replacement by context", () => {
	it("css-declaration -> var(--name-with-hyphens)", () => {
		const lit = literal({
			raw: "#3b82f6",
			line: 2,
			col: 9,
			context: "css-declaration",
		});
		const [edit] = planFixes([
			exactFinding(lit, colorToken("color.brand.primary", "#3b82f6")),
		]);
		expect(edit).toEqual({
			file: "src/x.css",
			line: 2,
			col: 9,
			length: "#3b82f6".length,
			replacement: "var(--color-brand-primary)",
		});
	});

	it("styled-template -> var(--name-with-hyphens) (same as css-declaration)", () => {
		const lit = literal({
			raw: "#3b82f6",
			file: "src/Hero.tsx",
			context: "styled-template",
		});
		const [edit] = planFixes([
			exactFinding(lit, colorToken("color.brand.primary", "#3b82f6")),
		]);
		expect(edit?.replacement).toBe("var(--color-brand-primary)");
		expect(edit?.length).toBe("#3b82f6".length);
	});

	it("style-object string value -> quotes preserved around var()", () => {
		const lit = literal({
			raw: '"#3b82f6"',
			file: "src/Banner.tsx",
			line: 9,
			col: 24,
			context: "style-object",
		});
		const [edit] = planFixes([
			exactFinding(lit, colorToken("color.brand.primary", "#3b82f6")),
		]);
		expect(edit).toEqual({
			file: "src/Banner.tsx",
			line: 9,
			col: 24,
			length: '"#3b82f6"'.length,
			replacement: '"var(--color-brand-primary)"',
		});
	});

	it("style-object string value keeps single quotes when authored that way", () => {
		const lit = literal({
			raw: "'#3b82f6'",
			file: "src/Banner.tsx",
			context: "style-object",
		});
		const [edit] = planFixes([
			exactFinding(lit, colorToken("color.brand.primary", "#3b82f6")),
		]);
		expect(edit?.replacement).toBe("'var(--color-brand-primary)'");
		expect(edit?.length).toBe("'#3b82f6'".length);
	});

	it("style-object bare number (dimension) -> a quoted var() string", () => {
		const lit = literal({
			raw: "16",
			file: "src/Banner.tsx",
			property: "padding",
			valueKind: "dimension",
			context: "style-object",
		});
		const [edit] = planFixes([exactFinding(lit, dimToken("space.md", "16px"))]);
		expect(edit?.replacement).toBe('"var(--space-md)"');
		expect(edit?.length).toBe("16".length);
	});

	it("style-string (a value inside a JSX string) -> bare var(), the string's quotes stay", () => {
		// style={{ padding: "8px 16px" }} — replacing 16px must not add quotes.
		const lit = literal({
			raw: "16px",
			file: "src/Banner.tsx",
			property: "padding",
			valueKind: "dimension",
			context: "style-string",
		});
		const [edit] = planFixes([exactFinding(lit, dimToken("space.md", "16px"))]);
		expect(edit?.replacement).toBe("var(--space-md)");
	});

	it("css-declaration dimension -> bare var() (no quotes)", () => {
		const lit = literal({
			raw: "16px",
			property: "padding",
			valueKind: "dimension",
			context: "css-declaration",
		});
		const [edit] = planFixes([exactFinding(lit, dimToken("space.md", "16px"))]);
		expect(edit?.replacement).toBe("var(--space-md)");
		expect(edit?.length).toBe("16px".length);
	});
});

describe("planFixes — rule 3: composite exact matches are unfixable in v1", () => {
	it("a #color matched to a composite shadow token produces NO edit", () => {
		const lit = literal({
			raw: "#11182733",
			file: "src/card.module.css",
			line: 6,
			col: 24,
			property: "box-shadow",
		});
		const edits = planFixes([
			exactFinding(lit, compositeToken("shadow.card", "#11182733")),
		]);
		expect(edits).toEqual([]);
	});

	it("a composite typography token also produces no edit", () => {
		const lit = literal({ raw: "#3b82f6" });
		const composite: Token = {
			name: "type.body",
			type: "typography",
			value: { color: "#3b82f6" },
		};
		expect(planFixes([exactFinding(lit, composite)])).toEqual([]);
	});
});

describe("planFixes — rule 4: deterministic ordering", () => {
	it("sorts by file asc, then line/col DESCENDING within a file", () => {
		const mk = (file: string, line: number, col: number): Finding =>
			exactFinding(
				literal({ raw: "#3b82f6", file, line, col }),
				colorToken("color.brand.primary", "#3b82f6"),
			);
		const edits = planFixes([
			mk("b.css", 1, 1),
			mk("a.css", 2, 5),
			mk("a.css", 2, 1),
			mk("a.css", 1, 9),
		]);
		expect(edits.map((e) => [e.file, e.line, e.col])).toEqual([
			["a.css", 2, 5],
			["a.css", 2, 1],
			["a.css", 1, 9],
			["b.css", 1, 1],
		]);
	});

	it("is stable across input permutations", () => {
		const a = exactFinding(
			literal({ raw: "#3b82f6", file: "a.css", line: 5, col: 3 }),
			colorToken("color.brand.primary", "#3b82f6"),
		);
		const b = exactFinding(
			literal({ raw: "#3b82f6", file: "a.css", line: 5, col: 9 }),
			colorToken("color.brand.primary", "#3b82f6"),
		);
		const order1 = planFixes([a, b]).map((e) => e.col);
		const order2 = planFixes([b, a]).map((e) => e.col);
		expect(order1).toEqual(order2);
		expect(order1).toEqual([9, 3]); // higher col first (descending)
	});
});

describe("applyEdits — rule 5: applies via line/col/length", () => {
	it("replaces a single literal in place", () => {
		const content = ".button {\n\tcolor: #3b82f6;\n}\n";
		const edit = {
			file: "x.css",
			line: 2,
			col: 9,
			length: "#3b82f6".length,
			replacement: "var(--color-brand-primary)",
		};
		expect(applyEdits(content, [edit])).toBe(
			".button {\n\tcolor: var(--color-brand-primary);\n}\n",
		);
	});

	it("applies multiple edits on the same line correctly (any input order)", () => {
		const content = "a: #3b82f6 #3b82f6;\n";
		// two edits on line 1 at col 4 and col 12 (both length 7)
		const edits = [
			{ file: "x.css", line: 1, col: 4, length: 7, replacement: "var(--a)" },
			{ file: "x.css", line: 1, col: 12, length: 7, replacement: "var(--b)" },
		];
		// supplied in ascending order — applyEdits must still get it right
		expect(applyEdits(content, edits)).toBe("a: var(--a) var(--b);\n");
	});

	it("preserves CRLF-free unchanged lines exactly", () => {
		const content = "x: 1;\ny: #ffffff;\nz: 2;\n";
		const edit = {
			file: "x.css",
			line: 2,
			col: 4,
			length: 7,
			replacement: "var(--w)",
		};
		expect(applyEdits(content, [edit])).toBe("x: 1;\ny: var(--w);\nz: 2;\n");
	});
});

describe("plan + apply — idempotency seed (T2.5) on real button.css", () => {
	const tokens = loadFixtureTokens();
	const index = buildTokenIndex(tokens);
	const compositeColors = buildCompositeColorLookup(tokens);

	function findingsFor(path: string, content: string): Finding[] {
		return extractLiterals({ path, content }).map((lit) => ({
			literal: lit,
			match: matchLiteral(lit, index, { compositeColors }),
		}));
	}

	it("fixing button.css removes every exact finding on the changed lines", () => {
		const path = "src/button.css";
		const original = readFileSync(join(projectRoot, path), "utf8");

		const before = findingsFor(path, original);
		const exactBefore = before.filter((f) => f.match.kind === "exact");
		// The fixture has one fixable exact in button.css (#3b82f6 -> color.brand.primary).
		expect(exactBefore.length).toBeGreaterThan(0);
		const changedLines = new Set(exactBefore.map((f) => f.literal.line));

		const edits = planFixes(before);
		expect(edits.length).toBe(exactBefore.length);

		const fixed = applyEdits(original, edits);

		const after = findingsFor(path, fixed);
		const exactAfterOnChanged = after.filter(
			(f) => f.match.kind === "exact" && changedLines.has(f.literal.line),
		);
		expect(exactAfterOnChanged).toEqual([]);

		// Re-planning over the fixed content is a no-op (true idempotency).
		expect(planFixes(after)).toEqual([]);

		// The replacement var() literally lands in the file.
		expect(fixed).toContain("var(--color-brand-primary)");
	});
});
