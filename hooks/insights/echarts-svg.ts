// The insights pane's Desktop charts: Apache ECharts rendered to SVG strings,
// styled after Nivo (soft grid, rounded marks, area fills, point rings, Nivo's
// palette by default), in the style the person picks under `insights_*`. The
// kind of chart comes from chart-kinds.ts, so it matches the terminal's.
import type { InsightChart, InsightItem } from "../../types";
import { gaugeFraction, resolveKind } from "./chart-kinds.js";
import {
	type ChartStyle,
	DEFAULT_STYLE,
	PALETTES,
	paletteColor,
	TONE_COLORS,
} from "./palette.js";
import { formatValue, topItems } from "./text-charts.js";
import { renderSvg } from "./vendor/echarts.js";

export type { ChartStyle, PaletteName, ShareStyle } from "./palette.js";
export { chartStyleFrom, DEFAULT_STYLE, PALETTES } from "./palette.js";

// Reads on both light and dark backgrounds: the SVG has no background of its own.
const TEXT = "#8a8f98";
const GRID = "rgba(138, 143, 152, 0.22)";
const TRACK = "rgba(138, 143, 152, 0.18)";
const FONT = 'Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

export type ChartSvg = {
	svg: string;
	width: number;
	height: number;
	alt: string;
};

function colorOf(item: InsightItem, n: number, style: ChartStyle): string {
	return item.tone ? TONE_COLORS[item.tone] : paletteColor(style, n);
}

function altText(chart: InsightChart): string {
	const kind = resolveKind(chart);
	if (kind === "line") {
		const parts = (chart.series ?? []).map(
			(s) => `${s.label} ${s.points.at(-1)?.y ?? "no data"}`,
		);
		return `${chart.title}: latest ${parts.join(", ") || "no data"}`;
	}
	if (kind === "gauge")
		return `${chart.title}: ${formatValue(chart.value ?? 0, chart.unit ?? "%")}`;
	if (kind === "heatmap" && chart.matrix) {
		const m = chart.matrix;
		const rows = m.rows.map(
			(row, r) =>
				`${row} ${m.columns.map((c, i) => `${c} ${m.values[r]?.[i] ?? 0}`).join(", ")}`,
		);
		return `${chart.title}: ${rows.join("; ")}`;
	}
	const parts = topItems(chart.items).map((i) => `${i.label} ${i.value}`);
	return `${chart.title}: ${parts.join(", ") || "no data"}`;
}

const axisLabel = { color: TEXT, fontSize: 11, fontFamily: FONT };

function barOption(
	chart: InsightChart,
	style: ChartStyle,
): Record<string, unknown> {
	// Largest at the top in the first colour: ECharts draws a category axis bottom-up.
	const items = topItems(chart.items)
		.map((item, n) => ({ ...item, color: colorOf(item, n, style) }))
		.reverse();
	return {
		animation: false,
		textStyle: { fontFamily: FONT },
		grid: { left: 8, right: 52, top: 8, bottom: 8, containLabel: true },
		xAxis: {
			type: "value",
			axisLabel,
			splitLine: { lineStyle: { color: GRID } },
		},
		yAxis: {
			type: "category",
			data: items.map((i) => i.label),
			axisLabel: {
				...axisLabel,
				fontSize: 12,
				width: 140,
				overflow: "truncate",
			},
			axisLine: { show: false },
			axisTick: { show: false },
		},
		series: [
			{
				type: "bar",
				barMaxWidth: 20,
				data: items.map((i) => ({
					value: i.value,
					itemStyle: { color: i.color },
				})),
				itemStyle: { borderRadius: [0, style.radius, style.radius, 0] },
				label: {
					show: true,
					position: "right",
					color: TEXT,
					fontSize: 11,
					fontFamily: FONT,
					formatter: (p: { value?: number }) =>
						formatValue(p.value ?? 0, chart.unit),
				},
			},
		],
	};
}

function shareOption(
	chart: InsightChart,
	style: ChartStyle,
): Record<string, unknown> {
	const items = topItems(chart.items, 6);
	const donut = style.share !== "pie";
	return {
		animation: false,
		textStyle: { fontFamily: FONT },
		legend: {
			orient: "vertical",
			right: 4,
			top: "middle",
			itemWidth: 10,
			itemHeight: 10,
			icon: "circle",
			textStyle: { color: TEXT, fontSize: 12, fontFamily: FONT },
		},
		series: [
			{
				type: "pie",
				radius: donut ? ["52%", "80%"] : ["0%", "80%"],
				center: ["34%", "50%"],
				padAngle: 1.2,
				itemStyle: { borderRadius: style.radius },
				label: {
					show: true,
					position: "inside",
					// Whole percents, and none on slices too thin to hold one.
					formatter: (p: { percent?: number }) =>
						(p.percent ?? 0) >= 8 ? `${Math.round(p.percent ?? 0)}%` : "",
					color: "#1f1f1f",
					fontSize: 11,
					fontWeight: 600,
					fontFamily: FONT,
				},
				data: items.map((item, n) => ({
					name: item.label,
					value: item.value,
					itemStyle: { color: colorOf(item, n, style) },
				})),
			},
		],
	};
}

function lineOption(
	chart: InsightChart,
	style: ChartStyle,
): Record<string, unknown> {
	const series = (chart.series ?? []).filter((s) => s.points.length > 0);
	// A lone series gets Nivo's soft area fill; several stay lines, so they don't muddy.
	const filled = series.length <= 2;
	return {
		animation: false,
		textStyle: { fontFamily: FONT },
		color: [...PALETTES[style.palette]],
		legend: {
			top: 0,
			left: 0,
			icon: "circle",
			itemWidth: 8,
			itemHeight: 8,
			textStyle: { color: TEXT, fontSize: 12, fontFamily: FONT },
		},
		grid: { left: 8, right: 16, top: 34, bottom: 8, containLabel: true },
		xAxis: {
			type: "value",
			minInterval: 1,
			axisLabel,
			splitLine: { show: false },
			axisLine: { lineStyle: { color: GRID } },
			axisTick: { show: false },
		},
		yAxis: {
			type: "value",
			axisLabel: {
				...axisLabel,
				formatter: (v: number) => formatValue(v, chart.unit),
			},
			splitLine: { lineStyle: { color: GRID } },
		},
		series: series.map((s, n) => ({
			name: s.label,
			type: "line",
			smooth: 0.35,
			symbol: "circle",
			symbolSize: 8,
			itemStyle: {
				color: paletteColor(style, n),
				borderColor: "#ffffff",
				borderWidth: 2,
			},
			lineStyle: { width: 2.5, color: paletteColor(style, n) },
			areaStyle: filled
				? { color: paletteColor(style, n), opacity: 0.16 }
				: undefined,
			data: s.points.map((p) => [p.x, p.y]),
		})),
	};
}

function gaugeOption(
	chart: InsightChart,
	style: ChartStyle,
): Record<string, unknown> {
	const fraction = gaugeFraction(chart);
	const tone = fraction >= 0.8 ? "ok" : fraction >= 0.5 ? "warn" : "error";
	return {
		animation: false,
		series: [
			{
				type: "gauge",
				min: 0,
				max: chart.max ?? 100,
				startAngle: 215,
				endAngle: -35,
				radius: "92%",
				center: ["50%", "56%"],
				progress: {
					show: true,
					roundCap: style.radius > 0,
					width: 16,
					itemStyle: { color: TONE_COLORS[tone] },
				},
				axisLine: {
					roundCap: style.radius > 0,
					lineStyle: { width: 16, color: [[1, TRACK]] },
				},
				pointer: { show: false },
				axisTick: { show: false },
				splitLine: { show: false },
				axisLabel: { show: false },
				anchor: { show: false },
				title: { show: false },
				detail: {
					valueAnimation: false,
					offsetCenter: [0, "4%"],
					fontSize: 34,
					fontWeight: 700,
					fontFamily: FONT,
					color: TONE_COLORS[tone],
					formatter: () =>
						formatValue(
							chart.value ?? 0,
							chart.unit ?? (chart.max === undefined ? "%" : undefined),
						),
				},
				data: [{ value: chart.value ?? 0 }],
			},
		],
	};
}

function heatmapOption(
	chart: InsightChart,
	style: ChartStyle,
): Record<string, unknown> {
	const m = chart.matrix ?? { rows: [], columns: [], values: [] };
	const data: [number, number, number][] = [];
	m.rows.forEach((_, r) => {
		m.columns.forEach((_, c) => {
			data.push([c, m.rows.length - 1 - r, m.values[r]?.[c] ?? 0]);
		});
	});
	const max = Math.max(1, ...data.map((d) => d[2]));
	return {
		animation: false,
		textStyle: { fontFamily: FONT },
		grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
		xAxis: {
			type: "category",
			data: m.columns,
			axisLabel,
			axisLine: { show: false },
			axisTick: { show: false },
			splitArea: { show: false },
		},
		yAxis: {
			type: "category",
			data: [...m.rows].reverse(),
			axisLabel: { ...axisLabel, fontSize: 12 },
			axisLine: { show: false },
			axisTick: { show: false },
		},
		visualMap: {
			show: false,
			min: 0,
			max,
			inRange: { color: [TRACK, paletteColor(style, 0)] },
		},
		series: [
			{
				type: "heatmap",
				data,
				itemStyle: {
					borderRadius: style.radius,
					borderColor: "rgba(0,0,0,0)",
					borderWidth: 3,
				},
				label: {
					show: true,
					color: "#1f1f1f",
					fontSize: 11,
					fontFamily: FONT,
					formatter: (p: { value?: number[] }) => String(p.value?.[2] ?? ""),
				},
			},
		],
	};
}

/** One chart as an SVG document, sized for a pane `width` CSS pixels wide. */
export function chartSvg(
	chart: InsightChart,
	width: number,
	style: ChartStyle = DEFAULT_STYLE,
): ChartSvg {
	const kind = resolveKind(chart);
	const alt = altText(chart);
	const draw = (option: Record<string, unknown>, height: number): ChartSvg => ({
		svg: renderSvg(option, width, height),
		width,
		height,
		alt,
	});
	switch (kind) {
		case "line":
			return draw(lineOption(chart, style), 230);
		case "gauge":
			return draw(gaugeOption(chart, style), 180);
		case "heatmap":
			return draw(
				heatmapOption(chart, style),
				Math.max(120, 36 + (chart.matrix?.rows.length ?? 0) * 38),
			);
		case "share": {
			if (style.share === "bar") {
				// Drawn as bars, a share chart shows each part's share of the whole, in percent.
				const total =
					chart.items.reduce((sum, i) => sum + Math.max(0, i.value), 0) || 1;
				const asBars: InsightChart = {
					...chart,
					kind: "bar",
					unit: "%",
					items: chart.items.map((i) => ({
						...i,
						value: Math.round((i.value / total) * 100),
					})),
				};
				return { ...chartSvg(asBars, width, style), alt };
			}
			return draw(shareOption(chart, style), 210);
		}
		default:
			return draw(
				barOption(chart, style),
				Math.max(96, 24 + topItems(chart.items).length * 30),
			);
	}
}
