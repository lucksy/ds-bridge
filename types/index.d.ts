// The ds-bridge mod's state contract: the values the insights pane keeps in `$.state`.
// `claude plugin validate` holds every `$.state` key hooks/register.tsx names to it.

/** A meaning a bar's colour carries, as ds-bridge's terminal severity colours do. */
export type InsightTone = "ok" | "warn" | "error" | "info";

export type InsightItem = { label: string; value: number; tone?: InsightTone };

export type InsightSeries = {
	label: string;
	points: { x: number; y: number }[];
};

/** A grid of values: one row per `rows` label, one column per `columns` label. */
export type InsightMatrix = {
	rows: string[];
	columns: string[];
	/** `values[row][column]`; a missing cell reads as 0. */
	values: number[][];
};

/** A chart type the pane draws. `auto` lets the data pick (see chart-kinds.ts). */
export type InsightChartKind =
	| "auto"
	| "bar"
	| "share"
	| "line"
	| "gauge"
	| "heatmap";

export type InsightChart = {
	title: string;
	/**
	 * `bar`: one row per item, a ranking. `share`: the parts of a whole
	 * (percentages computed from the values): a donut, a waffle in the
	 * terminal. `line`: `series` over time. `gauge`: one `value` out of `max`
	 * (default 100). `heatmap`: a `matrix`. `auto`: chosen from the data.
	 */
	kind: InsightChartKind;
	unit?: string;
	items: InsightItem[];
	series?: InsightSeries[];
	/** The gauge's reading. */
	value?: number;
	/** The gauge's full scale; 100 when absent. */
	max?: number;
	matrix?: InsightMatrix;
};

export type InsightStat = { label: string; value: string };

export type InsightReport = {
	title: string;
	subtitle?: string;
	source: "scan" | "claude";
	stats: InsightStat[];
	charts: InsightChart[];
	notes: string[];
};

declare module "claude-code" {
	interface PluginState {
		"ds-bridge": {
			report: InsightReport | null;
			status: string | null;
		};
	}
}
