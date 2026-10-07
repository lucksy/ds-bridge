// Multi-file token sources (real-user finding, Material 3 testbed): a DTCG /
// Style Dictionary token set split across several files — primitives in one,
// semantic colour roles per mode in `*.light.*` / `*.dark.*` — must load as ONE
// source with cross-file aliases resolved and one document per mode.
// Testing level 2 (integration): real node:fs against tests/fixtures/m3-project.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectFormat } from "../../src/engines/tokens/detect.js";
import { parseW3c } from "../../src/engines/tokens/parse-w3c.js";
import {
	findTokenSource,
	modeOfTokenFile,
	readTokenDocument,
} from "../../src/io/token-set.js";

const m3 = join(import.meta.dirname, "..", "fixtures", "m3-project");
const tokensDir = join(m3, "tokens");

function ok<T extends { kind: string }>(
	outcome: T,
): Extract<T, { kind: "ok" }> {
	if (outcome.kind !== "ok") throw new Error(JSON.stringify(outcome));
	return outcome as Extract<T, { kind: "ok" }>;
}

function tokenValue(doc: unknown, name: string): unknown {
	const outcome = parseW3c(doc);
	if (outcome.kind !== "ok") throw new Error(JSON.stringify(outcome.errors));
	return outcome.map.tokens.find((t) => t.name === name)?.value;
}

describe("modeOfTokenFile", () => {
	it("reads light / dark from a file name segment", () => {
		expect(modeOfTokenFile("md.sys.color.light.tokens.json")).toBe("light");
		expect(modeOfTokenFile("colors-dark.json")).toBe("dark");
		expect(modeOfTokenFile("theme_Dark.tokens.json")).toBe("dark");
	});

	it("keeps Material's contrast variants as their own mode", () => {
		expect(
			modeOfTokenFile("md.sys.color.light-high-contrast.tokens.json"),
		).toBe("light-high-contrast");
		expect(modeOfTokenFile("dark-medium-contrast.json")).toBe(
			"dark-medium-contrast",
		);
	});

	it("reads the mode from a folder segment", () => {
		expect(modeOfTokenFile("dark/color.json")).toBe("dark");
	});

	it("is undefined for a file that names no mode", () => {
		expect(modeOfTokenFile("md.ref.tokens.json")).toBeUndefined();
		expect(modeOfTokenFile("highlight.tokens.json")).toBeUndefined();
		expect(modeOfTokenFile("darkness.json")).toBeUndefined();
	});
});

describe("findTokenSource", () => {
	it("returns the token directory when it holds several token files", () => {
		expect(findTokenSource(m3)).toBe(tokensDir);
	});

	it("returns the file when a directory holds a single token file", () => {
		const projectA = join(
			import.meta.dirname,
			"..",
			"fixtures",
			"discovery",
			"project-a",
		);
		expect(findTokenSource(projectA)).toBe(
			join(projectA, "tokens", "design-tokens.json"),
		);
	});

	it("is undefined when nothing token-shaped exists", () => {
		const empty = join(
			import.meta.dirname,
			"..",
			"fixtures",
			"discovery",
			"empty-project",
		);
		expect(findTokenSource(empty)).toBeUndefined();
	});
});

describe("readTokenDocument — a single file", () => {
	it("returns the parsed JSON and no modes", () => {
		const read = ok(readTokenDocument(join(tokensDir, "md.ref.tokens.json")));
		expect(detectFormat(read.doc)).toBe("w3c");
		expect(read.modeDocs).toBeUndefined();
		expect(read.files).toEqual([join(tokensDir, "md.ref.tokens.json")]);
	});

	it("is a typed error for a missing path", () => {
		expect(readTokenDocument(join(m3, "nope.json")).kind).toBe("error");
	});
});

describe("readTokenDocument — a token directory", () => {
	it("merges every token file so cross-file aliases resolve", () => {
		const read = ok(readTokenDocument(tokensDir));
		expect(tokenValue(read.doc, "md.sys.color.primary")).toBe("#65558F");
		expect(tokenValue(read.doc, "md.sys.spacing.4")).toBe("16px");
		expect(tokenValue(read.doc, "md.ref.palette.primary80")).toBe("#CFBDFE");
	});

	it("uses the light mode as the default document", () => {
		const read = ok(readTokenDocument(tokensDir));
		expect(tokenValue(read.doc, "md.sys.color.on-surface")).toBe("#1D1B20");
	});

	it("returns one document per mode, default (light) first", () => {
		const read = ok(readTokenDocument(tokensDir));
		expect(read.modeDocs?.map((m) => m.mode)).toEqual(["light", "dark"]);
		const dark = read.modeDocs?.[1]?.doc;
		expect(tokenValue(dark, "md.sys.color.primary")).toBe("#CFBDFE");
		// Shared files are part of every mode.
		expect(tokenValue(dark, "md.sys.shape.corner.medium")).toBe("12px");
	});

	it("lists the files it read, sorted", () => {
		const read = ok(readTokenDocument(tokensDir));
		expect(read.files.map((f) => f.slice(tokensDir.length + 1))).toEqual([
			"md.ref.tokens.json",
			"md.sys.color.dark.tokens.json",
			"md.sys.color.light.tokens.json",
			"md.sys.tokens.json",
		]);
	});

	it("is a typed error for a directory with no token files", () => {
		const read = readTokenDocument(join(m3, "src", "screens"));
		expect(read.kind).toBe("error");
	});
});

// GitHub Primer (real-user finding, Primer testbed): the source is JSON5, nested
// by layer (tokens/base/color/{light,dark}/…, tokens/functional/…), with theme
// variants as `light.high-contrast` / `dark.dimmed` files that overlay their base
// mode, and dark values of functional tokens in `$extensions["org.primer.overrides"]`.
describe("readTokenDocument — a Primer-style JSON5 set", () => {
	const primerTokens = join(
		import.meta.dirname,
		"..",
		"fixtures",
		"primer-project",
		"tokens",
	);

	it("is discovered as the tokens/ folder, not its first nested sub-folder", () => {
		expect(findTokenSource(join(primerTokens, ".."))).toBe(primerTokens);
	});

	it("names theme variants as their own modes", () => {
		expect(modeOfTokenFile("base/color/light/light.high-contrast.json5")).toBe(
			"light-high-contrast",
		);
		expect(modeOfTokenFile("base/color/dark/dark.dimmed.json5")).toBe(
			"dark-dimmed",
		);
		expect(modeOfTokenFile("base/color/light/light.json5")).toBe("light");
	});

	it("reads JSON5, resolves cross-file aliases and DTCG 2025 values", () => {
		const outcome = ok(readTokenDocument(primerTokens));
		expect(tokenValue(outcome.doc, "bgColor.default")).toBe("#ffffff");
		expect(tokenValue(outcome.doc, "base.size.4")).toBe("4px");
	});

	it("builds a variant mode on its base mode, then applies its overrides", () => {
		const outcome = ok(readTokenDocument(primerTokens));
		const modes = Object.fromEntries(
			(outcome.modeDocs ?? []).map((m) => [m.mode, m.doc]),
		);
		expect(Object.keys(modes)).toEqual([
			"light",
			"dark",
			"dark-dimmed",
			"light-high-contrast",
		]);
		// dark: $extensions override → neutral.1 of the dark palette
		expect(tokenValue(modes.dark, "bgColor.default")).toBe("#0d1117");
		expect(tokenValue(modes.dark, "bgColor.muted")).toBe("#0d1117");
		// dark-dimmed: dark palette + its overlay, dark's overrides, then its own
		expect(tokenValue(modes["dark-dimmed"], "bgColor.default")).toBe("#212830");
		expect(tokenValue(modes["dark-dimmed"], "base.color.neutral.0")).toBe(
			"#010409",
		);
		// light-high-contrast: light palette + overlay; no override → $value
		expect(tokenValue(modes["light-high-contrast"], "bgColor.muted")).toBe(
			"#eff2f5",
		);
		expect(tokenValue(modes["light-high-contrast"], "bgColor.default")).toBe(
			"#ffffff",
		);
	});
});

describe("readTokenDocument — Primer override objects", () => {
	it("takes $value (and alpha) from an override written as an object", async () => {
		const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const dir = mkdtempSync(join(tmpdir(), "primer-ovr-"));
		mkdirSync(join(dir, "light"));
		mkdirSync(join(dir, "dark"));
		writeFileSync(
			join(dir, "light", "light.json5"),
			"{ base: { blue: { $type: 'color', $value: '#54aeff' } } }",
		);
		writeFileSync(
			join(dir, "dark", "dark.json5"),
			"{ base: { blue: { $type: 'color', $value: '#4493f8' } } }",
		);
		writeFileSync(
			join(dir, "border.json5"),
			`{ border: { accent: { $type: 'color', $value: '{base.blue}', alpha: 0.4,
			   $extensions: { 'org.primer.overrides': { dark: { $value: '{base.blue}', alpha: 1 } } } } } }`,
		);
		const outcome = ok(readTokenDocument(dir));
		const modes = Object.fromEntries(
			(outcome.modeDocs ?? []).map((m) => [m.mode, m.doc]),
		);
		expect(tokenValue(modes.light, "border.accent")).toBe("#54aeff66");
		expect(tokenValue(modes.dark, "border.accent")).toBe("#4493f8");
	});
});
