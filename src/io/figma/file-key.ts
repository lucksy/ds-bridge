// M1.3 — generalized `--file-key` resolution. A library/product command may
// target one of the N product files by RAW Figma file key OR by a
// `product_file_keys` alias (SPEC-personas §6.4). Pure, never throws: an unknown
// alias surfaces as a typed outcome carrying nearest-match suggestions (the same
// house style as the catalog/preset suggesters and config metric-key suggester).
//
// Precedence (SPEC-personas §6.4): `--file-key` value (alias-resolved, else
// treated as a raw key) > `figma_file_key` default. `figma_file_key` stays
// PRIVILEGED for stateful ops (registry build, impact's version cursor) — a
// product alias never drives those; that distinction lives in those commands,
// not here. This helper only resolves the per-run target.

/** Levenshtein edit distance — small, sufficient for a per-repo alias set. */
function editDistance(a: string, b: string): number {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const dist: number[] = Array.from({ length: rows * cols }, () => 0);
	for (let i = 0; i < rows; i++) {
		dist[i * cols] = i;
	}
	for (let j = 0; j < cols; j++) {
		dist[j] = j;
	}
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
			dist[i * cols + j] = Math.min(
				(dist[(i - 1) * cols + j] ?? 0) + 1,
				(dist[i * cols + j - 1] ?? 0) + 1,
				(dist[(i - 1) * cols + j - 1] ?? 0) + substitution,
			);
		}
	}
	return dist[rows * cols - 1] ?? 0;
}

/**
 * Nearest configured aliases for a user-supplied string: prefix matches rank
 * first, then ascending edit distance (alias declaration order breaks ties).
 * Case-insensitive. Nothing within distance 4 → no suggestions (better silent
 * than misleading). Mirrors `suggestArtifactIds`/`suggestTargetMetrics`.
 */
function suggestAliases(
	input: string,
	aliases: readonly string[],
	limit = 3,
): string[] {
	const needle = input.toLowerCase();
	const MAX_DISTANCE = 4;
	return aliases
		.map((alias, index) => ({
			alias,
			index,
			prefix: alias.toLowerCase().startsWith(needle),
			distance: editDistance(needle, alias.toLowerCase()),
		}))
		.filter((c) => c.prefix || c.distance <= MAX_DISTANCE)
		.sort(
			(a, b) =>
				Number(b.prefix) - Number(a.prefix) ||
				a.distance - b.distance ||
				a.index - b.index,
		)
		.slice(0, limit)
		.map((c) => c.alias);
}

/**
 * A value this length-and-shape is unambiguously a raw Figma file key, never an
 * alias miss. Figma file keys are ~22+ character alphanumeric strings (the
 * segment after /file/ or /design/ in a library URL); human aliases like
 * `checkout` are short kebab/snake words. The threshold keeps disambiguation
 * deterministic: long alnum → raw key; short non-alnum-shaped → attempted alias.
 */
const FIGMA_KEY_MIN_LENGTH = 22;
function looksLikeFigmaKey(value: string): boolean {
	return value.length >= FIGMA_KEY_MIN_LENGTH && /^[A-Za-z0-9]+$/.test(value);
}

/**
 * Normalize a user-supplied file-key value to a BARE Figma file key. Users
 * routinely paste a whole library URL; the REST API needs only the key segment
 * (`…/file/<key>/…`, `…/design/<key>/…`, also board/proto/slides) — anything else
 * (query string, file slug) is noise that yields a 404. A value that is not a
 * Figma URL is returned trimmed and unchanged, so a bare key OR a product alias
 * passes through untouched. Pure; never throws.
 */
export function extractFigmaFileKey(value: string): string {
	const trimmed = value.trim();
	const match = trimmed.match(
		/figma\.(?:com|site)\/(?:file|design|board|proto|slides)\/([A-Za-z0-9]+)/i,
	);
	return match?.[1] ?? trimmed;
}

/** What the caller passes; all sources injected so the helper stays pure. */
export interface ResolveFileKeyInput {
	/** The `--file-key` flag value, if the user passed one. */
	flagValue?: string;
	/** The alias→key map from `ResolvedConfig.productFileKeys` (M0.3). */
	productFileKeys: Record<string, string>;
	/** The `figma_file_key` default (the home library). */
	defaultKey?: string;
}

/** A typed, throw-free resolution outcome. */
export type ResolveFileKeyOutcome =
	| { kind: "ok"; key: string }
	| { kind: "unknown-alias"; alias: string; suggestions: string[] }
	| { kind: "missing" };

/**
 * Resolve the per-run file key from the flag, the product-alias map, and the
 * default. Logic:
 *  - No (or empty) `flagValue` → fall back to `defaultKey` (`ok` if set, else
 *    `missing`).
 *  - `flagValue` exactly an alias → its mapped key (`ok`).
 *  - `flagValue` not an alias → it is EITHER a raw key OR a typo'd alias:
 *      · figma-key-shaped (22+ alnum) OR no aliases configured → raw key (`ok`);
 *      · otherwise (aliases exist AND it looks like a word, not a key) → it was
 *        meant as an alias and missed → `unknown-alias` + nearest-match
 *        suggestions (which may be empty when nothing is close).
 * Never throws; never mutates its inputs.
 */
export function resolveFileKey(
	input: ResolveFileKeyInput,
): ResolveFileKeyOutcome {
	const { productFileKeys, defaultKey } = input;
	// A pasted library URL collapses to its bare key first; a bare key or an alias
	// word is untouched, so alias matching below still works.
	const flagValue =
		input.flagValue !== undefined
			? extractFigmaFileKey(input.flagValue)
			: undefined;

	if (flagValue === undefined || flagValue === "") {
		if (defaultKey !== undefined && defaultKey !== "") {
			return { kind: "ok", key: defaultKey };
		}
		return { kind: "missing" };
	}

	// Exact alias hit always wins.
	const mapped = Object.hasOwn(productFileKeys, flagValue)
		? productFileKeys[flagValue]
		: undefined;
	if (mapped !== undefined) {
		return { kind: "ok", key: mapped };
	}

	const aliases = Object.keys(productFileKeys);
	// A literal raw key: figma-shaped, or there is no alias set to mis-spell.
	if (aliases.length === 0 || looksLikeFigmaKey(flagValue)) {
		return { kind: "ok", key: flagValue };
	}

	// Aliases exist and the value reads like a word, not a key → it was meant as
	// an alias and missed. Surface a typed error with nearest-match suggestions.
	return {
		kind: "unknown-alias",
		alias: flagValue,
		suggestions: suggestAliases(flagValue, aliases),
	};
}
