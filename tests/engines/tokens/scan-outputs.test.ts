// T3.3 — platform-output scanner: read built CSS custom props / TS theme objects
// back into a value map so drift (T3.4) can compare them against the token source.
import { describe, expect, it } from "vitest";
import { scanOutputs } from "../../../src/engines/tokens/scan-outputs.js";

describe("scanOutputs — css custom properties", () => {
	it("extracts --prop: value pairs from :root", () => {
		const css = [
			":root {",
			"\t--color-brand-primary: #3b82f6;",
			"\t--space-md: 16px;",
			"}",
		].join("\n");
		const result = scanOutputs({ path: "dist/tokens.css", content: css });

		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values).toEqual([
			{ name: "color-brand-primary", raw: "#3b82f6" },
			{ name: "space-md", raw: "16px" },
		]);
	});

	it("extracts custom props from any rule, skipping normal declarations", () => {
		const css = [
			".theme-dark {",
			"\t--color-bg: #111827;",
			"\tcolor: red;",
			"}",
		].join("\n");
		const result = scanOutputs({ path: "out.css", content: css });

		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values).toEqual([
			{ name: "color-bg", raw: "#111827", scope: ".theme-dark" },
		]);
	});

	it("records the enclosing selector as scope, except at root level", () => {
		const css = [
			":root { --bg: #ffffff; }",
			"html, :host { --fg: #000000; }",
			".dark { --bg: #0a0a0a; }",
			"@media (prefers-color-scheme: dark) {",
			"	:root { --fg: #fafafa; }",
			"}",
			"@theme inline { --color-bg: var(--bg); }",
			"--top-level: 1px;",
		].join("\n");
		const result = scanOutputs({ path: "t.css", content: css });
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values).toEqual([
			{ name: "bg", raw: "#ffffff" },
			{ name: "bg", raw: "#0a0a0a", scope: ".dark" },
			{ name: "color-bg", raw: "var(--bg)", scope: "@theme inline" },
			{ name: "fg", raw: "#000000" },
			{
				name: "fg",
				raw: "#fafafa",
				scope: "@media (prefers-color-scheme: dark) :root",
			},
			{ name: "top-level", raw: "1px" },
		]);
	});

	it("skips comments and handles !important / extra whitespace", () => {
		const css = [
			":root {",
			"\t/* --color-fake: #000000; */",
			"\t--space-sm:   8px !important ;",
			"}",
		].join("\n");
		const result = scanOutputs({ path: "a.css", content: css });

		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values).toEqual([{ name: "space-sm", raw: "8px" }]);
	});

	it("returns empty values for css without custom props", () => {
		const result = scanOutputs({
			path: "p.css",
			content: ".a { color: red; }",
		});
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values).toEqual([]);
	});
});

describe("scanOutputs — ts theme objects", () => {
	it("flattens a nested exported theme object to dotted names", () => {
		const ts = [
			"export const tokens = {",
			"\tcolor: {",
			"\t\tbrand: {",
			'\t\t\tprimary: "#3b82f6",',
			"\t\t},",
			"\t},",
			"\tspace: {",
			'\t\tmd: "16px",',
			"\t\tscale: 1.2,",
			"\t},",
			"} as const;",
		].join("\n");
		const result = scanOutputs({ path: "src/theme/tokens.ts", content: ts });

		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values).toEqual([
			{ name: "color.brand.primary", raw: "#3b82f6" },
			{ name: "space.md", raw: "16px" },
			{ name: "space.scale", raw: "1.2" },
		]);
	});

	it("handles single quotes, trailing commas, and quoted keys", () => {
		const ts = [
			"export const theme = {",
			"\t'font-weight': { bold: 700, },",
			"\t\"colors\": { white: '#ffffff' },",
			"};",
		].join("\n");
		const result = scanOutputs({ path: "theme.ts", content: ts });

		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values).toEqual([
			{ name: "colors.white", raw: "#ffffff" },
			{ name: "font-weight.bold", raw: "700" },
		]);
	});

	it("skips non-literal leaf values and records a warning", () => {
		const ts = [
			"export const theme = {",
			'\ta: "#fff",',
			"\tb: someFunction(),",
			"};",
		].join("\n");
		const result = scanOutputs({ path: "t.ts", content: ts });

		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values).toEqual([{ name: "a", raw: "#fff" }]);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("returns empty values when no theme-shaped export exists", () => {
		const result = scanOutputs({
			path: "util.ts",
			content: "export function add(a: number, b: number) { return a + b; }",
		});
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values).toEqual([]);
	});
});

describe("scanOutputs — dispatch & errors", () => {
	it("returns unsupported-file for unknown extensions", () => {
		const result = scanOutputs({ path: "readme.md", content: "# hi" });
		expect(result.kind).toBe("unsupported-file");
	});

	it("values are sorted by name for stable diffs", () => {
		const css = ":root { --z: 1px; --a: 2px; }";
		const result = scanOutputs({ path: "x.css", content: css });
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.values.map((v) => v.name)).toEqual(["a", "z"]);
	});
});
