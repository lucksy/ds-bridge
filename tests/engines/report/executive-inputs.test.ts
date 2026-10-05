// X2 (SPEC-exec-report §3) — pure extraction of the AN1 consistency input and
// the AN2 debt input from replayed history records + the registry. Latest
// record wins per source; absent sources stay absent (never a misleading 0).
import { describe, expect, it } from "vitest";
import type { RegistryFile } from "../../../src/engines/registry/persist.js";
import { executiveInputs } from "../../../src/engines/report/executive-inputs.js";
import {
	type HistoryRecord,
	replayHistory,
} from "../../../src/engines/report/history-lines.js";

function lines(...records: object[]): HistoryRecord[] {
	return replayHistory(records.map((r) => JSON.stringify(r)).join("\n"));
}

const registry: RegistryFile = {
	schemaVersion: 1,
	generatedAt: "2026-06-01T00:00:00.000Z",
	matches: [
		{
			codeName: "Button",
			importPath: "./Button",
			figmaName: "Button",
			nodeId: "1:1",
			score: 1,
		},
		{
			codeName: "Card",
			importPath: "./Card",
			figmaName: "Card",
			nodeId: "1:2",
			score: 1,
		},
		{
			codeName: "Input",
			importPath: "./Input",
			figmaName: "Input",
			nodeId: "1:3",
			score: 1,
		},
	],
	unmatchedCode: [
		{ name: "FancyBox", importPath: "./FancyBox", candidates: [] },
	],
	unmatchedFigma: [],
};

describe("executiveInputs", () => {
	it("no records + no registry → empty consistency input, debt undefined", () => {
		expect(executiveInputs([], undefined)).toEqual({
			consistency: {},
			debt: undefined,
		});
	});

	it("latest adoption-bearing lint line → tokens; latest lint → offSystem", () => {
		const out = executiveInputs(
			lines(
				{
					kind: "lint",
					at: "2026-06-01T00:00:00Z",
					byKind: { exact: 1, near: 0, offSystem: 9 },
					adoption: { refs: 10, literals: 10, byDirectory: [] },
				},
				{
					kind: "lint",
					at: "2026-06-02T00:00:00Z",
					byKind: { exact: 0, near: 0, offSystem: 4 },
					adoption: { refs: 30, literals: 10, byDirectory: [] },
				},
				// A later plain lint line refreshes offSystem but keeps the adoption.
				{
					kind: "lint",
					at: "2026-06-03T00:00:00Z",
					byKind: { exact: 0, near: 0, offSystem: 2 },
				},
			),
			undefined,
		);
		expect(out.consistency.tokens).toEqual({ refs: 30, literals: 10 });
		expect(out.debt).toEqual({ offSystem: 2 });
	});

	it("registry → components matched vs custom", () => {
		const out = executiveInputs([], registry);
		expect(out.consistency.components).toEqual({ matched: 3, custom: 1 });
		expect(out.debt).toBeUndefined();
	});

	it("counts-only library-health line → overrides + debt counts", () => {
		const out = executiveInputs(
			lines({
				kind: "library-health",
				at: "2026-06-04T00:00:00Z",
				overrideHotspots: 2,
				deprecatedUsage: 3,
				detachedCandidates: 1,
			}),
			undefined,
		);
		expect(out.consistency.overrides).toEqual({ hotspots: 2 });
		expect(out.debt).toEqual({ deprecatedCount: 3, detachedCount: 1 });
	});

	it("a library-health line carrying lists → itemized debt + list-length hotspots", () => {
		const out = executiveInputs(
			lines({
				kind: "library-health",
				at: "2026-06-04T00:00:00Z",
				overrideHotspots: [
					{ nodeId: "1", name: "A", overrideCount: 5 },
					{ nodeId: "2", name: "B", overrideCount: 6 },
					{ nodeId: "3", name: "C", overrideCount: 7 },
				],
				deprecatedUsage: [{ componentName: "LegacyButton", count: 2 }],
				detachedCandidates: [{ nodeId: "9", name: "Card", heuristic: true }],
			}),
			undefined,
		);
		expect(out.consistency.overrides).toEqual({ hotspots: 3 });
		expect(out.debt).toEqual({
			deprecatedUsage: [{ componentName: "LegacyButton", count: 2 }],
			detachedCandidates: [{ nodeId: "9", name: "Card", heuristic: true }],
		});
	});

	it("latest library-health line wins", () => {
		const out = executiveInputs(
			lines(
				{ kind: "library-health", overrideHotspots: 9, deprecatedUsage: 9 },
				{ kind: "library-health", overrideHotspots: 1, deprecatedUsage: 0 },
			),
			undefined,
		);
		expect(out.consistency.overrides).toEqual({ hotspots: 1 });
		expect(out.debt).toEqual({ deprecatedCount: 0 });
	});

	it("tolerates malformed fields and a malformed registry", () => {
		const out = executiveInputs(
			lines(
				{ kind: "lint", byKind: "nope", adoption: "nope" },
				{ kind: "library-health", overrideHotspots: "x" },
			),
			{ matches: "x", unmatchedCode: null } as unknown as RegistryFile,
		);
		expect(out.consistency.tokens).toBeUndefined();
		expect(out.consistency.components).toBeUndefined();
		expect(out.consistency.overrides).toBeUndefined();
		expect(out.debt).toEqual({ offSystem: 0 });
	});
});
