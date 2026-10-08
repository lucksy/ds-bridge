// T3.4 — drift classifier. Source-vs-built-outputs classification table (spec'd first):
//
// | Situation                                              | Entry          |
// |--------------------------------------------------------|----------------|
// | token + matching output, canonically equal value       | (none, inSync) |
// | token + matching output, canonically different value   | stale-output   |
// | token with no matching output                          | missing-output |
// | output with no matching token                          | orphan-output  |
// | composite token (object value: shadow/typography)      | skipped        |
//
// Matching is name-based and notation-insensitive: token "color.brand.primary"
// matches CSS "--color-brand-primary" (kebab) and TS "color.brand.primary" (dotted).
// Value comparison is type-aware canonical (hex case, rgb() spelling, rem/px).
import { describe, expect, it } from "vitest";
import {
	classifyDrift,
	classifyDriftByMode,
} from "../../../src/engines/tokens/drift.js";
import type { OutputValue } from "../../../src/engines/tokens/scan-outputs.js";
import type { Token, TokenMap } from "../../../src/engines/tokens/types.js";

function mapOf(...tokens: Token[]): TokenMap {
	return { format: "w3c", tokens };
}

const primary: Token = {
	name: "color.brand.primary",
	type: "color",
	value: "#3b82f6",
};
const spaceMd: Token = { name: "space.md", type: "dimension", value: "16px" };

describe("classifyDrift", () => {
	it("counts canonically equal pairs as in sync (kebab CSS name)", () => {
		const outputs: OutputValue[] = [
			{ name: "color-brand-primary", raw: "#3B82F6" }, // case differs, canonical same
		];
		const result = classifyDrift(mapOf(primary), outputs);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(1);
	});

	it("matches dotted TS output names too", () => {
		const outputs: OutputValue[] = [
			{ name: "color.brand.primary", raw: "rgb(59, 130, 246)" },
		];
		const result = classifyDrift(mapOf(primary), outputs);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(1);
	});

	it("treats 1rem output as in sync with a 16px dimension token", () => {
		const outputs: OutputValue[] = [{ name: "space-md", raw: "1rem" }];
		const result = classifyDrift(mapOf(spaceMd), outputs);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(1);
	});

	it("classifies a canonically different output value as stale-output", () => {
		const outputs: OutputValue[] = [
			{ name: "color-brand-primary", raw: "#2563eb" },
		];
		const result = classifyDrift(mapOf(primary), outputs);
		expect(result.entries).toEqual([
			{ kind: "stale-output", token: primary, output: outputs[0] },
		]);
		expect(result.inSync).toBe(0);
	});

	it("classifies a token without any output as missing-output", () => {
		const result = classifyDrift(mapOf(primary), []);
		expect(result.entries).toEqual([
			{ kind: "missing-output", token: primary },
		]);
	});

	it("classifies an output without any token as orphan-output", () => {
		const orphan: OutputValue = { name: "color-legacy", raw: "#000000" };
		const result = classifyDrift(mapOf(), [orphan]);
		expect(result.entries).toEqual([{ kind: "orphan-output", output: orphan }]);
	});

	it("skips composite tokens entirely (no missing-output noise)", () => {
		const shadow: Token = {
			name: "shadow.card",
			type: "shadow",
			value: { color: "#11182733", blur: "8px" },
		};
		const result = classifyDrift(mapOf(shadow), []);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(0);
	});

	it("compares numeric token values as strings (fontWeight 700)", () => {
		const bold: Token = {
			name: "font.weight.bold",
			type: "fontWeight",
			value: 700,
		};
		const result = classifyDrift(mapOf(bold), [
			{ name: "font-weight-bold", raw: "700" },
		]);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(1);
	});

	it("sorts entries by token/output name for stable reports", () => {
		const a: Token = { name: "color.a", type: "color", value: "#000001" };
		const z: Token = { name: "color.z", type: "color", value: "#000002" };
		const orphan: OutputValue = { name: "color-m", raw: "#000003" };
		const result = classifyDrift(mapOf(z, a), [orphan]);
		const names = result.entries.map((e) =>
			e.kind === "orphan-output" ? e.output.name : e.token.name,
		);
		expect(names).toEqual(["color.a", "color-m", "color.z"]);
	});
});

describe("classifyDrift — derived aliases (Tailwind v4 @theme)", () => {
	it("does not call an output built from var() references to source tokens an orphan", () => {
		const outputs: OutputValue[] = [
			{ name: "color-brand-primary", raw: "#3b82f6" },
			{ name: "space-md", raw: "16px" },
			// shadcn's `@theme inline` mapping and derived radii
			{
				name: "color-primary",
				raw: "var(--color-brand-primary)",
				scope: "@theme inline",
			},
			{
				name: "space-lg",
				raw: "calc(var(--space-md) * 1.5)",
				scope: "@theme inline",
			},
		];
		const result = classifyDrift(mapOf(primary, spaceMd), outputs);
		expect(result.entries).toEqual([]);
	});

	it("still reports an output referencing only unknown custom properties", () => {
		const outputs: OutputValue[] = [
			{ name: "color-brand-primary", raw: "#3b82f6" },
			{ name: "space-md", raw: "16px" },
			{ name: "color-x", raw: "var(--not-a-token)" },
		];
		const result = classifyDrift(mapOf(primary, spaceMd), outputs);
		expect(result.entries.map((e) => e.kind)).toEqual(["orphan-output"]);
	});
});

// Mode-aware drift (Tokens Studio $themes): each mode is compared with the CSS
// that applies in that mode — root-level values for the default (first) mode;
// root overlaid by a selector naming the mode (`.dark`, `[data-theme="dark"]`,
// `@media (prefers-color-scheme: dark)`) for the others.
describe("classifyDriftByMode", () => {
	const light = mapOf(
		{ name: "background", type: "color", value: "#ffffff" },
		{ name: "radius", type: "dimension", value: "8px" },
	);
	const dark = mapOf(
		{ name: "background", type: "color", value: "#0a0a0a" },
		{ name: "radius", type: "dimension", value: "8px" },
	);
	const modes = [
		{ mode: "light", map: light },
		{ mode: "dark", map: dark },
	];
	const css: OutputValue[] = [
		{ name: "background", raw: "#ffffff" },
		{ name: "radius", raw: "8px" },
		{ name: "background", raw: "#0a0a0a", scope: ".dark" },
	];

	it("is in sync when every mode matches its own scope", () => {
		const result = classifyDriftByMode(modes, css);
		expect(result.entries).toEqual([]);
		expect(result.skippedModes).toEqual([]);
	});

	it("flags a stale DEFAULT-mode value (it no longer hides behind the last mode)", () => {
		const changed = [
			{
				mode: "light",
				map: mapOf(
					{ name: "background", type: "color", value: "#fafafa" },
					{ name: "radius", type: "dimension", value: "8px" },
				),
			},
			{ mode: "dark", map: dark },
		];
		const result = classifyDriftByMode(changed, css);
		expect(result.entries).toEqual([
			{
				kind: "stale-output",
				mode: "light",
				token: { name: "background", type: "color", value: "#fafafa" },
				output: { name: "background", raw: "#ffffff" },
			},
		]);
	});

	it("flags a stale value in a non-default mode against its scoped output", () => {
		const changed = [
			{ mode: "light", map: light },
			{
				mode: "dark",
				map: mapOf(
					{ name: "background", type: "color", value: "#111111" },
					{ name: "radius", type: "dimension", value: "8px" },
				),
			},
		];
		const result = classifyDriftByMode(changed, css);
		expect(
			result.entries.map((e) => [e.kind, "mode" in e ? e.mode : undefined]),
		).toEqual([["stale-output", "dark"]]);
	});

	it("matches data-theme attributes and prefers-color-scheme media scopes", () => {
		for (const scope of [
			'[data-theme="dark"]',
			"@media (prefers-color-scheme: dark) :root",
			".theme-dark",
		]) {
			const result = classifyDriftByMode(modes, [
				{ name: "background", raw: "#ffffff" },
				{ name: "radius", raw: "8px" },
				{ name: "background", raw: "#0a0a0a", scope },
			]);
			expect(result.entries, scope).toEqual([]);
		}
	});

	it("reports a token missing from the outputs once, not once per mode", () => {
		const withExtra = modes.map(({ mode, map }) => ({
			mode,
			map: mapOf(...map.tokens, {
				name: "success",
				type: "color",
				value: "#00ff00",
			}),
		}));
		const result = classifyDriftByMode(withExtra, css);
		expect(
			result.entries.filter((e) => e.kind === "missing-output"),
		).toHaveLength(1);
	});

	it("reports an output that no mode defines as one orphan", () => {
		const result = classifyDriftByMode(modes, [
			...css,
			{ name: "legacy", raw: "#123456" },
			{ name: "legacy", raw: "#654321", scope: ".dark" },
		]);
		expect(
			result.entries.filter((e) => e.kind === "orphan-output"),
		).toHaveLength(1);
	});

	it("skips (and names) a non-default mode that has no scoped outputs at all", () => {
		const result = classifyDriftByMode(
			modes,
			css.filter((o) => o.scope === undefined),
		);
		expect(result.entries).toEqual([]);
		expect(result.skippedModes).toEqual(["dark"]);
	});
});

// GitHub Primer (real-user finding): every theme file is scoped, the default
// (light) one included, and the selectors carry attribute NAMES that contain
// mode words — dark.css is `[data-color-mode="auto"][data-light-theme="dark"]`.
describe("classifyDriftByMode — attribute-scoped themes (Primer)", () => {
	const light = mapOf({
		name: "bgColor.default",
		type: "color",
		value: "#ffffff",
	});
	const dark = mapOf({
		name: "bgColor.default",
		type: "color",
		value: "#0d1117",
	});
	const dimmed = mapOf({
		name: "bgColor.default",
		type: "color",
		value: "#212830",
	});
	const lightScope =
		'[data-color-mode="light"][data-light-theme="light"], [data-color-mode="auto"][data-light-theme="light"]';
	const darkScope =
		'[data-color-mode="dark"][data-dark-theme="dark"], [data-color-mode="auto"][data-light-theme="dark"]';
	const dimmedScope = '[data-color-mode="dark"][data-dark-theme="dark-dimmed"]';
	const css: OutputValue[] = [
		{ name: "bgColor-default", raw: "#ffffff", scope: lightScope },
		{ name: "bgColor-default", raw: "#0d1117", scope: darkScope },
		{ name: "bgColor-default", raw: "#212830", scope: dimmedScope },
	];
	const modes = [
		{ mode: "light", map: light },
		{ mode: "dark", map: dark },
		{ mode: "dark-dimmed", map: dimmed },
	];

	it("compares the default mode against the outputs scoped to it", () => {
		const result = classifyDriftByMode(modes, css);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(3);
	});

	it("never reads a mode word inside an attribute name, and prefers the longest mode", () => {
		const result = classifyDriftByMode(
			[
				{ mode: "light", map: light },
				{
					mode: "dark",
					map: mapOf({
						name: "bgColor.default",
						type: "color",
						value: "#010409",
					}),
				},
				{ mode: "dark-dimmed", map: dimmed },
			],
			css,
		);
		expect(
			result.entries.map((e) => [e.kind, "mode" in e ? e.mode : undefined]),
		).toEqual([["stale-output", "dark"]]);
	});
});

// Style Dictionary `outputReferences: true` (Primer, and most real builds) emits
// semantic outputs as var() references to other outputs, not as final values.
describe("classifyDrift — outputs that reference other outputs", () => {
	it("resolves var(--…) chains (with fallbacks) before comparing", () => {
		const source = mapOf(
			{ name: "control.bgColor.rest", type: "color", value: "#f6f8fa" },
			{ name: "button.default.bgColor.rest", type: "color", value: "#f6f8fa" },
			{ name: "button.outline.bgColor.rest", type: "color", value: "#f6f8fa" },
			{ name: "motion.duration.long", type: "duration", value: "500ms" },
		);
		const outputs: OutputValue[] = [
			{ name: "control-bgColor-rest", raw: "#F6F8FA" },
			{
				name: "button-default-bgColor-rest",
				raw: "var(--control-bgColor-rest)",
			},
			{
				name: "button-outline-bgColor-rest",
				raw: "var(--button-default-bgColor-rest, #000)",
			},
			{ name: "motion-duration-long", raw: "var(--nope, 500ms)" },
		];
		const result = classifyDrift(source, outputs);
		expect(result.entries).toEqual([]);
		expect(result.inSync).toBe(4);
	});

	it("still flags a reference that resolves to the wrong value", () => {
		const source = mapOf(
			{ name: "fg.muted", type: "color", value: "#59636e" },
			{ name: "fg.default", type: "color", value: "#1f2328" },
		);
		const outputs: OutputValue[] = [
			{ name: "fg-default", raw: "#1f2328" },
			{ name: "fg-muted", raw: "var(--fg-default)" },
		];
		const result = classifyDrift(source, outputs);
		expect(result.entries.map((e) => e.kind)).toEqual(["stale-output"]);
	});
});

// Primer never emits its base palette: base.color.* reaches CSS only through the
// functional tokens that alias it. A layer with NO output at all whose tokens
// are alias targets is reported once as unbuilt, not as N missing outputs.
describe("classifyDrift — reference-only layers", () => {
	const source = mapOf(
		{ name: "base.color.blue.5", type: "color", value: "#0969da" },
		{ name: "base.color.blue.6", type: "color", value: "#0550ae" },
		{ name: "base.size.4", type: "dimension", value: "4px" },
		{ name: "base.size.8", type: "dimension", value: "8px" },
		{
			name: "fg.accent",
			type: "color",
			value: "#0969da",
			aliasOf: "base.color.blue.5",
		},
		{
			name: "space.xs",
			type: "dimension",
			value: "4px",
			aliasOf: "base.size.4",
		},
	);
	const outputs: OutputValue[] = [
		{ name: "fg-accent", raw: "#0969da" },
		{ name: "space-xs", raw: "4px" },
		{ name: "base-size-4", raw: "4px" },
	];

	it("collapses a never-emitted primitive layer into one unbuilt note", () => {
		const result = classifyDrift(source, outputs);
		expect(result.unbuiltLayers).toEqual([{ prefix: "base.color", tokens: 2 }]);
		// base.size IS built, so its unbuilt member is a real gap
		expect(result.entries.map((e) => [e.kind, entryLabel(e)])).toEqual([
			["missing-output", "base.size.8"],
		]);
	});

	it("keeps a semantic layer with no outputs as missing (nothing aliases it)", () => {
		const result = classifyDrift(
			mapOf(
				{ name: "fg.accent", type: "color", value: "#0969da" },
				{ name: "fg.muted", type: "color", value: "#59636e" },
			),
			[],
		);
		expect(result.unbuiltLayers ?? []).toEqual([]);
		expect(result.entries).toHaveLength(2);
	});
});

function entryLabel(e: {
	kind: string;
	token?: { name: string };
}): string | undefined {
	return e.token?.name;
}

describe("classifyDrift — free-form string values", () => {
	it("compares rem/px, quote style and spacing loosely", () => {
		const source = mapOf(
			{ name: "boxShadow.thin", type: "shadow", value: "inset 0 0 0 1px" },
			{
				name: "fontStack.sans",
				type: "fontFamily",
				value: "'Mona Sans VF', -apple-system, sans-serif",
			},
			{
				name: "viewport.narrow",
				type: "other",
				value: "(max-width: calc(768px - 0.02px))",
			},
		);
		const outputs: OutputValue[] = [
			{ name: "boxShadow-thin", raw: "inset 0 0 0 0.0625rem" },
			{
				name: "fontStack-sans",
				raw: '"Mona Sans VF", -apple-system,  sans-serif',
			},
			{ name: "viewport-narrow", raw: "(max-width: calc(48rem - 0.02px))" },
		];
		expect(classifyDrift(source, outputs).entries).toEqual([]);
	});
});

describe("classifyDrift — reference-only layers need emitted referrers", () => {
	it("keeps a layer missing when nothing that aliases it is emitted either", () => {
		const result = classifyDrift(
			mapOf(
				{ name: "borderRadius.small", type: "dimension", value: "3px" },
				{ name: "borderRadius.medium", type: "dimension", value: "6px" },
				{
					name: "overlay.borderRadius",
					type: "dimension",
					value: "6px",
					aliasOf: "borderRadius.medium",
				},
			),
			[{ name: "unrelated", raw: "1px" }],
		);
		expect(result.unbuiltLayers ?? []).toEqual([]);
		expect(
			result.entries.filter((e) => e.kind === "missing-output"),
		).toHaveLength(3);
	});
});

describe("classifyDriftByMode — underscore theme names (Primer's dark_dimmed)", () => {
	it("matches a `dark_dimmed` scope to the dark-dimmed mode", () => {
		const result = classifyDriftByMode(
			[
				{
					mode: "dark",
					map: mapOf({ name: "bg", type: "color", value: "#0d1117" }),
				},
				{
					mode: "dark-dimmed",
					map: mapOf({ name: "bg", type: "color", value: "#212830" }),
				},
			],
			[
				{ name: "bg", raw: "#0d1117", scope: '[data-dark-theme="dark"]' },
				{
					name: "bg",
					raw: "#212830",
					scope: '[data-dark-theme="dark_dimmed"]',
				},
			],
		);
		expect(result.skippedModes).toEqual([]);
		expect(result.entries).toEqual([]);
	});
});

describe("classifyDrift — Figma variable exports (Simple Design System)", () => {
	const tok = (
		name: string,
		type: Token["type"],
		value: Token["value"],
	): Token => ({
		name,
		type,
		value,
	});

	it("aligns collection paths with a prefixed, family-folded build", () => {
		const result = classifyDrift(
			mapOf(
				tok("@color.background.default", "color", "#ffffff"),
				tok("@color_primitives.gray.100", "color", "#f5f5f5"),
			),
			[
				{ name: "sds-color-background-default", raw: "#fff" },
				{ name: "sds-color-gray-100", raw: "#f5f5f5" },
				{ name: "column-count", raw: "3" },
			],
		);
		expect(result.inSync).toBe(2);
		// `--column-count` sits outside the build's `sds-` namespace: local, not an orphan.
		expect(result.entries).toEqual([]);
	});

	it("never aligns two tokens onto one output", () => {
		const result = classifyDrift(
			mapOf(
				tok("@color_primitives.gray.100", "color", "#f5f5f5"),
				tok("@color-base.gray.100", "color", "#f5f5f5"),
			),
			[
				{ name: "sds-color-gray-100", raw: "#f5f5f5" },
				{ name: "sds-x", raw: "1" },
			],
		);
		expect(result.inSync).toBe(0);
	});

	it("compares a unitless number token with a px / rem output", () => {
		const result = classifyDrift(
			mapOf(tok("space.400", "number", 16), tok("space.100", "number", 4)),
			[
				{ name: "space-400", raw: "1rem" },
				{ name: "space-100", raw: "8px" },
			],
		);
		expect(result.inSync).toBe(1);
		expect(result.entries.map((e) => e.kind)).toEqual(["stale-output"]);
	});

	it("reads a font stack with an appended generic fallback as in sync", () => {
		const result = classifyDrift(
			mapOf(tok("family.sans", "fontFamily", "Inter")),
			[{ name: "family-sans", raw: '"inter", sans-serif' }],
		);
		expect(result.inSync).toBe(1);
	});

	it("reads Figma font-style names as CSS weight + style", () => {
		const result = classifyDrift(
			mapOf(
				tok("weight.semibold-italic", "other", "Semi Bold Italic"),
				tok("weight.italic", "other", "Italic"),
				tok("weight.bold", "fontWeight", "Bold"),
			),
			[
				{ name: "weight-semibold-italic", raw: "600 italic" },
				{ name: "weight-italic", raw: "italic" },
				{ name: "weight-bold", raw: "700" },
			],
		);
		expect(result.inSync).toBe(3);
	});
});

describe("classifyDriftByMode — vendor-named modes (sds_dark)", () => {
	it("matches a mode named after its scheme to a prefers-color-scheme scope", () => {
		const t = (value: string): TokenMap =>
			mapOf({ name: "bg", type: "color", value });
		const result = classifyDriftByMode(
			[
				{ mode: "sds-light", map: t("#ffffff") },
				{ mode: "sds-dark", map: t("#1e1e1e") },
			],
			[
				{ name: "bg", raw: "#ffffff" },
				{
					name: "bg",
					raw: "#1e1e1e",
					scope: "@media (prefers-color-scheme: dark) :root",
				},
			],
		);
		expect(result.inSync).toBe(2);
		expect(result.skippedModes).toEqual([]);
	});
});
