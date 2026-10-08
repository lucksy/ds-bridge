// Readiness across tracked frames. PURE.
//
// `record --figma` scores every tracked frame, one `handoff` line each. The
// project's readiness is each frame's LATEST score averaged — never whichever
// frame happened to be recorded last (on Figma's Simple Design System the clean
// Account frame scored 100 and Settings 71; the score flipped with their order).

/**
 * A running per-frame average: feed handoff records in history order; each
 * call returns a record whose `score` is the mean of every frame's latest
 * score so far. With two or more frames it carries the LOWEST frame's other
 * fields (its deductions, blockers) and a `frameName` saying so, and sets
 * `frames`. Records without a `nodeId` pass through unchanged.
 */
export function frameAverager(): (
	record: Record<string, unknown>,
) => Record<string, unknown> {
	const latest = new Map<string, Record<string, unknown>>();
	const scoreOf = (r: Record<string, unknown>): number =>
		typeof r.score === "number" && Number.isFinite(r.score) ? r.score : 0;
	return (record) => {
		if (typeof record.nodeId !== "string") return record;
		latest.set(`${String(record.fileKey ?? "")}\u0000${record.nodeId}`, record);
		if (latest.size === 1) return record;
		const frames = [...latest.values()];
		const mean = frames.reduce((sum, r) => sum + scoreOf(r), 0) / frames.length;
		const lowest = frames.reduce((low, r) =>
			scoreOf(r) < scoreOf(low) ? r : low,
		);
		const lowName =
			typeof lowest.frameName === "string"
				? lowest.frameName
				: String(lowest.nodeId);
		return {
			...lowest,
			score: mean,
			frameName: `mean of ${frames.length} frames · lowest ${lowName} ${Math.round(scoreOf(lowest))}`,
			frames: frames.length,
		};
	};
}

/**
 * Frame implementability across tracked frames: each frame's latest
 * `frame-impl` record merged — resolved and gap counts summed, reasons
 * tallied — so the % covers every frame, not the last one run.
 */
export function mergeFrameImpl(
	records: readonly Record<string, unknown>[],
): Record<string, unknown> | undefined {
	const latest = new Map<string, Record<string, unknown>>();
	for (const r of records) {
		const key =
			typeof r.nodeId === "string"
				? `${String(r.fileKey ?? "")}\u0000${r.nodeId}`
				: `name\u0000${String(r.frameName ?? "")}`;
		latest.set(key, r);
	}
	const frames = [...latest.values()];
	if (frames.length <= 1) return frames[0];
	const num = (v: unknown): number =>
		typeof v === "number" && Number.isFinite(v) ? v : 0;
	const byReason: Record<string, number> = {};
	for (const f of frames) {
		const reasons =
			typeof f.byReason === "object" && f.byReason !== null
				? (f.byReason as Record<string, unknown>)
				: {};
		for (const [k, v] of Object.entries(reasons))
			byReason[k] = (byReason[k] ?? 0) + num(v);
	}
	return {
		kind: "frame-impl",
		frameName: `${frames.length} frames`,
		resolvedCount: frames.reduce((s, f) => s + num(f.resolvedCount), 0),
		gapCount: frames.reduce((s, f) => s + num(f.gapCount), 0),
		byReason,
		topGaps: frames.flatMap((f) => (Array.isArray(f.topGaps) ? f.topGaps : [])),
	};
}
