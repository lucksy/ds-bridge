// C4 / M3.2 — data-freshness engine. Test-first: a pure derivation over the
// shared tolerant `HistoryRecord[]` — the most-recent run per tracked check-kind,
// its age in whole days from an injected `nowIso`, and an aging/stale RAG band.
// Pure: records + nowIso + (partial) thresholds in → FreshnessRow[] out. No
// fs/clock/network; deterministic; never throws.
import { describe, expect, it } from "vitest";
import {
	buildFreshness,
	FRESHNESS_TRACKED_KINDS,
} from "../../../src/engines/report/freshness.js";
import { replayHistory } from "../../../src/engines/report/history-lines.js";

/** Build one JSONL line from a record object. */
function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

/** Replay raw JSONL into the shared tolerant record list (the engine's input). */
function records(...lines: string[]) {
	return replayHistory(lines.join("\n"));
}

/** Find one freshness row by its (logical) kind. */
function row(rows: ReturnType<typeof buildFreshness>, kind: string) {
	return rows.find((r) => r.kind === kind);
}

const NOW = "2026-06-30T00:00:00.000Z";

describe("buildFreshness", () => {
	it("emits one row per tracked kind, even with empty history (all never-run)", () => {
		const rows = buildFreshness(records(), NOW, undefined);
		expect(rows).toHaveLength(FRESHNESS_TRACKED_KINDS.length);
		for (const r of rows) {
			expect(r.band).toBe("unknown");
			expect(r.lastRun).toBeUndefined();
			expect(r.ageDays).toBeUndefined();
		}
		// Rows are in the canonical tracked-kind order.
		expect(rows.map((r) => r.kind)).toEqual([...FRESHNESS_TRACKED_KINDS]);
	});

	it("maps raw history kinds to logical kinds (tokens-check→drift, handoff→readiness)", () => {
		const rows = buildFreshness(
			records(
				line({ at: "2026-06-29T10:00:00.000Z", kind: "tokens-check" }),
				line({ at: "2026-06-29T10:00:00.000Z", kind: "handoff" }),
			),
			NOW,
			undefined,
		);
		expect(row(rows, "drift")?.lastRun).toBe("2026-06-29");
		expect(row(rows, "readiness")?.lastRun).toBe("2026-06-29");
		// The raw kind names are NOT present as rows.
		expect(row(rows, "tokens-check")).toBeUndefined();
		expect(row(rows, "handoff")).toBeUndefined();
	});

	it("takes the MAX dated `at` per kind and computes whole-day age", () => {
		const rows = buildFreshness(
			records(
				line({ at: "2026-06-01T10:00:00.000Z", kind: "lint" }),
				line({ at: "2026-06-20T10:00:00.000Z", kind: "lint" }),
				// An out-of-order EARLIER line never displaces the later max.
				line({ at: "2026-06-10T10:00:00.000Z", kind: "lint" }),
			),
			NOW,
			undefined,
		);
		const lint = row(rows, "lint");
		expect(lint?.lastRun).toBe("2026-06-20");
		// 2026-06-20 → 2026-06-30 = 10 whole days.
		expect(lint?.ageDays).toBe(10);
	});

	it("bands green below aging, amber at aging..stale, red at/above stale", () => {
		// drift defaults: aging 14, stale 30. now = 2026-06-30.
		const rows = buildFreshness(
			records(
				// drift 10d old → green (< 14).
				line({ at: "2026-06-20T00:00:00.000Z", kind: "tokens-check" }),
				// a11y 30d old, a11y defaults aging 30/stale 60 → amber (>= aging, < stale).
				line({ at: "2026-05-31T00:00:00.000Z", kind: "a11y" }),
				// lint 30d old, lint defaults aging 14/stale 30 → red (>= stale).
				line({ at: "2026-05-31T00:00:00.000Z", kind: "lint" }),
			),
			NOW,
			undefined,
		);
		expect(row(rows, "drift")?.band).toBe("green");
		expect(row(rows, "a11y")?.band).toBe("amber");
		expect(row(rows, "lint")?.band).toBe("red");
	});

	it("bands the aging boundary as amber and the stale boundary as red (inclusive)", () => {
		// lint defaults: aging 14, stale 30. now = 2026-06-30.
		const rows = buildFreshness(
			records(
				// exactly 14d → amber (aging inclusive).
				line({ at: "2026-06-16T00:00:00.000Z", kind: "lint" }),
			),
			NOW,
			undefined,
		);
		expect(row(rows, "lint")?.ageDays).toBe(14);
		expect(row(rows, "lint")?.band).toBe("amber");

		const stale = buildFreshness(
			records(
				// exactly 30d → red (stale inclusive).
				line({ at: "2026-05-31T00:00:00.000Z", kind: "lint" }),
			),
			NOW,
			undefined,
		);
		expect(row(stale, "lint")?.ageDays).toBe(30);
		expect(row(stale, "lint")?.band).toBe("red");
	});

	it("honors per-kind config overrides, merging absent kinds onto defaults", () => {
		const rows = buildFreshness(
			records(line({ at: "2026-06-25T00:00:00.000Z", kind: "lint" })),
			NOW,
			// Tighten lint: aging 3, stale 5. 5d old → red.
			{ lint: { aging: 3, stale: 5 } },
		);
		expect(row(rows, "lint")?.ageDays).toBe(5);
		expect(row(rows, "lint")?.band).toBe("red");
		// A kind NOT in the override still uses its default (drift never-run here).
		expect(row(rows, "drift")?.band).toBe("unknown");
	});

	it("treats a dateless-but-present line as run-with-no-anchorable-age", () => {
		// A line with a numeric/absent `at` carries presence but no date → the
		// kind is "present" (not never-run) yet its age cannot be computed.
		const rows = buildFreshness(
			records(line({ kind: "lint" })),
			NOW,
			undefined,
		);
		const lint = row(rows, "lint");
		expect(lint?.lastRun).toBeUndefined();
		expect(lint?.ageDays).toBeUndefined();
		// No date → no band beyond "unknown" (we cannot age it).
		expect(lint?.band).toBe("unknown");
	});

	it("a dated line wins over a dateless one of the same kind", () => {
		const rows = buildFreshness(
			records(
				line({ kind: "lint" }),
				line({ at: "2026-06-25T00:00:00.000Z", kind: "lint" }),
			),
			NOW,
			undefined,
		);
		const lint = row(rows, "lint");
		expect(lint?.lastRun).toBe("2026-06-25");
		expect(lint?.ageDays).toBe(5);
		expect(lint?.band).toBe("green");
	});

	it("ignores untracked / unknown kinds (forward compat)", () => {
		const rows = buildFreshness(
			records(
				line({ at: "2026-06-29T00:00:00.000Z", kind: "future-thing" }),
				line({ at: "2026-06-29T00:00:00.000Z", kind: "lint" }),
			),
			NOW,
			undefined,
		);
		expect(row(rows, "future-thing")).toBeUndefined();
		expect(row(rows, "lint")?.lastRun).toBe("2026-06-29");
	});

	it("never throws on malformed records (defensive)", () => {
		expect(() =>
			buildFreshness(
				records(line({ at: 123 as unknown as string, kind: "lint" })),
				NOW,
				undefined,
			),
		).not.toThrow();
	});
});
