// Dashboard timeline — the past states a dashboard can show. PURE: history text
// in → the days to offer, and the history as it stood at the end of a day.
//
// A stop is one UTC day that has dated records. The newest day is the current
// state ("Now", the full history); the stops before it are earlier days, each
// shown as it stood at the END of that day (every dated record at or before
// 23:59:59.999Z). Dateless and unreadable lines cannot be placed in time, so
// they belong to "Now" only.
import { replayHistory } from "./history-lines.js";

/** Most stops a dashboard offers, "Now" included. */
export const DEFAULT_TIMELINE_STOPS = 12;

/** One earlier state on the timeline. */
export interface TimelineDay {
	/** The UTC day, `YYYY-MM-DD`. */
	day: string;
	/** The last instant of that day, ISO — the state's "as of" time. */
	endOfDay: string;
}

/** The UTC day of an ISO instant, or undefined when it does not parse. */
function utcDay(at: string): string | undefined {
	const ms = Date.parse(at);
	if (Number.isNaN(ms)) return undefined;
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The earlier days to offer, oldest first: the distinct UTC days that have
 * dated records, minus the newest (that one is "Now"), newest `maxStops - 1`
 * kept. Empty when the history covers fewer than two days.
 */
export function timelineDays(
	text: string,
	maxStops: number = DEFAULT_TIMELINE_STOPS,
): TimelineDay[] {
	const days = new Set<string>();
	for (const { at } of replayHistory(text)) {
		const day = at !== undefined ? utcDay(at) : undefined;
		if (day !== undefined) days.add(day);
	}
	const keep = Math.max(maxStops - 1, 0);
	if (keep === 0) return [];
	return [...days]
		.sort()
		.slice(0, -1)
		.slice(-keep)
		.map((day) => ({ day, endOfDay: `${day}T23:59:59.999Z` }));
}

/**
 * The history as it stood at `endOfDay`: only the lines with a string `at` at
 * or before that instant, in file order. Dateless and unreadable lines are
 * dropped (they cannot be placed in time).
 */
export function historyAsOf(text: string, endOfDay: string): string {
	const cutoff = Date.parse(endOfDay);
	if (Number.isNaN(cutoff)) return "";
	const kept: string[] = [];
	for (const line of text.split("\n")) {
		const raw = line.trim();
		if (raw === "") continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			continue;
		}
		if (typeof parsed !== "object" || parsed === null) continue;
		const at = (parsed as { at?: unknown }).at;
		if (typeof at !== "string") continue;
		const ms = Date.parse(at);
		if (!Number.isNaN(ms) && ms <= cutoff) kept.push(raw);
	}
	return kept.length > 0 ? `${kept.join("\n")}\n` : "";
}
