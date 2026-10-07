// H7 — per-frame readiness (SPEC-history-v2 §3, gap G5). PURE: replayed history
// records + the readiness threshold in → one row per frame out.
//
// The dashboard's readiness gauge keeps "last handoff run wins" as its default;
// this view separates the frames so a trend never mixes them. Frame identity:
// `fileKey:nodeId` (v2 handoff lines) > `fileKey` > `name:<frameName>` (v1
// lines carry only the frame name); a v1 name aliases to the one v2 key seen for
// that name (`frameKeyResolver`). Latest record (file order) wins the score
// and name; the pass rate counts runs with score ≥ threshold and no blocker.
import type { HistoryRecord } from "../report/history-lines.js";

export interface FrameReadiness {
	key: string;
	frameName: string;
	fileKey?: string;
	nodeId?: string;
	/** The latest recorded readiness score. */
	latest: number;
	/** The latest record's `at`, when dated. */
	at?: string;
	runs: number;
	/** Percentage of runs at/above the threshold, half-up rounded. */
	passRate: number;
	/** The latest run was blocked (a deprecated component in the frame). */
	blocked?: boolean;
}

/**
 * Whether a handoff history line was blocked: a deprecated component in the
 * frame fails the gate whatever the score (`blockers` count, v1.17+).
 */
export function isBlockedHandoff(record: Record<string, unknown>): boolean {
	const blockers = record.blockers;
	return typeof blockers === "number" && blockers > 0;
}

/** The handoff gate for one history line: score at/above it and not blocked. */
export function handoffPasses(
	record: Record<string, unknown>,
	score: number,
	threshold: number,
): boolean {
	return score >= threshold && !isBlockedHandoff(record);
}

function str(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

function finite(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

/**
 * The frame identity of a handoff record (shared by every per-frame view, so
 * they can never disagree): `fileKey:nodeId` > `fileKey` > `name:<frameName>`.
 */
export function frameKeyOf(record: Record<string, unknown>): string {
	const fileKey = str(record.fileKey);
	const nodeId = str(record.nodeId);
	if (fileKey !== undefined) {
		return nodeId !== undefined ? `${fileKey}:${nodeId}` : fileKey;
	}
	return `name:${str(record.frameName) ?? ""}`;
}

/**
 * The frame identity with v1 → v2 aliasing (SPEC-figma-trends §1.4): a v1
 * `name:<frameName>` key resolves to the fileKey-based key when exactly ONE such
 * key was seen for that frame name on handoff lines; an ambiguous or unmatched
 * name keeps `name:<frameName>`. Upgrading from v1 history therefore never
 * splits a frame in two. Pure; the first pass reads only handoff records.
 */
export function frameKeyResolver(
	records: readonly HistoryRecord[],
): (record: Record<string, unknown>) => string {
	const keysByName = new Map<string, Set<string>>();
	for (const { kind, record } of records) {
		if (kind !== "handoff" || str(record.fileKey) === undefined) continue;
		const name = str(record.frameName);
		if (name === undefined) continue;
		const keys = keysByName.get(name) ?? new Set<string>();
		keys.add(frameKeyOf(record));
		keysByName.set(name, keys);
	}
	return (record) => {
		const key = frameKeyOf(record);
		if (str(record.fileKey) !== undefined) return key;
		const keys = keysByName.get(str(record.frameName) ?? "");
		return keys !== undefined && keys.size === 1
			? (keys.values().next().value ?? key)
			: key;
	};
}

/**
 * Fold handoff records into per-frame readiness rows, sorted by key. A line
 * without a finite `score` is skipped (like the frame-readiness trend and the
 * pass rate do): it is not a run, and never reads as a score of 0. A line
 * without a `frameName` keeps the name already seen.
 */
export function readinessByFrame(
	records: readonly HistoryRecord[],
	threshold: number,
): FrameReadiness[] {
	const keyOf = frameKeyResolver(records);
	const rows = new Map<string, FrameReadiness & { passes: number }>();
	for (const { kind, at, record } of records) {
		if (kind !== "handoff") continue;
		const key = keyOf(record);
		const prev = rows.get(key);
		// An aliased v1 line keeps the v2 identity fields already seen.
		const fileKey = str(record.fileKey) ?? prev?.fileKey;
		const nodeId = str(record.nodeId) ?? prev?.nodeId;
		const score = finite(record.score);
		if (score === undefined) continue;
		const frameName = str(record.frameName) ?? prev?.frameName ?? "";
		const row: FrameReadiness & { passes: number } = {
			key,
			frameName,
			...(fileKey !== undefined ? { fileKey } : {}),
			...(nodeId !== undefined ? { nodeId } : {}),
			latest: score,
			...(at !== undefined ? { at } : {}),
			runs: (prev?.runs ?? 0) + 1,
			passes:
				(prev?.passes ?? 0) + (handoffPasses(record, score, threshold) ? 1 : 0),
			passRate: 0,
			...(isBlockedHandoff(record) ? { blocked: true } : {}),
		};
		rows.set(key, row);
	}
	return [...rows.values()]
		.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
		.map(({ passes, ...row }) => ({
			...row,
			passRate: Math.round((100 * passes) / row.runs),
		}));
}
