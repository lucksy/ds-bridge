// E1 — tidy history export (SPEC-analytics-export §4). Pure: history text in →
// one row per finite numeric payload leaf per record → CSV / JSONL text.
import { describe, expect, it } from "vitest";
import {
	EXPORT_COLUMNS,
	exportRows,
	resolveUntil,
	toCsv,
	toJsonl,
} from "../../../src/engines/history/export.js";

const j = (r: Record<string, unknown>) => JSON.stringify(r);

const V2_LINT = j({
	v: 2,
	at: "2026-10-02T10:00:00.000Z",
	kind: "lint",
	source: "ci",
	git: { sha: "abc123", branch: "main", dirty: false },
	tool: { version: "1.11.0" },
	runId: "run-1",
	byKind: { exact: 3, near: 1, offSystem: 0 },
	adoption: { refs: 30, literals: 10, byDirectory: [{ dir: "src", refs: 1 }] },
	files: ["a.css"],
	ok: true,
	label: "x",
});

const V1_HANDOFF = j({
	at: "2026-10-01T09:00:00.000Z",
	kind: "handoff",
	score: 80,
	frameName: "Checkout",
	deductions: [{ rule: "component", points: 10 }],
});

describe("exportRows", () => {
	it("emits one row per numeric leaf with dot paths, sorted within a record", () => {
		const rows = exportRows(V2_LINT, {});
		expect(rows.map((r) => r.metric)).toEqual([
			"adoption.byDirectory.src.refs",
			"adoption.literals",
			"adoption.refs",
			"byKind.exact",
			"byKind.near",
			"byKind.offSystem",
		]);
		expect(rows[1]).toEqual({
			at: "2026-10-02T10:00:00.000Z",
			date: "2026-10-02",
			runId: "run-1",
			sha: "abc123",
			branch: "main",
			source: "ci",
			kind: "lint",
			subject: null,
			metric: "adoption.literals",
			value: 10,
		});
	});

	it("never treats envelope keys as metrics (v, git, tool)", () => {
		const metrics = exportRows(V2_LINT, {}).map((r) => r.metric);
		expect(metrics.some((m) => m === "v" || m.startsWith("git."))).toBe(false);
		expect(metrics.some((m) => m.startsWith("tool."))).toBe(false);
	});

	it("v1 records carry null envelope columns", () => {
		const rows = exportRows(V1_HANDOFF, {});
		expect(rows).toEqual([
			{
				at: "2026-10-01T09:00:00.000Z",
				date: "2026-10-01",
				runId: null,
				sha: null,
				branch: null,
				source: null,
				kind: "handoff",
				subject: "Checkout",
				metric: "score",
				value: 80,
			},
		]);
	});

	it("subject names the frame (with its node id) so per-frame rows are distinguishable", () => {
		const text = [
			j({
				at: "2026-10-01T09:00:00.000Z",
				kind: "handoff",
				score: 80,
				frameName: "Checkout",
				fileKey: "F1",
				nodeId: "1:2",
			}),
			j({
				at: "2026-10-01T09:00:00.000Z",
				kind: "handoff",
				score: 40,
				frameName: "Profile",
				fileKey: "F1",
				nodeId: "3:4",
			}),
			j({
				at: "2026-10-01T09:00:00.000Z",
				kind: "frame-impl",
				frameName: "Checkout",
				fileKey: "F1",
				pct: 75,
				resolvedCount: 3,
				gapCount: 1,
				byReason: { "no-match": 1 },
				topGaps: [{ reason: "no-match", requirement: "Badge" }],
			}),
		].join("\n");
		const rows = exportRows(text, {});
		expect(rows.map((r) => [r.kind, r.subject, r.metric, r.value])).toEqual([
			["handoff", "Checkout (1:2)", "score", 80],
			["handoff", "Profile (3:4)", "score", 40],
			["frame-impl", "Checkout", "byReason.no-match", 1],
			["frame-impl", "Checkout", "gapCount", 1],
			["frame-impl", "Checkout", "pct", 75],
			["frame-impl", "Checkout", "resolvedCount", 3],
		]);
	});

	it("flattens arrays of identified objects by identity (a11y modes, byDirectory)", () => {
		const text = j({
			v: 2,
			at: "2026-10-04T20:12:11.225Z",
			kind: "a11y",
			source: "local",
			git: null,
			tool: null,
			level: "AA",
			modes: [
				{ mode: "default", passed: 10, failed: 2 },
				{ mode: "dark", passed: 9, failed: 3 },
			],
			list: [{ points: 1 }, 7, { name: "n", count: 4 }],
		});
		const rows = exportRows(text, {});
		expect(rows.map((r) => [r.metric, r.value])).toEqual([
			["list.n.count", 4],
			["modes.dark.failed", 3],
			["modes.dark.passed", 9],
			["modes.default.failed", 2],
			["modes.default.passed", 10],
		]);
		expect(rows[0]?.date).toBe("2026-10-04");
		expect(rows[0]?.subject).toBeNull();
	});

	it("identity keys are tried in order: mode, dir, componentName, name", () => {
		const text = j({
			at: "2026-01-01T00:00:00Z",
			kind: "x",
			a: [{ name: "n", componentName: "Button", dir: "src", v: 1 }],
			b: [
				{ name: "Card", v: 2 },
				{ componentName: null, name: "Box", v: 3 },
			],
		});
		expect(exportRows(text, {}).map((r) => r.metric)).toEqual([
			"a.src.v",
			"b.Box.v",
			"b.Card.v",
		]);
	});

	it("git null → null sha/branch; a detached null branch stays null", () => {
		const text = [
			j({
				v: 2,
				at: "2026-01-01T00:00:00Z",
				kind: "a11y",
				source: "local",
				git: null,
				tool: null,
				failed: 2,
			}),
			j({
				v: 2,
				at: "2026-01-02T00:00:00Z",
				kind: "a11y",
				source: "hook",
				git: { sha: "s", branch: null, dirty: true },
				tool: null,
				failed: 1,
			}),
		].join("\n");
		const rows = exportRows(text, {});
		expect(rows.map((r) => [r.sha, r.branch, r.source])).toEqual([
			[null, null, "local"],
			["s", null, "hook"],
		]);
	});

	it("keeps file order across records; skips corrupt, kindless and dateless lines", () => {
		const text = [
			V2_LINT,
			"{not json",
			j({ at: "2026-10-03T00:00:00Z", score: 1 }),
			j({ kind: "handoff", score: 50 }),
			V1_HANDOFF,
			"",
		].join("\n");
		const rows = exportRows(text, {});
		expect(rows.map((r) => r.kind)).toEqual([
			"lint",
			"lint",
			"lint",
			"lint",
			"lint",
			"lint",
			"handoff",
		]);
	});

	it("skips non-finite numbers, nulls and booleans", () => {
		const text = j({
			at: "2026-01-01T00:00:00Z",
			kind: "x",
			a: null,
			b: false,
			c: { d: 2 },
		});
		expect(exportRows(text, {}).map((r) => r.metric)).toEqual(["c.d"]);
	});

	it("filters by kinds", () => {
		const rows = exportRows(`${V2_LINT}\n${V1_HANDOFF}`, {
			kinds: ["handoff"],
		});
		expect(rows.map((r) => r.kind)).toEqual(["handoff"]);
	});

	it("since is inclusive; until exclusive/inclusive per flag", () => {
		const text = `${V2_LINT}\n${V1_HANDOFF}`;
		const lintMs = Date.parse("2026-10-02T10:00:00.000Z");
		expect(
			exportRows(text, { sinceMs: lintMs }).every((r) => r.kind === "lint"),
		).toBe(true);
		expect(
			exportRows(text, { untilMs: lintMs, untilExclusive: true }).map(
				(r) => r.kind,
			),
		).toEqual(["handoff"]);
		expect(
			exportRows(text, { untilMs: lintMs, untilExclusive: false }).length,
		).toBe(7);
	});

	it("an empty history is zero rows", () => {
		expect(exportRows("", {})).toEqual([]);
	});
});

describe("resolveUntil", () => {
	const now = "2026-10-05T12:00:00.000Z";
	it("a date covers the whole UTC day (exclusive next-day bound)", () => {
		expect(resolveUntil("2026-10-02", now)).toEqual({
			kind: "ok",
			untilMs: Date.parse("2026-10-03T00:00:00.000Z"),
			exclusive: true,
		});
	});
	it("a relative window is an inclusive instant", () => {
		expect(resolveUntil("2d", now)).toEqual({
			kind: "ok",
			untilMs: Date.parse("2026-10-03T12:00:00.000Z"),
			exclusive: false,
		});
	});
	it("a malformed value is a typed error", () => {
		expect(resolveUntil("yesterday", now).kind).toBe("error");
	});
});

describe("toCsv / toJsonl", () => {
	it("CSV has the fixed header and empty cells for nulls", () => {
		const csv = toCsv(exportRows(V1_HANDOFF, {}));
		expect(csv).toBe(
			`${EXPORT_COLUMNS.join(",")}\n2026-10-01T09:00:00.000Z,2026-10-01,,,,,handoff,Checkout,score,80\n`,
		);
		expect(EXPORT_COLUMNS).toEqual([
			"at",
			"date",
			"runId",
			"sha",
			"branch",
			"source",
			"kind",
			"subject",
			"metric",
			"value",
		]);
	});

	it("CSV with zero rows is the header only", () => {
		expect(toCsv([])).toBe(`${EXPORT_COLUMNS.join(",")}\n`);
	});

	it("CSV quotes separators/quotes/newlines and guards formula-leading text", () => {
		const csv = toCsv([
			{
				at: "2026-01-01T00:00:00Z",
				date: "2026-01-01",
				runId: 'a,"b"',
				sha: "x\ny",
				branch: "=HYPERLINK(1)",
				source: "-ci",
				kind: "@k",
				subject: "=Frame, (1:2)",
				metric: "+m",
				value: -3,
			},
		]);
		// value is numeric and never guarded (-3 stays -3)
		expect(csv).toBe(
			`${EXPORT_COLUMNS.join(",")}\n2026-01-01T00:00:00Z,2026-01-01,"a,""b""","x\ny",'=HYPERLINK(1),'-ci,'@k,"'=Frame, (1:2)",'+m,-3\n`,
		);
	});

	it("JSONL is one object per row with the keys in column order", () => {
		const out = toJsonl(exportRows(V1_HANDOFF, {}));
		expect(out).toBe(
			`${JSON.stringify({ at: "2026-10-01T09:00:00.000Z", date: "2026-10-01", runId: null, sha: null, branch: null, source: null, kind: "handoff", subject: "Checkout", metric: "score", value: 80 })}\n`,
		);
		expect(Object.keys(JSON.parse(out.trim()))).toEqual([...EXPORT_COLUMNS]);
		expect(toJsonl([])).toBe("");
	});
});
