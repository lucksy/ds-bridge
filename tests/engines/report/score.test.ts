// S1 — System-score engine. Test-first: the four sub-score formulas (with
// clamping and the a11y all-modes ratio), validateWeights (defaults, partial
// merge, typed errors), weighted-mean-over-present with renormalization and a
// single half-up rounding, trend replay over distinct dated lines, and the
// raw-history parsing tolerance (mirrors aggregateHistory: per-line JSON.parse
// with skip-on-corrupt, unknown-kind skip, last-wins per kind) are all spec'd
// here before implementation. The engine is pure: raw text in → outcome out.
import { describe, expect, it } from "vitest";
import {
	DEFAULT_WEIGHTS,
	scoreFromHistory,
	validateWeights,
} from "../../../src/engines/report/score.js";

/** Build one JSONL line from a record object. */
function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

describe("DEFAULT_WEIGHTS", () => {
	it("is the documented rebalance {drift:25, lint:25, readiness:15, a11y:15, adoption:20}", () => {
		expect(DEFAULT_WEIGHTS).toEqual({
			drift: 25,
			lint: 25,
			readiness: 15,
			a11y: 15,
			adoption: 20,
		});
	});
});

describe("validateWeights", () => {
	it("returns the defaults verbatim for an empty/undefined override", () => {
		const merged = validateWeights({});
		expect(merged).toEqual({ kind: "ok", weights: DEFAULT_WEIGHTS });
		const merged2 = validateWeights(undefined);
		expect(merged2).toEqual({ kind: "ok", weights: DEFAULT_WEIGHTS });
	});

	it("merges a partial override onto the defaults (untouched keys keep default)", () => {
		const merged = validateWeights({ drift: 50 });
		expect(merged).toEqual({
			kind: "ok",
			weights: { drift: 50, lint: 25, readiness: 15, a11y: 15, adoption: 20 },
		});
	});

	it("accepts a full override of all five keys (including adoption)", () => {
		const merged = validateWeights({
			drift: 1,
			lint: 2,
			readiness: 3,
			a11y: 4,
			adoption: 5,
		});
		expect(merged).toEqual({
			kind: "ok",
			weights: { drift: 1, lint: 2, readiness: 3, a11y: 4, adoption: 5 },
		});
	});

	it("accepts the new adoption key as a partial override", () => {
		const merged = validateWeights({ adoption: 40 });
		expect(merged).toEqual({
			kind: "ok",
			weights: { drift: 25, lint: 25, readiness: 15, a11y: 15, adoption: 40 },
		});
	});

	it("rejects an unknown key with a typed error naming it", () => {
		const outcome = validateWeights({ parity: 10 } as Record<string, unknown>);
		expect(outcome.kind).toBe("unknown-key");
		if (outcome.kind === "unknown-key") {
			expect(outcome.key).toBe("parity");
		}
	});

	it("rejects a non-positive weight (zero) with a typed error", () => {
		const outcome = validateWeights({ drift: 0 });
		expect(outcome.kind).toBe("non-positive");
		if (outcome.kind === "non-positive") {
			expect(outcome.key).toBe("drift");
		}
	});

	it("rejects a negative weight with a non-positive error", () => {
		const outcome = validateWeights({ lint: -5 });
		expect(outcome.kind).toBe("non-positive");
		if (outcome.kind === "non-positive") {
			expect(outcome.key).toBe("lint");
		}
	});

	it("rejects a non-finite weight (NaN / Infinity) with a typed error", () => {
		const nan = validateWeights({ readiness: Number.NaN });
		expect(nan.kind).toBe("non-finite");
		if (nan.kind === "non-finite") {
			expect(nan.key).toBe("readiness");
		}
		const inf = validateWeights({ a11y: Number.POSITIVE_INFINITY });
		expect(inf.kind).toBe("non-finite");
		if (inf.kind === "non-finite") {
			expect(inf.key).toBe("a11y");
		}
	});

	it("rejects a non-number weight as non-finite (string smuggled in)", () => {
		const outcome = validateWeights({ drift: "30" } as Record<string, unknown>);
		expect(outcome.kind).toBe("non-finite");
		if (outcome.kind === "non-finite") {
			expect(outcome.key).toBe("drift");
		}
	});
});

describe("scoreFromHistory — empty / no-data", () => {
	it("returns no-data for empty text", () => {
		expect(scoreFromHistory("")).toEqual({ kind: "no-data" });
		expect(scoreFromHistory("   \n  \n")).toEqual({ kind: "no-data" });
	});

	it("returns no-data when no record kind contributes a component", () => {
		// Only unknown kinds present → no components → no-data.
		const text = [
			line({ at: "2026-06-01", kind: "mystery", x: 1 }),
			line({ at: "2026-06-02", kind: "parity", columns: [] }),
		].join("\n");
		expect(scoreFromHistory(text)).toEqual({ kind: "no-data" });
	});
});

describe("scoreFromHistory — sub-score formulas", () => {
	it("drift: 100 − 25·stale − 10·missing − 5·orphan, clamped at 0", () => {
		const text = line({
			at: "2026-06-01",
			kind: "tokens-check",
			stale: 1,
			missing: 2,
			orphan: 1,
		});
		// 100 − 25 − 20 − 5 = 50
		const outcome = scoreFromHistory(text);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			const drift = outcome.components.find((c) => c.kind === "drift");
			expect(drift?.score).toBe(50);
			// Single present component → renormalized → current equals it.
			expect(outcome.current).toBe(50);
		}
	});

	it("drift: clamps to 0 when penalties exceed 100", () => {
		const text = line({
			at: "2026-06-01",
			kind: "tokens-check",
			stale: 10,
			missing: 0,
			orphan: 0,
		});
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.components.find((c) => c.kind === "drift")?.score).toBe(0);
		}
	});

	it("lint: 100 − 10·offSystem − 5·near − 2·exact, clamped at 0", () => {
		const text = line({
			at: "2026-06-01",
			kind: "lint",
			byKind: { exact: 5, near: 2, offSystem: 1 },
		});
		// 100 − 10 − 10 − 10 = 70
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.components.find((c) => c.kind === "lint")?.score).toBe(70);
			expect(outcome.current).toBe(70);
		}
	});

	it("readiness: the recorded score verbatim, clamped to 0–100", () => {
		const text = line({ at: "2026-06-01", kind: "handoff", score: 83 });
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(
				outcome.components.find((c) => c.kind === "readiness")?.score,
			).toBe(83);
		}
	});

	it("readiness: clamps an out-of-range recorded score (>100 and <0)", () => {
		const high = scoreFromHistory(
			line({ at: "2026-06-01", kind: "handoff", score: 140 }),
		);
		if (high.kind === "ok") {
			expect(high.components.find((c) => c.kind === "readiness")?.score).toBe(
				100,
			);
		}
		const low = scoreFromHistory(
			line({ at: "2026-06-01", kind: "handoff", score: -20 }),
		);
		if (low.kind === "ok") {
			expect(low.components.find((c) => c.kind === "readiness")?.score).toBe(0);
		}
	});

	it("a11y: 100 · Σpassed / (Σpassed + Σfailed) summed over ALL modes", () => {
		const text = line({
			at: "2026-06-01",
			kind: "a11y",
			modes: [
				{ mode: "light", passed: 8, failed: 2 },
				{ mode: "dark", passed: 7, failed: 3 },
			],
		});
		// (8+7) / (8+7+2+3) = 15/20 = 75
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.components.find((c) => c.kind === "a11y")?.score).toBe(75);
		}
	});

	it("a11y: absent component when no pass/fail pairs exist (empty modes / all zero)", () => {
		const emptyModes = scoreFromHistory(
			line({ at: "2026-06-01", kind: "a11y", modes: [] }),
		);
		expect(emptyModes).toEqual({ kind: "no-data" });
		const allZero = scoreFromHistory(
			line({
				at: "2026-06-01",
				kind: "a11y",
				modes: [{ mode: "light", passed: 0, failed: 0 }],
			}),
		);
		expect(allZero).toEqual({ kind: "no-data" });
	});

	it("adoption: 100 · refs / (refs + literals) from a lint line's adoption block", () => {
		// refs:412 literals:46 → 412/458 ≈ 89.96 → component score ≈ 89.96 (raw).
		const text = line({
			at: "2026-06-01",
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 0 },
			adoption: { refs: 3, literals: 1, byDirectory: [] },
		});
		// 100 · 3 / 4 = 75.
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.components.find((c) => c.kind === "adoption")?.score).toBe(
				75,
			);
		}
	});

	it("adoption: absent component when the lint line carries no adoption block", () => {
		// A plain lint line (no adoption) contributes the lint component only — never
		// a misleading adoption 0.
		const text = line({
			at: "2026-06-01",
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 0 },
		});
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.components.some((c) => c.kind === "adoption")).toBe(false);
		}
	});

	it("adoption: absent component when refs+literals is zero (no denominator)", () => {
		const text = line({
			at: "2026-06-01",
			kind: "lint",
			byKind: { exact: 0, near: 0, offSystem: 0 },
			adoption: { refs: 0, literals: 0, byDirectory: [] },
		});
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.components.some((c) => c.kind === "adoption")).toBe(false);
		}
	});
});

describe("scoreFromHistory — adoption parallel last-wins (keyed on field presence)", () => {
	it("adoption-absent-on-latest-but-present-earlier: component survives from the earlier adoption-bearing line", () => {
		// An earlier lint line carries adoption; the LATEST lint line does NOT.
		// Plain-lint last-wins picks the latest (no-adoption) line for the LINT
		// component, but the adoption component is a PARALLEL last-wins keyed on
		// field presence → it survives from the earlier line.
		const text = [
			line({
				at: "2026-06-01",
				kind: "lint",
				byKind: { exact: 0, near: 0, offSystem: 0 },
				adoption: { refs: 3, literals: 1, byDirectory: [] }, // 75
			}),
			line({
				at: "2026-06-02",
				kind: "lint",
				byKind: { exact: 0, near: 0, offSystem: 0 }, // no adoption block
			}),
		].join("\n");
		const outcome = scoreFromHistory(text);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			const adoption = outcome.components.find((c) => c.kind === "adoption");
			expect(adoption?.score).toBe(75);
			// the plain-lint component still reflects the LATEST lint line.
			expect(outcome.components.find((c) => c.kind === "lint")?.score).toBe(
				100,
			);
		}
	});

	it("the LAST adoption-bearing line wins for the adoption component", () => {
		const text = [
			line({
				at: "2026-06-01",
				kind: "lint",
				byKind: { exact: 0, near: 0, offSystem: 0 },
				adoption: { refs: 1, literals: 3, byDirectory: [] }, // 25
			}),
			line({
				at: "2026-06-02",
				kind: "lint",
				byKind: { exact: 0, near: 0, offSystem: 0 },
				adoption: { refs: 3, literals: 1, byDirectory: [] }, // 75
			}),
		].join("\n");
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.components.find((c) => c.kind === "adoption")?.score).toBe(
				75,
			);
		}
	});

	it("trend-point-predates-adoption-data: a trend point before any adoption-bearing line has no adoption component", () => {
		// 06-01: a plain lint line (no adoption) AND a handoff → the 06-01 trend
		// snapshot must NOT carry an adoption contribution. 06-02 adds an
		// adoption-bearing lint line, so 06-02 onward does.
		const text = [
			line({ at: "2026-06-01", kind: "handoff", score: 60 }),
			line({
				at: "2026-06-02",
				kind: "lint",
				byKind: { exact: 0, near: 0, offSystem: 0 },
				adoption: { refs: 3, literals: 1, byDirectory: [] }, // 75
			}),
		].join("\n");
		const outcome = scoreFromHistory(text);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			// 06-01: only readiness 60 present → composite 60 (no adoption yet).
			expect(outcome.trend[0]).toEqual({ date: "2026-06-01", score: 60 });
			// 06-02: readiness 60 (w15) + lint 100 (w25) + adoption 75 (w20):
			//   (60·15 + 100·25 + 75·20) / 60 = (900 + 2500 + 1500)/60 = 4900/60 = 81.67 → 82.
			expect(outcome.trend[1]).toEqual({ date: "2026-06-02", score: 82 });
		}
	});
});

describe("scoreFromHistory — boundary clamps", () => {
	it("drift at the exact 90 boundary (single orphan deduction → no, use stale to hit clean cut)", () => {
		// stale:0 missing:1 orphan:0 → 100 − 10 = 90 exactly.
		const outcome = scoreFromHistory(
			line({
				at: "2026-06-01",
				kind: "tokens-check",
				stale: 0,
				missing: 1,
				orphan: 0,
			}),
		);
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(90);
		}
	});

	it("lint landing exactly on 70 (one offSystem + … = 30 penalty)", () => {
		// offSystem:3 → 100 − 30 = 70 exactly.
		const outcome = scoreFromHistory(
			line({
				at: "2026-06-01",
				kind: "lint",
				byKind: { exact: 0, near: 0, offSystem: 3 },
			}),
		);
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(70);
		}
	});

	it("a perfect run (no violations, full a11y, 100 readiness) → 100", () => {
		const text = [
			line({
				at: "2026-06-01",
				kind: "tokens-check",
				stale: 0,
				missing: 0,
				orphan: 0,
			}),
			line({
				at: "2026-06-01",
				kind: "lint",
				byKind: { exact: 0, near: 0, offSystem: 0 },
			}),
			line({ at: "2026-06-01", kind: "handoff", score: 100 }),
			line({
				at: "2026-06-01",
				kind: "a11y",
				modes: [{ mode: "light", passed: 10, failed: 0 }],
			}),
		].join("\n");
		const outcome = scoreFromHistory(text);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(100);
			expect(outcome.components).toHaveLength(4);
		}
	});
});

describe("scoreFromHistory — weighted combine + renormalization", () => {
	it("renormalizes weights over present components only", () => {
		// drift=60 (weight 25), readiness=80 (weight 15); lint, a11y, adoption absent.
		// renormalized: 60·(25/40) + 80·(15/40) = 37.5 + 30 = 67.5 → 68 half-up.
		const text = [
			line({
				at: "2026-06-01",
				kind: "tokens-check",
				stale: 1,
				missing: 1,
				orphan: 1,
			}), // 100−25−10−5 = 60
			line({ at: "2026-06-01", kind: "handoff", score: 80 }),
		].join("\n");
		const outcome = scoreFromHistory(text);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(68);
			expect(outcome.components.map((c) => c.kind).sort()).toEqual([
				"drift",
				"readiness",
			]);
		}
	});

	it("attaches each component's configured weight (pre-renormalization)", () => {
		const text = line({
			at: "2026-06-01",
			kind: "handoff",
			score: 50,
		});
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			const readiness = outcome.components.find((c) => c.kind === "readiness");
			expect(readiness?.weight).toBe(15);
		}
	});

	it("honours custom weights", () => {
		// drift=60 (weight 90), readiness=80 (weight 10):
		// 60·0.9 + 80·0.1 = 54 + 8 = 62.
		const text = [
			line({
				at: "2026-06-01",
				kind: "tokens-check",
				stale: 1,
				missing: 1,
				orphan: 1,
			}),
			line({ at: "2026-06-01", kind: "handoff", score: 80 }),
		].join("\n");
		const outcome = scoreFromHistory(text, {
			drift: 90,
			lint: 30,
			readiness: 10,
			a11y: 20,
			adoption: 20,
		});
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(62);
		}
	});

	it("applies half-up rounding exactly once at the very end", () => {
		// drift=51 (weight 30), readiness=50 (weight 20):
		// drift: 100−25−20−4 → use stale:1 missing:2 orphan:? to make 51:
		//   100−25−20−5·? ; use stale:1, missing:2, orphan:1 → 100-25-20-5=50. Not 51.
		// Instead engineer a fractional mean: drift=50 (w30) readiness=75 (w20)
		//   = 50·0.6 + 75·0.4 = 30 + 30 = 60 (clean). Need a .5 case:
		// drift=50 (w1), readiness=75 (w1) → mean 62.5 → half-up → 63.
		const text = [
			line({
				at: "2026-06-01",
				kind: "tokens-check",
				stale: 1,
				missing: 2,
				orphan: 1,
			}), // 50
			line({ at: "2026-06-01", kind: "handoff", score: 75 }),
		].join("\n");
		const outcome = scoreFromHistory(text, {
			drift: 1,
			lint: 1,
			readiness: 1,
			a11y: 1,
			adoption: 1,
		});
		// (50 + 75) / 2 = 62.5 → 63 half-up
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(63);
		}
	});
});

describe("scoreFromHistory — parsing tolerance (mirrors aggregateHistory)", () => {
	it("skips corrupted (non-JSON) lines and uses the rest", () => {
		const text = [
			"this is not json {{{",
			line({ at: "2026-06-01", kind: "handoff", score: 90 }),
			"}}} also broken",
		].join("\n");
		const outcome = scoreFromHistory(text);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(90);
		}
	});

	it("skips unknown record kinds silently (forward compat)", () => {
		const text = [
			line({ at: "2026-06-01", kind: "future-kind", payload: 1 }),
			line({ at: "2026-06-02", kind: "handoff", score: 88 }),
		].join("\n");
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(88);
		}
	});

	it("last record of each kind wins for the CURRENT score", () => {
		const text = [
			line({ at: "2026-06-01", kind: "handoff", score: 40 }),
			line({ at: "2026-06-02", kind: "handoff", score: 95 }),
		].join("\n");
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(95);
		}
	});

	it("coerces missing/non-numeric count fields to 0 (asNumber tolerance)", () => {
		// stale absent, missing a string, orphan null → all treated as 0 → 100.
		const text = line({
			at: "2026-06-01",
			kind: "tokens-check",
			missing: "oops",
			orphan: null,
		});
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.components.find((c) => c.kind === "drift")?.score).toBe(
				100,
			);
		}
	});

	it("a record without a string `at` still participates in CURRENT last-wins", () => {
		// The dateless handoff is the LAST handoff → wins for current, even though
		// it cannot anchor a trend point.
		const text = [
			line({ at: "2026-06-01", kind: "handoff", score: 40 }),
			line({ kind: "handoff", score: 77 }),
		].join("\n");
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.current).toBe(77);
		}
	});
});

describe("scoreFromHistory — trend replay", () => {
	it("emits one ascending trend point per distinct dated line, each from latest-of-each-kind ≤ that date", () => {
		const text = [
			// 06-01: handoff 60 only → score 60.
			line({ at: "2026-06-01", kind: "handoff", score: 60 }),
			// 06-02: handoff 60 still latest + drift 100 → mean over both.
			//   drift 100 (w25), readiness 60 (w15) → (100·25 + 60·15)/40 = 85.
			line({
				at: "2026-06-02",
				kind: "tokens-check",
				stale: 0,
				missing: 0,
				orphan: 0,
			}),
			// 06-03: handoff updates to 90 → drift 100 (w25) + readiness 90 (w15)
			//   = (100·25 + 90·15)/40 = 3850/40 = 96.25 → 96.
			line({ at: "2026-06-03", kind: "handoff", score: 90 }),
		].join("\n");
		const outcome = scoreFromHistory(text);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.trend).toEqual([
				{ date: "2026-06-01", score: 60 },
				{ date: "2026-06-02", score: 85 },
				{ date: "2026-06-03", score: 96 },
			]);
			// CURRENT equals the last trend point here (all records dated).
			expect(outcome.current).toBe(96);
		}
	});

	it("collapses multiple records on the SAME date into one trend point (last-of-day wins per kind)", () => {
		const text = [
			line({ at: "2026-06-01", kind: "handoff", score: 50 }),
			line({ at: "2026-06-01", kind: "handoff", score: 90 }),
		].join("\n");
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.trend).toEqual([{ date: "2026-06-01", score: 90 }]);
		}
	});

	it("uses only the YYYY-MM-DD prefix of `at` as the trend date", () => {
		const text = line({
			at: "2026-06-01T14:33:00.000Z",
			kind: "handoff",
			score: 70,
		});
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.trend).toEqual([{ date: "2026-06-01", score: 70 }]);
		}
	});

	it("orders trend points ascending even when lines arrive out of order", () => {
		const text = [
			line({ at: "2026-06-03", kind: "handoff", score: 90 }),
			line({ at: "2026-06-01", kind: "handoff", score: 50 }),
		].join("\n");
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			expect(outcome.trend.map((p) => p.date)).toEqual([
				"2026-06-01",
				"2026-06-03",
			]);
		}
	});

	it("a dateless record does NOT create a trend point (but feeds CURRENT)", () => {
		const text = [
			line({ at: "2026-06-01", kind: "handoff", score: 50 }),
			line({ kind: "handoff", score: 99 }),
		].join("\n");
		const outcome = scoreFromHistory(text);
		if (outcome.kind === "ok") {
			// Only one dated line → one trend point, anchored at that date's state.
			expect(outcome.trend).toEqual([{ date: "2026-06-01", score: 50 }]);
			// CURRENT reflects the dateless last-wins handoff.
			expect(outcome.current).toBe(99);
		}
	});
});

describe("scoreFromHistory — full shape", () => {
	it("returns the documented ok shape with components and trend", () => {
		const text = [
			line({ at: "2026-06-01", kind: "handoff", score: 80 }),
			line({
				at: "2026-06-02",
				kind: "a11y",
				modes: [{ mode: "light", passed: 9, failed: 1 }],
			}),
		].join("\n");
		const outcome = scoreFromHistory(text);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(typeof outcome.current).toBe("number");
			expect(Array.isArray(outcome.components)).toBe(true);
			expect(Array.isArray(outcome.trend)).toBe(true);
			for (const c of outcome.components) {
				expect(["drift", "lint", "readiness", "a11y", "adoption"]).toContain(
					c.kind,
				);
				expect(typeof c.score).toBe("number");
				expect(typeof c.weight).toBe("number");
			}
		}
	});
});
