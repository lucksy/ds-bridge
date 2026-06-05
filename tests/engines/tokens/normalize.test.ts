// T1.5 — canonical value normalization: many author spellings, one comparable form.
import { describe, expect, it } from "vitest";
import {
	normalizeColor,
	normalizeDimension,
} from "../../../src/engines/tokens/normalize.js";

describe("normalizeColor", () => {
	it("canonicalizes hex to lowercase 6-digit form", () => {
		expect(normalizeColor("#3B82F6")).toBe("#3b82f6");
		expect(normalizeColor("#FFF")).toBe("#ffffff");
	});

	it("maps rgb()/hsl()/oklch() spellings onto the same canonical hex", () => {
		expect(normalizeColor("rgb(59, 130, 246)")).toBe("#3b82f6");
		expect(normalizeColor("hsl(0, 0%, 100%)")).toBe("#ffffff");
		expect(normalizeColor("oklch(1 0 0)")).toBe("#ffffff");
	});

	it("accepts CSS named colors", () => {
		expect(normalizeColor("white")).toBe("#ffffff");
	});

	it("preserves meaningful alpha as 8-digit hex", () => {
		expect(normalizeColor("#11182733")).toBe("#11182733");
		expect(normalizeColor("rgba(255, 255, 255, 0.5)")).toBe("#ffffff80");
	});

	it("drops a fully-opaque alpha channel", () => {
		expect(normalizeColor("#3b82f6ff")).toBe("#3b82f6");
	});

	it("returns undefined for non-colors", () => {
		expect(normalizeColor("16px")).toBeUndefined();
		expect(normalizeColor("not-a-color-at-all")).toBeUndefined();
		expect(normalizeColor("")).toBeUndefined();
	});
});

describe("normalizeDimension", () => {
	it("parses px values", () => {
		expect(normalizeDimension("16px")).toEqual({ px: 16 });
		expect(normalizeDimension("0px")).toEqual({ px: 0 });
		expect(normalizeDimension("-4px")).toEqual({ px: -4 });
		expect(normalizeDimension("1.5px")).toEqual({ px: 1.5 });
	});

	it("converts rem using the default 16px base", () => {
		expect(normalizeDimension("1rem")).toEqual({ px: 16 });
		expect(normalizeDimension("1.5rem")).toEqual({ px: 24 });
		expect(normalizeDimension("0.25rem")).toEqual({ px: 4 });
	});

	it("respects a custom rem base", () => {
		expect(normalizeDimension("1rem", { remBase: 10 })).toEqual({ px: 10 });
	});

	it("treats unitless numeric strings as px (Tokens Studio spacing)", () => {
		expect(normalizeDimension("8")).toEqual({ px: 8 });
		expect(normalizeDimension("16")).toEqual({ px: 16 });
	});

	it("accepts plain numbers as px", () => {
		expect(normalizeDimension(8)).toEqual({ px: 8 });
	});

	it("returns undefined for non-dimensions", () => {
		expect(normalizeDimension("#3b82f6")).toBeUndefined();
		expect(normalizeDimension("150ms")).toBeUndefined();
		expect(normalizeDimension("50%")).toBeUndefined();
		expect(normalizeDimension("medium")).toBeUndefined();
		expect(normalizeDimension("")).toBeUndefined();
	});
});
