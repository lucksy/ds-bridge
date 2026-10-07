// T2.3 — token matcher for the lint engine (PURE: no fs/network/process).
// Given an ExtractedLiteral (T2.2) and a TokenIndex (T1.5), decide whether the
// literal is on-system (exact token), close to one (near, with ranked
// candidates), or off-system. Colors compare on canonical hex; dimensions on
// canonical px. Composite tokens (shadow/typography) carry their colors inside
// an object value and are not in `byValue` under that inner color, so a
// dedicated lookup (buildCompositeColorLookup) backstops color exact-matching.
// Never throws; bad input degrades to off-system.

import { normalizeColor, normalizeDimension } from "../tokens/normalize.js";
import type { TokenIndex } from "../tokens/token-index.js";
import type { Token } from "../tokens/types.js";
import type { ExtractedLiteral } from "./extract.js";

/** A scored candidate token for a near match (deltaE for colors, abs px for dimensions). */
export interface MatchCandidate {
	token: Token;
	distance: number;
}

/** Outcome of matching one literal against the token system. */
export type LiteralMatch =
	| { kind: "exact"; token: Token }
	| { kind: "near"; candidates: MatchCandidate[] }
	| { kind: "off-system" };

export interface MatchOptions {
	/** Canonical inner color → composite tokens (shadow/typography) carrying it. */
	compositeColors?: Map<string, Token[]>;
}

/** CIEDE2000 threshold for a color "near" match. */
const COLOR_NEAR_DELTA_E = 2.5;
/** Absolute px threshold for a dimension "near" match. */
const DIMENSION_NEAR_PX = 1;
/** Max candidates surfaced for a near match. */
const NEAR_LIMIT = 3;

/**
 * Among tokens that share an exact value, prefer the semantic alias (a token
 * whose `aliasOf` points at another token in the same group) over the primitive
 * it dereferences — that is the token a linter should suggest. Falls back to the
 * first token when no alias is present.
 */
function pickPreferred(
	tokens: readonly Token[],
	property?: string,
): Token | undefined {
	if (tokens.length === 0) return undefined;
	const role = propertyRole(property);
	const candidates =
		role === undefined
			? tokens
			: tokens.filter((t) => isForegroundToken(t.name) === (role === "fg"));
	const pool = candidates.length > 0 ? candidates : tokens;
	const names = new Set(tokens.map((t) => t.name));
	const semantic = pool.find(
		(t) => t.aliasOf !== undefined && names.has(t.aliasOf),
	);
	return semantic ?? pool[0];
}

/**
 * Whether a property paints text (fg) or a surface (bg); undefined when it is
 * neither or ambiguous (`fill`, `stroke` paint icons as often as shapes). When
 * several tokens share a value (shadcn: `chart-2` and `muted-foreground` are
 * both #737373), the role picks the one the author meant.
 */
function propertyRole(property: string | undefined): "fg" | "bg" | undefined {
	if (property === undefined) return undefined;
	const p = property.replace(/-/g, "").toLowerCase();
	if (
		/^(?:color|caretcolor|textdecorationcolor|webkittextfillcolor)$/.test(p)
	) {
		return "fg";
	}
	if (/^(?:background|border|outline|boxshadow|columnrule)/.test(p)) {
		return "bg";
	}
	return undefined;
}

/** A token named for text: `*-foreground`, `*.fg`, `text.*`, `on-*`. */
function isForegroundToken(name: string): boolean {
	return /(^|[.\-/])(?:foreground|fg|text|on-[a-z0-9]+|on)([.\-/]|$)/i.test(
		name,
	);
}

/** Stable secondary ordering: alias-bearing (semantic) tokens rank ahead of primitives. */
function aliasRank(token: Token): number {
	return token.aliasOf !== undefined ? 0 : 1;
}

/**
 * Strip a single layer of matching surrounding quotes. JSX style-object color
 * literals are captured with their quotes (e.g. `"#3b82f6"`); CSS literals are
 * bare. Returns the input unchanged when it is not quote-wrapped.
 */
function stripQuotes(raw: string): string {
	const trimmed = raw.trim();
	const quote = trimmed[0];
	if (
		trimmed.length >= 2 &&
		(quote === '"' || quote === "'") &&
		trimmed[trimmed.length - 1] === quote
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function matchColor(
	literal: ExtractedLiteral,
	index: TokenIndex,
	options: MatchOptions | undefined,
): LiteralMatch {
	const canonical = normalizeColor(stripQuotes(literal.raw));
	if (canonical === undefined) return { kind: "off-system" };

	// 1. Direct value hit on a simple color token.
	const exact = index.byValue.get(canonical);
	if (exact !== undefined && exact.length > 0) {
		const token = pickPreferred(exact, literal.property);
		if (token !== undefined) return { kind: "exact", token };
	}

	// 2. Composite token (shadow/typography) carrying this color in its object value.
	const composite = options?.compositeColors?.get(canonical);
	if (composite !== undefined && composite.length > 0) {
		const token = pickPreferred(composite);
		if (token !== undefined) return { kind: "exact", token };
	}

	// 3. Nearest simple color tokens within the deltaE threshold.
	const near = index.nearest(canonical, {
		maxDeltaE: COLOR_NEAR_DELTA_E,
		limit: NEAR_LIMIT,
	});
	if (near.length === 0) return { kind: "off-system" };

	// nearest() already sorts ascending deltaE; re-rank ties so the semantic
	// alias surfaces ahead of the primitive while preserving distance order.
	const candidates: MatchCandidate[] = near
		.map((m) => ({ token: m.token, distance: m.deltaE }))
		.sort((a, b) =>
			a.distance !== b.distance
				? a.distance - b.distance
				: aliasRank(a.token) - aliasRank(b.token),
		)
		.slice(0, NEAR_LIMIT);

	return { kind: "near", candidates };
}

function matchDimension(
	literal: ExtractedLiteral,
	index: TokenIndex,
): LiteralMatch {
	const dim = normalizeDimension(stripQuotes(literal.raw));
	if (dim === undefined) return { kind: "off-system" };

	// 1. Exact px hit. Only dimension tokens produce `${px}px` value keys.
	const bucket = index.byValue.get(`${dim.px}px`);
	if (bucket !== undefined) {
		const exact = bucket.find((t) => t.type === "dimension");
		if (exact !== undefined) return { kind: "exact", token: exact };
	}

	// 2. Nearest dimension tokens within the abs-px threshold.
	const candidates: MatchCandidate[] = [];
	for (const token of index.byName.values()) {
		if (token.type !== "dimension") continue;
		const tokenDim = normalizeDimension(
			typeof token.value === "number" || typeof token.value === "string"
				? token.value
				: Number.NaN,
		);
		if (tokenDim === undefined) continue;
		const distance = Math.abs(dim.px - tokenDim.px);
		if (distance === 0 || distance > DIMENSION_NEAR_PX) continue;
		candidates.push({ token, distance });
	}
	if (candidates.length === 0) return { kind: "off-system" };

	candidates.sort((a, b) =>
		a.distance !== b.distance
			? a.distance - b.distance
			: a.token.name < b.token.name
				? -1
				: a.token.name > b.token.name
					? 1
					: 0,
	);

	return { kind: "near", candidates: candidates.slice(0, NEAR_LIMIT) };
}

/**
 * Match a single extracted literal against the token system. Colors resolve on
 * canonical hex (with a composite-color backstop); dimensions on canonical px.
 * Exact always wins over near; nothing close enough is off-system.
 */
export function matchLiteral(
	literal: ExtractedLiteral,
	index: TokenIndex,
	options?: MatchOptions,
): LiteralMatch {
	return literal.valueKind === "color"
		? matchColor(literal, index, options)
		: matchDimension(literal, index);
}

/**
 * Build a canonical-color → composite-token(s) lookup. A composite token has an
 * object value (shadow/typography); its inner `color` field (if present and a
 * parseable color) is normalized and used as the key. Simple color/dimension
 * tokens are excluded — they already live in TokenIndex.byValue.
 */
export function buildCompositeColorLookup(
	tokens: readonly Token[],
): Map<string, Token[]> {
	const lookup = new Map<string, Token[]>();
	for (const token of tokens) {
		const { value } = token;
		if (typeof value !== "object" || value === null) continue;
		const inner = (value as Record<string, unknown>).color;
		if (typeof inner !== "string") continue;
		const canonical = normalizeColor(inner);
		if (canonical === undefined) continue;
		const bucket = lookup.get(canonical);
		if (bucket === undefined) {
			lookup.set(canonical, [token]);
		} else {
			bucket.push(token);
		}
	}
	return lookup;
}
