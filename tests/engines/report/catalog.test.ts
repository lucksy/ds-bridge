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
	"driftTrend",
	"lintSummary",
	"readiness",
	"parity",
	"a11y",
	"impact",
];

describe("CATALOG", () => {
	it("declares the six wave-1 artifacts in dashboard order", () => {
		expect(CATALOG.map((a) => a.id)).toEqual([
			"drift-trend",
			"lint-summary",
			"readiness",
			"parity",
			"a11y",
			"impact",
		]);
	});

	it("covers exactly the optional ReportData sections (runtime half of the satisfies check)", () => {
		const keys = CATALOG.map((a) => a.reportDataKey).sort();
		expect(keys).toEqual([...SECTION_KEYS].sort());
		// No duplicates: six ids → six distinct keys.
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
