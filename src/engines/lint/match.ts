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
import { type ExtractedLiteral, isRadiusProperty } from "./extract.js";

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
/** Near candidates considered before ranking (deltaE ignores alpha and role). */
const NEAR_SEARCH_LIMIT = 50;

/** The alpha of a canonical hex color (1 when opaque). */
function alphaOf(hex: string): number {
	const m = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(hex.trim());
	return m?.[1] === undefined ? 1 : Number.parseInt(m[1], 16) / 255;
}

/**
 * Among tokens that share an exact value, the one a linter should suggest:
 * first the token whose role fits the property (a text color for `color`, a
 * surface for `background`, a border for `border`), then a semantic alias
 * over the primitive it dereferences, a non-status role over a status one
 * (Material: on-primary and on-error are both white), and the more general
 * (shorter) name over a component-scoped one (`bgColor.default` over
 * `avatar.bgColor`). Ties keep the index order.
 */
function pickPreferred(
	tokens: readonly Token[],
	property?: string,
): Token | undefined {
	if (tokens.length === 0) return undefined;
	const role = propertyRole(property);
	const names = new Set(tokens.map((t) => t.name));
	const score = (t: Token): number[] => [
		roleScore(t.name, role),
		roleDepth(t.name, role),
		t.aliasOf !== undefined && names.has(t.aliasOf) ? 0 : 1,
		isStatusToken(t.name) ? 1 : 0,
		isDefaultVariant(t.name) ? 0 : 1,
		t.name.split(/[.\-/]/).length,
	];
	return tokens
		.map((token, order) => ({ token, key: [...score(token), order] }))
		.sort((a, b) => {
			for (let i = 0; i < a.key.length; i++) {
				const d = (a.key[i] as number) - (b.key[i] as number);
				if (d !== 0) return d;
			}
			return 0;
		})[0]?.token;
}

/**
 * How deep the role word sits: `bgColor.default` (0, a global family) ranks
 * ahead of `avatar.bgColor` (1, a component's own token).
 */
function roleDepth(name: string, role: Role | undefined): number {
	if (role === undefined) return 0;
	const re =
		role === "fg" ? FG_SEGMENT : role === "bg" ? BG_TOKEN : BORDER_TOKEN;
	const segments = name.split(/[.\-/]/);
	const at = segments.findIndex((s) => re.test(s));
	return at === -1 ? segments.length : at;
}

/** 0: the token's role fits the property · 1: neutral · 2: the opposite role. */
function roleScore(name: string, role: Role | undefined): number {
	if (role === undefined) return 1;
	const fg = isForegroundToken(name);
	if (role === "fg") return fg ? 0 : 2;
	if (fg) return 2;
	const fits = role === "bg" ? BG_TOKEN.test(name) : BORDER_TOKEN.test(name);
	return fits ? 0 : 1;
}

/**
 * A token of the default / neutral variant (`background.default.secondary`)
 * — the general choice over an accent (`background.brand.tertiary`) that
 * happens to share its value.
 */
function isDefaultVariant(name: string): boolean {
	return /(^|[.\-/])(?:default|neutral|base)([.\-/]|$)/i.test(name);
}

/** A token named for a status: error, danger, warning, success, destructive. */
function isStatusToken(name: string): boolean {
	return /(error|danger|warning|warn|success|destructive|critical)/i.test(name);
}

/**
 * The token family a dimension property means: spacing for padding / margin /
 * gap / insets, corners for border-radius, the type scale for font-size,
 * line-height and letter-spacing. Undefined when the property names none.
 */
function dimensionFamily(property: string | undefined): RegExp | undefined {
	if (property === undefined) return undefined;
	const p = property.toLowerCase();
	if (/radius/.test(p)) return /(radius|corner|rounded|shape)/i;
	if (/^font-?size$|^fontsize$/.test(p))
		return /(font-?size|typescale.*size|\.size$|text)/i;
	if (/line-?height/.test(p)) return /(line-?height|leading)/i;
	if (/letter-?spacing/.test(p)) return /(letter-?spacing|tracking)/i;
	if (
		/^(?:padding|margin|gap|row-?gap|column-?gap|inset|top|right|bottom|left)/.test(
			p.replace(/([a-z])([A-Z])/g, "$1-$2"),
		)
	) {
		return /(spacing|space|gap|gutter|padding|margin)/i;
	}
	return undefined;
}

type Role = "fg" | "bg" | "border";

/**
 * What a property paints: text (fg), a surface (bg) or an edge (border);
 * undefined when it is ambiguous (`fill`, `stroke` paint icons as often as
 * shapes). When several tokens share a value (shadcn: `chart-2` and
 * `muted-foreground` are both #737373), the role picks the one the author meant.
 */
function propertyRole(property: string | undefined): Role | undefined {
	if (property === undefined) return undefined;
	const p = property.replace(/-/g, "").toLowerCase();
	if (
		/^(?:color|caretcolor|textdecorationcolor|webkittextfillcolor)$/.test(p)
	) {
		return "fg";
	}
	if (/^(?:border|outline|columnrule)/.test(p)) return "border";
	if (/^(?:background|boxshadow)/.test(p)) return "bg";
	return undefined;
}

/**
 * A token named for text: `*-foreground`, `*.fg`, `text.*`, `on-*`, and the
 * camelCase forms large systems use (Primer's `fgColor.*`, `onEmphasis`).
 */
function isForegroundToken(name: string): boolean {
	return (
		/(^|[.\-/])(?:foreground|fg|fgcolor|text|textcolor|on-[a-z0-9]+|on)([.\-/]|$)/i.test(
			name,
		) || /(^|[.\-/])on[A-Z][A-Za-z]*([.\-/]|$)/.test(name)
	);
}

/** One name segment naming text (used for depth). */
const FG_SEGMENT =
	/^(?:foreground|fg|fgcolor|text|textcolor|on|on-[a-z0-9]+|on[A-Z][A-Za-z]*)$/i;

/** A token named for a surface: `bg`, `bgColor`, `background`, `surface`, `canvas`. */
const BG_TOKEN =
	/(^|[.\-/])(?:bg|bgcolor|background|backgroundcolor|surface|canvas)([.\-/]|$)/i;
/** A token named for an edge: `border`, `borderColor`, `outline`, `stroke`. */
const BORDER_TOKEN =
	/(^|[.\-/])(?:border|bordercolor|outline|stroke)([.\-/]|$)/i;

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

	// 1. Direct value hit on a simple color token — unless none of the hits is
	// a global token of the property's role and one is within reach: `color:
	// #cf222e` means the danger text color (fgColor.danger, #d1242f), not the
	// danger surface or a code-editor's keyword color with that exact value.
	const exact = index.byValue.get(canonical);
	if (exact !== undefined && exact.length > 0) {
		const role = propertyRole(literal.property);
		const fits = (t: Token) =>
			roleScore(t.name, role) === 0 && roleDepth(t.name, role) === 0;
		if (role !== undefined && !exact.some(fits)) {
			const inExact = new Set(exact.map((t) => t.name));
			const nearFit = index
				.nearest(canonical, { maxDeltaE: COLOR_NEAR_DELTA_E, limit: 50 })
				.filter((m) => !inExact.has(m.token.name) && fits(m.token))
				.map((m) => ({ token: m.token, distance: m.deltaE }))
				.slice(0, NEAR_LIMIT);
			if (nearFit.length > 0) return { kind: "near", candidates: nearFit };
		}
		const token = pickPreferred(exact, literal.property);
		if (token !== undefined) return { kind: "exact", token };
	}

	// 2. Composite token (shadow/typography) carrying this color in its object value.
	const composite = options?.compositeColors?.get(canonical);
	if (composite !== undefined && composite.length > 0) {
		const token = pickPreferred(composite);
		if (token !== undefined) return { kind: "exact", token };
	}

	// 3. Nearest simple color tokens within the deltaE threshold. DeltaE
	// ignores alpha and a large system has many tokens at one hue (Primer:
	// `ansi.black`, `base.color.black`, `borderColor.translucent`), so search
	// wide and rank like an exact hit: the property's role, global before
	// component, the literal's alpha, then distance.
	const near = index.nearest(canonical, {
		maxDeltaE: COLOR_NEAR_DELTA_E,
		limit: NEAR_SEARCH_LIMIT,
	});
	if (near.length === 0) return { kind: "off-system" };

	const role = propertyRole(literal.property);
	const alpha = alphaOf(canonical);
	const key = (m: (typeof near)[number]): number[] => [
		roleScore(m.token.name, role),
		roleDepth(m.token.name, role),
		Math.abs(alphaOf(String(m.token.value)) - alpha) > 0.02 ? 1 : 0,
		m.deltaE,
		aliasRank(m.token),
	];
	const candidates: MatchCandidate[] = near
		.map((m) => ({ m, k: key(m) }))
		.sort((a, b) => {
			for (let i = 0; i < a.k.length; i++) {
				const d = (a.k[i] as number) - (b.k[i] as number);
				if (d !== 0) return d;
			}
			return 0;
		})
		.map(({ m }) => ({ token: m.token, distance: m.deltaE }))
		.slice(0, NEAR_LIMIT);

	return { kind: "near", candidates };
}

const familyCache = new WeakMap<TokenIndex, Map<string, boolean>>();

/** Whether the token set has any dimension token of `family`. Cached per index. */
function setHasFamily(index: TokenIndex, family: RegExp): boolean {
	let byFamily = familyCache.get(index);
	if (byFamily === undefined) {
		byFamily = new Map();
		familyCache.set(index, byFamily);
	}
	const cached = byFamily.get(family.source);
	if (cached !== undefined) return cached;
	let found = false;
	for (const token of index.byName.values()) {
		if (token.type === "dimension" && family.test(token.name)) {
			found = true;
			break;
		}
	}
	byFamily.set(family.source, found);
	return found;
}

/**
 * Among dimension tokens sharing a value: the general spacing scale
 * (`space.lg`) first — a property-named token is often a component's own
 * (`overlay.padding.normal`) — then the one named for the property
 * (`stack.padding.*`, `*.gap.*`), then the shortest name; ties keep order.
 */
function pickDimension(
	tokens: readonly Token[],
	property: string | undefined,
): Token | undefined {
	const word = (property ?? "")
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.toLowerCase()
		.match(/^(padding|margin|gap|row-gap|column-gap)/)?.[1]
		?.replace(/^(row|column)-/, "");
	const has = (name: string, re: RegExp) => (re.test(name) ? 0 : 1);
	const named =
		word === undefined ? undefined : new RegExp(`(^|[.\\-/])${word}`, "i");
	const key = (t: Token): number[] => [
		has(t.name, /(^|[.\-/])(?:space|spacing)([.\-/]|$)/i),
		named === undefined ? 0 : has(t.name, named),
		t.name.split(/[.\-/]/).length,
	];
	return tokens
		.map((token, order) => ({ token, k: [...key(token), order] }))
		.sort((a, b) => {
			for (let i = 0; i < a.k.length; i++) {
				const d = (a.k[i] as number) - (b.k[i] as number);
				if (d !== 0) return d;
			}
			return 0;
		})[0]?.token;
}

function matchDimension(
	literal: ExtractedLiteral,
	index: TokenIndex,
): LiteralMatch {
	const dim = normalizeDimension(stripQuotes(literal.raw));
	if (dim === undefined) return { kind: "off-system" };

	// The property's token family (spacing for padding, corners for radius…).
	// When the set has that family, only its tokens are suggested: a spacing
	// token is never the fix for a radius. Without one, any dimension token is.
	const family = dimensionFamily(literal.property);
	const inFamily =
		family !== undefined && setHasFamily(index, family)
			? (token: Token) => family.test(token.name)
			: () => true;

	// 1. Exact px hit. Only dimension tokens produce `${px}px` value keys.
	const bucket = index.byValue.get(`${dim.px}px`);
	if (bucket !== undefined) {
		const exact = pickDimension(
			bucket.filter((t) => t.type === "dimension" && inFamily(t)),
			literal.property,
		);
		if (exact !== undefined) return { kind: "exact", token: exact };
	}

	// 2. Nearest dimension tokens within the abs-px threshold.
	const candidates: MatchCandidate[] = [];
	for (const token of index.byName.values()) {
		if (token.type !== "dimension" || !inFamily(token)) continue;
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
/** A dimension token naming a corner radius (`radius.md`, `shape.corner.small`). */
const RADIUS_TOKEN = /(radius|corner|rounded)/i;

const radiusScaleCache = new WeakMap<TokenIndex, boolean>();

/** Whether the token set defines a radius / corner scale. Cached per index. */
function hasRadiusScale(index: TokenIndex): boolean {
	const cached = radiusScaleCache.get(index);
	if (cached !== undefined) return cached;
	let found = false;
	for (const token of index.byName.values()) {
		if (token.type === "dimension" && RADIUS_TOKEN.test(token.name)) {
			found = true;
			break;
		}
	}
	radiusScaleCache.set(index, found);
	return found;
}

/**
 * Whether a literal belongs in the lint report for this token set. Radius
 * literals are reported only when the system has a radius scale to point them
 * at — otherwise every corner would be an off-system finding no token can fix.
 */
export function isLintable(
	literal: ExtractedLiteral,
	index: TokenIndex,
): boolean {
	if (literal.valueKind !== "dimension") return true;
	if (!isRadiusProperty(literal.property)) return true;
	return hasRadiusScale(index);
}

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
