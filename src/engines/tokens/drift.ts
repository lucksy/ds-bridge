// T3.4 — drift classifier: token source vs built outputs. Classification table
// lives at the top of the test file. Pure.
import { normalizeColor, normalizeDimension } from "./normalize.js";
import type { OutputValue } from "./scan-outputs.js";
import type { Token, TokenMap } from "./types.js";

export type DriftEntry =
	| { kind: "stale-output"; token: Token; output: OutputValue; mode?: string }
	| { kind: "missing-output"; token: Token; mode?: string }
	| { kind: "orphan-output"; output: OutputValue };

export interface DriftResult {
	entries: DriftEntry[];
	/** Token/output pairs whose canonical values agree. */
	inSync: number;
}

/** Notation-insensitive name key: dots and kebab map to one form. */
function nameKey(name: string): string {
	return name.toLowerCase().replace(/\./g, "-");
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
	return String(raw).trim();
}

const VAR_REF_RE = /var\(\s*--([A-Za-z0-9_-]+)/g;

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

function entryName(entry: DriftEntry): string {
	return entry.kind === "orphan-output" ? entry.output.name : entry.token.name;
}

export function classifyDrift(
	source: TokenMap,
	outputs: readonly OutputValue[],
): DriftResult {
	const outputsByKey = new Map<string, OutputValue>();
	for (const output of outputs) {
		outputsByKey.set(nameKey(output.name), output);
	}

	const entries: DriftEntry[] = [];
	const matchedOutputKeys = new Set<string>();
	let inSync = 0;

	for (const token of source.tokens) {
		if (typeof token.value === "object") continue; // composites: not comparable to flat outputs
		const key = nameKey(token.name);
		const output = outputsByKey.get(key);
		if (output === undefined) {
			entries.push({ kind: "missing-output", token });
			continue;
		}
		matchedOutputKeys.add(key);
		if (
			canonical(token.type, token.value) === canonical(token.type, output.raw)
		) {
			inSync += 1;
		} else {
			entries.push({ kind: "stale-output", token, output });
		}
	}

	const tokenKeys = new Set(source.tokens.map((t) => nameKey(t.name)));
	const derived = derivedAliasKeys(outputs, tokenKeys);
	for (const output of outputs) {
		const key = nameKey(output.name);
		if (!matchedOutputKeys.has(key) && !derived.has(key)) {
			entries.push({ kind: "orphan-output", output });
		}
	}

	entries.sort((a, b) =>
		nameKey(entryName(a)) < nameKey(entryName(b)) ? -1 : 1,
	);
	return { entries, inSync };
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

/** True when an output's scope selects `mode` (".dark", [data-theme=dark], media…). */
function scopeSelectsMode(scope: string, mode: string): boolean {
	const escaped = mode.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(
		scope.toLowerCase(),
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
	const modeNames = modes.map((m) => m.mode);
	const scopedMode = (output: OutputValue): string | undefined =>
		output.scope === undefined
			? undefined
			: modeNames.find((mode) =>
					scopeSelectsMode(output.scope as string, mode),
				);
	const base = outputs.filter((o) => scopedMode(o) === undefined);

	const entries: DriftEntry[] = [];
	const skippedModes: string[] = [];
	const missingReported = new Set<string>();
	const tokenKeys = new Set<string>();
	let inSync = 0;

	modes.forEach(({ mode, map }, index) => {
		for (const token of map.tokens) tokenKeys.add(nameKey(token.name));
		let effective: OutputValue[] = base;
		if (index > 0) {
			const overrides = outputs.filter((o) => scopedMode(o) === mode);
			if (overrides.length === 0) {
				skippedModes.push(mode);
				return;
			}
			const overridden = new Set(overrides.map((o) => nameKey(o.name)));
			effective = [
				...base.filter((o) => !overridden.has(nameKey(o.name))),
				...overrides,
			];
		}
		const result = classifyDrift(map, effective);
		inSync += result.inSync;
		for (const entry of result.entries) {
			if (entry.kind === "orphan-output") continue;
			if (entry.kind === "missing-output") {
				const key = nameKey(entry.token.name);
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
		if (tokenKeys.has(key) || derived.has(key) || orphanSeen.has(key)) continue;
		orphanSeen.add(key);
		entries.push({ kind: "orphan-output", output });
	}

	entries.sort((a, b) =>
		nameKey(entryName(a)) < nameKey(entryName(b)) ? -1 : 1,
	);
	return { entries, inSync, skippedModes };
}
