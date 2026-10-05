// X5 (SPEC-exec-report §5) — the DS-manager one-page report composer. PURE: the
// already-computed engine outputs in → headline, top-3 risks, top-3 actions,
// per-frame readiness and data coverage out. Deterministic rule tables; absent
// inputs stay absent (never a misleading 0); never throws.
import { describe, expect, it } from "vitest";
import type { FrameReadiness } from "../../../src/engines/history/readiness-frames.js";
import {
	buildManagerReport,
	frameLabel,
	kindLabel,
	type ManagerReportInput,
	scoreChangeText,
	targetLabel,
	targetOp,
	targetValue,
} from "../../../src/engines/report/manager-report.js";

const BASE: ManagerReportInput = {
	project: "acme",
	generatedAt: "2026-10-05T12:00:00.000Z",
	windowDays: 30,
	readinessThreshold: 80,
};

function frame(
	key: string,
	frameName: string,
	latest: number,
	passRate: number,
	runs = 2,
): FrameReadiness {
	return { key, frameName, latest, passRate, runs };
}

describe("buildManagerReport — empty input", () => {
	it("yields an all-absent headline and empty lists", () => {
		expect(buildManagerReport(BASE)).toEqual({
			project: "acme",
			generatedAt: "2026-10-05T12:00:00.000Z",
			windowDays: 30,
			readinessThreshold: 80,
			headline: {},
			targets: [],
			risks: [],
			actions: [],
			frames: [],
			coverage: { measured: [], stale: [], never: [] },
		});
	});
});

describe("buildManagerReport — headline", () => {
	it("composes score, on-system, coverage, consistency, debt and handoff", () => {
		const report = buildManagerReport({
			...BASE,
			systemScore: {
				current: 76,
				components: [],
				trend: [
					{ date: "2026-09-01", score: 70 },
					{ date: "2026-10-01", score: 76 },
				],
			},
			scoreVelocity: {
				delta: 6,
				windowDays: 30,
				direction: "up",
				regressionStreak: 0,
			},
			adoptionTrend: [
				{ date: "2026-09-01", pct: 79 },
				{ date: "2026-10-01", pct: 82 },
			],
			importCoverage: {
				imported: 12,
				total: 20,
				uncovered: [],
				uncoveredTotal: 8,
			},
			consistency: { score: 91, components: [] },
			debt: { pct: 18, level: "low", items: [] },
			frames: [frame("a", "Checkout", 85, 100), frame("b", "Profile", 60, 50)],
		});
		expect(report.headline).toEqual({
			score: { current: 76, delta: 6, direction: "up", trend: [70, 76] },
			onSystem: { pct: 82, delta: 3, since: "2026-09-01" },
			importCoverage: { imported: 12, total: 20, pct: 60 },
			consistency: 91,
			debt: { pct: 18, level: "low", items: 0 },
			handoff: { ready: 1, frames: 2 },
		});
	});

	it("a single adoption point has no delta; a zero-total coverage is absent", () => {
		const report = buildManagerReport({
			...BASE,
			adoptionTrend: [{ date: "2026-10-01", pct: 50 }],
			importCoverage: {
				imported: 0,
				total: 0,
				uncovered: [],
				uncoveredTotal: 0,
			},
			systemScore: { current: 40, components: [], trend: [] },
		});
		expect(report.headline.onSystem).toEqual({ pct: 50 });
		expect(report.headline.importCoverage).toBeUndefined();
		expect(report.headline.score).toEqual({ current: 40, trend: [] });
	});

	it("sorts frames worst-first (latest asc, then key)", () => {
		const report = buildManagerReport({
			...BASE,
			frames: [
				frame("b", "B", 90, 100),
				frame("c", "C", 40, 0),
				frame("a", "A", 40, 50),
			],
		});
		expect(report.frames.map((f) => f.key)).toEqual(["a", "c", "b"]);
	});
});

describe("buildManagerReport — risks", () => {
	it("keeps the top three by severity, stable in rule order", () => {
		const report = buildManagerReport({
			...BASE,
			targets: [
				{
					metric: "on-system",
					measured: 62,
					target: 80,
					op: ">=",
					band: "red",
				},
			],
			scoreVelocity: {
				delta: -6,
				windowDays: 30,
				direction: "down",
				regressionStreak: 2,
			},
			breakingDrift: 2,
			debt: {
				pct: 72,
				level: "high",
				items: [
					{
						kind: "deprecated",
						subject: "LegacyButton",
						count: 9,
						weight: 8,
						recommendation:
							'Replace deprecated "LegacyButton" with its supported DS component',
					},
				],
			},
		});
		expect(report.risks).toEqual([
			"On-system usage is off target: 62% vs goal ≥ 80%",
			"System score fell 6 pts in 30 days (2 drops in a row)",
			"2 breaking token changes in the latest drift check",
		]);
	});

	it("orders medium before low severity regardless of emission order", () => {
		const report = buildManagerReport({
			...BASE,
			targets: [
				{ metric: "parity", measured: 78, target: 80, op: ">=", band: "amber" },
			],
			debt: {
				pct: 30,
				level: "medium",
				items: [
					{
						kind: "off-system",
						subject: "off-system values",
						count: 15,
						weight: 2,
						recommendation:
							"Tokenize 15 off-system values (run /ds-bridge:ds-lint --fix)",
					},
				],
			},
			dataFreshness: [
				{ kind: "lint", lastRun: "2026-10-05", ageDays: 0, band: "green" },
				{ kind: "a11y", lastRun: "2026-08-01", ageDays: 65, band: "red" },
				{ kind: "impact", band: "unknown" },
			],
		});
		expect(report.risks).toEqual([
			"Design debt is medium at 30/100 (largest: off-system values)",
			"Stale data: a11y not measured recently",
			"Figma↔code parity is close to its goal: 78% vs ≥ 80%",
		]);
	});

	it("names frames below the readiness bar and low consistency", () => {
		const report = buildManagerReport({
			...BASE,
			consistency: { score: 42, components: [] },
			frames: [
				frame("a", "Checkout", 55, 0),
				frame("b", "Profile", 70, 50),
				frame("c", "Home", 90, 100),
			],
		});
		expect(report.risks).toEqual([
			'2 of 3 tracked frames are below the 80 readiness bar (lowest: "Checkout" at 55)',
			"Consistency is low at 42/100",
		]);
	});

	it("a falling score with a short streak is medium and carries no streak note", () => {
		const report = buildManagerReport({
			...BASE,
			scoreVelocity: {
				delta: -1,
				windowDays: 14,
				direction: "down",
				regressionStreak: 1,
			},
			dataFreshness: [{ kind: "drift", band: "unknown" }],
		});
		expect(report.risks).toEqual([
			"System score fell 1 pt in 14 days",
			"Never measured: token drift",
		]);
	});

	it("R9 names only never-measured kinds that feed the system score, in plain labels", () => {
		const report = buildManagerReport({
			...BASE,
			dataFreshness: [
				{ kind: "drift", band: "unknown" },
				{ kind: "readiness", band: "unknown" },
				{ kind: "impact", band: "unknown" },
				{ kind: "parity", band: "unknown" },
				{ kind: "changelog", band: "unknown" },
				{ kind: "frame-impl", band: "unknown" },
			],
		});
		expect(report.risks).toEqual([
			"Never measured: token drift, handoff readiness",
		]);
		// Only optional checks never measured → no risk at all.
		const optional = buildManagerReport({
			...BASE,
			dataFreshness: [
				{ kind: "impact", band: "unknown" },
				{ kind: "library-health", band: "unknown" },
			],
		});
		expect(optional.risks).toEqual([]);
	});

	it("R7 names stale kinds by their plain label", () => {
		const report = buildManagerReport({
			...BASE,
			dataFreshness: [
				{
					kind: "library-health",
					lastRun: "2026-07-01",
					ageDays: 96,
					band: "red",
				},
				{ kind: "drift", lastRun: "2026-07-01", ageDays: 96, band: "red" },
			],
		});
		expect(report.risks).toEqual([
			"Stale data: library health, token drift not measured recently",
		]);
	});

	it("a frame without a name (v1 handoff line) is labelled by its key in R5 and A4", () => {
		const report = buildManagerReport({
			...BASE,
			frames: [frame("name:", "", 40, 0, 1)],
		});
		expect(report.risks).toEqual([
			'1 of 1 tracked frame is below the 80 readiness bar (lowest: "name:" at 40)',
		]);
		expect(report.actions).toEqual([
			'Raise handoff readiness of "name:" from 40 to 80+ (run ds-bridge handoff)',
		]);
	});
});

describe("buildManagerReport — actions", () => {
	it("ranks red-target, high-debt and drift actions first, capped at three", () => {
		const report = buildManagerReport({
			...BASE,
			targets: [
				{
					metric: "on-system",
					measured: 62,
					target: 80,
					op: ">=",
					band: "red",
				},
			],
			breakingDrift: 1,
			debt: {
				pct: 72,
				level: "high",
				items: [
					{
						kind: "deprecated",
						subject: "LegacyButton",
						count: 9,
						weight: 8,
						recommendation: "Replace LegacyButton",
					},
					{
						kind: "duplicate",
						subject: "Card",
						count: 3,
						weight: 6,
						recommendation: "Merge Card",
					},
					{
						kind: "off-system",
						subject: "off-system values",
						count: 4,
						weight: 2,
						recommendation: "Tokenize",
					},
				],
			},
		});
		expect(report.actions).toEqual([
			"Bring On-system usage to ≥ 80% (now 62%)",
			"Replace LegacyButton",
			"Merge Card",
		]);
	});

	it("falls back to frame, drift and refresh actions in priority order", () => {
		const report = buildManagerReport({
			...BASE,
			breakingDrift: 1,
			frames: [frame("a", "Checkout", 55, 0), frame("b", "Home", 65, 0)],
			dataFreshness: [{ kind: "a11y", band: "unknown" }],
		});
		expect(report.actions).toEqual([
			"Resolve the 1 breaking token change (run ds-bridge tokens check)",
			'Raise handoff readiness of "Checkout" from 55 to 80+ (run ds-bridge handoff)',
			"Refresh the data: run ds-bridge record",
		]);
	});

	it("medium debt items rank below high-priority actions", () => {
		const report = buildManagerReport({
			...BASE,
			debt: {
				pct: 30,
				level: "medium",
				items: [
					{
						kind: "off-system",
						subject: "off-system values",
						count: 15,
						weight: 2,
						recommendation: "Tokenize 15",
					},
				],
			},
			breakingDrift: 3,
		});
		expect(report.actions).toEqual([
			"Resolve the 3 breaking token changes (run ds-bridge tokens check)",
			"Tokenize 15",
		]);
	});
});

describe("buildManagerReport — refresh vs targeted actions (A5)", () => {
	it("never-measured optional checks get their own command, deduped, no refresh", () => {
		const report = buildManagerReport({
			...BASE,
			dataFreshness: [
				{ kind: "parity", band: "unknown" },
				{ kind: "library-health", band: "unknown" },
				{ kind: "changelog", band: "unknown" },
				{ kind: "frame-impl", band: "unknown" },
			],
		});
		expect(report.actions).toEqual([
			"Start measuring parity and library health: run ds-bridge record --figma",
			"Start measuring changelog: run ds-bridge changelog",
			"Start measuring frame implementability: run ds-bridge frame-impl <frame-url>",
		]);
	});

	it("maps readiness, impact and adoption to their commands", () => {
		const report = buildManagerReport({
			...BASE,
			dataFreshness: [
				{ kind: "readiness", band: "unknown" },
				{ kind: "impact", band: "unknown" },
				{ kind: "adoption", band: "unknown" },
			],
		});
		expect(report.actions).toEqual([
			"Start measuring handoff readiness: run ds-bridge handoff <frame-url>",
			"Start measuring impact: run ds-bridge impact",
			"Start measuring adoption: run ds-bridge registry build",
		]);
	});

	it("refresh is offered for stale rows or never-measured kinds record covers, first", () => {
		const report = buildManagerReport({
			...BASE,
			dataFreshness: [
				{ kind: "lint", lastRun: "2026-07-01", ageDays: 96, band: "red" },
				{ kind: "adoption", band: "unknown" },
			],
		});
		expect(report.actions).toEqual([
			"Refresh the data: run ds-bridge record",
			"Start measuring adoption: run ds-bridge registry build",
		]);
		const fresh = buildManagerReport({
			...BASE,
			dataFreshness: [
				{ kind: "lint", lastRun: "2026-10-05", ageDays: 0, band: "green" },
				{ kind: "a11y", band: "unknown" },
			],
		});
		expect(fresh.actions).toEqual(["Refresh the data: run ds-bridge record"]);
	});
});

describe("manager-report labels", () => {
	it("frameLabel falls back to the key when the frame has no name", () => {
		expect(frameLabel(frame("f:1", "Checkout", 80, 100))).toBe("Checkout");
		expect(frameLabel(frame("name:", "", 40, 0))).toBe("name:");
	});

	it("kindLabel turns internal kind ids into plain language", () => {
		expect(kindLabel("drift")).toBe("token drift");
		expect(kindLabel("readiness")).toBe("handoff readiness");
		expect(kindLabel("frame-impl")).toBe("frame implementability");
		expect(kindLabel("library-health")).toBe("library health");
		expect(kindLabel("lint")).toBe("lint");
	});

	it("targetLabel / targetOp / targetValue render plain target text", () => {
		expect(targetLabel("system-score")).toBe("System score");
		expect(targetLabel("on-system")).toBe("On-system usage");
		expect(targetLabel("drift")).toBe("Token drift");
		expect(targetLabel("parity")).toBe("Figma↔code parity");
		expect(targetLabel("contrast")).toBe("Contrast (WCAG)");
		expect(targetLabel("readiness")).toBe("Handoff readiness (latest run)");
		expect(targetLabel("custom")).toBe("custom");
		expect(targetOp(">=")).toBe("≥");
		expect(targetOp("<=")).toBe("≤");
		expect(targetOp("==")).toBe("=");
		expect(targetValue("on-system", 64)).toBe("64%");
		expect(targetValue("parity", 80)).toBe("80%");
		expect(targetValue("system-score", 70)).toBe("70");
		expect(targetValue("contrast", undefined)).toBe("—");
	});
});

describe("buildManagerReport — coverage", () => {
	it("splits freshness into measured / stale / never", () => {
		const report = buildManagerReport({
			...BASE,
			dataFreshness: [
				{ kind: "lint", lastRun: "2026-10-05", ageDays: 0, band: "green" },
				{ kind: "drift", lastRun: "2026-09-20", ageDays: 15, band: "amber" },
				{ kind: "a11y", lastRun: "2026-08-01", ageDays: 65, band: "red" },
				{ kind: "impact", band: "unknown" },
			],
		});
		expect(report.coverage).toEqual({
			measured: [
				{ kind: "lint", ageDays: 0 },
				{ kind: "drift", ageDays: 15 },
			],
			stale: [{ kind: "a11y", ageDays: 65 }],
			never: ["impact"],
		});
	});
});

// ---------- X9 — measured-but-failing checks are risks + actions ----------

describe("buildManagerReport — failing contrast, token gaps, low score (X9)", () => {
	it("flags the critic's scenario: 1 failing contrast pair + 13 missing tokens", () => {
		const report = buildManagerReport({
			...BASE,
			systemScore: { current: 35, components: [], trend: [] },
			contrast: { failed: 1, level: "AA", modes: ["light"] },
			tokenGaps: { missing: 13, orphan: 0 },
			dataFreshness: [
				{ kind: "readiness", band: "unknown" },
				{ kind: "adoption", band: "unknown" },
			],
		});
		expect(report.risks).toEqual([
			"1 contrast pair fails WCAG AA (light)",
			"13 design tokens are missing from the code output",
			"System score is 35/100",
		]);
		expect(report.actions).toEqual([
			"Fix the 1 failing contrast pair (run ds-bridge a11y)",
			"Add the 13 missing tokens to the code output (run ds-bridge tokens check)",
			"Start measuring handoff readiness: run ds-bridge handoff <frame-url>",
		]);
	});

	it("pluralises contrast and joins failing modes", () => {
		const report = buildManagerReport({
			...BASE,
			contrast: { failed: 3, level: "AAA", modes: ["light", "dark"] },
		});
		expect(report.risks).toEqual([
			"3 contrast pairs fail WCAG AAA (light, dark)",
		]);
		expect(report.actions).toEqual([
			"Fix the 3 failing contrast pairs (run ds-bridge a11y)",
		]);
	});

	it("reports missing and orphan outputs together, orphans alone at low priority", () => {
		const both = buildManagerReport({
			...BASE,
			tokenGaps: { missing: 1, orphan: 2 },
		});
		expect(both.risks).toEqual([
			"1 design token is missing from the code output, 2 orphan outputs without a source token",
		]);
		expect(both.actions).toEqual([
			"Add the 1 missing token to the code output (run ds-bridge tokens check)",
		]);

		const orphanOnly = buildManagerReport({
			...BASE,
			tokenGaps: { missing: 0, orphan: 1 },
		});
		expect(orphanOnly.risks).toEqual([
			"1 orphan token output without a source token",
		]);
		expect(orphanOnly.actions).toEqual([
			"Remove or re-source the 1 orphan token output (run ds-bridge tokens check)",
		]);
	});

	it("zero failures, zero gaps and a score at the bar are not risks", () => {
		const report = buildManagerReport({
			...BASE,
			systemScore: { current: 50, components: [], trend: [] },
			contrast: { failed: 0, level: "AA", modes: [] },
			tokenGaps: { missing: 0, orphan: 0 },
		});
		expect(report.risks).toEqual([]);
		expect(report.actions).toEqual([]);
	});

	it("a red system-score target suppresses R12 (R1 already says it)", () => {
		const report = buildManagerReport({
			...BASE,
			systemScore: { current: 35, components: [], trend: [] },
			targets: [
				{
					metric: "system-score",
					measured: 35,
					target: 70,
					op: ">=",
					band: "red",
				},
			],
		});
		expect(report.risks).toEqual([
			"System score is off target: 35 vs goal ≥ 70",
		]);
	});

	it("contrast outranks medium-severity risks", () => {
		const report = buildManagerReport({
			...BASE,
			consistency: { score: 30, components: [] },
			frames: [frame("a", "Checkout", 40, 0)],
			tokenGaps: { missing: 2, orphan: 0 },
			contrast: { failed: 2, level: "AA", modes: ["dark"] },
		});
		expect(report.risks[0]).toBe("2 contrast pairs fail WCAG AA (dark)");
	});
});

// ---------- X10 — score change from same-day stored score records ----------

describe("buildManagerReport — score change without velocity (X10)", () => {
	it("two stored score points and no velocity → ±n pts since the first date", () => {
		const report = buildManagerReport({
			...BASE,
			systemScore: {
				current: 35,
				components: [],
				trend: [{ date: "2026-10-04", score: 35 }],
			},
			scorePoints: [
				{ date: "2026-10-04", score: 35 },
				{ date: "2026-10-04", score: 35 },
			],
		});
		expect(report.headline.score).toEqual({
			current: 35,
			delta: 0,
			since: "2026-10-04",
			trend: [35],
		});
		expect(scoreChangeText(report.headline, 30)).toBe(
			"±0 pts since 2026-10-04",
		);
	});

	it("a signed delta reads like the on-system row", () => {
		const report = buildManagerReport({
			...BASE,
			systemScore: { current: 40, components: [], trend: [] },
			scorePoints: [
				{ date: "2026-10-01", score: 35 },
				{ date: "2026-10-04", score: 40 },
			],
		});
		expect(scoreChangeText(report.headline, 30)).toBe(
			"+5 pts since 2026-10-01",
		);
	});

	it("a single score point stays without a change; velocity always wins", () => {
		const one = buildManagerReport({
			...BASE,
			systemScore: { current: 40, components: [], trend: [] },
			scorePoints: [{ date: "2026-10-04", score: 40 }],
		});
		expect(scoreChangeText(one.headline, 30)).toBeUndefined();

		const withVelocity = buildManagerReport({
			...BASE,
			systemScore: { current: 40, components: [], trend: [] },
			scoreVelocity: {
				delta: 4,
				windowDays: 30,
				direction: "up",
				regressionStreak: 0,
			},
			scorePoints: [
				{ date: "2026-10-01", score: 30 },
				{ date: "2026-10-04", score: 40 },
			],
		});
		expect(scoreChangeText(withVelocity.headline, 30)).toBe("▲ +4 in 30 days");
	});
});
