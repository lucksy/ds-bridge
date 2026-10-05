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
				"| On-system | 80 | 20 |",
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
				"| On-system | 68 | 20 |",
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

// ─── M5.1 — selection-gated appendix blocks ─────────────────────────────────
// The scorecard's headline table is unchanged; selected metric artifacts append
// their own `###` block AFTER it. `artifacts` gates which blocks render (absent
// → none, preserving the bare-scorecard goldens above). `--delta` (compare mode
// + base-side blocks) adds the now-vs-base columns/rows the SPEC §5 calls for.
import type { ArtifactId } from "../../../src/engines/report/catalog.js";

/** A minimal compare model carrying just a score row (for the velocity "score N"). */
const SCORE_MODEL: ScorecardModel = {
	kind: "ok",
	currentOnly: false,
	rows: [{ id: "score", now: 79, base: 76, delta: 3, components: [] }],
};

describe("renderScorecardMarkdown — appendix gating", () => {
	it("renders NO appendix when artifacts is undefined (bare scorecard)", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			baseLabel: "main",
			blocks: {
				targets: [
					{ metric: "drift", measured: 1, target: 0, op: "==", band: "red" },
				],
			},
		});
		expect(out).not.toContain("### Targets");
	});

	it("renders a block only when its artifact id is selected", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			baseLabel: "main",
			artifacts: ["score-velocity"] as ArtifactId[],
			blocks: {
				targets: [
					{ metric: "drift", measured: 1, target: 0, op: "==", band: "red" },
				],
				scoreVelocity: {
					delta: 4,
					windowDays: 30,
					direction: "up",
					regressionStreak: 0,
				},
			},
		});
		expect(out).not.toContain("### Targets");
		expect(out).toContain("### Score velocity");
	});
});

describe("renderScorecardMarkdown — Targets block", () => {
	it("renders RAG glyphs, %-format, and em-dash for unmeasured (exact)", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			artifacts: ["targets"] as ArtifactId[],
			blocks: {
				targets: [
					{
						metric: "on-system",
						measured: 90,
						target: 90,
						op: ">=",
						band: "green",
					},
					{ metric: "drift", measured: 1, target: 0, op: "==", band: "red" },
					{
						metric: "contrast",
						measured: 80,
						target: 90,
						op: ">=",
						band: "amber",
					},
					{
						metric: "parity",
						measured: undefined,
						target: 100,
						op: ">=",
						band: "unknown",
					},
				],
			},
		});
		expect(out).toContain(
			[
				"### Targets",
				"",
				"| Metric | Measured | Target | Status |",
				"| --- | --- | --- | --- |",
				"| on-system | 90% | >= 90 | 🟢 |",
				"| drift | 1 | == 0 | 🔴 |",
				"| contrast | 80% | >= 90 | 🟡 |",
				"| parity | — | >= 100 | ⚪ |",
			].join("\n"),
		);
	});
});

describe("renderScorecardMarkdown — Freshness block", () => {
	it("renders kind/last-run/age/band, never row as em-dash (exact)", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			artifacts: ["data-freshness"] as ArtifactId[],
			blocks: {
				dataFreshness: [
					{ kind: "drift", lastRun: "2026-06-01", ageDays: 9, band: "green" },
					{ kind: "a11y", band: "unknown" },
				],
			},
		});
		expect(out).toContain(
			[
				"### Freshness",
				"",
				"| Kind | Last run | Age | Band |",
				"| --- | --- | --- | --- |",
				"| drift | 2026-06-01 | 9d | 🟢 |",
				"| a11y | never | — | ⚪ |",
			].join("\n"),
		);
	});

	it("adds a Δ age column under --delta against the base-side ages", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			baseLabel: "main",
			artifacts: ["data-freshness"] as ArtifactId[],
			blocks: {
				dataFreshness: [
					{ kind: "drift", lastRun: "2026-06-10", ageDays: 2, band: "green" },
				],
			},
			baseBlocks: {
				dataFreshness: [
					{ kind: "drift", lastRun: "2026-06-01", ageDays: 9, band: "amber" },
				],
			},
		});
		expect(out).toContain("| Kind | Last run | Age | Δ age | Band |");
		expect(out).toContain("| drift | 2026-06-10 | 2d | -7 ▼ | 🟢 |");
	});
});

describe("renderScorecardMarkdown — Score velocity block", () => {
	it("renders the score/window/direction/streak line (exact, non-delta)", () => {
		const out = renderScorecardMarkdown(
			{
				kind: "ok",
				currentOnly: true,
				rows: [{ id: "score", now: 79, components: [] }],
			},
			{
				artifacts: ["score-velocity"] as ArtifactId[],
				blocks: {
					scoreVelocity: {
						delta: 4,
						windowDays: 30,
						direction: "up",
						regressionStreak: 0,
					},
				},
			},
		);
		expect(out).toContain("### Score velocity");
		expect(out).toContain("score 79 · +4 over 30d · up · 0-decline streak");
	});

	it("labels both window and git-ref deltas under --delta", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			baseLabel: "main",
			artifacts: ["score-velocity"] as ArtifactId[],
			blocks: {
				scoreVelocity: {
					delta: 4,
					windowDays: 30,
					direction: "up",
					regressionStreak: 0,
				},
			},
		});
		expect(out).toContain(
			"score 79 · window +4 over 30d · git-ref +3 · up · 0-decline streak",
		);
	});

	it("omits the block when velocity is absent (<2 trend points)", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			artifacts: ["score-velocity"] as ArtifactId[],
			blocks: {},
		});
		expect(out).not.toContain("### Score velocity");
	});
});

describe("renderScorecardMarkdown — Migration checklist block", () => {
	it("renders the call-site table + count line (exact)", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			artifacts: ["migration-checklist"] as ArtifactId[],
			blocks: {
				migrationChecklist: {
					truncated: false,
					sites: [
						{
							file: "src/Button.tsx",
							line: 12,
							subject: "Button",
							from: "large",
							to: "lg",
						},
					],
				},
			},
		});
		expect(out).toContain(
			[
				"### Migration checklist",
				"",
				"1 call site to migrate.",
				"",
				"| Site | Subject | Change |",
				"| --- | --- | --- |",
				"| `src/Button.tsx:12` | Button | `large` → `lg` |",
			].join("\n"),
		);
	});

	it("notes truncation when the cap was hit", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			artifacts: ["migration-checklist"] as ArtifactId[],
			blocks: {
				migrationChecklist: {
					truncated: true,
					sites: [{ file: "a.tsx", line: 1, subject: "X", from: "a", to: "b" }],
				},
			},
		});
		expect(out).toContain("1 call site to migrate (capped).");
	});
});

describe("renderScorecardMarkdown — Ownership block", () => {
	it("renders the worst-first owner table (exact)", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			artifacts: ["ownership-leaderboard"] as ArtifactId[],
			blocks: {
				ownershipLeaderboard: [
					{ owner: "unowned", refs: 5, literals: 5, pct: 50 },
					{ owner: "@team-a", refs: 40, literals: 10, pct: 80 },
				],
			},
		});
		expect(out).toContain(
			[
				"### Ownership",
				"",
				"| Owner | On-system | Refs | Literals |",
				"| --- | --- | --- | --- |",
				"| unowned | 50% | 5 | 5 |",
				"| @team-a | 80% | 40 | 10 |",
			].join("\n"),
		);
	});

	it("adds a Δ pct column under --delta against the base-side owners", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			baseLabel: "main",
			artifacts: ["ownership-leaderboard"] as ArtifactId[],
			blocks: {
				ownershipLeaderboard: [
					{ owner: "@team-a", refs: 40, literals: 10, pct: 80 },
				],
			},
			baseBlocks: {
				ownershipLeaderboard: [
					{ owner: "@team-a", refs: 30, literals: 20, pct: 60 },
				],
			},
		});
		expect(out).toContain("| Owner | On-system | Refs | Literals | Δ pct |");
		expect(out).toContain("| @team-a | 80% | 40 | 10 | +20 ▲ |");
	});
});

describe("renderScorecardMarkdown — Library health delta rows", () => {
	it("renders 3 count delta rows under --delta (exact)", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			baseLabel: "main",
			artifacts: ["library-health-trend"] as ArtifactId[],
			blocks: {
				libraryHealthTrend: [
					{ date: "2026-06-10", overrides: 3, deprecated: 2, detached: 6 },
				],
			},
			baseBlocks: {
				libraryHealthTrend: [
					{ date: "2026-06-01", overrides: 5, deprecated: 2, detached: 4 },
				],
			},
		});
		expect(out).toContain(
			[
				"### Library health",
				"",
				"| Signal | main | current | Δ |",
				"| --- | --- | --- | --- |",
				"| Override hotspots | 5 | 3 | -2 ▼ |",
				"| Deprecated usage | 2 | 2 | 0 = |",
				"| Detached candidates | 4 | 6 | +2 ▲ |",
			].join("\n"),
		);
	});

	it("omits the library-health block without --delta (no base side)", () => {
		const out = renderScorecardMarkdown(
			{
				kind: "ok",
				currentOnly: true,
				rows: [{ id: "score", now: 79, components: [] }],
			},
			{
				artifacts: ["library-health-trend"] as ArtifactId[],
				blocks: {
					libraryHealthTrend: [
						{ date: "2026-06-10", overrides: 3, deprecated: 2, detached: 6 },
					],
				},
			},
		);
		expect(out).not.toContain("### Library health");
	});
});

describe("renderScorecardMarkdown — Changelog echo block", () => {
	it("echoes per-audience counts + recent items (exact)", () => {
		const out = renderScorecardMarkdown(SCORE_MODEL, {
			artifacts: ["audience-changelog"] as ArtifactId[],
			blocks: {
				audienceChangelog: {
					slices: [
						{
							audience: "designers",
							breaking: 1,
							additive: 2,
							cosmetic: 0,
							recent: ["Button renamed"],
						},
						{
							audience: "developers",
							breaking: 0,
							additive: 3,
							cosmetic: 1,
							recent: [],
						},
					],
				},
			},
		});
		expect(out).toContain(
			[
				"### Changelog",
				"",
				"**For designers** — 1 breaking · 2 additive · 0 cosmetic",
				"- Button renamed",
				"",
				"**For developers** — 0 breaking · 3 additive · 1 cosmetic",
			].join("\n"),
		);
	});
});

describe("renderScorecardMarkdown — appendix is also the parity component label", () => {
	it("labels a parity score component in the sub-table", () => {
		const out = renderScorecardMarkdown(
			{
				kind: "ok",
				currentOnly: true,
				rows: [
					{
						id: "score",
						now: 80,
						components: [{ kind: "parity", score: 90, weight: 20 }],
					},
				],
			},
			{},
		);
		expect(out).toContain("| Parity | 90 | 20 |");
	});
});
