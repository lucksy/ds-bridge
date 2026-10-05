// F3 — library-hotspots-trend engine (SPEC-figma-trends §3.1). PURE: the shared
// tolerant `HistoryRecord[]` in → per-component series out. No fs/network/clock;
// deterministic; never throws.
//
// Input: dated `library-health` lines carrying the F2 top-N lists (`topN`,
// `topOverrides`, `topDeprecated`, `topDetached`); last-of-day wins (the C6
// rule). A component absent from a day's list is `0` only when that list was
// NOT full (every positive entry was stored); a full list (or a missing list)
// makes it unknown (`null`) — "fell below the cut" is never a false "resolved".
// Only lines for the newest line's `fileKey` are trended (legacy lines without
// one match only each other), so a different file is never a false "resolved".
import type { HistoryRecord } from "./history-lines.js";

/** The three hygiene signals, in render order. */
export type HotspotSignal = "overrides" | "deprecated" | "detached";

export type HotspotStatus =
	| "new"
	| "rising"
	| "falling"
	| "flat"
	| "resolved"
	| "below-top";

/** One component's series for one signal. */
export interface HotspotRow {
	signal: HotspotSignal;
	name: string;
	/** One point per trend date; `null` = unknown (below the stored top-N). */
	points: { date: string; count: number | null }[];
	/** The first known count. */
	first?: number;
	/** The latest date's count, or null when unknown. */
	latest: number | null;
	/** `latest − first` when both are known. */
	delta?: number;
	status: HotspotStatus;
}

/** The `library-hotspots-trend` section. */
export interface LibraryHotspotsTrend {
	dates: string[];
	rows: HotspotRow[];
}

const SIGNALS: readonly { signal: HotspotSignal; key: string }[] = [
	{ signal: "overrides", key: "topOverrides" },
	{ signal: "deprecated", key: "topDeprecated" },
	{ signal: "detached", key: "topDetached" },
];

/** One day's list for a signal: the entries, and whether it was full. */
interface DayList {
	counts: Map<string, number>;
	full: boolean;
}

/** Parse a stored list tolerantly (skip malformed entries). */
function parseList(value: unknown): Map<string, number> | undefined {
	if (!Array.isArray(value)) return undefined;
	const counts = new Map<string, number>();
	for (const entry of value) {
		if (typeof entry !== "object" || entry === null) continue;
		const { name, count } = entry as { name?: unknown; count?: unknown };
		if (typeof name !== "string" || name === "") continue;
		if (typeof count !== "number" || !Number.isFinite(count)) continue;
		counts.set(name, count);
	}
	return counts;
}

function compareNames(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Fold list-bearing library-health lines into per-component series. */
export function buildLibraryHotspotsTrend(
	records: readonly HistoryRecord[],
	opts: { limit?: number } = {},
): LibraryHotspotsTrend | undefined {
	const limit = opts.limit ?? 10;
	// Pass 1: the dated, list-bearing lines (file order) with their Figma file.
	const lines: {
		date: string;
		fileKey?: string;
		day: Map<HotspotSignal, DayList>;
	}[] = [];
	for (const { kind, at, record } of records) {
		if (kind !== "library-health" || at === undefined) continue;
		const topN =
			typeof record.topN === "number" && Number.isFinite(record.topN)
				? record.topN
				: undefined;
		const day = new Map<HotspotSignal, DayList>();
		for (const { signal, key } of SIGNALS) {
			const counts = parseList(record[key]);
			if (counts === undefined) continue;
			const stored = Array.isArray(record[key])
				? (record[key] as unknown[]).length
				: 0;
			day.set(signal, {
				counts,
				full: topN === undefined || stored >= topN,
			});
		}
		if (day.size === 0) continue;
		const fileKey =
			typeof record.fileKey === "string" && record.fileKey !== ""
				? record.fileKey
				: undefined;
		lines.push({
			date: at.slice(0, 10),
			...(fileKey !== undefined ? { fileKey } : {}),
			day,
		});
	}
	if (lines.length === 0) return undefined;

	// Pass 2: trend ONE file — the newest line's (a legacy line without a
	// fileKey matches only other legacy lines), so checking another file never
	// turns a component into a false "resolved". date → signal → day list
	// (last-of-day wins: overwritten in file order).
	const target = lines[lines.length - 1]?.fileKey;
	const byDate = new Map<string, Map<HotspotSignal, DayList>>();
	for (const { date, fileKey, day } of lines) {
		if (fileKey === target) byDate.set(date, day);
	}

	const dates = [...byDate.keys()].sort(compareNames);
	const rows: HotspotRow[] = [];
	for (const { signal } of SIGNALS) {
		const names = new Set<string>();
		for (const day of byDate.values()) {
			for (const name of day.get(signal)?.counts.keys() ?? []) names.add(name);
		}
		const signalRows: HotspotRow[] = [];
		for (const name of names) {
			const points = dates.map((date) => {
				const list = byDate.get(date)?.get(signal);
				const stored = list?.counts.get(name);
				const count =
					stored !== undefined
						? stored
						: list !== undefined && !list.full
							? 0
							: null;
				return { date, count };
			});
			signalRows.push(rowFor(signal, name, points));
		}
		signalRows.sort(
			(a, b) =>
				(b.latest ?? -1) - (a.latest ?? -1) || compareNames(a.name, b.name),
		);
		rows.push(...signalRows.slice(0, Math.max(0, limit)));
	}
	return { dates, rows };
}

/** Derive first / latest / delta / status for one series. */
function rowFor(
	signal: HotspotSignal,
	name: string,
	points: { date: string; count: number | null }[],
): HotspotRow {
	const known = points.filter(
		(p): p is { date: string; count: number } => p.count !== null,
	);
	const first = known[0]?.count;
	const latest = points[points.length - 1]?.count ?? null;
	let previous: number | undefined;
	for (let i = points.length - 2; i >= 0; i--) {
		const count = points[i]?.count;
		if (count !== null && count !== undefined) {
			previous = count;
			break;
		}
	}
	let status: HotspotStatus;
	if (latest === null) status = "below-top";
	else if (latest === 0) status = "resolved";
	else if (previous === undefined || previous === 0)
		status = points.length === 1 ? "flat" : "new";
	else
		status =
			latest > previous ? "rising" : latest < previous ? "falling" : "flat";
	return {
		signal,
		name,
		points,
		...(first !== undefined ? { first } : {}),
		latest,
		...(first !== undefined && latest !== null
			? { delta: latest - first }
			: {}),
		status,
	};
}
