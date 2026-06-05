// T1.5 — TokenIndex: fast lookups for the lint/diff engines.
import { differenceCiede2000, parse } from "culori";
import { normalizeColor, normalizeDimension } from "./normalize.js";
import type { Token } from "./types.js";

export interface NearestOptions {
	/** Maximum CIEDE2000 distance to count as "near". */
	maxDeltaE: number;
	limit: number;
}

export interface NearMatch {
	token: Token;
	deltaE: number;
}

export interface TokenIndex {
	/** Canonical name → token. */
	byName: ReadonlyMap<string, Token>;
	/** Canonical value (color hex / px form / stringified number) → tokens. */
	byValue: ReadonlyMap<string, Token[]>;
	/** Closest color tokens to a query color, ascending deltaE. */
	nearest(rawColor: string, options: NearestOptions): NearMatch[];
}

/** Canonical comparable key for a token value, or undefined when not indexable. */
function canonicalValueKey(token: Token): string | undefined {
	const { value } = token;
	if (typeof value === "number") {
		const dim = normalizeDimension(value);
		return token.type === "dimension" && dim !== undefined
			? `${dim.px}px`
			: String(value);
	}
	if (typeof value !== "string") return undefined; // composites indexed by name only
	const color = normalizeColor(value);
	if (color !== undefined) return color;
	const dim = normalizeDimension(value);
	if (dim !== undefined) return `${dim.px}px`;
	return value;
}

const deltaE2000 = differenceCiede2000();

export function buildTokenIndex(tokens: readonly Token[]): TokenIndex {
	const byName = new Map<string, Token>();
	const byValue = new Map<string, Token[]>();
	const colorTokens: {
		token: Token;
		parsed: NonNullable<ReturnType<typeof parse>>;
	}[] = [];

	for (const token of tokens) {
		byName.set(token.name, token);
		const key = canonicalValueKey(token);
		if (key !== undefined) {
			const bucket = byValue.get(key);
			if (bucket === undefined) {
				byValue.set(key, [token]);
			} else {
				bucket.push(token);
			}
		}
		if (token.type === "color" && typeof token.value === "string") {
			const parsed = parse(token.value);
			if (parsed !== undefined) colorTokens.push({ token, parsed });
		}
	}

	return {
		byName,
		byValue,
		nearest(rawColor, options) {
			const query = parse(rawColor);
			if (query === undefined) return [];
			return colorTokens
				.map(({ token, parsed }) => ({
					token,
					deltaE: deltaE2000(query, parsed),
				}))
				.filter((match) => match.deltaE <= options.maxDeltaE)
				.sort((a, b) => a.deltaE - b.deltaE)
				.slice(0, options.limit);
		},
	};
}
