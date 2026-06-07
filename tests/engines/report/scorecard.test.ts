// C1 — Scorecard model engine. Test-first: the §2 rules table, spec'd before
// implementation. buildScorecard(currentText, baseText?, weights) replays raw
// history text on each side and produces a typed, deterministic comparison model
// for the PR scorecard (SPEC-scorecard §2). The seven rows:
//
//   score          — composite via scoreFromHistory (CURRENT weights on BOTH
//                     sides per SPEC §1.5), with per-component sub-scores
//   on-system      — latest adoption-bearing lint line pct (parallel last-wins)
//   lint-violations— latest lint line byKind totals summed
//   drift          — latest tokens-check stale/missing/orphan
//   import-coverage— latest adoption line imported/total
//   contrast       — latest a11y line Σpassed/(Σpassed+Σfailed) pct
//   readiness      — latest handoff line score + frame
//
// Omission rules: a row absent on BOTH sides is omitted; `delta` only when the
// base side has the row; zero rows on both sides → { kind: "no-data" }. A model
// built with baseText undefined is flagged `currentOnly`. Parsing tolerance is
// the blessed wave-2 re-parse (per score.ts:5-10): one shared internal line-
// iterator, per-line JSON.parse skip-on-corrupt, unknown-kind skip, asNumber
// coercion, last-wins, adoption parallel-last-wins keyed on field presence.
import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS } from "../../../src/engines/report/score.js";
import {
	buildScorecard,
	type ScorecardModel,
	type ScorecardRow,
} from "../../../src/engines/report/scorecard.js";

/** Build one JSONL line from a record object. */
function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

/** A complete current-side history exercising every row at least once. */
function fullHistory(): string {
	return [
		line({
			at: "2026-06-01",
			kind: "tokens-check",
			stale: 1,
			missing: 0,
			orphan: 2,
			inSync: false,
		}),
		line({
			at: "2026-06-02",
			kind: "lint",
			byKind: { exact: 1, near: 2, offSystem: 3 },
			adoption: { refs: 80, literals: 20, byDirectory: [] },
		}),
		line({
			at: "2026-06-03",
			kind: "adoption",
			imported: 12,
			total: 20,
			uncovered: [],
		}),
		line({
			at: "2026-06-04",
			kind: "handoff",
			score: 88,
			frameName: "Checkout",
			deductions: [],
		}),
		line({
			at: "2026-06-05",
			kind: "a11y",
			level: "AA",
			modes: [
				{ mode: "light", passed: 18, failed: 2 },
				{ mode: "dark", passed: 16, failed: 4 },
			],
		}),
	].join("\n");
}

/** Find a row by id from a non-no-data model (test helper, asserts presence). */
function row(model: ScorecardModel, id: ScorecardRow["id"]): ScorecardRow {
	if (model.kind === "no-data") {
		throw new Error("expected an ok model, got no-data");
	}
	const found = model.rows.find((r) => r.id === id);
	if (found === undefined) {
		throw new Error(`expected row "${id}" to be present`);
	}
	return found;
}

describe("buildScorecard — no-data", () => {
	it("returns { kind: 'no-data' } when neither side has any score-relevant rows", () => {
		const model = buildScorecard("", undefined, DEFAULT_WEIGHTS);
		expect(model).toEqual({ kind: "no-data" });
	});

	it("returns no-data when both sides are only corrupt / unknown-kind lines", () => {
		const text = ["not json", line({ kind: "mystery", x: 1 }), ""].join("\n");
		const model = buildScorecard(text, text, DEFAULT_WEIGHTS);
		expect(model).toEqual({ kind: "no-data" });
	});
});

describe("buildScorecard — currentOnly flag", () => {
	it("flags currentOnly true when baseText is undefined", () => {
		const model = buildScorecard(fullHistory(), undefined, DEFAULT_WEIGHTS);
		expect(model.kind).toBe("ok");
		if (model.kind === "ok") {
			expect(model.currentOnly).toBe(true);
		}
	});

	it("flags currentOnly false when a baseText (even empty string) is supplied", () => {
		const model = buildScorecard(fullHistory(), "", DEFAULT_WEIGHTS);
		expect(model.kind).toBe("ok");
		if (model.kind === "ok") {
			expect(model.currentOnly).toBe(false);
		}
	});
});

describe("buildScorecard — score row (both sides, current weights)", () => {
	it("scores both sides and computes a signed delta with components on the now side", () => {
		// base: one lint line (offSystem 5 → lintScore 50). current: same kind but
		// offSystem 1 → lintScore 90. Single component → composite == that sub-score.
		const base = line({
			at: "2026-06-01",
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 5 },
		});
		const current = line({
			at: "2026-06-02",
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 1 },
		});
		const model = buildScorecard(current, base, DEFAULT_WEIGHTS);
		const r = row(model, "score");
		expect(r).toEqual({
			id: "score",
			now: 90,
			base: 50,
			delta: 40,
			components: [{ kind: "lint", score: 90, weight: 25 }],
		});
	});

	it("uses the CURRENT weights on BOTH sides (base score_weights ignored, SPEC §1.5)", () => {
		// Two present components so weights matter. Identical records both sides →
		// identical composite regardless of any weights the base might have carried
		// (this engine never reads base weights — it is handed one weights table).
		const both = [
			line({ kind: "lint", byKind: { exact: 0, near: 0, offSystem: 2 } }), // 80
			line({ kind: "handoff", score: 60, frameName: "F", deductions: [] }), // 60
		].join("\n");
		// custom weights skewed to lint — both sides get the SAME table.
		const weights = { ...DEFAULT_WEIGHTS, lint: 75, readiness: 25 };
		const model = buildScorecard(both, both, weights);
		const r = row(model, "score");
		if (r.id !== "score") throw new Error("expected the score row");
		// weighted mean over {lint:80@75, readiness:60@25} = (80*75+60*25)/100 = 75
		expect(r.now).toBe(75);
		expect(r.base).toBe(75);
		expect(r.delta).toBe(0);
	});

	it("omits delta on the score row when the base side has no score data", () => {
		const current = line({
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 1 },
		});
		const model = buildScorecard(current, "", DEFAULT_WEIGHTS);
		const r = row(model, "score");
		if (r.id !== "score") throw new Error("expected the score row");
		expect(r.now).toBe(90);
		expect(r.base).toBeUndefined();
		expect(r.delta).toBeUndefined();
	});
});

describe("buildScorecard — on-system row (adoption parallel last-wins)", () => {
	it("takes the latest adoption-bearing lint line pct, surviving a later plain lint line", () => {
		const current = [
			line({
				kind: "lint",
				byKind: { exact: 0, near: 0, offSystem: 0 },
				adoption: { refs: 75, literals: 25, byDirectory: [] },
			}),
			// a later PLAIN lint line must NOT clear the adoption pct (parallel last-wins)
			line({ kind: "lint", byKind: { exact: 1, near: 0, offSystem: 0 } }),
		].join("\n");
		const model = buildScorecard(current, undefined, DEFAULT_WEIGHTS);
		const r = row(model, "on-system");
		// 100*75/(75+25) = 75
		expect(r.now).toBe(75);
	});

	it("computes a signed delta against the base on-system pct", () => {
		const base = line({
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 0 },
			adoption: { refs: 50, literals: 50, byDirectory: [] },
		});
		const current = line({
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 0 },
			adoption: { refs: 90, literals: 10, byDirectory: [] },
		});
		const model = buildScorecard(current, base, DEFAULT_WEIGHTS);
		const r = row(model, "on-system");
		expect(r).toEqual({ id: "on-system", now: 90, base: 50, delta: 40 });
	});
});

describe("buildScorecard — lint-violations row (summed byKind)", () => {
	it("sums the latest lint line's byKind totals, last-wins", () => {
		const current = [
			line({ kind: "lint", byKind: { exact: 9, near: 9, offSystem: 9 } }),
			line({ kind: "lint", byKind: { exact: 1, near: 2, offSystem: 3 } }),
		].join("\n");
		const model = buildScorecard(current, undefined, DEFAULT_WEIGHTS);
		const r = row(model, "lint-violations");
		expect(r.now).toBe(6); // 1+2+3
	});

	it("signs the delta (current minus base)", () => {
		const base = line({
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 4 },
		});
		const current = line({
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 1 },
		});
		const model = buildScorecard(current, base, DEFAULT_WEIGHTS);
		const r = row(model, "lint-violations");
		expect(r).toEqual({ id: "lint-violations", now: 1, base: 4, delta: -3 });
	});
});

describe("buildScorecard — drift row (stale/missing/orphan, breaking=stale)", () => {
	it("carries stale/missing/orphan from the latest tokens-check line", () => {
		const current = line({
			kind: "tokens-check",
			stale: 2,
			missing: 1,
			orphan: 3,
			inSync: false,
		});
		const model = buildScorecard(current, undefined, DEFAULT_WEIGHTS);
		const r = row(model, "drift");
		expect(r).toEqual({
			id: "drift",
			now: { stale: 2, missing: 1, orphan: 3 },
		});
	});

	it("provides a base drift object (no scalar delta — it is a multi-count row)", () => {
		const base = line({
			kind: "tokens-check",
			stale: 1,
			missing: 0,
			orphan: 0,
			inSync: false,
		});
		const current = line({
			kind: "tokens-check",
			stale: 4,
			missing: 0,
			orphan: 0,
			inSync: false,
		});
		const model = buildScorecard(current, base, DEFAULT_WEIGHTS);
		const r = row(model, "drift");
		expect(r).toEqual({
			id: "drift",
			now: { stale: 4, missing: 0, orphan: 0 },
			base: { stale: 1, missing: 0, orphan: 0 },
		});
	});
});

describe("buildScorecard — import-coverage row (imported/total)", () => {
	it("carries imported/total from the latest adoption line", () => {
		const current = line({
			kind: "adoption",
			imported: 12,
			total: 20,
			uncovered: [],
		});
		const model = buildScorecard(current, undefined, DEFAULT_WEIGHTS);
		const r = row(model, "import-coverage");
		expect(r).toEqual({
			id: "import-coverage",
			now: { imported: 12, total: 20 },
		});
	});

	it("provides a base coverage object when the base side has the row", () => {
		const base = line({
			kind: "adoption",
			imported: 5,
			total: 20,
			uncovered: [],
		});
		const current = line({
			kind: "adoption",
			imported: 15,
			total: 20,
			uncovered: [],
		});
		const model = buildScorecard(current, base, DEFAULT_WEIGHTS);
		const r = row(model, "import-coverage");
		expect(r).toEqual({
			id: "import-coverage",
			now: { imported: 15, total: 20 },
			base: { imported: 5, total: 20 },
		});
	});
});

describe("buildScorecard — contrast row (Σpassed/(Σpassed+Σfailed) pct)", () => {
	it("sums all modes and reports the pass percentage from the latest a11y line", () => {
		const current = line({
			kind: "a11y",
			level: "AA",
			modes: [
				{ mode: "light", passed: 18, failed: 2 },
				{ mode: "dark", passed: 16, failed: 4 },
			],
		});
		const model = buildScorecard(current, undefined, DEFAULT_WEIGHTS);
		const r = row(model, "contrast");
		// 100*(18+16)/((18+16)+(2+4)) = 100*34/40 = 85
		expect(r.now).toBe(85);
	});

	it("signs the delta against the base contrast pct", () => {
		const base = line({
			kind: "a11y",
			level: "AA",
			modes: [{ mode: "light", passed: 6, failed: 4 }],
		});
		const current = line({
			kind: "a11y",
			level: "AA",
			modes: [{ mode: "light", passed: 9, failed: 1 }],
		});
		const model = buildScorecard(current, base, DEFAULT_WEIGHTS);
		const r = row(model, "contrast");
		expect(r).toEqual({ id: "contrast", now: 90, base: 60, delta: 30 });
	});
});

describe("buildScorecard — readiness row (score + frame)", () => {
	it("carries the latest handoff score and frame name", () => {
		const current = line({
			kind: "handoff",
			score: 88,
			frameName: "Checkout",
			deductions: [],
		});
		const model = buildScorecard(current, undefined, DEFAULT_WEIGHTS);
		const r = row(model, "readiness");
		expect(r).toEqual({
			id: "readiness",
			now: { score: 88, frame: "Checkout" },
		});
	});

	it("signs the readiness delta from the base score (frame is the now-side frame)", () => {
		const base = line({
			kind: "handoff",
			score: 70,
			frameName: "Old",
			deductions: [],
		});
		const current = line({
			kind: "handoff",
			score: 88,
			frameName: "Checkout",
			deductions: [],
		});
		const model = buildScorecard(current, base, DEFAULT_WEIGHTS);
		const r = row(model, "readiness");
		expect(r).toEqual({
			id: "readiness",
			now: { score: 88, frame: "Checkout" },
			base: { score: 70, frame: "Old" },
			delta: 18,
		});
	});
});

describe("buildScorecard — row ordering and presence (§2 row order)", () => {
	it("emits rows in the fixed §2 order: score, on-system, lint-violations, drift, import-coverage, contrast, readiness", () => {
		const model = buildScorecard(fullHistory(), undefined, DEFAULT_WEIGHTS);
		if (model.kind === "no-data") throw new Error("expected ok");
		expect(model.rows.map((r) => r.id)).toEqual([
			"score",
			"on-system",
			"lint-violations",
			"drift",
			"import-coverage",
			"contrast",
			"readiness",
		]);
	});
});

describe("buildScorecard — mixed-presence permutations (§2 omission rules)", () => {
	it("omits a row absent on BOTH sides entirely (no seven n/a's)", () => {
		// Only a lint line on each side → score, on-system?, lint-violations present;
		// drift/import-coverage/contrast/readiness omitted. (No adoption block here,
		// so on-system is also absent.)
		const lintOnly = line({
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 1 },
		});
		const model = buildScorecard(lintOnly, lintOnly, DEFAULT_WEIGHTS);
		if (model.kind === "no-data") throw new Error("expected ok");
		expect(model.rows.map((r) => r.id)).toEqual(["score", "lint-violations"]);
	});

	it("keeps a row present (now only, no base/delta) when ONLY the current side has it", () => {
		const base = line({
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 1 },
		});
		const current = [
			base,
			line({
				kind: "tokens-check",
				stale: 3,
				missing: 0,
				orphan: 0,
				inSync: false,
			}),
		].join("\n");
		const model = buildScorecard(current, base, DEFAULT_WEIGHTS);
		const drift = row(model, "drift");
		expect(drift).toEqual({
			id: "drift",
			now: { stale: 3, missing: 0, orphan: 0 },
		});
	});

	it("keeps a row present (now only) when ONLY the BASE side has it — current is absent", () => {
		// SPEC §2: a row is omitted only when absent on BOTH sides. Present on base
		// alone, it still renders (the renderer will show the loss). `now` is the
		// row's empty/zero shape and there is no delta (delta needs a now value too).
		const current = line({
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 1 },
		});
		const base = [
			current,
			line({ kind: "handoff", score: 80, frameName: "Gone", deductions: [] }),
		].join("\n");
		const model = buildScorecard(current, base, DEFAULT_WEIGHTS);
		const readiness = row(model, "readiness");
		expect(readiness.id).toBe("readiness");
		expect(readiness.base).toEqual({ score: 80, frame: "Gone" });
		// now is absent on the current side — represented as a zero/empty now.
		expect(readiness.now).toBeUndefined();
		// no delta without a now value
		if (readiness.id === "readiness") {
			expect(readiness.delta).toBeUndefined();
		}
	});
});

describe("buildScorecard — parsing tolerance (shared line-iterator)", () => {
	it("skips corrupt lines, unknown kinds, and blanks; applies last-wins; coerces non-numbers", () => {
		const current = [
			"{ not json",
			"",
			line({ kind: "unknown-thing", whatever: true }),
			line({ kind: "lint", byKind: { exact: "x", near: null, offSystem: 2 } }), // coerce → 2 violations
			line({ kind: "lint", byKind: { exact: 0, near: 0, offSystem: 1 } }), // last wins → 1
		].join("\n");
		const model = buildScorecard(current, undefined, DEFAULT_WEIGHTS);
		const r = row(model, "lint-violations");
		expect(r.now).toBe(1);
	});

	it("is deterministic — same inputs produce a deeply-equal model", () => {
		const a = buildScorecard(fullHistory(), fullHistory(), DEFAULT_WEIGHTS);
		const b = buildScorecard(fullHistory(), fullHistory(), DEFAULT_WEIGHTS);
		expect(a).toEqual(b);
	});
});
