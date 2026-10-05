// The handoff pass-rate trend is one pass over the dated records; it must give
// exactly what re-folding every earlier record per day gave — including for a
// merged (merge=union) history whose lines are out of date order.
import { describe, expect, it } from "vitest";
import { buildHandoffPassRate } from "../../../src/engines/report/handoff-pass-rate.js";
import { replayHistory } from "../../../src/engines/report/history-lines.js";

/** The previous O(days × records) definition, kept as the oracle. */
function reference(text: string, threshold: number) {
	const dated: { date: string; key: string; score: number }[] = [];
	for (const { kind, at, record } of replayHistory(text)) {
		if (kind !== "handoff" || at === undefined) continue;
		const score = record.score;
		if (typeof score !== "number") continue;
		dated.push({ date: at.slice(0, 10), key: String(record.fileKey), score });
	}
	const days = [...new Set(dated.map((d) => d.date))].sort();
	return days.map((date) => {
		const upTo = new Map<string, number>();
		for (const e of dated) if (e.date <= date) upTo.set(e.key, e.score);
		const passing = [...upTo.values()].filter((s) => s >= threshold).length;
		return {
			date,
			frames: upTo.size,
			passing,
			pct: upTo.size === 0 ? 0 : Math.round((100 * passing) / upTo.size),
		};
	});
}

/** Deterministic pseudo-random history (mulberry32). */
function history(seed: number, lines: number): string {
	let a = seed;
	const rand = () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return Array.from({ length: lines }, () =>
		JSON.stringify({
			at: `2026-09-${String(1 + Math.floor(rand() * 9)).padStart(2, "0")}T10:00:00Z`,
			kind: "handoff",
			fileKey: `F${Math.floor(rand() * 4)}`,
			score: Math.floor(rand() * 100),
		}),
	).join("\n");
}

describe("buildHandoffPassRate — trend", () => {
	it("matches the per-day re-fold on shuffled histories", () => {
		for (let seed = 1; seed <= 25; seed += 1) {
			const text = history(seed, 40);
			const result = buildHandoffPassRate(replayHistory(text), 60);
			expect(result?.trend).toEqual(reference(text, 60));
		}
	});
});
