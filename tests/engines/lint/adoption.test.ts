// A1 — adoption tally engine (pure, no I/O).
// countTokenRefs counts var(--name) occurrences AFTER blanking /* */ comments,
// SCSS // line comments, and string contents (so commented-out or string-embedded
// var() are never miscounted as on-system references). tallyAdoption groups
// per-file {refs, literals} into totals + a worst-pct-first byDirectory list.
import { describe, expect, it } from "vitest";
import {
	countInlineStyleTokenRefs,
	countTokenRefs,
	tallyAdoption,
} from "../../../src/engines/lint/adoption.js";

describe("countTokenRefs", () => {
	it("counts plain var(--name) references", () => {
		const css = ".x {\n\tcolor: var(--color-brand-primary);\n}\n";
		expect(countTokenRefs(css)).toBe(1);
	});

	it("counts multiple references on a single line", () => {
		const css =
			".x { border: var(--w) solid var(--color-line); color: var(--c); }\n";
		expect(countTokenRefs(css)).toBe(3);
	});

	it("does NOT count var(--x) inside a /* */ block comment", () => {
		const css = ".x {\n\t/* color: var(--color-brand-primary); */\n}\n";
		expect(countTokenRefs(css)).toBe(0);
	});

	it("does NOT count var(--x) inside a SCSS // line comment", () => {
		const css = ".x {\n\t// color: var(--color-brand-primary);\n}\n";
		expect(countTokenRefs(css)).toBe(0);
	});

	it("does NOT count var(--x) embedded in a string literal", () => {
		const css = '.x {\n\tcontent: "var(--color-brand-primary)";\n}\n';
		expect(countTokenRefs(css)).toBe(0);
	});

	it("does NOT count var() without a -- custom property name", () => {
		const css = ".x {\n\twidth: var(notAToken);\n}\n";
		expect(countTokenRefs(css)).toBe(0);
	});

	it("does NOT mistake a :// URL for a SCSS line comment", () => {
		const css =
			'.x {\n\tbackground: url("http://e.com/a.png");\n\tcolor: var(--c);\n}\n';
		expect(countTokenRefs(css)).toBe(1);
	});

	it("counts a real ref on a line that also has a trailing // comment", () => {
		const css = ".x {\n\tcolor: var(--c); // var(--ignored)\n}\n";
		expect(countTokenRefs(css)).toBe(1);
	});

	it("is zero for empty/clean input", () => {
		expect(countTokenRefs("")).toBe(0);
		expect(countTokenRefs(".x { color: #fff; }")).toBe(0);
	});
});

describe("tallyAdoption", () => {
	it("sums totals across files", () => {
		const result = tallyAdoption([
			{ path: "src/a.css", refs: 3, literals: 1 },
			{ path: "src/b.css", refs: 2, literals: 4 },
		]);
		expect(result.totals).toEqual({ refs: 5, literals: 5 });
	});

	it("groups by directory and orders worst pct first", () => {
		// dir x: pct = 2/(2+8) = 20%; dir y: pct = 8/(8+2) = 80%.
		const result = tallyAdoption([
			{ path: "x/a.css", refs: 2, literals: 8 },
			{ path: "y/a.css", refs: 8, literals: 2 },
		]);
		expect(result.byDirectory.map((d) => d.dir)).toEqual(["x", "y"]);
		expect(result.byDirectory[0]).toEqual({ dir: "x", refs: 2, literals: 8 });
		expect(result.byDirectory[1]).toEqual({ dir: "y", refs: 8, literals: 2 });
	});

	it("aggregates files that share a directory", () => {
		const result = tallyAdoption([
			{ path: "src/ui/a.css", refs: 1, literals: 1 },
			{ path: "src/ui/b.css", refs: 3, literals: 1 },
		]);
		expect(result.byDirectory).toEqual([
			{ dir: "src/ui", refs: 4, literals: 2 },
		]);
	});

	it("breaks pct ties by directory path ascending", () => {
		// All 50%: order must be b, m, z by path.
		const result = tallyAdoption([
			{ path: "z/a.css", refs: 1, literals: 1 },
			{ path: "b/a.css", refs: 1, literals: 1 },
			{ path: "m/a.css", refs: 1, literals: 1 },
		]);
		expect(result.byDirectory.map((d) => d.dir)).toEqual(["b", "m", "z"]);
	});

	it("excludes directories with refs+literals === 0", () => {
		const result = tallyAdoption([
			{ path: "empty/a.css", refs: 0, literals: 0 },
			{ path: "live/a.css", refs: 1, literals: 1 },
		]);
		expect(result.byDirectory.map((d) => d.dir)).toEqual(["live"]);
	});

	it("caps byDirectory at 20 entries (worst-first survive)", () => {
		// 25 directories, each a single file; worst pct ascending by index.
		const files = Array.from({ length: 25 }, (_v, i) => ({
			path: `d${String(i).padStart(2, "0")}/a.css`,
			// refs grows with i → pct grows with i → worst (lowest) are d00..d19.
			refs: i,
			literals: 25 - i,
		}));
		const result = tallyAdoption(files);
		expect(result.byDirectory.length).toBe(20);
		// The worst (lowest pct = lowest refs) directories survive.
		expect(result.byDirectory[0]?.dir).toBe("d00");
		expect(result.byDirectory[19]?.dir).toBe("d19");
		expect(result.byDirectory.some((d) => d.dir === "d20")).toBe(false);
	});

	it("is deterministic for the same input", () => {
		const files = [
			{ path: "a/x.css", refs: 5, literals: 5 },
			{ path: "b/y.css", refs: 1, literals: 9 },
		];
		expect(tallyAdoption(files)).toEqual(tallyAdoption(files));
	});
});

describe("countInlineStyleTokenRefs (.tsx/.jsx)", () => {
	it("counts var() refs inside style objects and styled templates only", () => {
		const tsx = [
			'const A = () => <div style={{ color: "var(--fg)", padding: "var(--space-2) var(--space-4)" }} />;',
			"const B = styled.div`",
			"\tbackground: var(--bg);",
			"`;",
			'const note = "var(--not-a-style)";',
			'const C = () => <div className="bg-[var(--x)]" />;',
		].join("\n");
		expect(countInlineStyleTokenRefs(tsx)).toBe(4);
	});

	it("is 0 without inline styles", () => {
		expect(countInlineStyleTokenRefs("export const X = () => <b />;\n")).toBe(
			0,
		);
	});
});
