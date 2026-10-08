// T3.4 — drift classifier: token source vs built outputs. Classification table
// lives at the top of the test file. Pure.
import {
	alignTokenKeys,
	nameKey,
	type TokenKeyAlignment,
} from "./align-names.js";
import { normalizeColor, normalizeDimension } from "./normalize.js";
import type { OutputValue } from "./scan-outputs.js";
import type { Token, TokenMap } from "./types.js";

export type DriftEntry =
	| {
			kind: "stale-output";
			token: Token;
			output: OutputValue;
			mode?: string;
			/** The output's value with its var() references resolved, when it has any. */
			resolved?: string;
	  }
	| { kind: "missing-output"; token: Token; mode?: string }
	| { kind: "orphan-output"; output: OutputValue };

export interface DriftResult {
	entries: DriftEntry[];
	/** Token/output pairs whose canonical values agree. */
	inSync: number;
	/**
	 * Reference-only layers: token groups with no output at all whose tokens
	 * other tokens alias (Primer's `base.color` palette) — the build resolves
	 * them away by design, so they are summarized here, not listed as missing.
	 */
	unbuiltLayers?: { prefix: string; tokens: number }[];
}

/** CSS font-weight numbers by Figma / font style name. */
const WEIGHT_NAMES: Readonly<Record<string, number>> = {
	thin: 100,
	hairline: 100,
	extralight: 200,
	ultralight: 200,
	light: 300,
	regular: 400,
	normal: 400,
	book: 400,
	medium: 500,
	semibold: 600,
	demibold: 600,
	bold: 700,
	extrabold: 800,
	ultrabold: 800,
	black: 900,
	heavy: 900,
};

/**
 * A font style written as a Figma style name ("Semi Bold Italic", "Italic")
 * or as CSS ("600 italic", "italic") → one canonical "<weight>[ italic]".
 * Undefined for anything that is not a font style.
 */
function fontStyleKey(raw: string): string | undefined {
	const trimmed = raw.trim().toLowerCase();
	const italic = /(?:^|\s)(?:italic|oblique)$/.test(trimmed);
	const weightPart = trimmed.replace(/\s*(?:italic|oblique)$/, "").trim();
	let weight = 400;
	if (/^\d{3}$/.test(weightPart)) weight = Number(weightPart);
	else if (weightPart !== "") {
		const known = WEIGHT_NAMES[weightPart.replace(/[\s-]+/g, "")];
		if (known === undefined) return undefined;
		weight = known;
	} else if (!italic) return undefined;
	return `${weight}${italic ? " italic" : ""}`;
}

/** A font stack's families, unquoted and lowercased. */
function fontFamilies(raw: string): string[] {
	return raw
		.split(",")
		.map((f) =>
			f
				.trim()
				.replace(/^["']|["']$/g, "")
				.toLowerCase(),
		)
		.filter((f) => f !== "");
}

/** Generic families a build appends as the stack's last resort. */
const GENERIC_FAMILIES = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
	"ui-sans-serif",
	"ui-serif",
	"ui-monospace",
]);

/**
 * True when a source value and a built output say the same thing in different
 * notations — the conventions Figma variable exports meet in a CSS build: a
 * unitless FLOAT (`16`) emitted as a length (`1rem`), a font family emitted
 * with a generic fallback (`"inter", sans-serif`), a font style named the
 * Figma way (`Semi Bold Italic`) emitted as CSS (`600 italic`).
 */
function equivalent(token: Token, output: string): boolean {
	const value = token.value;
	if (typeof value === "number" && /^-?[\d.]+(px|rem)$/.test(output.trim())) {
		const dim = normalizeDimension(output.trim());
		return dim !== undefined && Math.abs(dim.px - value) < 1e-6;
	}
	if (typeof value !== "string") return false;
	if (token.type === "fontFamily") {
		const source = fontFamilies(value);
		const built = fontFamilies(output);
		const extra = built.slice(source.length);
		return (
			source.length > 0 &&
			source.every((f, i) => built[i] === f) &&
			extra.every((f) => GENERIC_FAMILIES.has(f))
		);
	}
	const a = fontStyleKey(value);
	return a !== undefined && a === fontStyleKey(output);
}

/** Type-aware canonical value for comparison; raw fallback when unnormalizable. */
function canonical(type: Token["type"], raw: string | number): string {
	if (type === "color" && typeof raw === "string") {
		return normalizeColor(raw) ?? raw.trim();
	}
	if (type === "dimension") {
		const dim = normalizeDimension(raw);
		if (dim !== undefined) return `${dim.px}px`;
	}
	return looseCanonical(String(raw));
}

/**
 * Free-form values (shadows, font stacks, media queries) compare loosely:
 * every rem / px length as px, every color as hex, one quote style, single
 * spaces — a build's notation never reads as drift.
 */
function looseCanonical(raw: string): string {
	return raw
		.trim()
		.replace(/'/g, '"')
		.replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => normalizeColor(hex) ?? hex)
		.replace(/(-?\d*\.?\d+)(rem|px)\b/g, (whole) => {
			const dim = normalizeDimension(whole);
			return dim === undefined ? whole : `${Number(dim.px.toFixed(4))}px`;
		})
		.replace(/\s*,\s*/g, ", ")
		.replace(/\s+/g, " ");
}

const VAR_REF_RE = /var\(\s*--([A-Za-z0-9_-]+)/g;

/**
 * Substitute every `var(--name[, fallback])` in `raw` with the value `lookup`
 * resolves for it (or its fallback), recursively. Undefined when a reference
 * has neither — the output then compares as authored.
 */
function substituteVars(
	raw: string,
	lookup: (key: string, seen: Set<string>) => string | undefined,
	seen: Set<string>,
): string | undefined {
	let out = "";
	let i = 0;
	for (;;) {
		const start = raw.indexOf("var(", i);
		if (start === -1) return out + raw.slice(i);
		out += raw.slice(i, start);
		let depth = 0;
		let end = start + 3;
		for (; end < raw.length; end++) {
			if (raw[end] === "(") depth += 1;
			else if (raw[end] === ")") {
				depth -= 1;
				if (depth === 0) break;
			}
		}
		if (end >= raw.length) return undefined;
		const inner = raw.slice(start + 4, end);
		const comma = inner.indexOf(",");
		const ref = (comma === -1 ? inner : inner.slice(0, comma)).trim();
		const fallback = comma === -1 ? undefined : inner.slice(comma + 1).trim();
		const resolved = ref.startsWith("--")
			? lookup(nameKey(ref.slice(2)), seen)
			: undefined;
		const value =
			resolved ??
			(fallback === undefined
				? undefined
				: substituteVars(fallback, lookup, seen));
		if (value === undefined) return undefined;
		out += value;
		i = end + 1;
	}
}

/** Each output's value with its var() references resolved against the others. */
function resolvedOutputValues(
	outputsByKey: ReadonlyMap<string, OutputValue>,
): (key: string) => string | undefined {
	const memo = new Map<string, string | undefined>();
	const lookup = (key: string, seen: Set<string>): string | undefined => {
		if (memo.has(key)) return memo.get(key);
		const output = outputsByKey.get(key);
		if (output === undefined || seen.has(key)) return undefined;
		const value = output.raw.includes("var(")
			? substituteVars(output.raw, lookup, new Set([...seen, key]))
			: output.raw;
		memo.set(key, value);
		return value;
	};
	return (key) => lookup(key, new Set());
}

/**
 * Split missing outputs into real gaps and reference-only layers: the
 * shallowest name prefix with no output under it at all, whose tokens
 * emitted tokens alias. Such a layer (a primitive palette) is summarized once;
 * a layer nothing emitted reaches stays a real gap.
 */
function splitUnbuiltLayers(
	tokens: readonly Token[],
	entries: DriftEntry[],
	emitted: ReadonlySet<string>,
): {
	entries: DriftEntry[];
	unbuiltLayers: { prefix: string; tokens: number }[];
} {
	// Targets of EMITTED aliases: the build reached the layer through them.
	const emittedTargets = new Set(
		tokens.flatMap((t) =>
			t.aliasOf === undefined || !emitted.has(t.name) ? [] : [t.aliasOf],
		),
	);
	const hasOutputUnder = (prefix: string): boolean => {
		for (const name of emitted) {
			if (name === prefix || name.startsWith(`${prefix}.`)) return true;
		}
		return false;
	};
	const layerOf = new Map<string, string | undefined>();
	const layerFor = (name: string): string | undefined => {
		if (layerOf.has(name)) return layerOf.get(name);
		const parts = name.split(".");
		let layer: string | undefined;
		for (let k = 1; k < parts.length; k++) {
			const prefix = parts.slice(0, k).join(".");
			if (hasOutputUnder(prefix)) continue;
			const members = tokens.filter((t) => t.name.startsWith(`${prefix}.`));
			if (
				members.length >= 2 &&
				members.some((t) => emittedTargets.has(t.name))
			) {
				layer = prefix;
			}
			break;
		}
		layerOf.set(name, layer);
		return layer;
	};
	const counts = new Map<string, Set<string>>();
	const kept: DriftEntry[] = [];
	for (const entry of entries) {
		const layer =
			entry.kind === "missing-output" ? layerFor(entry.token.name) : undefined;
		if (layer === undefined || entry.kind !== "missing-output") {
			kept.push(entry);
			continue;
		}
		const names = counts.get(layer) ?? new Set<string>();
		names.add(entry.token.name);
		counts.set(layer, names);
	}
	const unbuiltLayers = [...counts]
		.map(([prefix, names]) => ({ prefix, tokens: names.size }))
		.sort((a, b) => (a.prefix < b.prefix ? -1 : 1));
	return { entries: kept, unbuiltLayers };
}

/**
 * Keys of outputs that are derived aliases of source tokens: their value is
 * built only from `var(--…)` references to tokens (or to other derived
 * aliases), e.g. Tailwind v4's `@theme inline { --color-primary: var(--primary) }`
 * or `--radius-sm: calc(var(--radius) * 0.6)`. They are not orphans — they
 * have a source, one hop away. Resolved to a fixpoint so alias chains count.
 */
function derivedAliasKeys(
	outputs: readonly OutputValue[],
	tokenKeys: ReadonlySet<string>,
): Set<string> {
	const known = new Set(tokenKeys);
	const derived = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const output of outputs) {
			const key = nameKey(output.name);
			if (known.has(key)) continue;
			const refs = [...output.raw.matchAll(VAR_REF_RE)].map((m) =>
				nameKey(m[1] as string),
			);
			if (refs.length > 0 && refs.every((ref) => known.has(ref))) {
				known.add(key);
				derived.add(key);
				changed = true;
			}
		}
	}
	return derived;
}

/**
 * When the build namespaces its tokens (`--sds-…`), a custom property outside
 * that namespace (`--column-count` in a layout stylesheet) is a local
 * variable, not an emitted token — never an orphan.
 */
function underBuildPrefix(
	prefixes: readonly string[],
): (key: string) => boolean {
	if (prefixes.length === 0) return () => true;
	return (key) => prefixes.some((p) => key.startsWith(`${p}-`));
}

function entryName(entry: DriftEntry): string {
	return entry.kind === "orphan-output" ? entry.output.name : entry.token.name;
}

export function classifyDrift(
	source: TokenMap,
	outputs: readonly OutputValue[],
	alignment: TokenKeyAlignment = alignTokenKeys(
		source.tokens.map((t) => t.name),
		outputs.map((o) => o.name),
	),
): DriftResult {
	const tokenKey = alignment.key;
	const isTokenOutput = underBuildPrefix(alignment.prefixes);
	const outputsByKey = new Map<string, OutputValue>();
	for (const output of outputs) {
		outputsByKey.set(nameKey(output.name), output);
	}

	const resolved = resolvedOutputValues(outputsByKey);
	let entries: DriftEntry[] = [];
	const matchedOutputKeys = new Set<string>();
	const emitted = new Set<string>();
	let inSync = 0;

	for (const token of source.tokens) {
		if (typeof token.value === "object") continue; // composites: not comparable to flat outputs
		const key = tokenKey(token.name);
		const output = outputsByKey.get(key);
		if (output === undefined) {
			entries.push({ kind: "missing-output", token });
			continue;
		}
		matchedOutputKeys.add(key);
		emitted.add(token.name);
		const built = resolved(key) ?? output.raw;
		if (
			canonical(token.type, token.value) === canonical(token.type, built) ||
			equivalent(token, built)
		) {
			inSync += 1;
		} else {
			const value = resolved(key);
			entries.push({
				kind: "stale-output",
				token,
				output,
				...(value !== undefined && value !== output.raw
					? { resolved: value }
					: {}),
			});
		}
	}

	const tokenKeys = new Set(source.tokens.map((t) => tokenKey(t.name)));
	const derived = derivedAliasKeys(outputs, tokenKeys);
	for (const output of outputs) {
		const key = nameKey(output.name);
		if (!isTokenOutput(key)) continue;
		if (!matchedOutputKeys.has(key) && !derived.has(key)) {
			entries.push({ kind: "orphan-output", output });
		}
	}

	const split = splitUnbuiltLayers(source.tokens, entries, emitted);
	entries = split.entries;
	entries.sort((a, b) =>
		nameKey(entryName(a)) < nameKey(entryName(b)) ? -1 : 1,
	);
	return {
		entries,
		inSync,
		...(split.unbuiltLayers.length > 0
			? { unbuiltLayers: split.unbuiltLayers }
			: {}),
	};
}

/** One mode's token map (a Tokens Studio theme), default mode first. */
export interface ModeTokens {
	mode: string;
	map: TokenMap;
}

export interface ModeDriftResult extends DriftResult {
	/** Non-default modes with no scoped outputs at all — not compared. */
	skippedModes: string[];
}

/**
 * True when an output's scope selects `mode` (".dark", [data-theme=dark],
 * media…). Attribute NAMES are not read: Primer's dark theme is scoped
 * `[data-light-theme="dark"]`, which names "light" only as an attribute.
 */
function scopeSelectsMode(scope: string, mode: string): boolean {
	const escaped = mode.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const withoutAttrNames = scope
		.toLowerCase()
		.replace(/_/g, "-")
		.replace(/\[\s*[\w-]+\s*(?=[~|^$*]?=|\])/g, "[");
	return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(
		withoutAttrNames,
	);
}

/**
 * Mode-aware drift: each mode's tokens against the outputs that apply in that
 * mode. The first mode is the default and reads the root-level outputs (no
 * scope); every other mode reads the root-level outputs overlaid by outputs
 * whose scope names it. A non-default mode with no scoped output at all is
 * skipped (the build only emits the default mode) rather than reported as
 * stale everywhere. A missing token is reported once (first mode it misses
 * in); an output no mode defines is one orphan. Outputs under scopes that name
 * no mode (e.g. Tailwind's `@theme`) are compared like root-level ones.
 */
export function classifyDriftByMode(
	modes: readonly ModeTokens[],
	outputs: readonly OutputValue[],
): ModeDriftResult {
	// Longest first, so `dark-dimmed` claims its scope before `dark` can.
	const modeNames = modes
		.map((m) => m.mode)
		.sort((a, b) => b.length - a.length);
	// A vendor-named mode (`sds-dark`) is selected by its scheme word when no
	// scope names it in full: SDS ships dark as `@media (prefers-color-scheme: dark)`.
	const schemeWord = (mode: string): string | undefined => {
		const words = mode.toLowerCase().split(/[-_\s.]+/);
		const scheme = words.filter((w) => w === "light" || w === "dark");
		return scheme.length === 1 && words.length > 1 ? scheme[0] : undefined;
	};
	const scopedMode = (output: OutputValue): string | undefined => {
		if (output.scope === undefined) return undefined;
		const scope = output.scope;
		const exact = modeNames.find((mode) => scopeSelectsMode(scope, mode));
		if (exact !== undefined) return exact;
		const byWord = modeNames.filter((mode) => {
			const word = schemeWord(mode);
			return word !== undefined && scopeSelectsMode(scope, word);
		});
		return byWord.length === 1 ? byWord[0] : undefined;
	};
	const base = outputs.filter((o) => scopedMode(o) === undefined);
	const alignment = alignTokenKeys(
		modes.flatMap((m) => m.map.tokens.map((t) => t.name)),
		outputs.map((o) => o.name),
	);
	const tokenKey = alignment.key;
	const isTokenOutput = underBuildPrefix(alignment.prefixes);

	const entries: DriftEntry[] = [];
	const skippedModes: string[] = [];
	const missingReported = new Set<string>();
	const tokenKeys = new Set<string>();
	const unbuilt = new Map<string, number>();
	let inSync = 0;

	modes.forEach(({ mode, map }, index) => {
		for (const token of map.tokens) tokenKeys.add(tokenKey(token.name));
		let effective: OutputValue[] = base;
		const overrides = outputs.filter((o) => scopedMode(o) === mode);
		if (index > 0 && overrides.length === 0) {
			skippedModes.push(mode);
			return;
		}
		if (overrides.length > 0) {
			const overridden = new Set(overrides.map((o) => nameKey(o.name)));
			effective = [
				...base.filter((o) => !overridden.has(nameKey(o.name))),
				...overrides,
			];
		}
		const result = classifyDrift(map, effective, alignment);
		inSync += result.inSync;
		for (const layer of result.unbuiltLayers ?? []) {
			unbuilt.set(
				layer.prefix,
				Math.max(unbuilt.get(layer.prefix) ?? 0, layer.tokens),
			);
		}
		for (const entry of result.entries) {
			if (entry.kind === "orphan-output") continue;
			if (entry.kind === "missing-output") {
				const key = tokenKey(entry.token.name);
				if (missingReported.has(key)) continue;
				missingReported.add(key);
			}
			entries.push({ ...entry, mode });
		}
	});

	const orphanSeen = new Set<string>();
	const derived = derivedAliasKeys(outputs, tokenKeys);
	for (const output of outputs) {
		const key = nameKey(output.name);
		if (!isTokenOutput(key)) continue;
		if (tokenKeys.has(key) || derived.has(key) || orphanSeen.has(key)) continue;
		orphanSeen.add(key);
		entries.push({ kind: "orphan-output", output });
	}

	entries.sort((a, b) =>
		nameKey(entryName(a)) < nameKey(entryName(b)) ? -1 : 1,
	);
	const unbuiltLayers = [...unbuilt]
		.map(([prefix, tokens]) => ({ prefix, tokens }))
		.sort((a, b) => (a.prefix < b.prefix ? -1 : 1));
	return {
		entries,
		inSync,
		skippedModes,
		...(unbuiltLayers.length > 0 ? { unbuiltLayers } : {}),
	};
}
