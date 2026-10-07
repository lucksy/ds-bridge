// T1.2 — W3C Design Tokens parser. Test-first per SPEC §6/§7.
// Behaviors: golden acceptance, $value/$type/$description, nested dot-paths,
// group $type inheritance, transitive alias resolution, cycle/unknown-alias
// errors, lenient unknown types, invalid-shape rejection, name sorting.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseW3c } from "../../../src/engines/tokens/parse-w3c.js";
import type { TokenMap } from "../../../src/engines/tokens/types.js";

const w3cRoot = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"tokens",
	"w3c",
);

function loadJson(relPath: string): unknown {
	return JSON.parse(readFileSync(join(w3cRoot, relPath), "utf8"));
}

describe("parseW3c — golden acceptance", () => {
	it("produces a TokenMap deep-equal to the expected twin", () => {
		const source = loadJson("tokens.json");
		const expected = loadJson("expected.json") as TokenMap;

		const outcome = parseW3c(source);

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map).toEqual(expected);
		expect(outcome.warnings).toEqual([]);
	});
});

describe("parseW3c — structure & metadata", () => {
	it("maps $value/$type/$description and builds dot-path names with first-segment group", () => {
		const outcome = parseW3c({
			color: {
				$type: "color",
				brand: {
					primary: { $value: "#3b82f6", $description: "Primary" },
				},
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.format).toBe("w3c");
		expect(outcome.map.tokens).toEqual([
			{
				name: "color.brand.primary",
				type: "color",
				value: "#3b82f6",
				description: "Primary",
				group: "color",
			},
		]);
	});

	it("omits optional fields when absent", () => {
		const outcome = parseW3c({
			space: { $type: "dimension", sm: { $value: "8px" } },
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const token = outcome.map.tokens[0];
		expect(token).toBeDefined();
		expect(token).not.toHaveProperty("description");
		expect(token).not.toHaveProperty("aliasOf");
		expect(Object.keys(token ?? {}).sort()).toEqual([
			"group",
			"name",
			"type",
			"value",
		]);
	});
});

describe("parseW3c — $type inheritance", () => {
	it("uses the nearest ancestor group's $type when a token lacks its own", () => {
		const outcome = parseW3c({
			color: {
				$type: "color",
				deep: {
					nested: { swatch: { $value: "#000000" } },
				},
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]?.type).toBe("color");
	});

	it("lets a per-token $type win over an ancestor group's $type", () => {
		const outcome = parseW3c({
			color: {
				$type: "color",
				weird: { $type: "number", $value: 42 },
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]).toMatchObject({
			name: "color.weird",
			type: "number",
			value: 42,
		});
	});

	it("uses the nearest (not the outermost) ancestor $type", () => {
		const outcome = parseW3c({
			root: {
				$type: "color",
				inner: {
					$type: "dimension",
					leaf: { $value: "16px" },
				},
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]?.type).toBe("dimension");
	});
});

describe("parseW3c — alias resolution", () => {
	it("resolves a direct alias and records aliasOf as the referenced token", () => {
		const outcome = parseW3c({
			color: {
				$type: "color",
				base: { blue: { $value: "#3b82f6" } },
				brand: { primary: { $value: "{color.base.blue}" } },
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const primary = outcome.map.tokens.find(
			(t) => t.name === "color.brand.primary",
		);
		expect(primary).toMatchObject({
			value: "#3b82f6",
			aliasOf: "color.base.blue",
		});
	});

	it("resolves transitive aliases (a -> b -> c) but aliasOf is the DIRECT reference", () => {
		const outcome = parseW3c({
			color: {
				$type: "color",
				c: { $value: "#abcdef" },
				b: { $value: "{color.c}" },
				a: { $value: "{color.b}" },
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const a = outcome.map.tokens.find((t) => t.name === "color.a");
		expect(a).toMatchObject({ value: "#abcdef", aliasOf: "color.b" });
	});

	it("returns an alias-cycle error (no throw, no infinite loop) for the cycle fixture", () => {
		const outcome = parseW3c(loadJson("invalid-cycle.json"));

		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "alias-cycle")).toBe(true);
	});

	it("returns unknown-alias with the offending path for a dangling reference", () => {
		const outcome = parseW3c({
			color: {
				$type: "color",
				broken: { $value: "{color.does-not-exist}" },
			},
		});

		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		const err = outcome.errors.find((e) => e.code === "unknown-alias");
		expect(err).toBeDefined();
		expect(err?.path).toBe("color.does-not-exist");
	});
});

describe("parseW3c — lenient unknown type", () => {
	it("includes the token as type 'other' and emits a warning", () => {
		const outcome = parseW3c({
			misc: {
				thing: { $type: "cubicBezier", $value: "ease-in-out" },
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.map.tokens[0]).toMatchObject({
			name: "misc.thing",
			type: "other",
		});
		expect(outcome.warnings.length).toBeGreaterThan(0);
		expect(outcome.warnings.some((w) => w.includes("cubicBezier"))).toBe(true);
	});
});

describe("parseW3c — invalid shape", () => {
	it("rejects a non-object root", () => {
		const outcome = parseW3c("not an object");
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "invalid-shape")).toBe(true);
	});

	it("rejects null root", () => {
		const outcome = parseW3c(null);
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "invalid-shape")).toBe(true);
	});

	it("rejects an array root", () => {
		const outcome = parseW3c([1, 2, 3]);
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "invalid-shape")).toBe(true);
	});

	it("rejects a $value on a non-object node", () => {
		const outcome = parseW3c({
			color: { $type: "color", bad: "#000000" },
		});
		expect(outcome.kind).toBe("error");
		if (outcome.kind !== "error") return;
		expect(outcome.errors.some((e) => e.code === "invalid-shape")).toBe(true);
	});
});

describe("parseW3c — ordering", () => {
	it("sorts tokens by name", () => {
		const outcome = parseW3c({
			z: { $type: "color", b: { $value: "#000" }, a: { $value: "#fff" } },
			a: { $type: "color", token: { $value: "#111" } },
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const names = outcome.map.tokens.map((t) => t.name);
		expect(names).toEqual([...names].sort());
		expect(names).toEqual(["a.token", "z.a", "z.b"]);
	});
});

// DTCG 2025.10 value shapes, as GitHub Primer ships them: colors as
// {colorSpace, components, hex}, dimensions / durations as {value, unit}, and
// array values (cubicBezier, fontFamily stacks, layered shadows).
describe("parseW3c — DTCG 2025 value objects", () => {
	const tokenValue = (source: unknown, name: string) => {
		const outcome = parseW3c(source);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return undefined;
		return outcome.map.tokens.find((t) => t.name === name)?.value;
	};

	it("reads a color object as its hex (alias chains included)", () => {
		const source = {
			base: {
				black: {
					$type: "color",
					$value: {
						colorSpace: "hsl",
						components: [213.3, 12.7, 13.9],
						hex: "#1f2328",
					},
				},
			},
			fg: { default: { $type: "color", $value: "{base.black}" } },
		};
		expect(tokenValue(source, "base.black")).toBe("#1f2328");
		expect(tokenValue(source, "fg.default")).toBe("#1f2328");
	});

	it("computes the hex of a color object without one, keeping alpha", () => {
		const source = {
			c: {
				red: {
					$type: "color",
					$value: { colorSpace: "srgb", components: [1, 0, 0] },
				},
				veil: {
					$type: "color",
					$value: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.5 },
				},
			},
		};
		expect(tokenValue(source, "c.red")).toBe("#ff0000");
		expect(tokenValue(source, "c.veil")).toBe("#00000080");
	});

	it("reads {value, unit} dimensions and durations as CSS strings", () => {
		const source = {
			size: { "4": { $type: "dimension", $value: { value: 4, unit: "px" } } },
			text: {
				md: { $type: "dimension", $value: { value: 0.875, unit: "rem" } },
			},
			motion: {
				fast: { $type: "duration", $value: { value: 100, unit: "ms" } },
			},
			space: { xs: { $type: "dimension", $value: "{size.4}" } },
		};
		expect(tokenValue(source, "size.4")).toBe("4px");
		expect(tokenValue(source, "text.md")).toBe("0.875rem");
		expect(tokenValue(source, "motion.fast")).toBe("100ms");
		expect(tokenValue(source, "space.xs")).toBe("4px");
	});

	it("accepts array values instead of rejecting them as invalid shapes", () => {
		const source = {
			easing: { linear: { $type: "cubicBezier", $value: [0, 0, 1, 1] } },
			font: {
				mono: {
					$type: "fontFamily",
					$value: ["ui-monospace", "Menlo", "monospace"],
				},
			},
			shadow: {
				floating: {
					$type: "shadow",
					$value: [
						{
							color: "#00000014",
							offsetX: "0px",
							offsetY: "1px",
							blur: "2px",
							spread: "0px",
						},
						{
							color: "#0000001f",
							offsetX: "0px",
							offsetY: "8px",
							blur: "16px",
							spread: "0px",
						},
					],
				},
			},
		};
		const outcome = parseW3c(source);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		const names = outcome.map.tokens.map((t) => t.name);
		expect(names).toEqual(["easing.linear", "font.mono", "shadow.floating"]);
		expect(tokenValue(source, "font.mono")).toBe(
			"ui-monospace, Menlo, monospace",
		);
	});
});

// GitHub Primer: a color token may carry `alpha` beside `$value`, and string
// values may embed references (`inset 0 0 0 {borderWidth.thin}`).
describe("parseW3c — Primer conventions", () => {
	const tokenValueOf = (source: unknown, name: string) => {
		const outcome = parseW3c(source);
		if (outcome.kind !== "ok") throw new Error(JSON.stringify(outcome.errors));
		return outcome.map.tokens.find((t) => t.name === name)?.value;
	};

	it("applies a token's alpha to its color, and aliases inherit it", () => {
		const source = {
			base: { blue: { $type: "color", $value: "#54aeff" } },
			border: {
				accent: { $type: "color", $value: "{base.blue}", alpha: 0.4 },
				selected: { $type: "color", $value: "{border.accent}" },
			},
		};
		expect(tokenValueOf(source, "base.blue")).toBe("#54aeff");
		expect(tokenValueOf(source, "border.accent")).toBe("#54aeff66");
		expect(tokenValueOf(source, "border.selected")).toBe("#54aeff66");
	});

	it("replaces (never compounds) the alpha of a translucent alias target", () => {
		const source = {
			border: {
				muted: { $type: "color", $value: "#d1d9e0", alpha: 0.7 },
				overlay: { $type: "color", $value: "{border.muted}", alpha: 0.5 },
			},
		};
		expect(tokenValueOf(source, "border.overlay")).toBe("#d1d9e080");
	});

	it("resolves references embedded in a string value", () => {
		const source = {
			borderWidth: {
				thin: { $type: "dimension", $value: { value: 1, unit: "px" } },
			},
			boxShadow: {
				thin: { $type: "shadow", $value: "inset 0 0 0 {borderWidth.thin}" },
			},
		};
		expect(tokenValueOf(source, "boxShadow.thin")).toBe("inset 0 0 0 1px");
	});
});
