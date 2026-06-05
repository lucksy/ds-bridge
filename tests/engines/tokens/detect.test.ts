// T1.4 — format auto-detection tests (TDD, written before implementation).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectFormat } from "../../../src/engines/tokens/detect.js";

const fixturesRoot = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"tokens",
);

function loadJson(relPath: string): unknown {
	return JSON.parse(readFileSync(join(fixturesRoot, relPath), "utf8"));
}

describe("detectFormat — golden fixtures (shape, not filename)", () => {
	it("detects the W3C golden fixture as w3c", () => {
		expect(detectFormat(loadJson("w3c/tokens.json"))).toBe("w3c");
	});

	it("detects the Tokens Studio golden fixture as tokens-studio", () => {
		expect(detectFormat(loadJson("tokens-studio/tokens.json"))).toBe(
			"tokens-studio",
		);
	});

	it("detects the Style Dictionary golden fixture as style-dictionary", () => {
		expect(detectFormat(loadJson("style-dictionary/tokens.json"))).toBe(
			"style-dictionary",
		);
	});

	it("detects the W3C invalid-cycle fixture as w3c (shape still W3C)", () => {
		expect(detectFormat(loadJson("w3c/invalid-cycle.json"))).toBe("w3c");
	});
});

describe("detectFormat — w3c", () => {
	it("detects w3c when any leaf carries $value", () => {
		expect(detectFormat({ color: { x: { $value: "#000" } } })).toBe("w3c");
	});

	it("detects w3c for nested groups with $type inheritance", () => {
		expect(
			detectFormat({ color: { $type: "color", x: { $value: "#000" } } }),
		).toBe("w3c");
	});

	it("detects w3c for a composite $value object", () => {
		expect(
			detectFormat({
				shadow: { card: { $type: "shadow", $value: { blur: "8px" } } },
			}),
		).toBe("w3c");
	});
});

describe("detectFormat — tokens-studio", () => {
	it("detects tokens-studio when top-level $themes exists", () => {
		expect(
			detectFormat({
				global: { color: { x: { value: "#000", type: "color" } } },
				$themes: [],
			}),
		).toBe("tokens-studio");
	});

	it("detects tokens-studio when top-level $metadata exists", () => {
		expect(
			detectFormat({
				global: { color: { x: { value: "#000", type: "color" } } },
				$metadata: { tokenSetOrder: ["global"] },
			}),
		).toBe("tokens-studio");
	});

	it("detects tokens-studio when leaves carry both value and type (no $-markers)", () => {
		expect(
			detectFormat({ color: { x: { value: "#000", type: "color" } } }),
		).toBe("tokens-studio");
	});
});

describe("detectFormat — style-dictionary", () => {
	it("detects style-dictionary when leaves carry value but no type and no $-markers", () => {
		expect(detectFormat({ color: { x: { value: "#000" } } })).toBe(
			"style-dictionary",
		);
	});

	it("detects style-dictionary when a leaf carries value + comment only", () => {
		expect(
			detectFormat({ color: { x: { value: "#000", comment: "note" } } }),
		).toBe("style-dictionary");
	});
});

describe("detectFormat — unknown", () => {
	it("returns unknown for an empty object", () => {
		expect(detectFormat({})).toBe("unknown");
	});

	it("returns unknown for an array", () => {
		expect(detectFormat([{ value: "#000" }])).toBe("unknown");
	});

	it("returns unknown for a string primitive", () => {
		expect(detectFormat("nope")).toBe("unknown");
	});

	it("returns unknown for a number primitive", () => {
		expect(detectFormat(42)).toBe("unknown");
	});

	it("returns unknown for null", () => {
		expect(detectFormat(null)).toBe("unknown");
	});

	it("returns unknown for a shape matching no format (no value/$value markers)", () => {
		expect(detectFormat({ color: { x: { hue: 210 } } })).toBe("unknown");
	});
});

describe("detectFormat — precedence", () => {
	it("prefers w3c over style-dictionary when $value appears anywhere", () => {
		expect(
			detectFormat({
				a: { x: { value: "#000" } },
				b: { y: { $value: "#fff" } },
			}),
		).toBe("w3c");
	});

	it("prefers tokens-studio when $themes is present even if leaves lack type", () => {
		expect(
			detectFormat({
				global: { color: { x: { value: "#000" } } },
				$themes: [],
			}),
		).toBe("tokens-studio");
	});
});
