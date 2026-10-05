// E4 — analytics artifacts (SPEC-analytics-export §3, SPEC-analytics §5). Pure:
// ReportData in → per-domain artifacts, the merged analytics document, a
// byte-stable serialization and the terminal rollup out.
import { describe, expect, it } from "vitest";
import {
	ANALYTICS_DOMAINS,
	ARTIFACT_FILE,
	buildAnalytics,
	buildDomainArtifact,
	DOMAIN_OF,
	MERGED_ARTIFACT_FILE,
	parseEmit,
	renderAnalyticsTerm,
	stableStringify,
} from "../../../src/engines/report/analytics-artifacts.js";
import { CATALOG } from "../../../src/engines/report/catalog.js";
import type { ReportData } from "../../../src/engines/report/types.js";
import { FULL_REPORT_DATA } from "../../fixtures/report/full-report-data.js";

const EMPTY: ReportData = {
	generatedAt: "2026-10-05T12:00:00.000Z",
	project: "acme",
	driftTrend: [],
	adoptionTrend: [],
	breakingCalendar: { entries: [], total: 0 },
	changeFrequency: { byKind: [] },
};

describe("domain map", () => {
	it("assigns every catalog ReportData section to exactly one domain", () => {
		const keys = [...new Set(CATALOG.map((a) => a.reportDataKey))].sort();
		expect(Object.keys(DOMAIN_OF).sort()).toEqual(keys);
		for (const domain of Object.values(DOMAIN_OF)) {
			expect(ANALYTICS_DOMAINS).toContain(domain);
		}
	});

	it("matches SPEC-analytics §5 file names", () => {
		expect(ARTIFACT_FILE).toEqual({
			figma: "figma-metrics.json",
			code: "code-metrics.json",
			token: "token-metrics.json",
			git: "git-metrics.json",
			score: "design-system-score.json",
		});
		expect(MERGED_ARTIFACT_FILE).toBe("analytics.json");
	});

	it("places the headline sections per the spec table", () => {
		expect(DOMAIN_OF.libraryHealth).toBe("figma");
		expect(DOMAIN_OF.importCoverage).toBe("code");
		expect(DOMAIN_OF.driftTrend).toBe("token");
		expect(DOMAIN_OF.audienceChangelog).toBe("git");
		expect(DOMAIN_OF.executive).toBe("score");
		expect(DOMAIN_OF.debt).toBe("score");
		expect(DOMAIN_OF.consistency).toBe("score");
	});
});

describe("buildDomainArtifact", () => {
	it("an ok artifact carries the domain's present sections verbatim", () => {
		const a = buildDomainArtifact("figma", FULL_REPORT_DATA);
		expect(a).toEqual({
			schema: "ds-bridge/analytics/figma",
			schemaVersion: 1,
			domain: "figma",
			generatedAt: FULL_REPORT_DATA.generatedAt,
			project: FULL_REPORT_DATA.project,
			status: "ok",
			metrics: {
				libraryHealth: FULL_REPORT_DATA.libraryHealth,
				libraryHealthTrend: FULL_REPORT_DATA.libraryHealthTrend,
				readiness: FULL_REPORT_DATA.readiness,
				frameImplementability: FULL_REPORT_DATA.frameImplementability,
				// F5 — the Figma/frame trends belong to the figma domain.
				libraryHotspotsTrend: FULL_REPORT_DATA.libraryHotspotsTrend,
				frameReadinessTrend: FULL_REPORT_DATA.frameReadinessTrend,
				handoffPassRate: FULL_REPORT_DATA.handoffPassRate,
			},
		});
	});

	it("empty sections are not present → no-data with a hint naming the command", () => {
		expect(buildDomainArtifact("token", EMPTY)).toEqual({
			schema: "ds-bridge/analytics/token",
			schemaVersion: 1,
			domain: "token",
			generatedAt: EMPTY.generatedAt,
			project: "acme",
			status: "no-data",
			metrics: {},
			hint: "ds-bridge tokens check",
		});
		expect(buildDomainArtifact("figma", EMPTY).hint).toBe(
			"ds-bridge record --figma (per-frame readiness: ds-bridge handoff / ds-bridge frame-impl)",
		);
		expect(buildDomainArtifact("git", EMPTY).hint).toBe("ds-bridge changelog");
		expect(buildDomainArtifact("code", EMPTY).hint).toBe("ds-bridge record");
		expect(buildDomainArtifact("score", EMPTY).hint).toBe("ds-bridge record");
	});

	it("all-unknown dataFreshness is not data: an unrecorded project is no-data everywhere", () => {
		const unrecorded: ReportData = {
			...EMPTY,
			dataFreshness: [
				{ kind: "lint", band: "unknown" },
				{ kind: "a11y", band: "unknown" },
			],
		};
		const score = buildDomainArtifact("score", unrecorded);
		expect(score.status).toBe("no-data");
		expect(score.metrics).toEqual({});
		expect(score.hint).toBe("ds-bridge record");
		const merged = buildAnalytics(unrecorded);
		for (const domain of ANALYTICS_DOMAINS) {
			expect(merged.domains[domain].status).toBe("no-data");
		}
	});

	it("dataFreshness with one measured band is present", () => {
		const data: ReportData = {
			...EMPTY,
			dataFreshness: [
				{ kind: "lint", band: "unknown" },
				{ kind: "a11y", lastRun: "2026-10-01", ageDays: 4, band: "green" },
			],
		};
		const score = buildDomainArtifact("score", data);
		expect(score.status).toBe("ok");
		expect(score.metrics.dataFreshness).toEqual(data.dataFreshness);
	});

	it("every section of a full report lands in some artifact", () => {
		const covered = ANALYTICS_DOMAINS.flatMap((d) =>
			Object.keys(buildDomainArtifact(d, FULL_REPORT_DATA).metrics),
		).sort();
		expect(covered).toEqual(Object.keys(DOMAIN_OF).sort());
	});
});

describe("buildAnalytics", () => {
	it("merges the five domains and repeats the executive rollup", () => {
		const merged = buildAnalytics(FULL_REPORT_DATA);
		expect(merged.schema).toBe("ds-bridge/analytics");
		expect(merged.schemaVersion).toBe(1);
		expect(merged.executive).toEqual(FULL_REPORT_DATA.executive);
		expect(Object.keys(merged.domains)).toEqual([...ANALYTICS_DOMAINS]);
		expect(merged.domains.score).toEqual({
			status: "ok",
			metrics: buildDomainArtifact("score", FULL_REPORT_DATA).metrics,
		});
	});

	it("omits executive when absent and keeps hints on no-data domains", () => {
		const merged = buildAnalytics(EMPTY);
		expect("executive" in merged).toBe(false);
		expect(merged.domains.token).toEqual({
			status: "no-data",
			metrics: {},
			hint: "ds-bridge tokens check",
		});
	});
});

describe("stableStringify", () => {
	it("sorts keys recursively, 2-space indent, trailing newline; arrays keep order", () => {
		expect(
			stableStringify({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }),
		).toBe(
			`{\n  "a": {\n    "c": null,\n    "d": [\n      3,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n`,
		);
	});

	it("the same input gives identical bytes regardless of key insertion order", () => {
		expect(stableStringify({ x: 1, y: 2 })).toBe(
			stableStringify({ y: 2, x: 1 }),
		);
	});
});

describe("parseEmit", () => {
	it("a single domain", () => {
		expect(parseEmit("code")).toEqual({
			kind: "ok",
			domains: ["code"],
			merged: false,
		});
	});
	it("all = the five domains + the merged document", () => {
		expect(parseEmit("all")).toEqual({
			kind: "ok",
			domains: [...ANALYTICS_DOMAINS],
			merged: true,
		});
	});
	it("an unknown value is a typed error listing the accepted values", () => {
		const r = parseEmit("design");
		expect(r.kind).toBe("error");
		if (r.kind === "error") {
			expect(r.message).toContain("figma, code, token, git, score, all");
		}
	});
});

describe("renderAnalyticsTerm", () => {
	it("shows the four headlines and one line per domain", () => {
		const text = renderAnalyticsTerm(buildAnalytics(FULL_REPORT_DATA));
		expect(text).toContain("Health           78/100");
		expect(text).toContain("Import coverage  60%");
		expect(text).toContain("Consistency      84/100");
		expect(text).toContain("Debt             30/100 (medium)");
		// E8 — one name per metric: "Adoption" is not a headline label here.
		expect(text).not.toMatch(/^ {2}Adoption\b/m);
		expect(text).not.toContain("lower is better");
		expect(text).toContain("ds-bridge analytics --emit all");
		expect(text).not.toContain("Nothing recorded yet");
		expect(text).toContain("figma   ok (7 sections)");
		expect(text).toContain("score   ok (7 sections)");
	});

	it("says not measured / no-data + hint instead of inventing zeros", () => {
		const text = renderAnalyticsTerm(buildAnalytics(EMPTY));
		expect(text).toContain("Health           not measured");
		expect(text).toContain("Debt             not measured");
		expect(text).toContain("token   no data — run ds-bridge tokens check");
		expect(text).not.toMatch(/\b0\/100\b/);
	});

	it("absent adoption names the registry prerequisite", () => {
		const text = renderAnalyticsTerm(buildAnalytics(EMPTY));
		expect(text).toContain(
			"Import coverage  not measured — run ds-bridge registry build, then ds-bridge record",
		);
	});

	it("nothing measured → the footer says to record, not to emit", () => {
		const text = renderAnalyticsTerm(buildAnalytics(EMPTY));
		expect(text).toContain("Nothing recorded yet — run ds-bridge record.");
		expect(text).not.toContain("--emit all");
	});

	it("one measured headline keeps the --emit footer", () => {
		const text = renderAnalyticsTerm(
			buildAnalytics({
				...EMPTY,
				executive: { debt: 12 },
			}),
		);
		expect(text).toContain("Debt             12/100 (low)");
		expect(text).toContain("ds-bridge analytics --emit all");
		expect(text).not.toContain("Nothing recorded yet");
	});
});
