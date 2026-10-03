// The insights pane's Desktop charts: Apache ECharts rendered to SVG strings, in the
// style the person picks under the plugin's `insights_*` options.
import type { InsightChart, InsightItem, InsightTone } from "../../types";
import { topItems } from "./text-charts.js";
import { renderSvg } from "./vendor/echarts.js";

// Each palette reads on both light and dark backgrounds: the SVG has no background of its own.
export const PALETTES = {
	echarts: [
		"#5470c6",
		"#91cc75",
		"#fac858",
		"#ee6666",
		"#73c0de",
		"#3ba272",
		"#fc8452",
		"#9a60b4",
	],
	nivo: ["#e8c1a0", "#f47560", "#f1e15b", "#e8a838", "#61cdbb", "#97e3d5"],
	"ds-bridge": [
		"#2563eb",
		"#16a34a",
		"#dc2626",
		"#d97706",
		"#7c3aed",
		"#0891b2",
	],
	mono: ["#1d4ed8", "#3b82f6", "#60a5fa", "#93c5fd", "#2563eb", "#bfdbfe"],
} as const;

/** An item's tone outranks the palette, so "hard-coded" reads as a problem in every palette. */
const TONE_COLORS: Record<InsightTone, string> = {
	ok: "#3ba272",
	warn: "#f0a83c",
	error: "#e5534b",
	info: "#5470c6",
};

export type PaletteName = keyof typeof PALETTES;
export type ShareStyle = "donut" | "pie" | "bar";

/** How the Desktop pane's charts look: the plugin's `insights_*` userConfig values. */
export type ChartStyle = {
	palette: PaletteName;
	share: ShareStyle;
	radius: number;
};

export const DEFAULT_STYLE: ChartStyle = {
	palette: "echarts",
	share: "donut",
	radius: 4,
};

/** Reads the userConfig values, keeping the default for any value that is missing or unknown. */
export function chartStyleFrom(options: Record<string, unknown>): ChartStyle {
	const palette = String(options.insights_palette ?? "");
	const share = String(options.insights_share_style ?? "");
	const radius = Number(options.insights_corner_radius ?? Number.NaN);
	return {
		palette:
			palette in PALETTES ? (palette as PaletteName) : DEFAULT_STYLE.palette,
		share:
			share === "pie" || share === "bar" || share === "donut"
				? share
				: DEFAULT_STYLE.share,
		radius: Number.isFinite(radius)
			? Math.min(12, Math.max(0, radius))
			: DEFAULT_STYLE.radius,
	};
}

const TEXT = "#8a8f98";
const GRID = "rgba(138, 143, 152, 0.25)";

export type ChartSvg = {
	svg: string;
	width: number;
	height: number;
	alt: string;
};

function colorOf(item: InsightItem, n: number, style: ChartStyle): string {
	const palette = PALETTES[style.palette];
	return item.tone
		? TONE_COLORS[item.tone]
		: (palette[n % palette.length] ?? TONE_COLORS.info);
}

function altText(chart: InsightChart): string {
	if (chart.kind === "line") {
		const parts = (chart.series ?? []).map(
			(s) => `${s.label} ${s.points.at(-1)?.y ?? "no data"}`,
		);
		return `${chart.title}: latest ${parts.join(", ") || "no data"}`;
	}
	const parts = topItems(chart.items).map((i) => `${i.label} ${i.value}`);
	return `${chart.title}: ${parts.join(", ") || "no data"}`;
}

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
		grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
		xAxis: {
			type: "value",
			axisLabel: { color: TEXT, fontSize: 11 },
			splitLine: { lineStyle: { color: GRID } },
		},
		yAxis: {
			type: "category",
			data: items.map((i) => i.label),
			axisLabel: {
				color: TEXT,
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
				barMaxWidth: 22,
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
					formatter: chart.unit ? `{c} ${chart.unit}` : "{c}",
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
	return {
		animation: false,
		legend: {
			orient: "vertical",
			right: 8,
			top: "middle",
			textStyle: { color: TEXT, fontSize: 12 },
		},
		series: [
			{
				type: "pie",
				radius: style.share === "pie" ? ["0%", "76%"] : ["48%", "76%"],
				center: ["32%", "50%"],
				padAngle: 2,
				itemStyle: { borderRadius: style.radius },
				label: {
					show: true,
					position: "inside",
					// Whole percents, and none on slices too thin to hold one.
					formatter: (p: { percent?: number }) =>
						(p.percent ?? 0) >= 8 ? `${Math.round(p.percent ?? 0)}%` : "",
					color: "#fff",
					fontSize: 11,
					fontWeight: "bold",
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
	return {
		animation: false,
		color: PALETTES[style.palette],
		legend: {
			top: 0,
			left: 0,
			textStyle: { color: TEXT, fontSize: 12 },
			itemHeight: 8,
		},
		grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
		xAxis: {
			type: "value",
			minInterval: 1,
			axisLabel: { color: TEXT, fontSize: 11 },
			splitLine: { show: false },
		},
		yAxis: {
			type: "value",
			axisLabel: {
				color: TEXT,
				fontSize: 11,
				formatter: chart.unit ? `{value} ${chart.unit}` : "{value}",
			},
			splitLine: { lineStyle: { color: GRID } },
		},
		series: (chart.series ?? []).map((s) => ({
			name: s.label,
			type: "line",
			smooth: true,
			symbolSize: 6,
			lineStyle: { width: 2 },
			data: s.points.map((p) => [p.x, p.y]),
		})),
	};
}

/** One chart as an SVG document, sized for a pane `width` CSS pixels wide. */
export function chartSvg(
	chart: InsightChart,
	width: number,
	style: ChartStyle = DEFAULT_STYLE,
): ChartSvg {
	if (chart.kind === "line") {
		return {
			svg: renderSvg(lineOption(chart, style), width, 220),
			width,
			height: 220,
			alt: altText(chart),
		};
	}
	// A share chart drawn as bars shows each part's share of the whole, in percent.
	if (chart.kind === "share" && style.share === "bar") {
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
		return { ...chartSvg(asBars, width, style), alt: altText(chart) };
	}
	const rows = topItems(chart.items).length;
	const height = chart.kind === "share" ? 200 : Math.max(96, 24 + rows * 30);
	const option =
		chart.kind === "share"
			? shareOption(chart, style)
			: barOption(chart, style);
	return {
		svg: renderSvg(option, width, height),
		width,
		height,
		alt: altText(chart),
	};
}
