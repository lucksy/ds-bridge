// M1.3 — the pure `resolveFileKey` resolver. A generalized `--file-key` that
// accepts either a raw Figma file key OR a `product_file_keys` alias. Pure,
// never throws — unknown alias surfaces as a typed outcome carrying nearest-match
// suggestions. Precedence: flagValue (alias-resolved, else raw) > defaultKey.
import { describe, expect, it } from "vitest";
import { resolveFileKey } from "../../src/io/figma/file-key.js";

const RAW_KEY = "ABcdEFghIJklMNopQRstUV"; // 22 chars — a real-shaped Figma key

describe("resolveFileKey", () => {
	it("resolves a flagValue that is an alias to its mapped key", () => {
		const out = resolveFileKey({
			flagValue: "checkout",
			productFileKeys: { checkout: "AbC123", settings: "DeF456" },
			defaultKey: "home-library",
		});
		expect(out).toEqual({ kind: "ok", key: "AbC123" });
	});

	it("passes a raw figma-key-shaped flagValue straight through (not an alias)", () => {
		const out = resolveFileKey({
			flagValue: RAW_KEY,
			productFileKeys: { checkout: "AbC123" },
			defaultKey: "home-library",
		});
		expect(out).toEqual({ kind: "ok", key: RAW_KEY });
	});

	it("treats any flagValue as a raw key when no product aliases are configured", () => {
		const out = resolveFileKey({
			flagValue: "whatever",
			productFileKeys: {},
			defaultKey: "home-library",
		});
		expect(out).toEqual({ kind: "ok", key: "whatever" });
	});

	it("falls back to defaultKey when no flagValue is given", () => {
		const out = resolveFileKey({
			productFileKeys: { checkout: "AbC123" },
			defaultKey: "home-library",
		});
		expect(out).toEqual({ kind: "ok", key: "home-library" });
	});

	it("an alias still wins over the default when both could apply", () => {
		const out = resolveFileKey({
			flagValue: "settings",
			productFileKeys: { checkout: "AbC123", settings: "DeF456" },
			defaultKey: "home-library",
		});
		expect(out).toEqual({ kind: "ok", key: "DeF456" });
	});

	it("returns missing when neither a flagValue nor a defaultKey is given", () => {
		const out = resolveFileKey({ productFileKeys: { checkout: "AbC123" } });
		expect(out).toEqual({ kind: "missing" });
	});

	it("an empty-string flagValue is treated as unset (falls back to default)", () => {
		const out = resolveFileKey({
			flagValue: "",
			productFileKeys: {},
			defaultKey: "home-library",
		});
		expect(out).toEqual({ kind: "ok", key: "home-library" });
	});

	it("an unknown alias-looking flagValue (aliases present, not figma-shaped) is unknown-alias with suggestions", () => {
		const out = resolveFileKey({
			flagValue: "chekcout", // typo of "checkout"
			productFileKeys: { checkout: "AbC123", settings: "DeF456" },
			defaultKey: "home-library",
		});
		expect(out.kind).toBe("unknown-alias");
		if (out.kind !== "unknown-alias") return;
		expect(out.alias).toBe("chekcout");
		expect(out.suggestions).toContain("checkout");
	});

	it("an unknown alias-looking flagValue with no near match is still unknown-alias (empty suggestions)", () => {
		const out = resolveFileKey({
			flagValue: "zzz",
			productFileKeys: { checkout: "AbC123", settings: "DeF456" },
		});
		expect(out.kind).toBe("unknown-alias");
		if (out.kind !== "unknown-alias") return;
		expect(out.alias).toBe("zzz");
		expect(out.suggestions).toEqual([]);
	});

	it("a figma-key-shaped flagValue is a raw key even when aliases are present and it is not one", () => {
		// 22+ alphanumeric chars is unambiguously a raw key — never an alias miss.
		const out = resolveFileKey({
			flagValue: "ZZZZZZZZZZZZZZZZZZZZZZ",
			productFileKeys: { checkout: "AbC123" },
		});
		expect(out).toEqual({ kind: "ok", key: "ZZZZZZZZZZZZZZZZZZZZZZ" });
	});

	it("never mutates its inputs", () => {
		const productFileKeys = { checkout: "AbC123" };
		const frozen = Object.freeze({ ...productFileKeys });
		expect(() =>
			resolveFileKey({ flagValue: "checkout", productFileKeys: frozen }),
		).not.toThrow();
	});
});
