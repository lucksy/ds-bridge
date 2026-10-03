// The ds-bridge mod's state contract: the values the insights pane keeps in `$.state`.
// `claude plugin validate` holds every `$.state` key hooks/register.tsx names to it.

/** A meaning a bar's colour carries, as ds-bridge's terminal severity colours do. */
export type InsightTone = "ok" | "warn" | "error" | "info";

export type InsightItem = { label: string; value: number; tone?: InsightTone };

export type InsightSeries = {
	label: string;
	points: { x: number; y: number }[];
};

export type InsightChart = {
	title: string;
	/**
	 * `bar`: one row per item. `share`: the parts of a whole (percentages are
	 * computed from the values). `line`: `series` over time; `items` is unused.
	 */
	kind: "bar" | "share" | "line";
	unit?: string;
	items: InsightItem[];
	series?: InsightSeries[];
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
