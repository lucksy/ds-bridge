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

/** What one history row says: a 0–100 score, a count of open findings, or both. */
export type HistoryEntry = {
	at: string;
	kind: string;
	score?: number;
	findings?: number;
	/** Lint only: findings per kind (`exact`, `near`, `offSystem`). */
	byKind?: Record<string, number>;
};

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** The sum of an object's numeric values (`byKind: { exact: 3, near: 1 }` → 4). */
function total(value: unknown): number {
	if (value === null || typeof value !== "object") return 0;
	return Object.values(value).reduce<number>(
		(sum, v) => sum + (finite(v) ? v : 0),
		0,
	);
}

/**
 * One history row, read by its kind's shape. Handoff and parity rows carry a
 * `score`; lint rows carry finding counts and on-system adoption (refs vs
 * literals, as a 0–100 score); drift rows carry stale/missing/orphan counts;
 * a11y rows carry failures per mode. A row with neither is skipped.
 */
function readRow(row: Record<string, unknown>): HistoryEntry | undefined {
	if (typeof row.kind !== "string") return undefined;
	const entry: HistoryEntry = { at: String(row.at ?? ""), kind: row.kind };
	if (finite(row.score)) entry.score = row.score;
	if (row.kind === "lint") {
		if (row.byKind !== null && typeof row.byKind === "object") {
			entry.findings = total(row.byKind);
			entry.byKind = Object.fromEntries(
				Object.entries(row.byKind).filter((pair): pair is [string, number] =>
					finite(pair[1]),
				),
			);
		}
		const adoption = row.adoption as Record<string, unknown> | undefined;
		const refs = finite(adoption?.refs) ? adoption.refs : 0;
		const literals = finite(adoption?.literals) ? adoption.literals : 0;
		if (refs + literals > 0) {
			entry.score = Math.round((refs / (refs + literals)) * 100);
		}
	}
	if (row.kind === "tokens-check") {
		entry.findings = [row.stale, row.missing, row.orphan].reduce<number>(
			(sum, v) => sum + (finite(v) ? v : 0),
			0,
		);
	}
	if (row.kind === "a11y" && Array.isArray(row.modes)) {
		entry.findings = row.modes.reduce<number>(
			(sum, mode) =>
				sum +
				(finite((mode as { failed?: unknown }).failed)
					? (mode as { failed: number }).failed
					: 0),
			0,
		);
	}
	return entry.score !== undefined || entry.findings !== undefined
		? entry
		: undefined;
}

/** The history file's rows; lines that don't parse, or say nothing chartable, are skipped. */
export function parseHistory(text: string): HistoryEntry[] {
	const entries: HistoryEntry[] = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const entry = readRow(JSON.parse(line) as Record<string, unknown>);
			if (entry) entries.push(entry);
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

/**
 * Lint's score is its on-system share, so it is named for that, not "Lint score";
 * the `score` kind is the stored composite (`ds-bridge record`), "System score".
 */
function scoreLabel(kind: string): string {
	if (kind === "lint") return "On-system";
	if (kind === "score") return "System score";
	return `${kindLabel(kind)} score`;
}

const FINDINGS_LABELS: Record<string, string> = {
	lint: "Lint findings",
	"tokens-check": "Drift entries",
	a11y: "Contrast failures",
};

function findingsLabel(kind: string): string {
	return FINDINGS_LABELS[kind] ?? `${kindLabel(kind)} findings`;
}

/** One series per check kind, from the last `runs` rows that carry `pick`. */
function seriesOf(
	entries: readonly HistoryEntry[],
	pick: (entry: HistoryEntry) => number | undefined,
	label: (kind: string) => string,
	runs: number,
): InsightSeries[] {
	const byKind = new Map<string, number[]>();
	for (const entry of entries) {
		const value = pick(entry);
		if (value === undefined) continue;
		byKind.set(entry.kind, [...(byKind.get(entry.kind) ?? []), value]);
	}
	return [...byKind].map(([kind, values]) => ({
		label: label(kind),
		points: values.slice(-runs).map((y, n) => ({ x: n + 1, y })),
	}));
}

function ends(series: InsightSeries): [number, number] | undefined {
	const first = series.points[0]?.y;
	const last = series.points[series.points.length - 1]?.y;
	return first !== undefined && last !== undefined && series.points.length > 1
		? [first, last]
		: undefined;
}

const LINT_KINDS: readonly [string, string][] = [
	["exact", "exact"],
	["near", "near-miss"],
	["offSystem", "off-system"],
];

/** "2026-09-05T…" → "09-05"; a row with no date is numbered instead. */
function runLabel(at: string, n: number): string {
	const date = /^\d{4}-(\d{2})-(\d{2})/.exec(at);
	return date ? `${date[1]}-${date[2]}` : `#${n + 1}`;
}

/** Lint findings by kind, run by run: a heatmap once there are two lint runs. */
function lintHeatmap(
	entries: readonly HistoryEntry[],
	runs: number,
): InsightChart | undefined {
	const lint = entries
		.filter((e) => e.kind === "lint" && e.byKind !== undefined)
		.slice(-Math.min(runs, 10));
	if (lint.length < 2) return undefined;
	return {
		title: "Lint findings by kind, run by run",
		kind: "heatmap",
		items: [],
		matrix: {
			rows: LINT_KINDS.map(([, label]) => label),
			columns: lint.map((e, n) => runLabel(e.at, n)),
			values: LINT_KINDS.map(([key]) => lint.map((e) => e.byKind?.[key] ?? 0)),
		},
	};
}

/**
 * The latest score and open-findings count of each check, and both run by
 * run (the last `runs` of them), with a note for any score that fell or any
 * count that rose.
 */
export function historySection(
	entries: readonly HistoryEntry[],
	runs = 30,
): Section {
	const scores = seriesOf(entries, (e) => e.score, scoreLabel, runs);
	const findings = seriesOf(entries, (e) => e.findings, findingsLabel, runs);

	const latest = (s: InsightSeries) => s.points[s.points.length - 1]?.y;
	const stats: InsightStat[] = [];
	for (const s of scores) {
		const value = latest(s);
		if (value === undefined) continue;
		stats.push({
			label: s.label === "On-system" ? "On-system" : s.label,
			value: s.label === "On-system" ? `${value}%` : String(value),
		});
	}
	for (const s of findings) {
		const value = latest(s);
		if (value !== undefined)
			stats.push({ label: s.label, value: String(value) });
	}

	const charts: InsightChart[] = [];
	if (scores.length > 0) {
		charts.push({
			title: "ds-bridge check scores, run by run",
			kind: "line",
			items: [],
			series: scores.map((s) => ({
				...s,
				label:
					s.label === "On-system"
						? "On-system %"
						: s.label.replace(/ score$/, ""),
			})),
		});
	}
	if (findings.length > 0) {
		charts.push({
			title: "Open findings, run by run",
			kind: "line",
			items: [],
			series: findings,
		});
	}

	const heatmap = lintHeatmap(entries, runs);
	if (heatmap) charts.push(heatmap);

	const notes: string[] = [];
	for (const s of scores) {
		const pair = ends(s);
		if (pair && pair[1] < pair[0]) {
			notes.push(
				`${s.label} fell from ${pair[0]} to ${pair[1]} over the last ${s.points.length} runs.`,
			);
		}
	}
	for (const s of findings) {
		const pair = ends(s);
		if (pair && pair[1] > pair[0]) {
			notes.push(
				`${s.label} rose from ${pair[0]} to ${pair[1]} over the last ${s.points.length} runs.`,
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
