// M0.1 — Artifact catalog. Test-first: the frozen ArtifactId contract, the
// catalog's completeness against ReportData's optional sections, and the
// nearest-match lookup are spec'd here before implementation.
import { describe, expect, it } from "vitest";
import {
	ALL_ARTIFACT_IDS,
	type ArtifactId,
	type ArtifactMeta,
	CATALOG,
	lookupArtifact,
	suggestArtifactIds,
} from "../../../src/engines/report/catalog.js";
import type { ReportData } from "../../../src/engines/report/types.js";

/** The optional section keys of ReportData — the set CATALOG must cover. */
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
];

describe("CATALOG", () => {
	it("leads with system-score then the six wave-1 artifacts, the three owner artifacts (positions 8–10), and library-health (position 11)", () => {
		expect(CATALOG.map((a) => a.id)).toEqual([
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
		]);
	});

	it("appends library-health at index 10 (position 11) with the SPEC §3 personas + key", () => {
		const libraryHealth = CATALOG[10];
		expect(libraryHealth?.id).toBe("library-health");
		expect(libraryHealth?.title).toBe("Library health");
		expect(libraryHealth?.reportDataKey).toBe("libraryHealth");
		expect([...(libraryHealth?.personas ?? [])].sort()).toEqual([
			"design",
			"owner",
		]);
	});

	it("appends the three owner artifacts at positions 8–10 with their SPEC §3 personas + keys", () => {
		const trend = CATALOG[7];
		expect(trend?.id).toBe("adoption-trend");
		expect(trend?.reportDataKey).toBe("adoptionTrend");
		expect([...(trend?.personas ?? [])].sort()).toEqual([
			"engineering",
			"owner",
		]);

		const coverage = CATALOG[8];
		expect(coverage?.id).toBe("import-coverage");
		expect(coverage?.reportDataKey).toBe("importCoverage");
		expect([...(coverage?.personas ?? [])].sort()).toEqual([
			"consumer",
			"owner",
		]);

		const leaderboard = CATALOG[9];
		expect(leaderboard?.id).toBe("leaderboard");
		expect(leaderboard?.reportDataKey).toBe("leaderboard");
		expect([...(leaderboard?.personas ?? [])]).toEqual(["owner"]);
	});

	it("places system-score at index 0 with all four personas and the systemScore key", () => {
		const entry = CATALOG[0];
		expect(entry?.id).toBe("system-score");
		expect(entry?.title).toBe("System score");
		expect(entry?.reportDataKey).toBe("systemScore");
		expect([...(entry?.personas ?? [])].sort()).toEqual([
			"consumer",
			"design",
			"engineering",
			"owner",
		]);
	});

	it("covers exactly the optional ReportData sections (runtime half of the satisfies check)", () => {
		const keys = CATALOG.map((a) => a.reportDataKey).sort();
		expect(keys).toEqual([...SECTION_KEYS].sort());
		// No duplicates: ten ids → ten distinct keys.
		expect(new Set(keys).size).toBe(SECTION_KEYS.length);
	});

	it("gives every artifact a non-empty title and at least one persona tag", () => {
		for (const artifact of CATALOG) {
			expect(artifact.title.length).toBeGreaterThan(0);
			expect(artifact.personas.length).toBeGreaterThan(0);
		}
	});

	it("exports ALL_ARTIFACT_IDS in catalog order", () => {
		expect(ALL_ARTIFACT_IDS).toEqual(CATALOG.map((a) => a.id));
	});
});

describe("lookupArtifact", () => {
	it("finds an artifact by its kebab-case id", () => {
		const outcome = lookupArtifact("parity");
		expect(outcome.kind).toBe("found");
		if (outcome.kind === "found") {
			const meta: ArtifactMeta = outcome.artifact;
			expect(meta.reportDataKey).toBe("parity");
		}
	});

	it("returns a typed unknown outcome (never throws) for an unknown id", () => {
		const outcome = lookupArtifact("nonsense");
		expect(outcome.kind).toBe("unknown");
		if (outcome.kind === "unknown") {
			expect(outcome.id).toBe("nonsense");
		}
	});

	it("carries nearest-match suggestions for a near-miss id", () => {
		const outcome = lookupArtifact("parityy");
		expect(outcome.kind).toBe("unknown");
		if (outcome.kind === "unknown") {
			expect(outcome.suggestions).toContain("parity");
		}
	});
});

describe("suggestArtifactIds", () => {
	it("ranks a prefix match first", () => {
		expect(suggestArtifactIds("drift")[0]).toBe("drift-trend");
	});

	it("suggests by edit distance for a typo", () => {
		expect(suggestArtifactIds("a11yy")).toContain("a11y");
		expect(suggestArtifactIds("partiy")).toContain("parity");
	});

	it("returns no suggestions when nothing is plausibly close", () => {
		expect(suggestArtifactIds("zzzzzzzzzz")).toEqual([]);
	});

	it("caps suggestions at three and keeps the ranking deterministic", () => {
		const suggestions = suggestArtifactIds("i");
		expect(suggestions.length).toBeLessThanOrEqual(3);
		expect(suggestions).toEqual(suggestArtifactIds("i"));
	});

	it("matches case-insensitively", () => {
		expect(suggestArtifactIds("PARITY")).toContain("parity");
	});
});

describe("ArtifactId type", () => {
	it("round-trips through the catalog (compile-time exhaustiveness lives in catalog.ts via satisfies)", () => {
		const ids: ArtifactId[] = [...ALL_ARTIFACT_IDS];
		for (const id of ids) {
			expect(lookupArtifact(id).kind).toBe("found");
		}
	});
});
