// T5.5 — parity engine. PURE: no fs/network/process; deterministic; NEVER
// throws. It projects a saved RegistryFile into a flat parity report (one row
// per component, severity-sorted) plus a summary count, and adapts that report
// into the dashboard's Parity section shape.
//
// ── Status rules (the table these tests pin) ──
//
//   matched, score >= 0.85                 -> "ok"
//   matched, 0.6 <= score < 0.85           -> "prop-mismatch"  (detail names the
//                                              gap: low shape agreement)
//   unmatchedFigma (no code component)     -> "missing-in-code"  (detail lists
//                                              the top code candidate if any)
//   unmatchedCode  (no figma component)    -> "missing-in-figma"
//
// Component name: matches use codeName; unmatchedFigma use the figma name;
// unmatchedCode use the code name.
//
// Row ordering: by status SEVERITY first
//   (missing-in-code, missing-in-figma, prop-mismatch, ok) then by name asc.
import { describe, expect, it } from "vitest";
import {
	buildParity,
	type ParityReport,
	toParitySection,
} from "../../../src/engines/registry/parity.js";
import type { RegistryFile } from "../../../src/engines/registry/persist.js";

// ── Builders ──

function registry(overrides: Partial<RegistryFile> = {}): RegistryFile {
	return {
		schemaVersion: 1,
		generatedAt: "2026-06-05T00:00:00.000Z",
		matches: [],
		unmatchedCode: [],
		unmatchedFigma: [],
		...overrides,
	};
}

describe("buildParity", () => {
	it("classifies a high-score match as ok", () => {
		const report = buildParity(
			registry({
				matches: [
					{
						codeName: "Button",
						importPath: "components/button.tsx",
						figmaName: "Button",
						nodeId: "10:1",
						score: 0.9,
					},
				],
			}),
		);
		expect(report.rows).toEqual([
			{ component: "Button", status: "ok", detail: expect.any(String) },
		]);
		expect(report.summary).toEqual({
			ok: 1,
			missingInCode: 0,
			missingInFigma: 0,
			propMismatch: 0,
		});
	});

	it("treats exactly 0.85 as ok (inclusive lower bound for ok)", () => {
		const report = buildParity(
			registry({
				matches: [
					{
						codeName: "Card",
						importPath: "components/card.tsx",
						figmaName: "Card",
						nodeId: "10:2",
						score: 0.85,
					},
				],
			}),
		);
		expect(report.rows[0]?.status).toBe("ok");
	});

	it("classifies a mid-score match as prop-mismatch with a shape-gap detail", () => {
		const report = buildParity(
			registry({
				matches: [
					{
						codeName: "Badge",
						importPath: "components/badge.tsx",
						figmaName: "Badge",
						nodeId: "10:3",
						score: 0.7,
					},
				],
			}),
		);
		const row = report.rows[0];
		expect(row?.status).toBe("prop-mismatch");
		expect(row?.detail.toLowerCase()).toContain("shape");
		// The numeric score appears so the user can see how close it is.
		expect(row?.detail).toContain("0.7");
		expect(report.summary.propMismatch).toBe(1);
	});

	it("classifies an unmatched figma component as missing-in-code, naming its top candidate", () => {
		const report = buildParity(
			registry({
				unmatchedFigma: [
					{
						name: "Tooltip",
						nodeId: "10:9",
						candidates: [
							{ codeName: "Toolbar", score: 0.5 },
							{ codeName: "Tip", score: 0.4 },
						],
					},
				],
			}),
		);
		const row = report.rows[0];
		expect(row?.component).toBe("Tooltip");
		expect(row?.status).toBe("missing-in-code");
		expect(row?.detail).toContain("Toolbar");
		expect(report.summary.missingInCode).toBe(1);
	});

	it("missing-in-code with no candidates still produces a sensible detail", () => {
		const report = buildParity(
			registry({
				unmatchedFigma: [{ name: "Lonely", nodeId: "10:10", candidates: [] }],
			}),
		);
		const row = report.rows[0];
		expect(row?.status).toBe("missing-in-code");
		expect(typeof row?.detail).toBe("string");
		expect(row?.detail.length).toBeGreaterThan(0);
	});

	it("classifies an unmatched code component as missing-in-figma", () => {
		const report = buildParity(
			registry({
				unmatchedCode: [
					{
						name: "HeroPanel",
						importPath: "components/hero-panel.tsx",
						candidates: [],
					},
				],
			}),
		);
		const row = report.rows[0];
		expect(row?.component).toBe("HeroPanel");
		expect(row?.status).toBe("missing-in-figma");
		expect(report.summary.missingInFigma).toBe(1);
	});

	it("sorts rows by status severity then name", () => {
		const report = buildParity(
			registry({
				matches: [
					{
						codeName: "Zeta",
						importPath: "components/zeta.tsx",
						figmaName: "Zeta",
						nodeId: "1:1",
						score: 0.95,
					},
					{
						codeName: "Alpha",
						importPath: "components/alpha.tsx",
						figmaName: "Alpha",
						nodeId: "1:2",
						score: 0.95,
					},
					{
						codeName: "Mismatch",
						importPath: "components/mismatch.tsx",
						figmaName: "Mismatch",
						nodeId: "1:3",
						score: 0.7,
					},
				],
				unmatchedCode: [
					{ name: "GoneFromFigma", importPath: "x.tsx", candidates: [] },
				],
				unmatchedFigma: [
					{ name: "GoneFromCode", nodeId: "1:4", candidates: [] },
				],
			}),
		);
		expect(
			report.rows.map((r) => ({ component: r.component, status: r.status })),
		).toEqual([
			{ component: "GoneFromCode", status: "missing-in-code" },
			{ component: "GoneFromFigma", status: "missing-in-figma" },
			{ component: "Mismatch", status: "prop-mismatch" },
			{ component: "Alpha", status: "ok" },
			{ component: "Zeta", status: "ok" },
		]);
	});

	it("returns an all-zero summary and no rows for an empty registry", () => {
		const report = buildParity(registry());
		expect(report.rows).toEqual([]);
		expect(report.summary).toEqual({
			ok: 0,
			missingInCode: 0,
			missingInFigma: 0,
			propMismatch: 0,
		});
	});

	it("never throws on a malformed registry (defensive)", () => {
		const bad = {
			schemaVersion: 1,
			generatedAt: "x",
			matches: undefined,
			unmatchedCode: undefined,
			unmatchedFigma: undefined,
		} as unknown as RegistryFile;
		expect(() => buildParity(bad)).not.toThrow();
		expect(buildParity(bad).rows).toEqual([]);
	});
});

describe("buildParity — compound component parts", () => {
	const card = {
		codeName: "Card",
		importPath: "src/components/ui/card.tsx",
		figmaName: "Card",
		nodeId: "1:110",
		score: 0.9,
	};
	const part = (name: string, importPath = "src/components/ui/card.tsx") => ({
		name,
		importPath,
		candidates: [],
	});

	it("folds same-file parts (CardHeader, CardTitle) into the parent's row", () => {
		const report = buildParity(
			registry({
				matches: [card],
				unmatchedCode: [part("CardHeader"), part("CardTitle")],
			}),
		);
		expect(report.rows.map((r) => [r.component, r.status])).toEqual([
			["Card", "ok"],
		]);
		expect(report.rows[0]?.detail).toContain("Parts: CardHeader, CardTitle");
		expect(report.summary.missingInFigma).toBe(0);
	});

	it("folds the parts of a parent that is itself missing in Figma into its one row", () => {
		const report = buildParity(
			registry({
				unmatchedCode: [
					part("Dialog", "src/components/ui/dialog.tsx"),
					part("DialogContent", "src/components/ui/dialog.tsx"),
					part("DialogTitle", "src/components/ui/dialog.tsx"),
				],
			}),
		);
		expect(report.rows.map((r) => r.component)).toEqual(["Dialog"]);
		expect(report.summary.missingInFigma).toBe(1);
	});

	it("does not fold a same-prefix component from another file", () => {
		const report = buildParity(
			registry({
				matches: [card],
				unmatchedCode: [part("CardGrid", "src/components/card-grid.tsx")],
			}),
		);
		expect(report.rows.map((r) => r.component).sort()).toEqual([
			"Card",
			"CardGrid",
		]);
	});
});

describe("buildParity — deprecated Figma components", () => {
	it("does not ask code to implement a Figma component marked deprecated", () => {
		const report = buildParity(
			registry({
				unmatchedFigma: [
					{ name: "Legacy Button", nodeId: "1:127", candidates: [] },
					{ name: "Tooltip", nodeId: "1:125", candidates: [] },
				],
			}),
		);
		expect(report.rows.map((r) => r.component)).toEqual(["Tooltip"]);
		expect(report.summary.missingInCode).toBe(1);
	});
});

describe("toParitySection", () => {
	function sampleReport(): ParityReport {
		return buildParity(
			registry({
				matches: [
					{
						codeName: "Button",
						importPath: "components/button.tsx",
						figmaName: "Button",
						nodeId: "10:1",
						score: 0.95,
					},
					{
						codeName: "Badge",
						importPath: "components/badge.tsx",
						figmaName: "Badge",
						nodeId: "10:3",
						score: 0.7,
					},
				],
				unmatchedCode: [
					{ name: "HeroPanel", importPath: "x.tsx", candidates: [] },
				],
				unmatchedFigma: [{ name: "Tooltip", nodeId: "10:9", candidates: [] }],
			}),
		);
	}

	it("produces a single 'Status' column matching the dashboard Parity shape", () => {
		const section = toParitySection(sampleReport());
		expect(section.columns).toEqual(["Status"]);
	});

	it("emits one row per parity row, in the same order, with one status cell each", () => {
		const report = sampleReport();
		const section = toParitySection(report);
		expect(section.rows.map((r) => r.component)).toEqual(
			report.rows.map((r) => r.component),
		);
		for (let i = 0; i < section.rows.length; i += 1) {
			const cells = section.rows[i]?.cells ?? [];
			expect(cells).toHaveLength(1);
			expect(cells[0]?.status).toBe(report.rows[i]?.status);
		}
	});

	it("produces an empty section for an empty report", () => {
		const section = toParitySection(buildParity(registry()));
		expect(section.columns).toEqual(["Status"]);
		expect(section.rows).toEqual([]);
	});
});
