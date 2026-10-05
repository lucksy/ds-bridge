// F4 — per-frame readiness trend + handoff pass rate (SPEC-figma-trends §3.2,
// §3.3). Pure engines over the replayed history. Frame identity is the H7 key
// (`fileKey:nodeId` > `fileKey` > `name:<frameName>`), shared via frameKeyOf.
import { describe, expect, it } from "vitest";
import {
	frameKeyOf,
	frameKeyResolver,
} from "../../../src/engines/history/readiness-frames.js";
import { buildFrameReadinessTrend } from "../../../src/engines/report/frame-readiness-trend.js";
import { buildHandoffPassRate } from "../../../src/engines/report/handoff-pass-rate.js";
import { replayHistory } from "../../../src/engines/report/history-lines.js";

function handoff(
	at: string | undefined,
	score: number,
	frame: { name: string; fileKey?: string; nodeId?: string },
): string {
	return JSON.stringify({
		...(at !== undefined ? { at } : {}),
		kind: "handoff",
		score,
		frameName: frame.name,
		...(frame.fileKey !== undefined ? { fileKey: frame.fileKey } : {}),
		...(frame.nodeId !== undefined ? { nodeId: frame.nodeId } : {}),
	});
}

const rec = (...lines: string[]) => replayHistory(lines.join("\n"));

const CHECKOUT = { name: "Checkout", fileKey: "F1", nodeId: "1:2" };
const CART = { name: "Cart", fileKey: "F1", nodeId: "3:4" };
const LEGACY = { name: "Legacy screen" };

describe("frameKeyOf", () => {
	it("prefers fileKey:nodeId, then fileKey, then name:<frameName>", () => {
		expect(frameKeyOf({ fileKey: "F", nodeId: "1:2", frameName: "x" })).toBe(
			"F:1:2",
		);
		expect(frameKeyOf({ fileKey: "F", frameName: "x" })).toBe("F");
		expect(frameKeyOf({ frameName: "x" })).toBe("name:x");
		expect(frameKeyOf({})).toBe("name:");
	});
});

describe("frameKeyResolver (v1 → v2 aliasing)", () => {
	it("aliases name:<n> to the ONE fileKey-based key seen for that name; ambiguous/unmatched keep name:<n>", () => {
		const records = rec(
			handoff("2026-09-01T09:00:00.000Z", 70, { name: "Login" }),
			handoff("2026-09-02T09:00:00.000Z", 90, {
				name: "Login",
				fileKey: "F",
				nodeId: "1:2",
			}),
			handoff("2026-09-01T09:00:00.000Z", 70, { name: "Twin" }),
			handoff("2026-09-02T09:00:00.000Z", 90, {
				name: "Twin",
				fileKey: "F",
				nodeId: "5:6",
			}),
			handoff("2026-09-02T09:00:00.000Z", 90, {
				name: "Twin",
				fileKey: "G",
				nodeId: "5:6",
			}),
			handoff("2026-09-01T09:00:00.000Z", 50, LEGACY),
		);
		const keyOf = frameKeyResolver(records);
		expect(keyOf({ kind: "handoff", frameName: "Login" })).toBe("F:1:2");
		expect(keyOf({ frameName: "Twin" })).toBe("name:Twin");
		expect(keyOf({ frameName: "Legacy screen" })).toBe("name:Legacy screen");
		expect(keyOf({ frameName: "Login", fileKey: "F", nodeId: "1:2" })).toBe(
			"F:1:2",
		);
	});
});

describe("buildFrameReadinessTrend", () => {
	it("v1 `Login` then v2 `Login` is ONE frame whose points span both dates", () => {
		const trend = buildFrameReadinessTrend(
			rec(
				handoff("2026-09-01T09:00:00.000Z", 70, { name: "Login" }),
				handoff("2026-09-02T09:00:00.000Z", 90, {
					name: "Login",
					fileKey: "F",
					nodeId: "1:2",
				}),
			),
			80,
		);
		expect(trend?.total).toBe(1);
		expect(trend?.failing).toBe(0);
		expect(trend?.frames).toEqual([
			{
				key: "F:1:2",
				frameName: "Login",
				fileKey: "F",
				nodeId: "1:2",
				points: [
					{ date: "2026-09-01", score: 70 },
					{ date: "2026-09-02", score: 90 },
				],
				latest: 90,
				first: 70,
				delta: 20,
				runs: 2,
				passing: true,
			},
		]);
	});

	it("skips a handoff line with a non-numeric score (never a 0 below the gate)", () => {
		const trend = buildFrameReadinessTrend(
			rec(
				handoff("2026-09-01T09:00:00.000Z", 90, CART),
				JSON.stringify({
					at: "2026-09-02T09:00:00.000Z",
					kind: "handoff",
					score: "bad",
					frameName: "Broken",
				}),
				JSON.stringify({
					at: "2026-09-02T09:00:00.000Z",
					kind: "handoff",
					frameName: "Cart",
					fileKey: "F1",
					nodeId: "3:4",
				}),
			),
			80,
		);
		expect(trend?.total).toBe(1);
		expect(trend?.failing).toBe(0);
		expect(trend?.frames[0]?.runs).toBe(1);
		expect(trend?.frames[0]?.latest).toBe(90);
	});

	it("is undefined without handoff records", () => {
		expect(buildFrameReadinessTrend(rec(), 80)).toBeUndefined();
	});

	it("one series per frame, last-of-day points, latest/first/delta/runs/passing", () => {
		const trend = buildFrameReadinessTrend(
			rec(
				handoff("2026-09-01T09:00:00.000Z", 60, CHECKOUT),
				handoff("2026-09-01T17:00:00.000Z", 70, CHECKOUT),
				handoff("2026-09-03T09:00:00.000Z", 85, CHECKOUT),
				handoff("2026-09-02T09:00:00.000Z", 90, CART),
			),
			80,
		);
		expect(trend?.threshold).toBe(80);
		expect(trend?.total).toBe(2);
		expect(trend?.failing).toBe(0);
		const checkout = trend?.frames.find((f) => f.key === "F1:1:2");
		expect(checkout).toEqual({
			key: "F1:1:2",
			frameName: "Checkout",
			fileKey: "F1",
			nodeId: "1:2",
			points: [
				{ date: "2026-09-01", score: 70 },
				{ date: "2026-09-03", score: 85 },
			],
			latest: 85,
			first: 60,
			delta: 25,
			runs: 3,
			passing: true,
		});
	});

	it("undated runs count toward runs/latest but not points; v1 lines key by name", () => {
		const trend = buildFrameReadinessTrend(
			rec(
				handoff("2026-09-01T09:00:00.000Z", 50, LEGACY),
				handoff(undefined, 40, LEGACY),
			),
			80,
		);
		const legacy = trend?.frames[0];
		expect(legacy?.key).toBe("name:Legacy screen");
		expect(legacy?.points).toEqual([{ date: "2026-09-01", score: 50 }]);
		expect(legacy?.latest).toBe(40);
		expect(legacy?.runs).toBe(2);
		expect(legacy?.delta).toBe(-10);
		expect(legacy?.passing).toBe(false);
	});

	it("orders failing frames first (worst first), then passing; caps at limit with total", () => {
		const trend = buildFrameReadinessTrend(
			rec(
				handoff("2026-09-01T09:00:00.000Z", 95, CART),
				handoff("2026-09-01T09:00:00.000Z", 70, CHECKOUT),
				handoff("2026-09-01T09:00:00.000Z", 40, LEGACY),
			),
			80,
			{ limit: 2 },
		);
		expect(trend?.frames.map((f) => f.frameName)).toEqual([
			"Legacy screen",
			"Checkout",
		]);
		expect(trend?.total).toBe(3);
		// Failing counts ALL scored frames, not just the shown ones.
		expect(trend?.failing).toBe(2);
	});
});

describe("buildHandoffPassRate", () => {
	it("is undefined without handoff records", () => {
		expect(buildHandoffPassRate(rec(), 80)).toBeUndefined();
	});

	it("latest per frame: passing / frames, half-up pct, plus a cumulative day trend", () => {
		const rate = buildHandoffPassRate(
			rec(
				handoff("2026-09-01T09:00:00.000Z", 60, CHECKOUT),
				handoff("2026-09-01T10:00:00.000Z", 90, CART),
				handoff("2026-09-02T09:00:00.000Z", 40, LEGACY),
				handoff("2026-09-03T09:00:00.000Z", 82, CHECKOUT),
			),
			80,
		);
		expect(rate).toEqual({
			threshold: 80,
			frames: 3,
			passing: 2,
			pct: 67,
			trend: [
				{ date: "2026-09-01", frames: 2, passing: 1, pct: 50 },
				{ date: "2026-09-02", frames: 3, passing: 1, pct: 33 },
				{ date: "2026-09-03", frames: 3, passing: 2, pct: 67 },
			],
		});
	});

	it("v1 `Login` 70 then v2 `Login` 90 counts ONE frame (no stale v1 failure)", () => {
		const rate = buildHandoffPassRate(
			rec(
				handoff("2026-09-01T09:00:00.000Z", 70, { name: "Login" }),
				handoff("2026-09-02T09:00:00.000Z", 90, {
					name: "Login",
					fileKey: "F",
					nodeId: "1:2",
				}),
			),
			80,
		);
		expect(rate).toEqual({
			threshold: 80,
			frames: 1,
			passing: 1,
			pct: 100,
			trend: [
				{ date: "2026-09-01", frames: 1, passing: 0, pct: 0 },
				{ date: "2026-09-02", frames: 1, passing: 1, pct: 100 },
			],
		});
	});

	it("a malformed score line changes neither frames nor passing", () => {
		const good = [
			handoff("2026-09-01T09:00:00.000Z", 90, CART),
			handoff("2026-09-01T09:00:00.000Z", 60, CHECKOUT),
		];
		const bad = JSON.stringify({
			at: "2026-09-02T09:00:00.000Z",
			kind: "handoff",
			score: "bad",
			frameName: "Broken",
		});
		expect(buildHandoffPassRate(rec(...good, bad), 80)).toEqual(
			buildHandoffPassRate(rec(...good), 80),
		);
		expect(buildHandoffPassRate(rec(bad), 80)).toBeUndefined();
	});

	it("a score exactly at the gate passes; undated records count in the headline only", () => {
		const rate = buildHandoffPassRate(
			rec(handoff(undefined, 80, CART), handoff(undefined, 79, CHECKOUT)),
			80,
		);
		expect(rate).toMatchObject({ frames: 2, passing: 1, pct: 50, trend: [] });
	});
});
