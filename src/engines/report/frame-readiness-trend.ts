// F4 — per-frame readiness trend (SPEC-figma-trends §3.2). PURE: replayed
// history + the readiness gate in → one series per frame out. No I/O; never
// throws. The frame identity is the H7 key with v1 → v2 aliasing
// (`frameKeyResolver`), so this view, `history stats` and the pass rate always
// agree on what "a frame" is. A line without a finite numeric `score` is skipped.
//
// Points are last-of-day per frame (ascending); undated records still count in
// `runs` and can be the `latest` (file order wins, as in readinessByFrame).
// Failing frames lead (worst first) — the frames a designer should open next.
import { frameKeyResolver } from "../history/readiness-frames.js";
import type { HistoryRecord } from "./history-lines.js";

/** One frame's readiness series. */
export interface FrameTrendRow {
	key: string;
	frameName: string;
	fileKey?: string;
	nodeId?: string;
	points: { date: string; score: number }[];
	latest: number;
	first: number;
	delta: number;
	runs: number;
	/** latest ≥ the gate. */
	passing: boolean;
}

/** The `frame-readiness-trend` section. */
export interface FrameReadinessTrend {
	threshold: number;
	/** Frames scored, before the row cap. */
	total: number;
	/** Frames whose latest score is below the gate (all frames, pre-cap). */
	failing: number;
	frames: FrameTrendRow[];
}

function str(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

/** Fold handoff records into per-frame readiness series. */
export function buildFrameReadinessTrend(
	records: readonly HistoryRecord[],
	threshold: number,
	opts: { limit?: number } = {},
): FrameReadinessTrend | undefined {
	const limit = opts.limit ?? 12;
	const frames = new Map<
		string,
		Omit<FrameTrendRow, "points" | "delta" | "passing"> & {
			byDate: Map<string, number>;
		}
	>();
	const keyOf = frameKeyResolver(records);
	for (const { kind, at, record } of records) {
		if (kind !== "handoff") continue;
		const score = record.score;
		if (typeof score !== "number" || !Number.isFinite(score)) continue;
		const key = keyOf(record);
		const fileKey = str(record.fileKey);
		const nodeId = str(record.nodeId);
		const prev = frames.get(key);
		const row = prev ?? {
			key,
			frameName: "",
			latest: score,
			first: score,
			runs: 0,
			byDate: new Map<string, number>(),
		};
		row.frameName = str(record.frameName) ?? row.frameName;
		if (fileKey !== undefined) row.fileKey = fileKey;
		if (nodeId !== undefined) row.nodeId = nodeId;
		row.latest = score;
		row.runs += 1;
		if (at !== undefined) row.byDate.set(at.slice(0, 10), score);
		frames.set(key, row);
	}
	if (frames.size === 0) return undefined;

	const rows: FrameTrendRow[] = [...frames.values()].map(
		({ byDate, ...row }) => ({
			key: row.key,
			frameName: row.frameName,
			...(row.fileKey !== undefined ? { fileKey: row.fileKey } : {}),
			...(row.nodeId !== undefined ? { nodeId: row.nodeId } : {}),
			points: [...byDate.entries()]
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([date, score]) => ({ date, score })),
			latest: row.latest,
			first: row.first,
			delta: row.latest - row.first,
			runs: row.runs,
			passing: row.latest >= threshold,
		}),
	);
	rows.sort(
		(a, b) =>
			Number(a.passing) - Number(b.passing) ||
			a.latest - b.latest ||
			(a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
	);
	return {
		threshold,
		total: rows.length,
		failing: rows.filter((r) => !r.passing).length,
		frames: rows.slice(0, Math.max(0, limit)),
	};
}
