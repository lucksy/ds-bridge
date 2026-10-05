// H6 — `history stats` (SPEC-history-v2 §4). PURE: history text + its byte size
// in → a summary of the series out (the CLI reads the file and its size).
import { replayHistory } from "../report/history-lines.js";

export interface HistoryStats {
	bytes: number;
	/** Non-blank lines. */
	lines: number;
	/** Readable records (object + string kind). */
	records: number;
	/** Non-blank lines that are not readable records (corrupt / kindless). */
	corrupt: number;
	v1: number;
	v2: number;
	byKind: Record<string, number>;
	/** v2 records per source. */
	bySource: Record<string, number>;
	/** Distinct run ids (record batches). */
	runs: number;
	firstAt: string | null;
	lastAt: string | null;
}

/** Summarize a history text. */
export function historyStats(text: string, bytes: number): HistoryStats {
	const lines = text.split("\n").filter((l) => l.trim() !== "").length;
	const records = replayHistory(text);
	const byKind: Record<string, number> = {};
	const bySource: Record<string, number> = {};
	const runs = new Set<string>();
	let v2 = 0;
	let firstAt: string | null = null;
	let lastAt: string | null = null;
	for (const r of records) {
		byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
		if (r.envelope !== undefined) {
			v2 += 1;
			if (r.envelope.source !== undefined) {
				bySource[r.envelope.source] = (bySource[r.envelope.source] ?? 0) + 1;
			}
			if (r.envelope.runId !== undefined) runs.add(r.envelope.runId);
		}
		if (r.at !== undefined) {
			if (firstAt === null || r.at < firstAt) firstAt = r.at;
			if (lastAt === null || r.at > lastAt) lastAt = r.at;
		}
	}
	return {
		bytes,
		lines,
		records: records.length,
		corrupt: lines - records.length,
		v1: records.length - v2,
		v2,
		byKind,
		bySource,
		runs: runs.size,
		firstAt,
		lastAt,
	};
}
