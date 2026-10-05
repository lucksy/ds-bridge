// H2 — the "no reader changes behaviour" net (SPEC-history-v2 §1.1, §1.3). The
// SAME history, written once as v1 lines and once as v2-enveloped lines with a
// `score` record interleaved after every batch, must produce IDENTICAL results
// from every history reader: the envelope is additive and `kind:"score"` is an
// unknown kind to all of them (never double counted).
import { describe, expect, it } from "vitest";
import { buildDigest } from "../../../src/engines/report/digest.js";
import { buildFreshness } from "../../../src/engines/report/freshness.js";
import { replayHistory } from "../../../src/engines/report/history-lines.js";
import { buildLibraryHealthTrend } from "../../../src/engines/report/library-health-trend.js";
import { buildParityTrend } from "../../../src/engines/report/parity-trend.js";
import { extractReleaseSignals } from "../../../src/engines/report/release-readiness.js";
import {
	DEFAULT_WEIGHTS,
	scoreFromHistory,
} from "../../../src/engines/report/score.js";
import { buildScorecard } from "../../../src/engines/report/scorecard.js";

const V1: Record<string, unknown>[] = [
	{
		at: "2026-09-01T10:00:00.000Z",
		kind: "tokens-check",
		stale: 2,
		missing: 1,
		orphan: 0,
		inSync: false,
	},
	{
		at: "2026-09-01T10:00:01.000Z",
		kind: "lint",
		byKind: { exact: 4, near: 2, offSystem: 1 },
		adoption: { refs: 70, literals: 30, byDirectory: [] },
	},
	{
		at: "2026-09-02T10:00:00.000Z",
		kind: "a11y",
		level: "AA",
		modes: [{ mode: "light", passed: 8, failed: 2 }],
	},
	{
		at: "2026-09-03T10:00:00.000Z",
		kind: "handoff",
		score: 72,
		frameName: "Checkout",
		deductions: [],
	},
	{
		at: "2026-09-04T10:00:00.000Z",
		kind: "parity",
		total: 10,
		ok: 7,
		missingInCode: 1,
		missingInFigma: 1,
		propMismatch: 1,
		score: 70,
	},
	{
		at: "2026-09-05T10:00:00.000Z",
		kind: "library-health",
		overrideHotspots: 3,
		deprecatedUsage: 1,
		detachedCandidates: 2,
	},
	{
		at: "2026-09-06T10:00:00.000Z",
		kind: "impact",
		breaking: 1,
		additive: 2,
		cosmetic: 0,
		touchedCallSites: 4,
	},
	{
		at: "2026-09-07T10:00:00.000Z",
		kind: "lint",
		byKind: { exact: 1, near: 0, offSystem: 0 },
		adoption: { refs: 90, literals: 10, byDirectory: [] },
	},
];

function v1Text(): string {
	return `${V1.map((r) => JSON.stringify(r)).join("\n")}\n`;
}

/** The same records v2-enveloped, with a `score` record after each one. */
function v2Text(): string {
	const lines: string[] = [];
	V1.forEach((r, i) => {
		const { at, kind, ...payload } = r;
		const envelope = {
			v: 2,
			at,
			kind,
			source: "ci",
			git: { sha: `sha${i}`, branch: "main", dirty: false },
			tool: { version: "1.11.0" },
			runId: `run-${i}`,
		};
		lines.push(JSON.stringify({ ...envelope, ...payload }));
		lines.push(
			JSON.stringify({
				...envelope,
				kind: "score",
				score: 99,
				subScores: { drift: 99 },
				weights: DEFAULT_WEIGHTS,
				weightsSource: "default",
			}),
		);
	});
	return `${lines.join("\n")}\n`;
}

describe("v1 vs v2 history — readers agree (H2)", () => {
	it("system score (current + trend)", () => {
		expect(scoreFromHistory(v2Text())).toEqual(scoreFromHistory(v1Text()));
	});

	it("scorecard (current-only and with a base)", () => {
		expect(buildScorecard(v2Text(), undefined, DEFAULT_WEIGHTS)).toEqual(
			buildScorecard(v1Text(), undefined, DEFAULT_WEIGHTS),
		);
		expect(buildScorecard(v2Text(), v1Text(), DEFAULT_WEIGHTS)).toEqual(
			buildScorecard(v1Text(), v1Text(), DEFAULT_WEIGHTS),
		);
	});

	it("digest", () => {
		const since = "2026-09-03T00:00:00.000Z";
		expect(buildDigest(v2Text(), since, "both", 80)).toEqual(
			buildDigest(v1Text(), since, "both", 80),
		);
	});

	it("freshness, parity trend, library-health trend, release signals", () => {
		const a = replayHistory(v1Text());
		const b = replayHistory(v2Text());
		const now = "2026-09-10T00:00:00.000Z";
		expect(buildFreshness(b, now, undefined)).toEqual(
			buildFreshness(a, now, undefined),
		);
		expect(buildParityTrend(b)).toEqual(buildParityTrend(a));
		expect(buildLibraryHealthTrend(b)).toEqual(buildLibraryHealthTrend(a));
		expect(extractReleaseSignals(b)).toEqual(extractReleaseSignals(a));
	});
});
