// H6 — `history stats` (SPEC-history-v2 §4). Pure: history text + its byte size
// in → counts per kind, v1/v2 split, sources, runs, date range, corrupt lines.
import { describe, expect, it } from "vitest";
import { historyStats } from "../../../src/engines/history/stats.js";

const j = (r: Record<string, unknown>) => JSON.stringify(r);

describe("historyStats", () => {
	it("summarizes a mixed v1/v2 history", () => {
		const text = [
			j({ at: "2026-01-02T00:00:00Z", kind: "lint" }),
			j({
				v: 2,
				at: "2026-01-01T00:00:00Z",
				kind: "lint",
				source: "ci",
				runId: "a",
			}),
			j({
				v: 2,
				at: "2026-01-05T00:00:00Z",
				kind: "score",
				source: "ci",
				runId: "a",
			}),
			j({ v: 2, kind: "a11y", source: "local", runId: "b" }),
			"{corrupt",
			"",
		].join("\n");
		expect(historyStats(text, 1234)).toEqual({
			bytes: 1234,
			lines: 5,
			records: 4,
			corrupt: 1,
			v1: 1,
			v2: 3,
			byKind: { a11y: 1, lint: 2, score: 1 },
			bySource: { ci: 2, local: 1 },
			runs: 2,
			firstAt: "2026-01-01T00:00:00Z",
			lastAt: "2026-01-05T00:00:00Z",
		});
	});

	it("is all zeros for an empty history", () => {
		expect(historyStats("", 0)).toEqual({
			bytes: 0,
			lines: 0,
			records: 0,
			corrupt: 0,
			v1: 0,
			v2: 0,
			byKind: {},
			bySource: {},
			runs: 0,
			firstAt: null,
			lastAt: null,
		});
	});
});
