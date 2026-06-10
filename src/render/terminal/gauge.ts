// M10.1 — single-line horizontal gauge (the terminal twin of the HTML donut).
// PURE string building. `<label> [████████░░] 78%` — the filled portion uses the
// shared proportional block builder, the remainder is light-shade `░`. Clamps to
// [0,100]. Color (when on) tints only the filled glyphs; the caller decides color
// once at the edge and threads the boolean.
import pc from "picocolors";
import { proportionalBar } from "./blocks.js";

const colors = pc.createColors(true);

/** The light-shade glyph filling the unmet portion of the meter. */
const EMPTY_CELL = "░";

export interface GaugeOptions {
	/** Optional left label (e.g. "System score"). */
	label?: string;
	/** Meter width in cells. */
	width: number;
	color: boolean;
}

/**
 * Render a 0–100 value as a single-line meter. The value is clamped to [0,100]
 * and rounded for display; the bar fills proportionally across `width` cells.
 */
export function renderGauge(value: number, opts: GaugeOptions): string {
	const v = Math.max(0, Math.min(100, value));
	const bar = proportionalBar(v / 100, opts.width);
	const filledCells = [...bar].length;
	const empty = EMPTY_CELL.repeat(Math.max(0, opts.width - filledCells));
	const filled = opts.color && bar.length > 0 ? colors.cyan(bar) : bar;
	const meter = `[${filled}${empty}]`;
	const pct = `${Math.round(v)}%`;
	return opts.label !== undefined && opts.label !== ""
		? `${opts.label} ${meter} ${pct}`
		: `${meter} ${pct}`;
}
