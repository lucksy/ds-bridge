// T1.1 — smoke spec: golden fixtures load and their expected-normalized twins
// conform to the frozen contract in src/engines/tokens/types.ts.
// The loader below is typed against the contract, so contract drift breaks compile here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	Token,
	TokenMap,
	TokenSourceFormat,
	TokenType,
} from "../../../src/engines/tokens/types.js";

const fixturesRoot = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"tokens",
);

const TOKEN_TYPES: readonly TokenType[] = [
	"color",
	"dimension",
	"fontFamily",
	"fontWeight",
	"duration",
	"number",
	"shadow",
	"typography",
	"other",
];

const FORMATS: readonly TokenSourceFormat[] = [
	"w3c",
	"tokens-studio",
	"style-dictionary",
];

function loadJson(relPath: string): unknown {
	return JSON.parse(readFileSync(join(fixturesRoot, relPath), "utf8"));
}

/** Runtime validator typed against the frozen contract. */
function assertTokenMap(raw: unknown): TokenMap {
	expect(typeof raw).toBe("object");
	const map = raw as TokenMap;
	expect(FORMATS).toContain(map.format);
	expect(Array.isArray(map.tokens)).toBe(true);
	for (const token of map.tokens) {
		const t: Token = token; // compile-time: fixture loader speaks the contract
		expect(typeof t.name).toBe("string");
		expect(t.name.length).toBeGreaterThan(0);
		expect(TOKEN_TYPES).toContain(t.type);
		expect(["string", "number", "object"]).toContain(typeof t.value);
	}
	return map;
}

describe.each(FORMATS)("golden fixtures: %s", (format) => {
	it("source file loads as JSON", () => {
		const source = loadJson(`${format}/tokens.json`);
		expect(source).toBeTypeOf("object");
	});

	it("expected twin conforms to the TokenMap contract", () => {
		const expected = assertTokenMap(loadJson(`${format}/expected.json`));
		expect(expected.format).toBe(format);
		expect(expected.tokens.length).toBeGreaterThan(0);
	});

	it("expected twin is sorted by name for stable diffs", () => {
		const expected = assertTokenMap(loadJson(`${format}/expected.json`));
		const names = expected.tokens.map((t) => t.name);
		expect(names).toEqual([...names].sort());
	});

	it("every alias target exists in the twin", () => {
		const expected = assertTokenMap(loadJson(`${format}/expected.json`));
		const names = new Set(expected.tokens.map((t) => t.name));
		for (const token of expected.tokens) {
			if (token.aliasOf !== undefined) {
				expect(names, `aliasOf ${token.aliasOf} should resolve`).toContain(
					token.aliasOf,
				);
			}
		}
	});
});

describe("cycle fixture", () => {
	it("w3c invalid-cycle fixture loads (parsers must reject it, not throw)", () => {
		const source = loadJson("w3c/invalid-cycle.json");
		expect(source).toBeTypeOf("object");
	});
});
