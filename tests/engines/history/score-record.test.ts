// H4 — the stored composite score (SPEC-history-v2 §2, G3). Pure: history text +
// the resolved weight profile in → the `score` record payload out, so the score
// trend is auditable (the weights used are stored beside the number).
import { describe, expect, it } from "vitest";
import { scoreRecordPayload } from "../../../src/engines/history/score-record.js";
import {
	DEFAULT_WEIGHTS,
	resolveWeightProfile,
	scoreFromHistory,
} from "../../../src/engines/report/score.js";

const TEXT = [
	JSON.stringify({
		at: "2026-10-01T00:00:00.000Z",
		kind: "tokens-check",
		stale: 1,
		missing: 0,
		orphan: 0,
	}),
	JSON.stringify({
		at: "2026-10-01T00:00:01.000Z",
		kind: "lint",
		byKind: { exact: 1, near: 1, offSystem: 1 },
	}),
	JSON.stringify({
		at: "2026-10-01T00:00:02.000Z",
		kind: "handoff",
		score: 91,
		frameName: "F",
		deductions: [],
	}),
].join("\n");

describe("scoreRecordPayload", () => {
	it("stores the composite, sub-scores, full weights and their source", () => {
		const profile = resolveWeightProfile(undefined, undefined, undefined);
		const payload = scoreRecordPayload(TEXT, profile);
		const outcome = scoreFromHistory(TEXT, profile.weights);
		if (outcome.kind !== "ok") throw new Error("expected ok");
		expect(payload).toEqual({
			kind: "score",
			score: outcome.current,
			subScores: { drift: 75, lint: 83, readiness: 91 },
			weights: DEFAULT_WEIGHTS,
			weightsSource: "default",
		});
	});

	it("names a project weights table and a per-view profile", () => {
		const weights = { ...DEFAULT_WEIGHTS, drift: 60 };
		expect(
			scoreRecordPayload(
				TEXT,
				resolveWeightProfile(undefined, weights, undefined),
			)?.weightsSource,
		).toBe("project");
		const byView = scoreRecordPayload(
			TEXT,
			resolveWeightProfile("ds-manager", undefined, { "ds-manager": weights }),
		);
		expect(byView?.weightsSource).toBe("view:ds-manager");
		expect(byView?.weights.drift).toBe(60);
	});

	it("is undefined when nothing is score-relevant (no-data)", () => {
		const profile = resolveWeightProfile(undefined, undefined, undefined);
		expect(scoreRecordPayload("", profile)).toBeUndefined();
		expect(
			scoreRecordPayload(
				JSON.stringify({ kind: "impact", breaking: 1 }),
				profile,
			),
		).toBeUndefined();
	});

	it("ignores earlier score records (never feeds itself)", () => {
		const profile = resolveWeightProfile(undefined, undefined, undefined);
		const withScore = `${TEXT}\n${JSON.stringify({ kind: "score", score: 1 })}`;
		expect(scoreRecordPayload(withScore, profile)).toEqual(
			scoreRecordPayload(TEXT, profile),
		);
	});
});
