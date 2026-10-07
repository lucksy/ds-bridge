// M10.1 — shared unicode block glyphs + the sub-character proportional bar
// builder, extracted from bar-chart.ts so the gauge primitive reuses the exact
// same fill discipline. PURE string building, no color.

/** A full filled cell. */
export const FULL_BLOCK = "█";

/** Left-anchored partial blocks for 1..7 eighths of a cell (index 0 = empty). */
export const PARTIAL_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"] as const;

/**
 * Build a sub-character-precise bar for `fraction` (0..1) across `width` cells,
 * using full + partial unicode blocks. Negative/zero → empty; ≥1 → full width.
 */
export function proportionalBar(fraction: number, width: number): string {
	const eighths = Math.max(0, Math.round(fraction * width * 8));
	const fullCount = Math.min(Math.floor(eighths / 8), width);
	let bar = FULL_BLOCK.repeat(fullCount);
	const remainder = eighths % 8;
	if (fullCount < width && remainder > 0) {
		bar += PARTIAL_BLOCKS[remainder];
	}
	return bar;
}
