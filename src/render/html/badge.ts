// S5a — System-score badge SVG. Pure and deterministic: a flat, self-contained
// shields-style badge with a dark-neutral label segment and a value segment
// ("NN/100") whose fill band is chosen by the score. No DOM, no dates, no
// randomness, no measurement APIs — width is derived from character counts so
// output is reproducible for a given input. Band hex literals live here (the
// shared charts.ts module is deliberately not modified).

export interface BadgeInput {
	/** The system score; clamped to [0, 100] then half-up rounded for display. */
	score: number;
	/** Left-segment label; XML-escaped. Defaults to "ds-bridge". */
	label?: string;
}

const DEFAULT_LABEL = "ds-bridge";

// Dark neutral label-segment background. Distinct from every band color.
const LABEL_BG = "#404040";
const TEXT_COLOR = "#ffffff";

// Band fills, keyed by score thresholds (concrete hexes, matching the shared
// DEFAULT_PALETTE members but declared locally so charts.ts stays untouched).
const BAND_GREEN = "#16a34a"; // score >= 90
const BAND_AMBER = "#d97706"; // score >= 70 (and < 90)
const BAND_RED = "#dc2626"; // score < 70

// Deterministic, measurement-free text metrics: a fixed advance per character
// plus horizontal padding either side of each segment's text.
const CHAR_WIDTH = 7;
const SEGMENT_PADDING = 10;
const HEIGHT = 20;
const FONT_SIZE = 11;

/** Escape the five XML-significant characters so labels are safe in markup. */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function clamp(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/** Half-up rounding to an integer (Math.round is half-up for positives). */
function roundHalfUp(value: number): number {
	return Math.round(value);
}

/** Pick the band fill for a (display) score. */
function bandFill(score: number): string {
	if (score >= 90) return BAND_GREEN;
	if (score >= 70) return BAND_AMBER;
	return BAND_RED;
}

/** Deterministic segment width from a text's character count. */
function segmentWidth(text: string): number {
	return text.length * CHAR_WIDTH + SEGMENT_PADDING * 2;
}

/**
 * Render a flat, self-contained system-score badge SVG. The score is clamped to
 * [0, 100] and half-up rounded; the value segment "NN/100" is filled by band.
 */
export function renderBadge(input: BadgeInput): string {
	const label = input.label ?? DEFAULT_LABEL;
	const display = roundHalfUp(clamp(input.score, 0, 100));
	const valueText = `${display}/100`;
	const fill = bandFill(display);

	const labelW = segmentWidth(label);
	const valueW = segmentWidth(valueText);
	const totalW = labelW + valueW;

	const safeLabel = escapeXml(label);
	const safeValue = escapeXml(valueText);
	const title = `${label} system score: ${valueText}`;

	const labelMid = labelW / 2;
	const valueMid = labelW + valueW / 2;
	const textY = HEIGHT / 2 + FONT_SIZE / 2 - 2;

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${HEIGHT}" viewBox="0 0 ${totalW} ${HEIGHT}" role="img">`,
		`<title>${escapeXml(title)}</title>`,
		`<rect x="0" y="0" width="${labelW}" height="${HEIGHT}" fill="${LABEL_BG}" />`,
		`<rect x="${labelW}" y="0" width="${valueW}" height="${HEIGHT}" fill="${fill}" />`,
		`<text x="${labelMid}" y="${textY}" text-anchor="middle" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="${FONT_SIZE}">${safeLabel}</text>`,
		`<text x="${valueMid}" y="${textY}" text-anchor="middle" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="${FONT_SIZE}">${safeValue}</text>`,
		"</svg>",
	].join("");
}
