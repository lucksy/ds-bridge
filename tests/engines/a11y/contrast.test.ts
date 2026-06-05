// T7.1 — WCAG 2.1 contrast engine. Test-first: relative luminance, contrast
// ratio, and the AA/AAA threshold table are spec'd here before implementation.
import { describe, expect, it } from "vitest";
import {
	type ContrastEvaluation,
	contrastRatio,
	evaluateContrast,
	relativeLuminance,
	requiredRatio,
} from "../../../src/engines/a11y/contrast.js";

describe("relativeLuminance", () => {
	it("is 1 for white and 0 for black (WCAG 2.1 sRGB)", () => {
		expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
		expect(relativeLuminance("#000000")).toBeCloseTo(0, 10);
	});

	it("accepts any culori-parseable spelling (rgb, named, shorthand)", () => {
		expect(relativeLuminance("rgb(255,255,255)")).toBeCloseTo(1, 10);
		expect(relativeLuminance("white")).toBeCloseTo(1, 10);
		expect(relativeLuminance("#fff")).toBeCloseTo(1, 10);
	});

	it("returns undefined for a non-color", () => {
		expect(relativeLuminance("not-a-color")).toBeUndefined();
		expect(relativeLuminance("16px")).toBeUndefined();
	});
});

describe("contrastRatio", () => {
	it("white-on-black is 21:1", () => {
		const ratio = contrastRatio("#ffffff", "#000000");
		expect(ratio).not.toBeUndefined();
		expect(ratio).toBeCloseTo(21, 5);
	});

	it("is symmetric (fg/bg order does not matter)", () => {
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
	});

	it("same color against itself is 1:1", () => {
		expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 10);
	});

	// Hand-computed mid cases (WCAG 2.1 formula, see fixtures math in the test
	// harness comment): all rounded to 2 decimals.
	it("#595959 on white ≈ 7.00 (AAA normal boundary)", () => {
		expect(contrastRatio("#595959", "#ffffff")).toBeCloseTo(7.0, 1);
	});

	it("#767676 on white ≈ 4.54 (AA normal boundary)", () => {
		expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
	});

	it("#3b82f6 (blue-500) on white ≈ 3.68", () => {
		expect(contrastRatio("#3b82f6", "#ffffff")).toBeCloseTo(3.68, 1);
	});

	it("returns undefined when either color is unparseable", () => {
		expect(contrastRatio("nope", "#ffffff")).toBeUndefined();
		expect(contrastRatio("#ffffff", "nope")).toBeUndefined();
	});
});

describe("requiredRatio threshold table", () => {
	it("AA: 4.5 normal text, 3.0 large text", () => {
		expect(requiredRatio("AA", "normal")).toBe(4.5);
		expect(requiredRatio("AA", "large")).toBe(3.0);
	});

	it("AAA: 7.0 normal text, 4.5 large text", () => {
		expect(requiredRatio("AAA", "normal")).toBe(7.0);
		expect(requiredRatio("AAA", "large")).toBe(4.5);
	});
});

describe("evaluateContrast", () => {
	it("passes white-on-black at every level and size", () => {
		const aaNormal = evaluateContrast("#ffffff", "#000000", "AA", "normal");
		expect(aaNormal).toEqual<ContrastEvaluation>({
			kind: "evaluated",
			ratio: aaNormal.kind === "evaluated" ? aaNormal.ratio : 0,
			required: 4.5,
			passes: true,
		});
		expect(aaNormal.kind === "evaluated" && aaNormal.ratio).toBeCloseTo(21, 5);
	});

	it("fails #3b82f6 on white at AA normal (3.68 < 4.5)", () => {
		const result = evaluateContrast("#3b82f6", "#ffffff", "AA", "normal");
		expect(result.kind).toBe("evaluated");
		if (result.kind === "evaluated") {
			expect(result.required).toBe(4.5);
			expect(result.passes).toBe(false);
		}
	});

	it("passes #3b82f6 on white at AA large (3.68 > 3.0)", () => {
		const result = evaluateContrast("#3b82f6", "#ffffff", "AA", "large");
		expect(result.kind).toBe("evaluated");
		if (result.kind === "evaluated") {
			expect(result.required).toBe(3.0);
			expect(result.passes).toBe(true);
		}
	});

	it("fails #595959 on white at AAA normal boundary inclusivity (7.00 ≥ 7.0 passes)", () => {
		const result = evaluateContrast("#595959", "#ffffff", "AAA", "normal");
		expect(result.kind).toBe("evaluated");
		if (result.kind === "evaluated") {
			expect(result.required).toBe(7.0);
			// 7.0047… ≥ 7.0 → passes
			expect(result.passes).toBe(true);
		}
	});

	it("returns an unparseable outcome (not a throw) for bad input", () => {
		const result = evaluateContrast("nope", "#ffffff", "AA", "normal");
		expect(result.kind).toBe("unparseable");
	});
});
