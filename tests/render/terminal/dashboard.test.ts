// M10.2 — renderTerminalDashboard: the selection-aware terminal composer. PURE.
// Mirrors the HTML renderer's selection-gating (deselected → nothing; selected-
// but-empty → empty-state) under one header, in selection order. Asserts the
// full 30-title render, the run-a-check hints, gating + order, color on/off, and
// determinism.
import { describe, expect, it } from "vitest";
import {
	ALL_ARTIFACT_IDS,
	type ArtifactId,
} from "../../../src/engines/report/catalog.js";
import type { ReportData } from "../../../src/engines/report/types.js";
import { renderTerminalDashboard } from "../../../src/render/terminal/dashboard.js";

const hasAnsi = (s: string): boolean => s.includes(String.fromCharCode(27));

/** A bare ReportData — every section absent → each renders its empty-state. */
const BARE: ReportData = {
	generatedAt: "2026-06-10T00:00:00.000Z",
	project: "demo",
};

const OPTS = { generatedAt: "2026-06-10T00:00:00.000Z", color: false } as const;

describe("renderTerminalDashboard", () => {
	it("renders the header + a block per selected artifact (all 31)", () => {
		const out = renderTerminalDashboard(BARE, ALL_ARTIFACT_IDS, OPTS);
		expect(out).toContain("ds-bridge report · demo");
		expect(out).toContain("Generated 2026-06-10T00:00:00.000Z");
		// One block per selected artifact: every selected-but-empty section keeps
		// its empty-state, so the count proves all 31 rendered.
		expect(out.match(/No data yet/g)?.length).toBe(31);
		// Spot-check representative panel titles across the catalog.
		for (const title of [
			"System score",
			"Drift trend",
			"Parity matrix",
			"Targets / SLAs",
			"Score velocity",
			"Data freshness",
			"Consistency",
			"Design debt",
			"Executive summary",
		]) {
			expect(out).toContain(title);
		}
	});

	it("renders the executive layer twins (X4 / AN7)", () => {
		const out = renderTerminalDashboard(
			{
				...BARE,
				consistency: {
					score: 84,
					components: [{ kind: "tokens", score: 84, weight: 40 }],
				},
				debt: {
					pct: 30,
					level: "medium",
					items: [
						{
							kind: "deprecated",
							subject: "LegacyButton",
							count: 2,
							weight: 8,
							recommendation: 'Replace deprecated "LegacyButton"',
						},
					],
				},
				executive: {
					health: 78,
					adoption: 60,
					trend: [
						{ date: "2026-06-01", score: 70 },
						{ date: "2026-06-05", score: 78 },
					],
				},
			},
			["executive", "consistency", "design-debt"],
			OPTS,
		);
		expect(out).not.toContain("No data yet");
		expect(out).toMatch(/System score\s+78/);
		expect(out).toMatch(/Import coverage\s+60%/);
		expect(out).not.toMatch(/^Health/m);
		expect(out).not.toMatch(/^Adoption\s/m);
		expect(out).toContain("78");
		expect(out).toContain("60%");
		// Absent headlines read as not measured, never 0.
		expect(out).toMatch(/Consistency\s+—/);
		expect(out).toContain("84%");
		expect(out).toContain("tokens");
		expect(out).toContain("30/100 · medium");
		expect(out).toContain("LegacyButton");
		expect(out.indexOf("Executive summary")).toBeLessThan(
			out.indexOf("Design debt"),
		);
	});

	it("names each section's run-a-check command in its empty-state", () => {
		const out = renderTerminalDashboard(BARE, ALL_ARTIFACT_IDS, OPTS);
		expect(out).toContain("ds-bridge report"); // system-score / targets
		expect(out).toContain("ds-bridge parity"); // parity
		expect(out).toContain("ds-bridge changelog`"); // audience-changelog
		expect(out).toContain("ds-bridge release-check"); // release-readiness
		expect(out).toContain("ds-bridge library-health"); // library-health
	});

	it("the executive empty state points at `record`", () => {
		const out = renderTerminalDashboard(BARE, ["executive"], OPTS);
		expect(out).toContain("run `ds-bridge record` to populate this section");
	});

	it("emits NOTHING for a deselected artifact", () => {
		const out = renderTerminalDashboard(BARE, ["parity"] as ArtifactId[], OPTS);
		expect(out).toContain("Parity matrix");
		expect(out).not.toContain("System score");
		expect(out).not.toContain("Data freshness");
	});

	it("renders sections in selection order, not catalog order", () => {
		const out = renderTerminalDashboard(
			BARE,
			["parity", "system-score"] as ArtifactId[],
			OPTS,
		);
		expect(out.indexOf("Parity matrix")).toBeLessThan(
			out.indexOf("System score"),
		);
	});

	it("renders real content for a populated section (gauge + percent)", () => {
		const data: ReportData = {
			...BARE,
			systemScore: {
				current: 76,
				components: [{ kind: "drift", score: 70, weight: 25 }],
				trend: [
					{ date: "2026-06-01", score: 70 },
					{ date: "2026-06-02", score: 76 },
				],
			},
		};
		const out = renderTerminalDashboard(
			data,
			["system-score"] as ArtifactId[],
			OPTS,
		);
		expect(out).toContain("System score");
		expect(out).toContain("76/100");
		expect(out).not.toContain("No data yet");
	});

	it("emits ANSI only when color is on", () => {
		const data: ReportData = {
			...BARE,
			systemScore: {
				current: 76,
				components: [{ kind: "drift", score: 70, weight: 25 }],
				trend: [{ date: "2026-06-01", score: 76 }],
			},
		};
		const sel = ["system-score"] as ArtifactId[];
		expect(
			hasAnsi(renderTerminalDashboard(data, sel, { ...OPTS, color: true })),
		).toBe(true);
		expect(
			hasAnsi(renderTerminalDashboard(data, sel, { ...OPTS, color: false })),
		).toBe(false);
	});

	it("is deterministic for identical input", () => {
		expect(renderTerminalDashboard(BARE, ALL_ARTIFACT_IDS, OPTS)).toBe(
			renderTerminalDashboard(BARE, ALL_ARTIFACT_IDS, OPTS),
		);
	});
});
