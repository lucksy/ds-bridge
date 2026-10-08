// T7.2 — token-pair contrast audit engine. Pure: discovers semantic
// foreground/background color pairings from a TokenMap via role heuristics on
// token paths, computes the WCAG ratio per pair per mode, and proposes a
// nearest-compliant suggestion for failing pairs by adjusting OKLCH lightness
// (hue/chroma preserved). Deterministic ordering, typed findings, no I/O.
import { formatHex, oklch, parse, rgb } from "culori";
import type { Token, TokenMap } from "../tokens/types.js";
import {
	type ContrastLevel,
	contrastRatio,
	relativeLuminance,
	requiredRatio,
} from "./contrast.js";

/** One mode's token map. The audit is mode-aware via an array of these. */
export interface ModeTokenMap {
	/** Mode/theme name, e.g. "light" / "dark". */
	mode: string;
	map: TokenMap;
}

/** A discovered foreground/background pairing of color tokens within a mode. */
export interface ColorPair {
	foreground: Token;
	background: Token;
}

export interface AuditOptions {
	level: ContrastLevel;
}

/** A concrete suggested foreground color, or why no suggestion was possible. */
export type Suggestion = { kind: "adjusted"; value: string } | { kind: "none" };

export type FindingStatus = "pass" | "fail" | "unparseable";

/** One audited pair within one mode. */
export interface ContrastFinding {
	mode: string;
	foreground: string;
	background: string;
	foregroundValue: string;
	backgroundValue: string;
	/** Computed WCAG ratio; undefined when a color was unparseable. */
	ratio?: number;
	required: number;
	status: FindingStatus;
	/** Present only on failing pairs that produced a compliant suggestion. */
	suggestion?: Suggestion;
}

export interface AuditSummary {
	total: number;
	passed: number;
	failed: number;
	/** Pairs whose colors could not be parsed (counted apart from pass/fail). */
	unparseable: number;
}

export interface AuditReport {
	level: ContrastLevel;
	findings: ContrastFinding[];
	summary: AuditSummary;
}

// Role heuristics over the last path segment(s). A token plays a foreground or
// background role based on tokens anywhere in its dot path.
const FG_RE =
	/(^|[.\-/])(text|fg|fgcolor|textcolor|foreground|on-[a-z0-9]+|on)([.\-/]|$)/i;
/** camelCase `onEmphasis` / `onInverse` (GitHub Primer). */
const ON_CAMEL_RE = /(^|[.\-/])on([A-Z][A-Za-z0-9]*)([.\-/]|$)/;
const BG_RE =
	/(^|[.\-/])(bg|bgcolor|background|backgroundcolor|surface|fill)([.\-/]|$)/i;
/** Segments that name a role, not what the color is for. */
const ROLE_SEGMENT =
	/^(?:text|fg|fgcolor|textcolor|foreground|on|bg|bgcolor|background|backgroundcolor|surface|fill|color|colors|sys|semantic)$/i;
/** Disabled / inactive states: exempt from contrast minimums (WCAG 1.4.3). */
function isExempt(name: string): boolean {
	return segmentsOf(name).some((s) => /^(?:disabled|inactive)$/i.test(s));
}

/** Foreground role segment → the background role words its counterpart may use. */
const ROLE_SWAP: Readonly<Record<string, readonly string[]>> = {
	fgcolor: ["bgcolor"],
	fg: ["bg"],
	text: ["bg", "background"],
	textcolor: ["bgcolor", "backgroundcolor"],
	foreground: ["background"],
};
/** Literal color names: such a token has no semantic surface to pair with. */
const LITERAL_SEGMENT = /^(?:white|black|transparent)$/i;
/** Strong surfaces carry on-X text (`fgColor.onEmphasis`), not role text. */
const STRONG_SURFACE = /^(?:emphasis|strong|solid|inverse)$/i;

function isColor(token: Token): token is Token & { value: string } {
	return token.type === "color" && typeof token.value === "string";
}

/** Foreground role? `text`, `fg`, `fgColor`, `foreground`, `on-*`, `onX`. */
function isForegroundRole(name: string): boolean {
	return FG_RE.test(name) || ON_CAMEL_RE.test(name);
}

/** Background role? `bg`, `background`, `surface`, or `fill`. */
function isBackgroundRole(name: string): boolean {
	return BG_RE.test(name);
}

function byName(a: { name: string }, b: { name: string }): number {
	return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * The surface a foreground token names, when its name says so: shadcn's
 * `primary-foreground` / `card.foreground` / `x-fg` → `primary` / `card` / `x`,
 * Material's `on-primary` → `primary` and `inverse-on-surface` →
 * `inverse-surface`. Undefined for role-only names
 * (`foreground`, `text.primary`).
 */
function namedSurface(name: string): string | undefined {
	const suffix = name.match(/^(.+)[.-](?:foreground|fg)$/i);
	if (suffix !== null) return suffix[1];
	const onPrefix = name.match(/^(.*?)(^|[./])on-([a-z0-9-]+)$/i);
	if (onPrefix !== null) return `${onPrefix[1]}${onPrefix[2]}${onPrefix[3]}`;
	const onInfix = name.match(/^(.*?)([a-z0-9]+)-on-([a-z0-9-]+)$/i);
	if (onInfix !== null) return `${onInfix[1]}${onInfix[2]}-${onInfix[3]}`;
	return undefined;
}

/** Name segments, collection markers dropped (`@color` → `color`). */
const segmentsOf = (name: string): string[] =>
	name.split(/[.\-/]/).map((s) => s.replace(/^[@$]/, ""));

/** A non-text foreground (an icon): held to WCAG 1.4.11, not 1.4.3. */
function isNonText(name: string): boolean {
	return segmentsOf(name).some((s) => /^(?:icon|icons|glyph)$/i.test(s));
}

/** Tone words: a role's light surfaces (`background.brand.tertiary`). */
const TONE_SEGMENT =
	/^(?:secondary|tertiary|subtle|muted|soft|light|weak|faint|quiet|minimal)$/i;

/** The X of a dash-form `on-X` foreground (`text.brand.on-brand` → brand). */
function onRoleOf(name: string): string | undefined {
	return name.match(/(?:^|[./])on-([a-z0-9]+)$/i)?.[1]?.toLowerCase();
}

/** The non-role words of a token name (`bgColor.accent.muted` → accent, muted). */
function wordsOf(name: string): string[] {
	return segmentsOf(name)
		.filter((s) => !ROLE_SEGMENT.test(s))
		.map((s) => s.toLowerCase());
}

/**
 * Discover foreground/background color pairings within a single mode's map —
 * the combinations the system renders, not the full cross product:
 *
 * 1. A foreground that names its surface pairs with it only: shadcn's
 *    `primary-foreground` ↔ `primary`, Material's `on-primary` ↔ `primary`.
 * 2. Counterparts pair with each other only — the same name with the role
 *    swapped: `button.danger.fgColor.rest` ↔ `button.danger.bgColor.rest`,
 *    `syntax.x.text` ↔ `syntax.x.bg`. A component's own foreground with no
 *    counterpart is not paired at all.
 * 3. camelCase on-X (`fgColor.onEmphasis`) pairs with surfaces naming X.
 * 4. Any other foreground pairs with the surfaces of its role — the first
 *    non-role word (`fgColor.accent` ↔ `bgColor.accent.muted`), never a strong surface
 *    (`*.emphasis`, which carries on-X text); with none, the default surfaces
 *    (`*.default`), else every surface it can reach.
 *
 * Literal colors (`fgColor.white`) are never paired. Ordered by foreground name, then background name. Non-color
 * tokens are ignored.
 */
export function pairColorTokens(map: TokenMap): ColorPair[] {
	const colors = map.tokens.filter(isColor);
	const byTokenName = new Map(colors.map((t) => [t.name, t]));
	// WCAG 1.4.3 exempts inactive UI: disabled states are not audited.
	const foregrounds = colors
		.filter((t) => isForegroundRole(t.name) && !isExempt(t.name))
		.sort(byName);
	const backgrounds = colors
		.filter((t) => isBackgroundRole(t.name) && !isForegroundRole(t.name))
		.sort(byName);
	const isLiteral = (t: Token) =>
		wordsOf(t.name).some((w) => LITERAL_SEGMENT.test(w));
	const backgroundByName = new Map(backgrounds.map((t) => [t.name, t]));
	/** The same name with its role swapped: `x.fgColor.rest` → `x.bgColor.rest`. */
	const siblingOf = (fg: Token): Token | undefined => {
		// Raw segments: the rebuilt name must keep collection markers (`@color`).
		const segments = fg.name.split(/[.\-/]/);
		const separators = fg.name.match(/[.\-/]/g) ?? [];
		for (let i = segments.length - 1; i >= 0; i--) {
			const swaps = ROLE_SWAP[(segments[i] as string).toLowerCase()];
			if (swaps === undefined) continue;
			for (const swap of swaps) {
				const cased =
					segments[i] === (segments[i] as string).toLowerCase()
						? swap
						: swap.replace(/color$/, "Color");
				const parts = [...segments];
				parts[i] = cased;
				const name = parts
					.map((p, k) => (k === 0 ? p : `${separators[k - 1]}${p}`))
					.join("");
				const hit = backgroundByName.get(name);
				if (hit !== undefined) return hit;
			}
		}
		return undefined;
	};
	const bgRoleIndex = (name: string): number =>
		segmentsOf(name).findIndex((s) => BG_RE.test(`.${s}.`));
	/** Index of the role segment: 0–1 is a global role, deeper a component's. */
	const roleIndex = (name: string): number =>
		segmentsOf(name).findIndex(
			(s) => FG_RE.test(`.${s}.`) || ON_CAMEL_RE.test(`.${s}.`),
		);
	const surfaces = backgrounds.filter((bg) => !isLiteral(bg));
	// Roles with on-X text (SDS `text.brand.on-brand`): their untoned surfaces
	// (`background.brand.default`, `.hover`) are strong and carry that text,
	// not the role's own text (`text.brand.default` is for its light tones).
	const onRoles = new Set(
		foregrounds.flatMap((f) => {
			const role = onRoleOf(f.name);
			return role === undefined ? [] : [role];
		}),
	);
	const isRoleStrong = (bg: Token): boolean => {
		const words = wordsOf(bg.name);
		return (
			words[0] !== undefined &&
			onRoles.has(words[0]) &&
			!words.some((w) => TONE_SEGMENT.test(w))
		);
	};
	const isStrong = (bg: Token): boolean =>
		wordsOf(bg.name).some((w) => STRONG_SURFACE.test(w)) || isRoleStrong(bg);

	const pairs: ColorPair[] = [];
	for (const foreground of foregrounds) {
		const surfaceName = namedSurface(foreground.name);
		const surface =
			surfaceName !== undefined ? byTokenName.get(surfaceName) : undefined;
		if (surface !== undefined) {
			pairs.push({ foreground, background: surface });
			continue;
		}
		if (isLiteral(foreground)) continue;
		const onRole = onRoleOf(foreground.name);
		if (onRole !== undefined) {
			const strong = surfaces.filter(
				(bg) => wordsOf(bg.name)[0] === onRole && isRoleStrong(bg),
			);
			for (const background of strong) pairs.push({ foreground, background });
			if (strong.length > 0) continue;
		}
		const sibling = siblingOf(foreground);
		if (sibling !== undefined && !isRoleStrong(sibling)) {
			pairs.push({ foreground, background: sibling });
			continue;
		}
		// A component's own foreground with no counterpart surface: nothing
		// names what it sits on, so no pairing is guessed.
		if (roleIndex(foreground.name) > 1) continue;
		const onWord = foreground.name.match(ON_CAMEL_RE)?.[2]?.toLowerCase();
		if (onWord !== undefined) {
			for (const background of surfaces) {
				if (wordsOf(background.name).includes(onWord)) {
					pairs.push({ foreground, background });
				}
			}
			continue;
		}
		const role = wordsOf(foreground.name)[0];
		// A global foreground (`fgColor.accent`) sits on global surfaces of any
		// depth; a namespaced one (`control.fgColor.placeholder`) on its
		// namespace's surfaces at the same depth (`control.bgColor.rest`).
		const fgIndex = roleIndex(foreground.name);
		const depth = segmentsOf(foreground.name).length;
		const namespace = segmentsOf(foreground.name)[0];
		const reachable = (bg: Token) => {
			const bgIndex = bgRoleIndex(bg.name);
			const bgSegments = segmentsOf(bg.name);
			if (fgIndex === 0) {
				// Global surfaces: `bgColor.*`, or under a namespace word (`color.bg.*`).
				return (
					bgIndex === 0 ||
					(bgIndex === 1 && ROLE_SEGMENT.test(bgSegments[0] as string))
				);
			}
			// A namespaced foreground: its own namespace's surfaces at its depth,
			// or the namespace's root surface (`header.bgColor`).
			return (
				bgSegments[0] === namespace &&
				(bgSegments.length === depth || bgSegments.length === 2)
			);
		};
		const plain = surfaces.filter(
			(bg) => bg.name !== foreground.name && reachable(bg) && !isStrong(bg),
		);
		// The first word is the role (`accent`, `muted`, `danger`); later ones are
		// tones (`bgColor.accent.muted` is an accent surface, not a muted one).
		const sharing =
			role === undefined
				? []
				: plain.filter((bg) => wordsOf(bg.name)[0] === role);
		const defaults = plain.filter((bg) => /(^|[.\-/])default$/i.test(bg.name));
		const chosen =
			sharing.length > 0 ? sharing : defaults.length > 0 ? defaults : plain;
		for (const background of chosen) pairs.push({ foreground, background });
	}
	return pairs;
}

/** Number of fine lightness steps scanned when searching for a suggestion. */
const SUGGESTION_STEPS = 1000;

/**
 * Find a nearest-compliant foreground by walking OKLCH lightness toward the
 * direction that increases contrast against `bg`, preserving hue and chroma,
 * until the required ratio is met. Returns the first compliant hex, or `none`
 * when even the lightness extreme cannot reach the ratio (e.g. high-chroma hue).
 */
function suggestForeground(
	fg: string,
	bg: string,
	required: number,
): Suggestion {
	const parsed = parse(fg);
	if (parsed === undefined) return { kind: "none" };
	const base = oklch(parsed);
	if (base === undefined) return { kind: "none" };
	const bgLuminance = relativeLuminance(bg);
	if (bgLuminance === undefined) return { kind: "none" };

	// Walk lightness both ways and keep the smallest change that passes: a
	// mid-tone surface (SDS's #ec221f red) can need darker text even though
	// it is not "light" (#fee9e7 on #ec221f fails, black passes at 4.8:1).
	const baseL = base.l;
	const preferred = bgLuminance > 0.5 ? -1 : 1;
	for (let step = 0; step <= SUGGESTION_STEPS; step += 1) {
		for (const direction of [preferred, -preferred]) {
			const lightness = baseL + direction * (step / SUGGESTION_STEPS);
			if (lightness < 0 || lightness > 1) continue;
			// Spread the base Oklch color (hue + chroma preserved) and override only L.
			const candidate = formatHex(rgb({ ...base, l: lightness }));
			if (candidate === undefined) continue;
			const ratio = contrastRatio(candidate, bg);
			if (ratio !== undefined && ratio >= required) {
				return { kind: "adjusted", value: candidate };
			}
		}
	}
	return { kind: "none" };
}

/** Audit one pair within one mode against the required ratio. */
/** `top` (possibly translucent) painted over the opaque `under`, as hex. */
function composite(top: string, under: string): string {
	const a = rgb(parse(top));
	const b = rgb(parse(under));
	if (a === undefined || b === undefined) return top;
	const alpha = a.alpha ?? 1;
	if (alpha >= 1) return top;
	return formatHex({
		mode: "rgb",
		r: a.r * alpha + b.r * (1 - alpha),
		g: a.g * alpha + b.g * (1 - alpha),
		b: a.b * alpha + b.b * (1 - alpha),
	});
}

/** The mode's opaque page surface (`bgColor.default`, `background`), else white. */
function pageSurface(map: TokenMap): string {
	const page = map.tokens
		.filter(isColor)
		.filter(
			(t) =>
				isBackgroundRole(t.name) &&
				/(^|[.\-/])(default|background)$/i.test(t.name) &&
				(rgb(parse(t.value))?.alpha ?? 1) >= 1,
		)
		.sort((a, b) => segmentsOf(a.name).length - segmentsOf(b.name).length)[0];
	return page?.value ?? "#ffffff";
}

function auditPair(
	mode: string,
	pair: ColorPair,
	level: ContrastLevel,
	page = "#ffffff",
): ContrastFinding {
	const fgValue = pair.foreground.value as string;
	const bgValue = pair.background.value as string;
	// Translucent colors render over what is beneath them: the surface over
	// the page, the text over that surface.
	const shownBg = composite(bgValue, page);
	const shownFg = composite(fgValue, shownBg);
	// Token-level contrast is judged at the normal-text threshold (SPEC §11.2):
	// tokens carry no size metadata, so the stricter normal requirement applies.
	// Icons are graphical objects: WCAG 1.4.11 asks 3:1 (AA) of them, the
	// large-text threshold, not the 4.5:1 of body text.
	const required = requiredRatio(
		level,
		isNonText(pair.foreground.name) ? "large" : "normal",
	);

	const ratio = contrastRatio(shownFg, shownBg);
	if (ratio === undefined) {
		return {
			mode,
			foreground: pair.foreground.name,
			background: pair.background.name,
			foregroundValue: fgValue,
			backgroundValue: bgValue,
			required,
			status: "unparseable",
		};
	}

	if (ratio >= required) {
		return {
			mode,
			foreground: pair.foreground.name,
			background: pair.background.name,
			foregroundValue: fgValue,
			backgroundValue: bgValue,
			ratio,
			required,
			status: "pass",
		};
	}

	return {
		mode,
		foreground: pair.foreground.name,
		background: pair.background.name,
		foregroundValue: fgValue,
		backgroundValue: bgValue,
		ratio,
		required,
		status: "fail",
		suggestion: suggestForeground(shownFg, shownBg, required),
	};
}

/**
 * Audit token-level WCAG contrast across one or more modes. For each mode, every
 * discovered foreground/background pairing is evaluated against the `level`
 * threshold; failing pairs receive a nearest-compliant OKLCH-lightness
 * suggestion. Findings are deterministically ordered by mode, then foreground,
 * then background. Pure — no I/O.
 */
export function auditContrast(
	modes: readonly ModeTokenMap[],
	options: AuditOptions,
): AuditReport {
	const findings: ContrastFinding[] = [];
	for (const { mode, map } of modes) {
		const page = pageSurface(map);
		for (const pair of pairColorTokens(map)) {
			findings.push(auditPair(mode, pair, options.level, page));
		}
	}

	findings.sort(
		(a, b) =>
			(a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0) ||
			(a.foreground < b.foreground
				? -1
				: a.foreground > b.foreground
					? 1
					: 0) ||
			(a.background < b.background ? -1 : a.background > b.background ? 1 : 0),
	);

	let passed = 0;
	let failed = 0;
	let unparseable = 0;
	for (const finding of findings) {
		if (finding.status === "pass") passed += 1;
		else if (finding.status === "fail") failed += 1;
		else unparseable += 1;
	}

	return {
		level: options.level,
		findings,
		summary: { total: findings.length, passed, failed, unparseable },
	};
}
