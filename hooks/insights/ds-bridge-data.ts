// Turns ds-bridge's own records into insights charts: the check history in
// `.ds-bridge/history.jsonl`, and `ds-bridge library-health --format=json`.
// Every figure comes from those records; nothing here estimates.
import type { InsightChart, InsightSeries, InsightStat } from "../../types";

/**
 * What `ds-bridge library-health --format=json` prints: the fields of
 * LibraryHealthReport (src/engines/figma/library-health.ts) this pane reads. Typed
 * here, not imported, because that module pulls in the REST client, and the mod
 * only ever sees the CLI's JSON.
 */
export type LibraryHealthJson = {
	overrideHotspots: { name: string; overrideCount: number }[];
	deprecatedUsage: { componentName: string; count: number }[];
	totals: {
		overrideHotspots: number;
		deprecatedUsage: number;
		detachedCandidates: number;
	};
};

export type Section = {
	stats: InsightStat[];
	charts: InsightChart[];
	notes: string[];
};

export type HistoryEntry = { at: string; kind: string; score: number };

/** The `{ kind, score }` rows of a history file; lines that don't parse, or have no score, are skipped. */
export function parseHistory(text: string): HistoryEntry[] {
	const entries: HistoryEntry[] = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const row = JSON.parse(line) as Record<string, unknown>;
			if (
				typeof row.kind === "string" &&
				typeof row.score === "number" &&
				Number.isFinite(row.score)
			) {
				entries.push({
					at: String(row.at ?? ""),
					kind: row.kind,
					score: row.score,
				});
			}
		} catch {
			// A torn last line from an interrupted write: the rest of the history still counts.
		}
	}
	return entries;
}

/** "handoff" → "Handoff", "library-health" → "Library health". */
export function kindLabel(kind: string): string {
	const words = kind.replace(/[-_]+/g, " ").trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The latest score of each check, and each check's scores run by run (the last `runs` of them). */
export function historySection(
	entries: readonly HistoryEntry[],
	runs = 30,
): Section {
	const byKind = new Map<string, HistoryEntry[]>();
	for (const entry of entries) {
		const list = byKind.get(entry.kind) ?? [];
		list.push(entry);
		byKind.set(entry.kind, list);
	}
	const stats: InsightStat[] = [];
	const series: InsightSeries[] = [];
	for (const [kind, list] of byKind) {
		const recent = list.slice(-runs);
		const last = recent[recent.length - 1];
		if (last !== undefined)
			stats.push({
				label: `${kindLabel(kind)} score`,
				value: String(last.score),
			});
		series.push({
			label: kindLabel(kind),
			points: recent.map((e, n) => ({ x: n + 1, y: e.score })),
		});
	}
	const notes: string[] = [];
	const charts: InsightChart[] = [];
	if (series.length > 0) {
		charts.push({
			title: "ds-bridge check scores, run by run",
			kind: "line",
			items: [],
			series,
		});
	}
	for (const s of series) {
		const first = s.points[0]?.y;
		const last = s.points[s.points.length - 1]?.y;
		if (
			first !== undefined &&
			last !== undefined &&
			s.points.length > 1 &&
			last < first
		) {
			notes.push(
				`${s.label} score fell from ${first} to ${last} over the last ${s.points.length} runs.`,
			);
		}
	}
	return { stats, charts, notes };
}

/** The library-wide hygiene signals `ds-bridge library-health` found over Figma REST. */
export function libraryHealthSection(report: LibraryHealthJson): Section {
	const { totals } = report;
	const charts: InsightChart[] = [];
	if (report.deprecatedUsage.length > 0) {
		charts.push({
			title: "Deprecated components still in use",
			kind: "bar",
			items: report.deprecatedUsage.map((d) => ({
				label: d.componentName,
				value: d.count,
				tone: "warn",
			})),
		});
	}
	if (report.overrideHotspots.length > 0) {
		charts.push({
			title: "Override hotspots (overrides per instance)",
			kind: "bar",
			items: report.overrideHotspots.map((h) => ({
				label: h.name,
				value: h.overrideCount,
				tone: "warn",
			})),
		});
	}
	const notes: string[] = [];
	if (totals.detachedCandidates > 0) {
		const count = totals.detachedCandidates;
		notes.push(
			`${count} possible detached ${count === 1 ? "instance" : "instances"} (a heuristic: a frame named like a component looks the same over REST). Check by hand.`,
		);
	}
	return {
		stats: [
			{ label: "Override hotspots", value: String(totals.overrideHotspots) },
			{ label: "Deprecated uses", value: String(totals.deprecatedUsage) },
			{ label: "Detach candidates", value: String(totals.detachedCandidates) },
		],
		charts,
		notes,
	};
}
