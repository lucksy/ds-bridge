// F1 — top-N lists for the library-health history record (SPEC-figma-trends §2).
// Pure: the uncapped L1 report in → per-component lists out, so the dashboard
// can trend SPECIFIC components (which keep getting overridden, which deprecated
// ones are going away, which detach spikes return).
import { describe, expect, it } from "vitest";
import {
	assessLibraryHealth,
	type LibraryHealthReport,
} from "../../../src/engines/figma/library-health.js";
import {
	DEFAULT_TOP_N,
	libraryHealthTopLists,
	parseTopN,
} from "../../../src/engines/figma/library-health-top.js";
import type { FigmaFile, FigmaNode } from "../../../src/io/figma/client.js";

function report(partial: Partial<LibraryHealthReport>): LibraryHealthReport {
	return {
		overrideHotspots: [],
		deprecatedUsage: [],
		detachedCandidates: [],
		totals: { overrideHotspots: 0, deprecatedUsage: 0, detachedCandidates: 0 },
		...partial,
	};
}

describe("assessLibraryHealth — cap option", () => {
	const instances: FigmaNode[] = Array.from({ length: 25 }, (_, i) => ({
		id: `1:${i}`,
		name: `I${String(i).padStart(2, "0")}`,
		type: "INSTANCE",
		overrides: [{ id: "a" }],
	}));
	const f: FigmaFile = {
		name: "T",
		lastModified: "2026-06-09T00:00:00Z",
		version: "1",
		document: { id: "0:0", name: "D", type: "DOCUMENT", children: instances },
	};

	it("keeps the default display cap of 20", () => {
		expect(assessLibraryHealth(f).overrideHotspots).toHaveLength(20);
	});

	it("an explicit Infinity cap returns every entry (totals unchanged)", () => {
		const r = assessLibraryHealth(f, { cap: Number.POSITIVE_INFINITY });
		expect(r.overrideHotspots).toHaveLength(25);
		expect(r.totals.overrideHotspots).toBe(25);
	});
});

describe("libraryHealthTopLists", () => {
	it("groups override hotspots by main component, summing override counts", () => {
		const lists = libraryHealthTopLists(
			report({
				overrideHotspots: [
					{
						nodeId: "1",
						name: "Primary",
						componentName: "Button",
						overrideCount: 4,
					},
					{
						nodeId: "2",
						name: "Secondary",
						componentName: "Button",
						overrideCount: 3,
					},
					{
						nodeId: "3",
						name: "Card A",
						componentName: "Card",
						overrideCount: 5,
					},
					{ nodeId: "4", name: "Loose", overrideCount: 1 },
				],
			}),
			10,
		);
		expect(lists.topN).toBe(10);
		expect(lists.topOverrides).toEqual([
			{ name: "Button", count: 7 },
			{ name: "Card", count: 5 },
			{ name: "Loose", count: 1 },
		]);
	});

	it("maps deprecated groups and ranks by count desc, then name asc", () => {
		const lists = libraryHealthTopLists(
			report({
				deprecatedUsage: [
					{ componentName: "Legacy Tag", count: 3 },
					{ componentName: "Button/Old ⚠", count: 6 },
					{ componentName: "Alert [old]", count: 3 },
				],
			}),
			10,
		);
		expect(lists.topDeprecated).toEqual([
			{ name: "Button/Old ⚠", count: 6 },
			{ name: "Alert [old]", count: 3 },
			{ name: "Legacy Tag", count: 3 },
		]);
	});

	it("groups detached candidates by node name (count of frames)", () => {
		const lists = libraryHealthTopLists(
			report({
				detachedCandidates: [
					{ nodeId: "1", name: "Chip", heuristic: true },
					{ nodeId: "2", name: "Avatar", heuristic: true },
					{ nodeId: "3", name: "Avatar", heuristic: true },
				],
			}),
			10,
		);
		expect(lists.topDetached).toEqual([
			{ name: "Avatar", count: 2 },
			{ name: "Chip", count: 1 },
		]);
	});

	it("slices each list to N", () => {
		const lists = libraryHealthTopLists(
			report({
				deprecatedUsage: [
					{ componentName: "A", count: 1 },
					{ componentName: "B", count: 2 },
					{ componentName: "C", count: 3 },
				],
			}),
			2,
		);
		expect(lists.topN).toBe(2);
		expect(lists.topDeprecated).toEqual([
			{ name: "C", count: 3 },
			{ name: "B", count: 2 },
		]);
	});

	it("N = 0 yields empty lists", () => {
		const lists = libraryHealthTopLists(
			report({ deprecatedUsage: [{ componentName: "A", count: 1 }] }),
			0,
		);
		expect(lists).toEqual({
			topN: 0,
			topOverrides: [],
			topDeprecated: [],
			topDetached: [],
		});
	});
});

describe("parseTopN", () => {
	it("defaults to 10", () => {
		expect(DEFAULT_TOP_N).toBe(10);
	});

	it.each([
		["0", 0],
		["10", 10],
		["100", 100],
		[" 7 ", 7],
	])("accepts %j", (raw, n) => {
		expect(parseTopN(raw)).toBe(n);
	});

	it.each([
		["-1"],
		["101"],
		["2.5"],
		["abc"],
		[""],
		["1e2"],
	])("rejects %j", (raw) => {
		expect(parseTopN(raw)).toBeUndefined();
	});
});
