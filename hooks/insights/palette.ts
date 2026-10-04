// The insights pane's colours and the style options that pick them. Shared by
// the terminal grids and the Desktop SVG, and free of the ECharts bundle so the
// terminal path never loads it.
import type { InsightTone } from "../../types";

// Categorical palettes. `harvest` is the default: autumn berry, olive, mustard,
// burnt orange, khaki and sage, mid-tones that read on light and dark grounds.
// `nivo` is Nivo's own "nivo" scheme.
export const PALETTES = {
	harvest: ["#a3384b", "#7f9139", "#e3a73b", "#d06f2e", "#c8ae84", "#b8bf86"],
	nivo: ["#e8c1a0", "#f47560", "#f1e15b", "#e8a838", "#61cdbb", "#97e3d5"],
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

export type PaletteName = keyof typeof PALETTES;
export type ShareStyle = "donut" | "pie" | "bar";

/** How the pane's charts look: the plugin's `insights_*` userConfig values. */
export type ChartStyle = {
	palette: PaletteName;
	share: ShareStyle;
	radius: number;
};

export const DEFAULT_STYLE: ChartStyle = {
	palette: "harvest",
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

/** The colour of the `n`th category in a palette. */
export function paletteColor(style: ChartStyle, n: number): string {
	const palette = PALETTES[style.palette];
	return palette[n % palette.length] ?? palette[0];
}

/**
 * Tone colours outrank the palette, so "hard-coded" reads as a problem in every
 * palette: from the harvest family, on-system olive, near-miss mustard,
 * off-system berry.
 */
export const TONE_COLORS: Record<InsightTone, string> = {
	ok: "#7f9139",
	warn: "#e3a73b",
	error: "#b83f4f",
	info: "#c8ae84",
};

/** The terminal's tone colours: the same family, a touch muted, as ds-bridge's CLI output is. */
export const TERMINAL_TONE_COLORS: Record<InsightTone, string> = {
	ok: "#8a9a4a",
	warn: "#c9973c",
	error: "#b4505c",
	info: "#b9a07a",
};
