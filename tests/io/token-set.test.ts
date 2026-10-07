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
