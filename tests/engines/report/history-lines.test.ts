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
