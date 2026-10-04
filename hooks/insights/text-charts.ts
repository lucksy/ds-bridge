// The insights pane's terminal charts. Each chart's kind comes from
// chart-kinds.ts; bars are drawn the way ds-bridge's own CLI draws them (a solid
// proportional bar over a light-shade `░` track, then the count and, for the
// parts of a whole, the percent), and the richer kinds are grids of coloured
// cells from cell-grid.ts. `terminalChart` says what to draw; the pane draws
// it, and `reportText` writes the same thing as plain text for the transcript.
import { proportionalBar } from "../../src/render/terminal/blocks.js";
import type { InsightChart, InsightItem, InsightReport } from "../../types";
import {
	brailleLine,
	type Grid,
	gridText,
	heatmapGrid,
	waffleGrid,
} from "./cell-grid.js";
import { type DrawnKind, gaugeFraction, resolveKind } from "./chart-kinds.js";
import {
	type ChartStyle,
	DEFAULT_STYLE,
	paletteColor,
	TERMINAL_TONE_COLORS,
} from "./palette.js";

const TRACK = "░";

export function formatValue(value: number, unit?: string): string {
	const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
	if (!unit) return text;
	return unit === "%" ? `${text}%` : `${text} ${unit}`;
}

export function clip(text: string, width: number): string {
	if (text.length <= width) return text.padEnd(width);
	return `${text.slice(0, Math.max(0, width - 1))}…`;
}

/** The items worth drawing: positive values, largest first, the tail folded into "other". */
export function topItems(
	items: readonly InsightItem[],
	limit = 8,
): InsightItem[] {
	const sorted = items
		.filter((i) => i.value > 0)
		.sort((a, b) => b.value - a.value);
	if (sorted.length <= limit) return sorted;
	const rest = sorted.slice(limit - 1).reduce((sum, i) => sum + i.value, 0);
	return [...sorted.slice(0, limit - 1), { label: "other", value: rest }];
}

/** A bar `cells` wide: the filled part, then the `░` track that pads it to the full width. */
export function trackBar(
	fraction: number,
	cells: number,
): { fill: string; track: string } {
	const fill = proportionalBar(Math.min(1, Math.max(0, fraction)), cells);
	return { fill, track: TRACK.repeat(Math.max(0, cells - [...fill].length)) };
}

/** An item's colour: its tone if it has one, else the palette's `n`th colour. */
export function itemColor(
	item: InsightItem,
	n: number,
	style: ChartStyle,
): string {
	return item.tone ? TERMINAL_TONE_COLORS[item.tone] : paletteColor(style, n);
}

export type BarRow = {
	label: string;
	fill: string;
	track: string;
	value: string;
	/** The share of the whole, on the parts of a whole; empty otherwise. */
	percent: string;
	color: string;
};

/**
 * One row per item. Bars scale to the largest value, or for the parts of a whole
 * to the total, so a share row's bar is its share.
 */
export function barRows(
	chart: InsightChart,
	columns: number,
	style: ChartStyle = DEFAULT_STYLE,
	asShare = chart.kind === "share",
): BarRow[] {
	const items = topItems(chart.items, asShare ? 6 : 8);
	const total = items.reduce((sum, i) => sum + i.value, 0);
	const scale = asShare ? total : Math.max(0, ...items.map((i) => i.value));
	const labelWidth = Math.min(
		22,
		Math.max(6, ...items.map((i) => i.label.length)),
	);
	const values = items.map((i) => formatValue(i.value, chart.unit));
	const valueWidth = Math.max(1, ...values.map((v) => v.length));
	const percentWidth = asShare ? 5 : 0;
	const cells = Math.max(
		6,
		Math.min(32, columns - labelWidth - valueWidth - percentWidth - 4),
	);
	return items.map((item, n) => {
		const { fill, track } = trackBar(scale > 0 ? item.value / scale : 0, cells);
		return {
			label: clip(item.label, labelWidth),
			fill,
			track,
			value: (values[n] ?? "").padStart(valueWidth),
			percent:
				asShare && total > 0
					? `${Math.round((item.value / total) * 100)}%`.padStart(4)
					: "",
			color: itemColor(item, n, style),
		};
	});
}

/** A colour key: a swatch, the label and, where there is one, the figure. */
export type LegendEntry = { label: string; detail: string; color: string };

/** What the terminal draws for one chart, by kind. */
export type TerminalChart =
	| { kind: "bar"; rows: BarRow[] }
	| { kind: "share"; grid: Grid; legend: LegendEntry[] }
	| { kind: "line"; grid: Grid; legend: LegendEntry[] }
	| { kind: "heatmap"; grid: Grid }
	| { kind: "gauge"; row: BarRow }
	| { kind: "empty" };

function isEmpty(chart: InsightChart, kind: DrawnKind): boolean {
	switch (kind) {
		case "line":
			return !(chart.series ?? []).some((s) => s.points.length > 0);
		case "heatmap":
			return !chart.matrix || chart.matrix.rows.length === 0;
		case "gauge":
			return chart.value === undefined;
		default:
			return topItems(chart.items).length === 0;
	}
}

/** The chart, drawn for a terminal `columns` wide. */
export function terminalChart(
	chart: InsightChart,
	columns: number,
	style: ChartStyle = DEFAULT_STYLE,
): TerminalChart {
	const kind = resolveKind(chart);
	if (isEmpty(chart, kind)) return { kind: "empty" };
	switch (kind) {
		case "share": {
			const items = topItems(chart.items, 6);
			const colors = items.map((item, n) => itemColor(item, n, style));
			const { grid, counts } = waffleGrid(
				items,
				colors,
				Math.min(25, Math.max(10, Math.floor((columns - 2) / 2))),
			);
			return {
				kind: "share",
				grid,
				legend: items.map((item, n) => ({
					label: item.label,
					detail: `${counts[n] ?? 0}% · ${formatValue(item.value, chart.unit)}`,
					color: colors[n] ?? paletteColor(style, n),
				})),
			};
		}
		case "line": {
			const series = (chart.series ?? []).filter((s) => s.points.length > 0);
			const colors = series.map((_, n) => paletteColor(style, n));
			return {
				kind: "line",
				grid: brailleLine(series, colors, Math.max(24, columns - 2)),
				legend: series.map((s, n) => {
					const last = s.points[s.points.length - 1]?.y;
					return {
						label: s.label,
						detail:
							last === undefined
								? ""
								: `latest ${formatValue(last, chart.unit)}`,
						color: colors[n] ?? paletteColor(style, n),
					};
				}),
			};
		}
		case "heatmap": {
			const m = chart.matrix;
			if (!m) return { kind: "empty" };
			const cellWidth = Math.max(
				4,
				Math.min(7, Math.floor((columns - 14) / Math.max(1, m.columns.length))),
			);
			return {
				kind: "heatmap",
				grid: heatmapGrid(m, cellWidth, "#2b2b30", paletteColor(style, 0)),
			};
		}
		case "gauge": {
			const fraction = gaugeFraction(chart);
			const cells = Math.max(10, Math.min(40, columns - 14));
			const { fill, track } = trackBar(fraction, cells);
			const tone = fraction >= 0.8 ? "ok" : fraction >= 0.5 ? "warn" : "error";
			return {
				kind: "gauge",
				row: {
					label: "",
					fill,
					track,
					value: formatValue(
						chart.value ?? 0,
						chart.unit ?? (chart.max === undefined ? "%" : undefined),
					),
					percent:
						chart.max !== undefined
							? `of ${formatValue(chart.max, chart.unit)}`
							: "",
					color: TERMINAL_TONE_COLORS[tone],
				},
			};
		}
		default:
			return { kind: "bar", rows: barRows(chart, columns, style, false) };
	}
}

function legendText(legend: readonly LegendEntry[]): string[] {
	return legend.map(
		(entry) => `  ■ ${entry.label}${entry.detail ? `  ${entry.detail}` : ""}`,
	);
}

const indent = (block: string) => block.split("\n").map((line) => `  ${line}`);

/** The report as plain text, for the transcript and for surfaces that draw no pane. */
export function reportText(
	report: InsightReport,
	columns = 60,
	style: ChartStyle = DEFAULT_STYLE,
): string {
	const lines: string[] = [report.title];
	if (report.subtitle) lines.push(report.subtitle);
	if (report.stats.length > 0) {
		lines.push(
			"",
			report.stats.map((s) => `${s.label}: ${s.value}`).join(" · "),
		);
	}
	for (const chart of report.charts) {
		lines.push("", chart.title);
		const drawn = terminalChart(chart, columns, style);
		switch (drawn.kind) {
			case "bar":
				for (const row of drawn.rows) {
					lines.push(
						`  ${row.label} ${row.fill}${row.track} ${row.value}${row.percent ? `  ${row.percent}` : ""}`,
					);
				}
				break;
			case "share":
			case "line":
				lines.push(
					...indent(gridText(drawn.grid)),
					...legendText(drawn.legend),
				);
				break;
			case "heatmap":
				lines.push(...indent(gridText(drawn.grid)));
				break;
			case "gauge":
				lines.push(
					`  ${drawn.row.fill}${drawn.row.track} ${drawn.row.value}${drawn.row.percent ? ` ${drawn.row.percent}` : ""}`,
				);
				break;
			case "empty":
				lines.push("  (no data)");
				break;
		}
	}
	if (report.notes.length > 0)
		lines.push("", ...report.notes.map((n) => `- ${n}`));
	return lines.join("\n");
}
