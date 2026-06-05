// T7.1 — WCAG 2.1 contrast engine. Pure: relative luminance (sRGB
// linearization), contrast ratio over culori-parsed colors, the AA/AAA
// threshold table, and a typed evaluation outcome. No I/O, no throws on bad
// input — unparseable colors surface as a typed outcome (SPEC §5).
import { parse, rgb } from "culori";

/** Conformance level per WCAG 2.1 success criterion 1.4.3 (AA) / 1.4.6 (AAA). */
export type ContrastLevel = "AA" | "AAA";

/**
 * Text size bucket. "large" = ≥18pt (or ≥14pt bold) per WCAG; it relaxes the
 * required ratio. The engine takes the caller's classification as given.
 */
export type TextSize = "normal" | "large";

/** Required contrast ratios by level + text size (WCAG 2.1). */
const THRESHOLDS: Record<ContrastLevel, Record<TextSize, number>> = {
	AA: { normal: 4.5, large: 3.0 },
	AAA: { normal: 7.0, large: 4.5 },
};

/** The minimum contrast ratio required for `level` at `size`. */
export function requiredRatio(level: ContrastLevel, size: TextSize): number {
	return THRESHOLDS[level][size];
}

/** Linearize one 0–1 sRGB channel per WCAG 2.1. */
function linearize(channel: number): number {
	return channel <= 0.04045
		? channel / 12.92
		: ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance of a color per WCAG 2.1, in [0, 1]. Returns undefined when
 * the value is not a parseable color. Alpha is ignored (contrast over an opaque
 * surface is the caller's pairing concern).
 */
export function relativeLuminance(color: string): number | undefined {
	const parsed = parse(color);
	if (parsed === undefined) return undefined;
	const srgb = rgb(parsed);
	if (srgb === undefined) return undefined;
	const r = linearize(srgb.r);
	const g = linearize(srgb.g);
	const b = linearize(srgb.b);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio between two colors, in [1, 21]. Symmetric in its
 * arguments. Returns undefined when either color is unparseable.
 */
export function contrastRatio(fg: string, bg: string): number | undefined {
	const lFg = relativeLuminance(fg);
	const lBg = relativeLuminance(bg);
	if (lFg === undefined || lBg === undefined) return undefined;
	const lighter = Math.max(lFg, lBg);
	const darker = Math.min(lFg, lBg);
	return (lighter + 0.05) / (darker + 0.05);
}

/** Typed outcome of evaluating a foreground/background pair at a level + size. */
export type ContrastEvaluation =
	| { kind: "evaluated"; ratio: number; required: number; passes: boolean }
	| { kind: "unparseable" };

/**
 * Evaluate a foreground/background pair against the WCAG threshold for `level`
 * at `size`. A pair passes when its ratio is at least the required ratio
 * (inclusive boundary). Unparseable colors yield a typed `unparseable` outcome.
 */
export function evaluateContrast(
	fg: string,
	bg: string,
	level: ContrastLevel,
	size: TextSize,
): ContrastEvaluation {
	const ratio = contrastRatio(fg, bg);
	if (ratio === undefined) return { kind: "unparseable" };
	const required = requiredRatio(level, size);
	return { kind: "evaluated", ratio, required, passes: ratio >= required };
}
