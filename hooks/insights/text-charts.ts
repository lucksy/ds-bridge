// The insights pane's text charts, drawn the way ds-bridge's own terminal output is:
// a solid proportional bar over a light-shade `░` track, in muted severity colours,
// then the count and, for the parts of a whole, the percent.
import { proportionalBar } from "../../src/render/terminal/blocks.js";
import { sparkline } from "../../src/render/terminal/sparkline.js";
import type {
	InsightChart,
	InsightItem,
	InsightReport,
	InsightTone,
} from "../../types";

const TRACK = "░";

/** Muted colours that match ds-bridge's terminal output: ok, warn, error, info. */
export const TONE_COLORS: Record<InsightTone, string> = {
	ok: "#7a9e6b",
	warn: "#b0863f",
	error: "#c8605a",
	info: "#6b95b8",
};

/** For items with no tone: the same muted family, in a fixed order. */
export const PALETTE = [
	"#6b95b8",
	"#7a9e6b",
	"#b0863f",
	"#c8605a",
	"#9a7fc0",
	"#5fa8a0",
] as const;

export function formatValue(value: number, unit?: string): string {
	const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
	return unit ? `${text} ${unit}` : text;
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
 * to the total, so a `share` row's bar is its share.
 */
export function barRows(chart: InsightChart, columns: number): BarRow[] {
	const items = topItems(chart.items, chart.kind === "share" ? 6 : 8);
	const isShare = chart.kind === "share";
	const total = items.reduce((sum, i) => sum + i.value, 0);
	const scale = isShare ? total : Math.max(0, ...items.map((i) => i.value));
	const labelWidth = Math.min(
		22,
		Math.max(6, ...items.map((i) => i.label.length)),
	);
	const values = items.map((i) => formatValue(i.value, chart.unit));
	const valueWidth = Math.max(1, ...values.map((v) => v.length));
	const percentWidth = isShare ? 5 : 0;
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
				isShare && total > 0
					? `${Math.round((item.value / total) * 100)}%`.padStart(4)
					: "",
			color: item.tone
				? TONE_COLORS[item.tone]
				: (PALETTE[n % PALETTE.length] ?? TONE_COLORS.info),
		};
	});
}

export type TrendRow = {
	label: string;
	spark: string;
	last: string;
	color: string;
};

/** One row per series: its label, a sparkline of its values, and its latest value. */
export function trendRows(chart: InsightChart, columns: number): TrendRow[] {
	const series = chart.series ?? [];
	const labelWidth = Math.min(
		22,
		Math.max(6, ...series.map((s) => s.label.length)),
	);
	const room = Math.max(4, columns - labelWidth - 8);
	return series.map((s, n) => {
		const values = s.points.slice(-room).map((p) => p.y);
		const last = values[values.length - 1];
		return {
			label: clip(s.label, labelWidth),
			spark: sparkline(values),
			last: last === undefined ? "" : formatValue(last, chart.unit),
			color: PALETTE[n % PALETTE.length] ?? TONE_COLORS.info,
		};
	});
}

/** The report as plain text, for the transcript and for surfaces that draw no pane. */
export function reportText(report: InsightReport, columns = 60): string {
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
		if (chart.kind === "line") {
			for (const row of trendRows(chart, columns))
				lines.push(`  ${row.label} ${row.spark} ${row.last}`);
			if ((chart.series ?? []).length === 0) lines.push("  (no data)");
			continue;
		}
		for (const row of barRows(chart, columns)) {
			lines.push(
				`  ${row.label} ${row.fill}${row.track} ${row.value}${row.percent ? `  ${row.percent}` : ""}`,
			);
		}
		if (chart.items.length === 0) lines.push("  (no data)");
	}
	if (report.notes.length > 0)
		lines.push("", ...report.notes.map((n) => `- ${n}`));
	return lines.join("\n");
}
