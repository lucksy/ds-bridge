// H7 — per-frame readiness (SPEC-history-v2 §3, G5). Pure: the replayed records
// in → one row per frame (latest score, runs, pass rate) out. The frame key is
// `fileKey:nodeId` > `fileKey` > `name:<frameName>` (v1 lines carry only a name).
import { describe, expect, it } from "vitest";
import { readinessByFrame } from "../../../src/engines/history/readiness-frames.js";
import { replayHistory } from "../../../src/engines/report/history-lines.js";

const j = (r: Record<string, unknown>) => JSON.stringify(r);

describe("readinessByFrame", () => {
	it("groups by frame identity, latest score wins, pass rate vs threshold", () => {
		const text = [
			j({
				at: "2026-01-01",
				kind: "handoff",
				score: 60,
				frameName: "Card",
				fileKey: "F",
				nodeId: "1:2",
			}),
			j({
				at: "2026-01-02",
				kind: "handoff",
				score: 90,
				frameName: "Card v2",
				fileKey: "F",
				nodeId: "1:2",
			}),
			j({
				at: "2026-01-03",
				kind: "handoff",
				score: 70,
				frameName: "Page",
				fileKey: "F",
			}),
			j({ at: "2026-01-04", kind: "handoff", score: 85, frameName: "Legacy" }),
			j({ at: "2026-01-05", kind: "lint", byKind: {} }),
		].join("\n");
		expect(readinessByFrame(replayHistory(text), 80)).toEqual([
			{
				key: "F",
				frameName: "Page",
				fileKey: "F",
				latest: 70,
				at: "2026-01-03",
				runs: 1,
				passRate: 0,
			},
			{
				key: "F:1:2",
				frameName: "Card v2",
				fileKey: "F",
				nodeId: "1:2",
				latest: 90,
				at: "2026-01-02",
				runs: 2,
				passRate: 50,
			},
			{
				key: "name:Legacy",
				frameName: "Legacy",
				latest: 85,
				at: "2026-01-04",
				runs: 1,
				passRate: 100,
			},
		]);
	});

	it("a v1 name-only line aliases to the ONE v2 frame with that name (SPEC-figma-trends §1.4)", () => {
		const text = [
			j({ at: "2026-01-01", kind: "handoff", score: 70, frameName: "Login" }),
			j({
				at: "2026-01-02",
				kind: "handoff",
				score: 90,
				frameName: "Login",
				fileKey: "F",
				nodeId: "1:2",
			}),
		].join("\n");
		expect(readinessByFrame(replayHistory(text), 80)).toEqual([
			{
				key: "F:1:2",
				frameName: "Login",
				fileKey: "F",
				nodeId: "1:2",
				latest: 90,
				at: "2026-01-02",
				runs: 2,
				passRate: 50,
			},
		]);
	});

	it("skips a line without a finite score and keeps the frame's name", () => {
		const text = [
			j({
				at: "2026-10-01T00:00:00Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "1:1",
				frameName: "Checkout",
				score: 92,
			}),
			j({
				at: "2026-10-02T00:00:00Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "1:1",
			}),
			j({
				at: "2026-10-03T00:00:00Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "1:1",
				score: "n/a",
			}),
			j({
				at: "2026-10-04T00:00:00Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "1:1",
				score: 95,
			}),
		].join("\n");
		const [row] = readinessByFrame(replayHistory(text), 80);
		expect(row).toMatchObject({
			key: "F:1:1",
			frameName: "Checkout",
			latest: 95,
			runs: 2,
			passRate: 100,
		});
	});

	it("a frame with only scoreless lines has no row", () => {
		const text = j({ kind: "handoff", fileKey: "F", frameName: "X" });
		expect(readinessByFrame(replayHistory(text), 80)).toEqual([]);
	});

	it("is empty without handoff records", () => {
		expect(readinessByFrame([], 80)).toEqual([]);
	});
});
