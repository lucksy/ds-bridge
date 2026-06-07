// C2 — Scorecard markdown renderer. GOLDEN tests: the exact multi-line output
// IS the contract (inline expected strings). Pure string building — no I/O, no
// clock, no dates beyond the supplied ref labels. Layout (SPEC-scorecard §2):
//
//   ### Design-system scorecard
//
//   <summary line>            score + the strongest mover
//
//   | Metric | <baseLabel> | <currentLabel> | Δ |    (compare) — or 2-col current-only
//   |---|...|
//   | ...rows... |              ▲▼= arrows + signed deltas; **bold** drift on stale>base
//
//   #### Components
//   | Component | Score | Weight |
//   | ...sub-table... |
//
//   _no baseline at <ref>_     when a --delta ref had no committed history
//
// Golden specs: full-delta, current-only, no-baseline, single-row. Determinism
// and the strongest-mover tie-break (absolute Δ desc, then the fixed §2 row
// order) are pinned explicitly.
import { describe, expect, it } from "vitest";
import type { ScorecardModel } from "../../../src/engines/report/scorecard.js";
import { renderScorecardMarkdown } from "../../../src/engines/report/scorecard-md.js";

describe("renderScorecardMarkdown — full delta golden", () => {
	it("renders summary + compare table + component sub-table (exact string)", () => {
		const model: ScorecardModel = {
			kind: "ok",
			currentOnly: false,
			rows: [
				{
					id: "score",
					now: 79,
					base: 76,
					delta: 3,
					components: [
						{ kind: "drift", score: 70, weight: 25 },
						{ kind: "lint", score: 90, weight: 25 },
						{ kind: "adoption", score: 80, weight: 20 },
					],
				},
				{ id: "on-system", now: 90, base: 88, delta: 2 },
				{ id: "lint-violations", now: 4, base: 4, delta: 0 },
				{
					id: "drift",
					now: { stale: 1, missing: 0, orphan: 2 },
					base: { stale: 0, missing: 0, orphan: 2 },
				},
				{
					id: "import-coverage",
					now: { imported: 12, total: 20 },
					base: { imported: 10, total: 20 },
				},
				{ id: "contrast", now: 85, base: 80, delta: 5 },
				{
					id: "readiness",
					now: { score: 88, frame: "Checkout" },
					base: { score: 84, frame: "Checkout" },
					delta: 4,
				},
			],
		};
		const md = renderScorecardMarkdown(model, {
			currentLabel: "HEAD",
			baseLabel: "main",
		});
		expect(md).toBe(
			[
				"### Design-system scorecard",
				"",
				"Score 76 → 79 ▲ · contrast 80% → 85% ▲ · **1 breaking token change**",
				"",
				"| Metric | main | HEAD | Δ |",
				"| --- | --- | --- | --- |",
				"| System score | 76 | 79 | +3 ▲ |",
				"| On-system | 88% | 90% | +2 ▲ |",
				"| Lint violations | 4 | 4 | 0 = |",
				"| Drift (stale/missing/orphan) | 0/0/2 | **1/0/2** | +1 ▲ |",
				"| Import coverage | 10/20 | 12/20 | +2 ▲ |",
				"| Contrast | 80% | 85% | +5 ▲ |",
				"| Readiness (Checkout) | 84 | 88 | +4 ▲ |",
				"",
				"#### Components",
				"",
				"| Component | Score | Weight |",
				"| --- | --- | --- |",
				"| Drift | 70 | 25 |",
				"| Lint | 90 | 25 |",
				"| Adoption | 80 | 20 |",
				"",
			].join("\n"),
		);
	});
});

describe("renderScorecardMarkdown — current-only golden", () => {
	it("renders a single-value table (no Δ column) and the current-only summary", () => {
		const model: ScorecardModel = {
			kind: "ok",
			currentOnly: true,
			rows: [
				{
					id: "score",
					now: 79,
					components: [
						{ kind: "lint", score: 90, weight: 25 },
						{ kind: "adoption", score: 68, weight: 20 },
					],
				},
				{ id: "on-system", now: 68 },
				{ id: "lint-violations", now: 4 },
			],
		};
		const md = renderScorecardMarkdown(model, { currentLabel: "HEAD" });
		expect(md).toBe(
			[
				"### Design-system scorecard",
				"",
				"Score 79",
				"",
				"| Metric | HEAD |",
				"| --- | --- |",
				"| System score | 79 |",
				"| On-system | 68% |",
				"| Lint violations | 4 |",
				"",
				"#### Components",
				"",
				"| Component | Score | Weight |",
				"| --- | --- | --- |",
				"| Lint | 90 | 25 |",
				"| Adoption | 68 | 20 |",
				"",
			].join("\n"),
		);
	});
});

describe("renderScorecardMarkdown — no-baseline golden", () => {
	it("appends a no-baseline note naming the ref and renders current-only otherwise", () => {
		const model: ScorecardModel = {
			kind: "ok",
			currentOnly: true,
			rows: [
				{
					id: "score",
					now: 79,
					components: [{ kind: "lint", score: 90, weight: 25 }],
				},
				{ id: "lint-violations", now: 4 },
			],
		};
		const md = renderScorecardMarkdown(model, {
			currentLabel: "HEAD",
			baseLabel: "main",
			noBaseline: true,
		});
		expect(md).toBe(
			[
				"### Design-system scorecard",
				"",
				"Score 79",
				"",
				"| Metric | HEAD |",
				"| --- | --- |",
				"| System score | 79 |",
				"| Lint violations | 4 |",
				"",
				"#### Components",
				"",
				"| Component | Score | Weight |",
				"| --- | --- | --- |",
				"| Lint | 90 | 25 |",
				"",
				"_no baseline at main_",
				"",
			].join("\n"),
		);
	});
});

describe("renderScorecardMarkdown — single-row golden", () => {
	it("renders one non-score row with no component sub-table", () => {
		const model: ScorecardModel = {
			kind: "ok",
			currentOnly: false,
			rows: [{ id: "lint-violations", now: 1, base: 4, delta: -3 }],
		};
		const md = renderScorecardMarkdown(model, {
			currentLabel: "HEAD",
			baseLabel: "main",
		});
		expect(md).toBe(
			[
				"### Design-system scorecard",
				"",
				"Lint violations 4 → 1 ▼",
				"",
				"| Metric | main | HEAD | Δ |",
				"| --- | --- | --- | --- |",
				"| Lint violations | 4 | 1 | -3 ▼ |",
				"",
			].join("\n"),
		);
	});
});

describe("renderScorecardMarkdown — strongest-mover selection", () => {
	it("picks the largest absolute delta as the mover, ties broken by §2 row order", () => {
		// on-system Δ = +5 (abs 5) and contrast Δ = -5 (abs 5) tie; §2 order puts
		// on-system before contrast, so on-system is the mover in the summary.
		const model: ScorecardModel = {
			kind: "ok",
			currentOnly: false,
			rows: [
				{
					id: "score",
					now: 80,
					base: 79,
					delta: 1,
					components: [{ kind: "lint", score: 80, weight: 25 }],
				},
				{ id: "on-system", now: 90, base: 85, delta: 5 },
				{ id: "contrast", now: 80, base: 85, delta: -5 },
			],
		};
		const md = renderScorecardMarkdown(model, {
			currentLabel: "HEAD",
			baseLabel: "main",
		});
		const summary = md.split("\n")[2];
		expect(summary).toBe("Score 79 → 80 ▲ · on-system 85% → 90% ▲");
	});

	it("omits the mover clause when score is the only row with a delta", () => {
		const model: ScorecardModel = {
			kind: "ok",
			currentOnly: false,
			rows: [
				{
					id: "score",
					now: 80,
					base: 76,
					delta: 4,
					components: [{ kind: "lint", score: 80, weight: 25 }],
				},
			],
		};
		const md = renderScorecardMarkdown(model, {
			currentLabel: "HEAD",
			baseLabel: "main",
		});
		expect(md.split("\n")[2]).toBe("Score 76 → 80 ▲");
	});
});

describe("renderScorecardMarkdown — breaking-drift callout", () => {
	it("bolds the drift now cell ONLY when stale exceeds base stale", () => {
		const model: ScorecardModel = {
			kind: "ok",
			currentOnly: false,
			rows: [
				{
					id: "drift",
					now: { stale: 2, missing: 1, orphan: 0 },
					base: { stale: 5, missing: 1, orphan: 0 },
				},
			],
		};
		const md = renderScorecardMarkdown(model, {
			currentLabel: "HEAD",
			baseLabel: "main",
		});
		// stale 2 < base 5 → NOT bold, arrow shows the improvement
		expect(md).toContain(
			"| Drift (stale/missing/orphan) | 5/1/0 | 2/1/0 | -3 ▼ |",
		);
		expect(md).not.toContain("**2/1/0**");
	});
});

describe("renderScorecardMarkdown — current-only multi-count, no score row", () => {
	it("renders drift + import-coverage current cells and a non-score summary lead (golden)", () => {
		// No score row → the summary names the first now-bearing row (drift).
		const model: ScorecardModel = {
			kind: "ok",
			currentOnly: true,
			rows: [
				{ id: "drift", now: { stale: 2, missing: 1, orphan: 3 } },
				{ id: "import-coverage", now: { imported: 7, total: 14 } },
			],
		};
		const md = renderScorecardMarkdown(model, { currentLabel: "HEAD" });
		expect(md).toBe(
			[
				"### Design-system scorecard",
				"",
				"Drift (stale/missing/orphan) 2",
				"",
				"| Metric | HEAD |",
				"| --- | --- |",
				"| Drift (stale/missing/orphan) | 2/1/3 |",
				"| Import coverage | 7/14 |",
				"",
			].join("\n"),
		);
	});
});

describe("renderScorecardMarkdown — no-data", () => {
	it("renders a typed no-data note (defensive — the CLI exits 2 before calling)", () => {
		const md = renderScorecardMarkdown({ kind: "no-data" }, {});
		expect(md).toBe(
			[
				"### Design-system scorecard",
				"",
				"_No design-system history yet — run a check to populate the scorecard._",
				"",
			].join("\n"),
		);
	});
});

describe("renderScorecardMarkdown — determinism", () => {
	it("is deterministic for identical input", () => {
		const model: ScorecardModel = {
			kind: "ok",
			currentOnly: false,
			rows: [{ id: "contrast", now: 90, base: 85, delta: 5 }],
		};
		const a = renderScorecardMarkdown(model, {
			currentLabel: "a",
			baseLabel: "b",
		});
		const b = renderScorecardMarkdown(model, {
			currentLabel: "a",
			baseLabel: "b",
		});
		expect(a).toBe(b);
	});
});
