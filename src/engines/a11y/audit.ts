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
const FG_RE = /(^|[.\-/])(text|fg|foreground|on-[a-z0-9]+|on)([.\-/]|$)/i;
const BG_RE = /(^|[.\-/])(bg|background|surface|fill)([.\-/]|$)/i;

function isColor(token: Token): token is Token & { value: string } {
	return token.type === "color" && typeof token.value === "string";
}

/** Foreground role? `text`, `fg`, `foreground`, or any `on-*` segment. */
function isForegroundRole(name: string): boolean {
	return FG_RE.test(name);
}

/** Background role? `bg`, `background`, `surface`, or `fill`. */
function isBackgroundRole(name: string): boolean {
	return BG_RE.test(name);
}

function byName(a: { name: string }, b: { name: string }): number {
	return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * Discover foreground/background color pairings within a single mode's map.
 * Every foreground-role color token is paired with every background-role color
 * token (full cross product), deterministically ordered by foreground name then
 * background name. Non-color tokens are ignored.
 */
export function pairColorTokens(map: TokenMap): ColorPair[] {
	const colors = map.tokens.filter(isColor);
	const foregrounds = colors
		.filter((t) => isForegroundRole(t.name))
		.sort(byName);
	const backgrounds = colors
		.filter((t) => isBackgroundRole(t.name))
		.sort(byName);

	const pairs: ColorPair[] = [];
	for (const foreground of foregrounds) {
		for (const background of backgrounds) {
			if (foreground.name === background.name) continue;
			pairs.push({ foreground, background });
		}
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

	// Light background → darken the foreground; dark background → lighten it.
	const direction = bgLuminance > 0.5 ? -1 : 1;
	const baseL = base.l;

	for (let step = 0; step <= SUGGESTION_STEPS; step += 1) {
		const lightness = Math.min(
			1,
			Math.max(0, baseL + direction * (step / SUGGESTION_STEPS)),
		);
		// Spread the base Oklch color (hue + chroma preserved) and override only L.
		const candidate = formatHex(rgb({ ...base, l: lightness }));
		if (candidate === undefined) continue;
		const ratio = contrastRatio(candidate, bg);
		if (ratio !== undefined && ratio >= required) {
			return { kind: "adjusted", value: candidate };
		}
	}
	return { kind: "none" };
}

/** Audit one pair within one mode against the required ratio. */
function auditPair(
	mode: string,
	pair: ColorPair,
	level: ContrastLevel,
): ContrastFinding {
	const fgValue = pair.foreground.value as string;
	const bgValue = pair.background.value as string;
	// Token-level contrast is judged at the normal-text threshold (SPEC §11.2):
	// tokens carry no size metadata, so the stricter normal requirement applies.
	const required = requiredRatio(level, "normal");

	const ratio = contrastRatio(fgValue, bgValue);
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
		suggestion: suggestForeground(fgValue, bgValue, required),
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
		for (const pair of pairColorTokens(map)) {
			findings.push(auditPair(mode, pair, options.level));
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
