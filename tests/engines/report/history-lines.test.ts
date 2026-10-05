// D0 — the shared tolerant history-line iterator, test-first. `replayHistory`
// turns one `history.jsonl` text into an ORDERED list of tolerant records, each
// carrying `{ kind, at?, record }`. The tolerance contract is the blessed wave-2
// shape (score.ts:304-344 builds exactly this ordered form): per-line
// JSON.parse skip-on-corrupt, a record must be a non-null object with a STRING
// `kind` to be emitted, `at` is carried only when it is a string, and UNKNOWN
// kinds are emitted (consumers skip what they don't recognize). The scorecard
// last-wins map is then a thin fold over this list — the scorecard suite is the
// refactor net.
import { describe, expect, it } from "vitest";
import { replayHistory } from "../../../src/engines/report/history-lines.js";

/** Build one JSONL line from a record object. */
function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

describe("replayHistory — ordering", () => {
	it("preserves source order across kinds", () => {
		const text = [
			line({ at: "2026-06-01", kind: "tokens-check", stale: 1 }),
			line({ at: "2026-06-02", kind: "lint", byKind: {} }),
			line({ at: "2026-06-03", kind: "a11y", modes: [] }),
		].join("\n");

		const records = replayHistory(text);
		expect(records.map((r) => r.kind)).toEqual([
			"tokens-check",
			"lint",
			"a11y",
		]);
		expect(records.map((r) => r.at)).toEqual([
			"2026-06-01",
			"2026-06-02",
			"2026-06-03",
		]);
	});

	it("emits two same-kind records in order (does NOT collapse to last-wins)", () => {
		const text = [
			line({ at: "2026-06-01", kind: "lint", byKind: { exact: 1 } }),
			line({ at: "2026-06-02", kind: "lint", byKind: { exact: 9 } }),
		].join("\n");

		const records = replayHistory(text);
		expect(records).toHaveLength(2);
		expect(records[0]?.record.byKind).toEqual({ exact: 1 });
		expect(records[1]?.record.byKind).toEqual({ exact: 9 });
	});
});

describe("replayHistory — tolerance", () => {
	it("skips corrupt (non-JSON) lines and blanks, keeping the rest in order", () => {
		const text = [
			line({ at: "2026-06-01", kind: "tokens-check", stale: 1 }),
			"{ this is not json",
			"",
			"   ",
			line({ at: "2026-06-02", kind: "lint", byKind: {} }),
		].join("\n");

		const records = replayHistory(text);
		expect(records.map((r) => r.kind)).toEqual(["tokens-check", "lint"]);
	});

	it("skips a line whose parse is not a non-null object", () => {
		const text = [
			"42",
			"null",
			'"a string"',
			line({ kind: "lint", byKind: {} }),
		].join("\n");

		const records = replayHistory(text);
		expect(records).toHaveLength(1);
		expect(records[0]?.kind).toBe("lint");
	});

	it("skips an object whose kind is missing or not a string", () => {
		const text = [
			line({ at: "2026-06-01", stale: 1 }), // no kind
			line({ at: "2026-06-01", kind: 7 }), // kind not a string
			line({ kind: "lint", byKind: {} }), // valid
		].join("\n");

		const records = replayHistory(text);
		expect(records).toHaveLength(1);
		expect(records[0]?.kind).toBe("lint");
	});

	it("carries `at` only when it is a string (absent otherwise)", () => {
		const text = [
			line({ kind: "lint", byKind: {} }), // no at
			line({ at: 12345, kind: "a11y", modes: [] }), // at not a string
			line({ at: "2026-06-03", kind: "handoff", score: 80 }), // string at
		].join("\n");

		const records = replayHistory(text);
		expect(records).toHaveLength(3);
		expect(records[0]?.at).toBeUndefined();
		expect(Object.hasOwn(records[0] ?? {}, "at")).toBe(false);
		expect(records[1]?.at).toBeUndefined();
		expect(records[2]?.at).toBe("2026-06-03");
	});

	it("emits UNKNOWN kinds (forward-compat: the consumer skips what it doesn't know)", () => {
		const text = [
			line({ at: "2026-06-01", kind: "tokens-check", stale: 1 }),
			line({ at: "2026-06-02", kind: "brand-new-future-kind", value: 1 }),
			line({ at: "2026-06-03", kind: "lint", byKind: {} }),
		].join("\n");

		const records = replayHistory(text);
		expect(records.map((r) => r.kind)).toEqual([
			"tokens-check",
			"brand-new-future-kind",
			"lint",
		]);
	});

	it("returns an empty list for empty / whitespace-only text", () => {
		expect(replayHistory("")).toEqual([]);
		expect(replayHistory("\n\n   \n")).toEqual([]);
	});

	it("carries the full parsed record verbatim", () => {
		const rec = {
			at: "2026-06-01",
			kind: "lint",
			byKind: { exact: 1, near: 2, offSystem: 3 },
			adoption: { refs: 80, literals: 20, byDirectory: [] },
		};
		const records = replayHistory(line(rec));
		expect(records).toHaveLength(1);
		expect(records[0]?.record).toEqual(rec);
	});
});

// H2 — v1 + v2 read transparently (SPEC-history-v2 §3). A v2 line keeps `at` and
// `kind` top-level, so it replays exactly like v1 plus an optional `envelope`.
describe("replayHistory — v2 envelope (H2)", () => {
	it("emits NO envelope property for a v1 record (output unchanged)", () => {
		const records = replayHistory(
			line({ at: "2026-06-01", kind: "lint", byKind: {} }),
		);
		expect(records[0]).toEqual({
			kind: "lint",
			at: "2026-06-01",
			record: { at: "2026-06-01", kind: "lint", byKind: {} },
		});
		expect(records[0]).not.toHaveProperty("envelope");
	});

	it("emits the envelope for a v2 record, keeping kind/at/record", () => {
		const rec = {
			v: 2,
			at: "2026-10-04T00:00:00.000Z",
			kind: "lint",
			source: "ci",
			git: { sha: "abc", branch: "main", dirty: false },
			tool: { version: "1.11.0" },
			runId: "r-1",
			byKind: { exact: 1 },
		};
		const records = replayHistory(line(rec));
		expect(records[0]?.kind).toBe("lint");
		expect(records[0]?.at).toBe("2026-10-04T00:00:00.000Z");
		expect(records[0]?.record).toEqual(rec);
		expect(records[0]?.envelope).toEqual({
			v: 2,
			source: "ci",
			runId: "r-1",
			git: { sha: "abc", branch: "main", dirty: false },
			tool: { version: "1.11.0" },
		});
	});

	it("reads a mixed v1/v2 file in order", () => {
		const text = [
			line({ at: "2026-06-01", kind: "lint", byKind: {} }),
			line({ v: 2, at: "2026-06-02", kind: "a11y", source: "local" }),
		].join("\n");
		const records = replayHistory(text);
		expect(records.map((r) => r.kind)).toEqual(["lint", "a11y"]);
		expect(records[0]?.envelope).toBeUndefined();
		expect(records[1]?.envelope?.v).toBe(2);
	});
});
