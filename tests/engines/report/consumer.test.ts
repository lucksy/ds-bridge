// N1 — consumer artifact engines, test-first. Two PURE views over the wave-5
// `replayHistory` output (NO new parser): `buildBreakingCalendar` (date-grouped
// breaking events from `tokens-check.stale>0` + `impact.breaking>0`, one entry
// per signal, dateless EXCLUDED — cannot place) and `buildChangeFrequency`
// (per-kind counts in a fixed order, zero-count kinds omitted, dateless COUNTED).
//
// The dateless ASYMMETRY is the load-bearing contract and is locked red-first
// here: a dateless breaking record contributes NOTHING to the calendar (no date
// to place it on — mirrors digest.ts:327 `if (at === undefined) continue`) but
// IS counted in the frequency tally (a count is date-agnostic — mirrors
// score.ts dateless-feeds-last-wins). windowFirst/windowLast see only DATED records.
import { describe, expect, it } from "vitest";
import {
	buildBreakingCalendar,
	buildChangeFrequency,
} from "../../../src/engines/report/consumer.js";
import { replayHistory } from "../../../src/engines/report/history-lines.js";

/** Build one JSONL line from a record object. */
function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

/** Replay a list of record objects into the shared iterator's record list. */
function records(...recs: Record<string, unknown>[]) {
	return replayHistory(recs.map(line).join("\n"));
}

describe("buildBreakingCalendar — signal extraction", () => {
	it("emits a tokens entry for a tokens-check with stale>0", () => {
		const result = buildBreakingCalendar(
			records({ at: "2026-06-01T10:00:00Z", kind: "tokens-check", stale: 3 }),
		);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.date).toBe("2026-06-01");
		expect(result.entries[0]?.source).toBe("tokens");
		expect(result.entries[0]?.count).toBe(3);
		expect(typeof result.entries[0]?.detail).toBe("string");
		expect(result.total).toBe(3);
	});

	it("emits a figma entry for an impact with breaking>0", () => {
		const result = buildBreakingCalendar(
			records({ at: "2026-06-02T10:00:00Z", kind: "impact", breaking: 2 }),
		);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.date).toBe("2026-06-02");
		expect(result.entries[0]?.source).toBe("figma");
		expect(result.entries[0]?.count).toBe(2);
		expect(result.total).toBe(2);
	});

	it("omits a tokens-check with stale=0 (no breaking signal)", () => {
		const result = buildBreakingCalendar(
			records({
				at: "2026-06-01T10:00:00Z",
				kind: "tokens-check",
				stale: 0,
				missing: 5,
				orphan: 2,
			}),
		);
		expect(result.entries).toEqual([]);
		expect(result.total).toBe(0);
	});

	it("omits an impact with breaking=0 (additive/cosmetic only)", () => {
		const result = buildBreakingCalendar(
			records({
				at: "2026-06-02T10:00:00Z",
				kind: "impact",
				breaking: 0,
				additive: 4,
				cosmetic: 1,
			}),
		);
		expect(result.entries).toEqual([]);
		expect(result.total).toBe(0);
	});

	it("ignores non-breaking-bearing kinds entirely", () => {
		const result = buildBreakingCalendar(
			records(
				{ at: "2026-06-01T10:00:00Z", kind: "lint", byKind: { offSystem: 9 } },
				{ at: "2026-06-02T10:00:00Z", kind: "handoff", score: 50 },
				{ at: "2026-06-03T10:00:00Z", kind: "a11y", modes: [] },
			),
		);
		expect(result.entries).toEqual([]);
		expect(result.total).toBe(0);
	});

	it("treats a non-finite / non-number / absent count as no signal", () => {
		const result = buildBreakingCalendar(
			records(
				{ at: "2026-06-01T10:00:00Z", kind: "tokens-check" }, // no stale
				{ at: "2026-06-02T10:00:00Z", kind: "tokens-check", stale: "lots" },
				{ at: "2026-06-03T10:00:00Z", kind: "impact", breaking: null },
			),
		);
		expect(result.entries).toEqual([]);
		expect(result.total).toBe(0);
	});
});

describe("buildBreakingCalendar — both signals on one line", () => {
	it("a tokens-check cannot carry breaking, but a hypothetical dual line yields one entry per signal", () => {
		// A single line that somehow carries BOTH a tokens stale signal and a figma
		// breaking signal contributes ONE entry per signal (SPEC §2 / TASKS N1).
		const result = buildBreakingCalendar(
			records({
				at: "2026-06-04T10:00:00Z",
				kind: "tokens-check",
				stale: 1,
				breaking: 2,
			}),
		);
		// `kind` is tokens-check, so only the tokens signal applies here — the
		// per-signal rule is exercised below where a kind genuinely owns a signal.
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.source).toBe("tokens");
	});

	it("two distinct breaking-bearing lines on the same date yield two entries (tokens before figma)", () => {
		const result = buildBreakingCalendar(
			records(
				{ at: "2026-06-05T08:00:00Z", kind: "impact", breaking: 1 },
				{ at: "2026-06-05T09:00:00Z", kind: "tokens-check", stale: 4 },
			),
		);
		expect(result.entries).toHaveLength(2);
		// Same date → tie broken by source order: tokens before figma.
		expect(result.entries.map((e) => e.source)).toEqual(["tokens", "figma"]);
		expect(result.total).toBe(5);
	});
});

describe("buildBreakingCalendar — dateless EXCLUDED", () => {
	it("excludes a dateless tokens-check even with stale>0 (cannot place on a date)", () => {
		const result = buildBreakingCalendar(
			records({ kind: "tokens-check", stale: 7 }), // no `at`
		);
		expect(result.entries).toEqual([]);
		expect(result.total).toBe(0);
	});

	it("excludes a dateless impact even with breaking>0", () => {
		const result = buildBreakingCalendar(
			records({ kind: "impact", breaking: 9 }), // no `at`
		);
		expect(result.entries).toEqual([]);
		expect(result.total).toBe(0);
	});

	it("excludes a record whose `at` is non-string (replayHistory drops the at)", () => {
		const result = buildBreakingCalendar(
			records({ at: 12345, kind: "tokens-check", stale: 3 }),
		);
		expect(result.entries).toEqual([]);
		expect(result.total).toBe(0);
	});
});

describe("buildBreakingCalendar — ordering & determinism", () => {
	it("sorts entries date-descending", () => {
		const result = buildBreakingCalendar(
			records(
				{ at: "2026-06-01T10:00:00Z", kind: "tokens-check", stale: 1 },
				{ at: "2026-06-10T10:00:00Z", kind: "impact", breaking: 1 },
				{ at: "2026-06-05T10:00:00Z", kind: "tokens-check", stale: 1 },
			),
		);
		expect(result.entries.map((e) => e.date)).toEqual([
			"2026-06-10",
			"2026-06-05",
			"2026-06-01",
		]);
	});

	it("breaks same-date ties by source (tokens<figma) then by detail", () => {
		const result = buildBreakingCalendar(
			records(
				{ at: "2026-06-07T10:00:00Z", kind: "impact", breaking: 2 },
				{ at: "2026-06-07T11:00:00Z", kind: "tokens-check", stale: 5 },
				{ at: "2026-06-07T12:00:00Z", kind: "impact", breaking: 8 },
			),
		);
		expect(result.entries.map((e) => e.date)).toEqual([
			"2026-06-07",
			"2026-06-07",
			"2026-06-07",
		]);
		// tokens entry first, then the two figma entries ordered by detail.
		expect(result.entries[0]?.source).toBe("tokens");
		expect(result.entries[1]?.source).toBe("figma");
		expect(result.entries[2]?.source).toBe("figma");
		const figmaDetails = [
			result.entries[1]?.detail ?? "",
			result.entries[2]?.detail ?? "",
		];
		expect([...figmaDetails].sort()).toEqual(figmaDetails);
	});

	it("is a pure function — repeated calls on the same input are identical", () => {
		const recs = records(
			{ at: "2026-06-01T10:00:00Z", kind: "tokens-check", stale: 1 },
			{ at: "2026-06-02T10:00:00Z", kind: "impact", breaking: 3 },
		);
		expect(buildBreakingCalendar(recs)).toEqual(buildBreakingCalendar(recs));
	});

	it("sums counts across all entries into total", () => {
		const result = buildBreakingCalendar(
			records(
				{ at: "2026-06-01T10:00:00Z", kind: "tokens-check", stale: 2 },
				{ at: "2026-06-02T10:00:00Z", kind: "impact", breaking: 3 },
				{ at: "2026-06-03T10:00:00Z", kind: "tokens-check", stale: 4 },
			),
		);
		expect(result.total).toBe(9);
	});
});

describe("buildBreakingCalendar — empty", () => {
	it("empty input → {entries:[], total:0}", () => {
		expect(buildBreakingCalendar([])).toEqual({ entries: [], total: 0 });
	});
});

describe("buildChangeFrequency — per-kind counts", () => {
	it("counts records per known kind in the fixed catalog-ish order", () => {
		const result = buildChangeFrequency(
			records(
				{ at: "2026-06-03T10:00:00Z", kind: "library-health", score: 1 },
				{ at: "2026-06-01T10:00:00Z", kind: "lint", byKind: {} },
				{ at: "2026-06-02T10:00:00Z", kind: "tokens-check", stale: 0 },
				{ at: "2026-06-02T11:00:00Z", kind: "lint", byKind: { exact: 1 } },
				{ at: "2026-06-04T10:00:00Z", kind: "impact", breaking: 0 },
			),
		);
		// Fixed order: tokens-check, lint, handoff, a11y, impact, adoption,
		// library-health — zero-count kinds (handoff, a11y, adoption) omitted.
		expect(result.byKind).toEqual([
			{ kind: "tokens-check", count: 1 },
			{ kind: "lint", count: 2 },
			{ kind: "impact", count: 1 },
			{ kind: "library-health", count: 1 },
		]);
	});

	it("omits zero-count kinds entirely", () => {
		const result = buildChangeFrequency(
			records({ at: "2026-06-01T10:00:00Z", kind: "handoff", score: 80 }),
		);
		expect(result.byKind).toEqual([{ kind: "handoff", count: 1 }]);
	});

	it("ignores unknown kinds (not in the fixed order)", () => {
		const result = buildChangeFrequency(
			records(
				{ at: "2026-06-01T10:00:00Z", kind: "brand-new-future-kind", value: 1 },
				{ at: "2026-06-02T10:00:00Z", kind: "lint", byKind: {} },
			),
		);
		expect(result.byKind).toEqual([{ kind: "lint", count: 1 }]);
	});
});

describe("buildChangeFrequency — dateless COUNTED (the asymmetry)", () => {
	it("counts a dateless record in the tally (vs the calendar, which excludes it)", () => {
		const recs = records(
			{ kind: "tokens-check", stale: 7 }, // dateless
			{ at: "2026-06-02T10:00:00Z", kind: "tokens-check", stale: 1 },
		);
		// Frequency COUNTS both (count is date-agnostic).
		const freq = buildChangeFrequency(recs);
		expect(freq.byKind).toEqual([{ kind: "tokens-check", count: 2 }]);
		// The calendar EXCLUDES the dateless one (one entry, count 1) — the asymmetry.
		const cal = buildBreakingCalendar(recs);
		expect(cal.entries).toHaveLength(1);
		expect(cal.entries[0]?.count).toBe(1);
	});

	it("windowFirst/windowLast see only DATED records, never dateless ones", () => {
		const result = buildChangeFrequency(
			records(
				{ kind: "lint", byKind: { exact: 1 } }, // dateless — counted, not windowed
				{ at: "2026-06-05T10:00:00Z", kind: "lint", byKind: { exact: 2 } },
				{ at: "2026-06-01T10:00:00Z", kind: "lint", byKind: { exact: 3 } },
				{ at: "2026-06-09T10:00:00Z", kind: "lint", byKind: { exact: 4 } },
			),
		);
		expect(result.byKind).toEqual([{ kind: "lint", count: 4 }]);
		expect(result.windowFirst).toBe("2026-06-01T10:00:00Z");
		expect(result.windowLast).toBe("2026-06-09T10:00:00Z");
	});

	it("omits windowFirst/windowLast when no dated records exist", () => {
		const result = buildChangeFrequency(
			records({ kind: "lint", byKind: {} }), // dateless only
		);
		expect(result.byKind).toEqual([{ kind: "lint", count: 1 }]);
		expect(Object.hasOwn(result, "windowFirst")).toBe(false);
		expect(Object.hasOwn(result, "windowLast")).toBe(false);
	});
});

describe("buildChangeFrequency — window bounds", () => {
	it("windowFirst=windowLast for a single dated record", () => {
		const result = buildChangeFrequency(
			records({ at: "2026-06-06T10:00:00Z", kind: "impact", breaking: 1 }),
		);
		expect(result.windowFirst).toBe("2026-06-06T10:00:00Z");
		expect(result.windowLast).toBe("2026-06-06T10:00:00Z");
	});

	it("min/max use the full instant string (not the truncated date)", () => {
		const result = buildChangeFrequency(
			records(
				{ at: "2026-06-06T23:00:00Z", kind: "lint", byKind: {} },
				{ at: "2026-06-06T01:00:00Z", kind: "lint", byKind: {} },
			),
		);
		expect(result.windowFirst).toBe("2026-06-06T01:00:00Z");
		expect(result.windowLast).toBe("2026-06-06T23:00:00Z");
	});

	it("is deterministic regardless of source order", () => {
		const a = buildChangeFrequency(
			records(
				{ at: "2026-06-09T10:00:00Z", kind: "lint", byKind: {} },
				{ at: "2026-06-01T10:00:00Z", kind: "lint", byKind: {} },
			),
		);
		const b = buildChangeFrequency(
			records(
				{ at: "2026-06-01T10:00:00Z", kind: "lint", byKind: {} },
				{ at: "2026-06-09T10:00:00Z", kind: "lint", byKind: {} },
			),
		);
		expect(a).toEqual(b);
	});
});

describe("buildChangeFrequency — empty", () => {
	it("empty input → {byKind:[]}", () => {
		const result = buildChangeFrequency([]);
		expect(result.byKind).toEqual([]);
		expect(Object.hasOwn(result, "windowFirst")).toBe(false);
		expect(Object.hasOwn(result, "windowLast")).toBe(false);
	});
});

describe("buildChangeFrequency — re-runs are not churn", () => {
	it("counts a surface's first state and each change, not identical re-runs", () => {
		const result = buildChangeFrequency(
			records(
				{
					at: "2026-06-01T10:00:00Z",
					kind: "lint",
					byKind: { exact: 2 },
					runId: "a",
				},
				{
					at: "2026-06-01T11:00:00Z",
					kind: "lint",
					byKind: { exact: 2 },
					runId: "b",
				},
				{
					at: "2026-06-01T12:00:00Z",
					kind: "lint",
					byKind: { exact: 1 },
					runId: "c",
				},
				{
					at: "2026-06-01T10:00:00Z",
					kind: "handoff",
					score: 100,
					nodeId: "1:1",
				},
				{
					at: "2026-06-01T10:00:00Z",
					kind: "handoff",
					score: 71,
					nodeId: "1:2",
				},
				{
					at: "2026-06-01T11:00:00Z",
					kind: "handoff",
					score: 100,
					nodeId: "1:1",
				},
			),
		);
		expect(result.byKind).toEqual([
			{ kind: "lint", count: 2 },
			{ kind: "handoff", count: 2 },
		]);
	});
});
