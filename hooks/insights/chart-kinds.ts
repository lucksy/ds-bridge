// Which chart a piece of data gets. One rule set for both surfaces, so the
// terminal and the Desktop app always show the same kind of chart.
import type { InsightChart, InsightChartKind } from "../../types";

/** A kind the renderers draw: everything but `auto`. */
export type DrawnKind = Exclude<InsightChartKind, "auto">;

/** Parts of a whole beyond this many read better as a ranked bar. */
export const MAX_SHARE_PARTS = 6;

function hasSeries(chart: InsightChart): boolean {
	return (chart.series ?? []).some((s) => s.points.length > 0);
}

function hasMatrix(chart: InsightChart): boolean {
	const m = chart.matrix;
	return m !== undefined && m.rows.length > 0 && m.columns.length > 0;
}

/** The chart's values as percentages that add up to about a whole. */
function isWholeInPercent(chart: InsightChart): boolean {
	if (chart.unit !== "%" || chart.items.length < 2) return false;
	const sum = chart.items.reduce((total, item) => total + item.value, 0);
	return Math.abs(sum - 100) <= 1;
}

/**
 * The kind to draw. An explicit kind is kept when its data is present and
 * falls back to the closest kind that fits when it isn't (a `line` without
 * series becomes a `bar`). `auto` reads the data's shape:
 *
 * - a matrix → `heatmap`
 * - series over time → `line`
 * - a single `value` → `gauge`
 * - 2–6 parts that add up to 100 % → `share`
 * - anything else → `bar`
 *
 * A `share` with more than six parts is drawn as a `bar`: thin slices and
 * one-cell waffle squares can't be read.
 */
export function resolveKind(chart: InsightChart): DrawnKind {
	const fits = (kind: DrawnKind): boolean => {
		switch (kind) {
			case "heatmap":
				return hasMatrix(chart);
			case "line":
				return hasSeries(chart);
			case "gauge":
				return chart.value !== undefined && Number.isFinite(chart.value);
			case "share":
				return (
					chart.items.filter((i) => i.value > 0).length >= 2 &&
					chart.items.length <= MAX_SHARE_PARTS
				);
			case "bar":
				return true;
		}
	};
	if (chart.kind !== "auto") {
		if (fits(chart.kind)) return chart.kind;
		if (chart.kind === "share") return "bar";
	}
	if (hasMatrix(chart)) return "heatmap";
	if (hasSeries(chart)) return "line";
	if (fits("gauge")) return "gauge";
	if (isWholeInPercent(chart) && fits("share")) return "share";
	return "bar";
}

/** The gauge's reading as a 0–1 fraction of its scale, clamped. */
export function gaugeFraction(chart: InsightChart): number {
	const max = chart.max !== undefined && chart.max > 0 ? chart.max : 100;
	const value = chart.value ?? 0;
	return Math.min(1, Math.max(0, value / max));
}
