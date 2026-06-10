// T1.7 — proportional unicode block bar chart. PURE string building.
import pc from "picocolors";
import { proportionalBar } from "./blocks.js";

const colors = pc.createColors(true);

export interface BarChartItem {
	label: string;
	value: number;
}

export interface BarChartOptions {
	/** Maximum bar width in characters. */
	width: number;
	color: boolean;
}

function displayWidth(value: string): number {
	return [...value].length;
}

/**
 * Render a horizontal bar chart. Bars are proportional to the largest value,
 * using full + partial unicode blocks for sub-character precision. Labels are
 * left-aligned to a common width; values are right-aligned. Zero and negative
 * values clamp to an empty bar. When `color` is on, the bar glyphs (only) are
 * wrapped in cyan ANSI codes.
 */
export function renderBarChart(
	items: BarChartItem[],
	opts: BarChartOptions,
): string {
	const labelWidth = Math.max(0, ...items.map((i) => displayWidth(i.label)));
	const valueStrings = items.map((i) => String(i.value));
	const valueWidth = Math.max(0, ...valueStrings.map((v) => v.length));
	const max = Math.max(0, ...items.map((i) => i.value));

	return items
		.map((item, index) => {
			const clamped = Math.max(0, item.value);
			const fraction = max > 0 ? clamped / max : 0;
			const bar = proportionalBar(fraction, opts.width);
			const renderedBar = opts.color && bar.length > 0 ? colors.cyan(bar) : bar;
			const label =
				item.label + " ".repeat(labelWidth - displayWidth(item.label));
			const value = (valueStrings[index] ?? "").padStart(valueWidth);
			return `${label} │${renderedBar} ${value}`;
		})
		.join("\n");
}
