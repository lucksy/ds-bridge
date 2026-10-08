// Token path ↔ built output name alignment. PURE.
//
// Builds rarely emit a token's path verbatim. Figma's Simple Design System
// exports `@color.background.default` and `@color_primitives.gray.100`, and its
// build writes `--sds-color-background-default` and `--sds-color-gray-100`: a
// project prefix in front, the collection marker `@` dropped, and the
// primitives collection folded into its family. This module maps each token to
// the output key it was emitted under, trying (in order) the plain key, the
// key under a detected build prefix, and the key with its collection reduced
// to its family stem. A key two tokens could claim at the same step is given
// to neither — names are never guessed.

/** Notation-insensitive name key: dots and kebab map to one form. */
export function nameKey(name: string): string {
	return name.toLowerCase().replace(/\./g, "-");
}

/** A token path's key without collection markers or spaces. */
function baseKey(name: string): string {
	return nameKey(
		name
			.split(".")
			.map((segment) => segment.replace(/^[@$]/, "").replace(/\s+/g, "-"))
			.join("."),
	);
}

/** `color_primitives.gray.100` → `color.gray.100`: the collection's family word. */
function stemmed(name: string): string | undefined {
	const [first, ...rest] = name.split(".");
	if (first === undefined || rest.length === 0) return undefined;
	const stem = first.replace(/^[@$]/, "").split(/[\s_-]+/)[0];
	if (stem === undefined || stem === "" || stem === first.replace(/^[@$]/, ""))
		return undefined;
	return baseKey([stem, ...rest].join("."));
}

/**
 * Build prefixes: a leading output segment most outputs share that no token
 * path starts with (`sds` in `--sds-color-…`).
 */
function detectPrefixes(
	outputKeys: readonly string[],
	tokenKeys: readonly string[],
): string[] {
	const tokenFirsts = new Set(tokenKeys.map((k) => k.split("-")[0]));
	const counts = new Map<string, number>();
	for (const key of outputKeys) {
		const first = key.split("-")[0];
		if (first === undefined || first === "" || first === key) continue;
		counts.set(first, (counts.get(first) ?? 0) + 1);
	}
	return [...counts]
		.filter(
			([first, n]) =>
				!tokenFirsts.has(first) && n >= Math.max(2, outputKeys.length * 0.4),
		)
		.map(([first]) => first)
		.sort();
}

/**
 * The output key each token aligns to. Tokens whose plain key already names an
 * output keep it; the rest try the build prefix, then their collection's
 * family stem (with and without the prefix). Unaligned tokens map to their
 * plain key, so a missing output still reports under the token's own name.
 */
export interface TokenKeyAlignment {
	/** The output key a token aligns to (its plain key when unaligned). */
	key: (tokenName: string) => string;
	/** Detected build prefixes (`sds`), empty when outputs carry none. */
	prefixes: string[];
}

export function alignTokenKeys(
	tokenNames: readonly string[],
	outputNames: readonly string[],
): TokenKeyAlignment {
	const outputKeys = [...new Set(outputNames.map(nameKey))];
	const outputSet = new Set(outputKeys);
	const names = [...new Set(tokenNames)];
	const plain = new Map(names.map((n) => [n, nameKey(n)]));
	const prefixes = detectPrefixes(outputKeys, [...plain.values()]);
	const withPrefixes = (key: string | undefined): string[] =>
		key === undefined ? [] : [key, ...prefixes.map((p) => `${p}-${key}`)];
	const steps: ((name: string) => string[])[] = [
		(name) => [nameKey(name)],
		(name) => withPrefixes(baseKey(name)),
		(name) => withPrefixes(stemmed(name)),
	];

	const aligned = new Map<string, string>();
	const claimed = new Set<string>();
	for (const step of steps) {
		const wants = new Map<string, string[]>();
		for (const name of names) {
			if (aligned.has(name)) continue;
			const key = step(name).find((k) => outputSet.has(k) && !claimed.has(k));
			if (key === undefined) continue;
			wants.set(key, [...(wants.get(key) ?? []), name]);
		}
		for (const [key, claimants] of wants) {
			claimed.add(key);
			if (claimants.length === 1) aligned.set(claimants[0] as string, key);
		}
	}
	return {
		key: (tokenName) =>
			aligned.get(tokenName) ?? plain.get(tokenName) ?? nameKey(tokenName),
		prefixes,
	};
}
