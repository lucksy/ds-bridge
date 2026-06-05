// T3.4 — drift classifier: token source vs built outputs. Classification table
// lives at the top of the test file. Pure.
import { normalizeColor, normalizeDimension } from "./normalize.js";
import type { OutputValue } from "./scan-outputs.js";
import type { Token, TokenMap } from "./types.js";

export type DriftEntry =
	| { kind: "stale-output"; token: Token; output: OutputValue }
	| { kind: "missing-output"; token: Token }
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

	for (const output of outputs) {
		if (!matchedOutputKeys.has(nameKey(output.name))) {
			entries.push({ kind: "orphan-output", output });
		}
	}

	entries.sort((a, b) =>
		nameKey(entryName(a)) < nameKey(entryName(b)) ? -1 : 1,
	);
	return { entries, inSync };
}
