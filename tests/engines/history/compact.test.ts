// H6 — `history compact` (SPEC-history-v2 §1.5, §4). Pure: history text in →
// compacted text + counts out. A run of IDENTICAL consecutive same-kind records
// (payload equal; envelope keys incl. `at` ignored) collapses to its LATEST
// member, so every last-wins reader and data freshness are unchanged.
import { describe, expect, it } from "vitest";
import { compactHistory } from "../../../src/engines/history/compact.js";

const j = (r: Record<string, unknown>) => JSON.stringify(r);
const lines = (text: string) => text.split("\n").filter((l) => l !== "");

describe("compactHistory — dedupe", () => {
	it("collapses identical consecutive same-kind records to the latest", () => {
		const text = [
			j({ at: "2026-01-01T00:00:00Z", kind: "handoff", score: 80 }),
			j({ at: "2026-01-02T00:00:00Z", kind: "handoff", score: 80 }),
			j({ at: "2026-01-03T00:00:00Z", kind: "handoff", score: 80 }),
		].join("\n");
		const result = compactHistory(text);
		expect(lines(result.text)).toEqual([
			j({ at: "2026-01-03T00:00:00Z", kind: "handoff", score: 80 }),
		]);
		expect(result.before).toBe(3);
		expect(result.after).toBe(1);
		expect(result.removed).toBe(2);
	});

	it("'consecutive' is per kind: other kinds in between do not break a run", () => {
		const text = [
			j({ at: "2026-01-01", kind: "lint", byKind: { exact: 1 } }),
			j({ at: "2026-01-01", kind: "a11y", modes: [] }),
			j({ at: "2026-01-02", kind: "lint", byKind: { exact: 1 } }),
		].join("\n");
		expect(lines(compactHistory(text).text)).toEqual([
			j({ at: "2026-01-01", kind: "a11y", modes: [] }),
			j({ at: "2026-01-02", kind: "lint", byKind: { exact: 1 } }),
		]);
	});

	it("a changed value breaks the run (A, B, A keeps all three)", () => {
		const text = [
			j({ at: "1", kind: "lint", n: 1 }),
			j({ at: "2", kind: "lint", n: 2 }),
			j({ at: "3", kind: "lint", n: 1 }),
		].join("\n");
		expect(compactHistory(text).removed).toBe(0);
	});

	it("ignores envelope keys (v, source, git, tool, runId) and key order", () => {
		const text = [
			j({ at: "1", kind: "lint", a: 1, b: 2 }),
			j({
				v: 2,
				at: "2",
				kind: "lint",
				source: "ci",
				git: { sha: "x", branch: "main", dirty: false },
				tool: { version: "1" },
				runId: "r",
				b: 2,
				a: 1,
			}),
		].join("\n");
		const result = compactHistory(text);
		expect(result.removed).toBe(1);
		expect(lines(result.text)[0]).toContain('"runId":"r"');
	});

	it("keeps corrupt and kindless lines verbatim, in place", () => {
		const text = ["{oops", j({ at: "1", note: "no kind" }), ""].join("\n");
		const result = compactHistory(text);
		expect(lines(result.text)).toEqual([
			"{oops",
			j({ at: "1", note: "no kind" }),
		]);
		expect(result.removed).toBe(0);
	});

	it("is idempotent and ends with a newline when non-empty", () => {
		const text = [
			j({ at: "1", kind: "lint", n: 1 }),
			j({ at: "2", kind: "lint", n: 1 }),
		].join("\n");
		const once = compactHistory(text).text;
		expect(once.endsWith("\n")).toBe(true);
		expect(compactHistory(once).text).toBe(once);
		expect(compactHistory("").text).toBe("");
	});
});

describe("compactHistory — keepPerDay", () => {
	it("keeps the last record per kind per UTC day (after dedupe)", () => {
		const text = [
			j({ at: "2026-01-01T08:00:00Z", kind: "lint", n: 1 }),
			j({ at: "2026-01-01T09:00:00Z", kind: "lint", n: 2 }),
			j({ at: "2026-01-01T10:00:00Z", kind: "a11y", n: 1 }),
			j({ at: "2026-01-02T08:00:00Z", kind: "lint", n: 3 }),
			j({ kind: "lint", n: 4 }),
		].join("\n");
		expect(lines(compactHistory(text, { keepPerDay: true }).text)).toEqual([
			j({ at: "2026-01-01T09:00:00Z", kind: "lint", n: 2 }),
			j({ at: "2026-01-01T10:00:00Z", kind: "a11y", n: 1 }),
			j({ at: "2026-01-02T08:00:00Z", kind: "lint", n: 3 }),
			j({ kind: "lint", n: 4 }),
		]);
	});

	it("keeps one record per FRAME per day — per-frame handoff lines never collapse", () => {
		const text = [
			j({
				at: "2026-01-01T08:00:00Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "1:1",
				score: 70,
			}),
			j({
				at: "2026-01-01T08:00:01Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "2:2",
				score: 90,
			}),
			j({
				at: "2026-01-01T12:00:00Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "1:1",
				score: 75,
			}),
			j({
				at: "2026-01-01T12:00:01Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "2:2",
				score: 91,
			}),
		].join("\n");
		expect(lines(compactHistory(text, { keepPerDay: true }).text)).toEqual([
			j({
				at: "2026-01-01T12:00:00Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "1:1",
				score: 75,
			}),
			j({
				at: "2026-01-01T12:00:01Z",
				kind: "handoff",
				fileKey: "F",
				nodeId: "2:2",
				score: 91,
			}),
		]);
	});

	it("keeps one library-health record per FILE per day", () => {
		const text = [
			j({
				at: "2026-01-01T08:00:00Z",
				kind: "library-health",
				fileKey: "A",
				deprecatedUsage: 1,
			}),
			j({
				at: "2026-01-01T08:00:01Z",
				kind: "library-health",
				fileKey: "B",
				deprecatedUsage: 2,
			}),
		].join("\n");
		expect(compactHistory(text, { keepPerDay: true }).removed).toBe(0);
	});
});

describe("compactHistory — subjects", () => {
	it("dedupes identical records of one frame even when other frames interleave", () => {
		const a = { kind: "handoff", fileKey: "F", nodeId: "1:1", score: 80 };
		const b = { kind: "handoff", fileKey: "F", nodeId: "2:2", score: 60 };
		const text = [
			j({ at: "1", ...a }),
			j({ at: "2", ...b }),
			j({ at: "3", ...a }),
			j({ at: "4", ...b }),
		].join("\n");
		expect(lines(compactHistory(text).text)).toEqual([
			j({ at: "3", ...a }),
			j({ at: "4", ...b }),
		]);
	});
});
