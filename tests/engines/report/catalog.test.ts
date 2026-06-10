// M0.1 — Artifact catalog (fresh product: 24 artifacts, 6 clean personas).
// Test-first: the ArtifactId contract, completeness against ReportData's
// optional sections, the six-persona tagging, and nearest-match lookup are
// spec'd here before implementation.
import { describe, expect, it } from "vitest";
import {
	ALL_ARTIFACT_IDS,
	type ArtifactId,
	type ArtifactMeta,
	CATALOG,
	lookupArtifact,
	type Persona,
	suggestArtifactIds,
} from "../../../src/engines/report/catalog.js";
import type { ReportData } from "../../../src/engines/report/types.js";

/** The optional section keys of ReportData — the set CATALOG must cover (24). */
type SectionKey = Exclude<keyof ReportData, "generatedAt" | "project">;
const SECTION_KEYS: readonly SectionKey[] = [
	"systemScore",
	"driftTrend",
	"lintSummary",
	"readiness",
	"parity",
	"a11y",
	"impact",
	"adoptionTrend",
	"importCoverage",
	"leaderboard",
	"libraryHealth",
	"breakingCalendar",
	"changeFrequency",
	"targets",
	"parityTrend",
	"componentHealth",
	"libraryHealthTrend",
	"migrationChecklist",
	"scoreVelocity",
	"ownershipLeaderboard",
	"audienceChangelog",
	"frameImplementability",
	"releaseReadiness",
	"dataFreshness",
];

const PERSONAS: readonly Persona[] = [
	"ds-designer",
	"ds-manager",
	"ds-engineer",
	"product-designer",
	"product-manager",
	"product-engineer",
];

const EXPECTED_ORDER: readonly ArtifactId[] = [
	"system-score",
	"drift-trend",
	"lint-summary",
	"readiness",
	"parity",
	"a11y",
	"impact",
	"adoption-trend",
	"import-coverage",
	"leaderboard",
	"library-health",
	"breaking-calendar",
	"change-frequency",
	"targets",
	"parity-trend",
	"component-health",
	"library-health-trend",
	"migration-checklist",
	"score-velocity",
	"ownership-leaderboard",
	"audience-changelog",
	"frame-implementability",
	"release-readiness",
	"data-freshness",
];

describe("CATALOG (24-artifact fresh catalog)", () => {
	it("has exactly 24 artifacts in the authored order (13 base + 11 metric artifacts)", () => {
		expect(CATALOG.map((a) => a.id)).toEqual([...EXPECTED_ORDER]);
		expect(ALL_ARTIFACT_IDS).toEqual([...EXPECTED_ORDER]);
		expect(ALL_ARTIFACT_IDS).toHaveLength(24);
	});

	it("covers every optional ReportData section exactly once via reportDataKey", () => {
		const keys = CATALOG.map((a) => a.reportDataKey).sort();
		expect(keys).toEqual([...SECTION_KEYS].sort());
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("tags every artifact only with the six clean persona names", () => {
		for (const entry of CATALOG) {
			expect(entry.personas.length).toBeGreaterThan(0);
			for (const p of entry.personas) {
				expect(PERSONAS).toContain(p);
			}
		}
	});

	it("tags system-score, parity, parity-trend and data-freshness with all six personas", () => {
		for (const id of [
			"system-score",
			"parity",
			"parity-trend",
			"data-freshness",
		] as const) {
			const entry = CATALOG.find((a) => a.id === id);
			expect([...(entry?.personas ?? [])].sort()).toEqual([...PERSONAS].sort());
		}
	});

	it("maps the 11 new metric artifacts to their camelCase reportDataKeys", () => {
		const expectKey = (id: ArtifactId, key: SectionKey) =>
			expect(CATALOG.find((a) => a.id === id)?.reportDataKey).toBe(key);
		expectKey("targets", "targets");
		expectKey("parity-trend", "parityTrend");
		expectKey("component-health", "componentHealth");
		expectKey("library-health-trend", "libraryHealthTrend");
		expectKey("migration-checklist", "migrationChecklist");
		expectKey("score-velocity", "scoreVelocity");
		expectKey("ownership-leaderboard", "ownershipLeaderboard");
		expectKey("audience-changelog", "audienceChangelog");
		expectKey("frame-implementability", "frameImplementability");
		expectKey("release-readiness", "releaseReadiness");
		expectKey("data-freshness", "dataFreshness");
	});

	it("gives every entry a non-empty title", () => {
		for (const entry of CATALOG) {
			expect(entry.title.length).toBeGreaterThan(0);
		}
	});

	it("exports ALL_ARTIFACT_IDS in catalog order", () => {
		expect(ALL_ARTIFACT_IDS).toEqual(CATALOG.map((a) => a.id));
	});
});

describe("lookupArtifact", () => {
	it("resolves a new metric id to its entry", () => {
		const outcome = lookupArtifact("data-freshness");
		expect(outcome.kind).toBe("found");
		if (outcome.kind === "found") {
			const meta: ArtifactMeta = outcome.artifact;
			expect(meta.reportDataKey).toBe("dataFreshness");
		}
	});

	it("returns a typed unknown outcome (never throws) with suggestions for a near miss", () => {
		const outcome = lookupArtifact("targetz");
		expect(outcome.kind).toBe("unknown");
		if (outcome.kind === "unknown") {
			expect(outcome.id).toBe("targetz");
			expect(outcome.suggestions).toContain("targets");
		}
	});

	it("returns no suggestions for nonsense far from any id", () => {
		const outcome = lookupArtifact("zzzzzzzzzz");
		expect(outcome.kind).toBe("unknown");
		if (outcome.kind === "unknown") {
			expect(outcome.suggestions).toEqual([]);
		}
	});
});

describe("suggestArtifactIds", () => {
	it("ranks a prefix match first", () => {
		expect(suggestArtifactIds("parity")[0]).toBe("parity");
	});

	it("suggests the closest new id for a typo", () => {
		expect(suggestArtifactIds("migration-checklst")).toContain(
			"migration-checklist",
		);
	});

	it("returns no suggestions when nothing is plausibly close", () => {
		expect(suggestArtifactIds("zzzzzzzzzz")).toEqual([]);
	});

	it("matches case-insensitively", () => {
		expect(suggestArtifactIds("PARITY")).toContain("parity");
	});
});

describe("ArtifactId type", () => {
	it("round-trips every id through the catalog", () => {
		const ids: ArtifactId[] = [...ALL_ARTIFACT_IDS];
		for (const id of ids) {
			expect(lookupArtifact(id).kind).toBe("found");
		}
	});
});
