// F3 — library-hotspots-trend engine (SPEC-figma-trends §3.1). Pure: the
// replayed history in → per-component series out, so a DS designer can see
// WHICH components keep getting overridden, which deprecated ones are going
// away, and which detach spikes return. "Below the top-N cut" is unknown, never
// a false "resolved".
import { describe, expect, it } from "vitest";
import { replayHistory } from "../../../src/engines/report/history-lines.js";
import { buildLibraryHotspotsTrend } from "../../../src/engines/report/library-hotspots-trend.js";

type Entry = { name: string; count: number };

function lh(
	at: string | undefined,
	lists: {
		topN?: number;
		topOverrides?: Entry[];
		topDeprecated?: Entry[];
		topDetached?: Entry[];
	},
): string {
	return JSON.stringify({
		...(at !== undefined ? { at } : {}),
		kind: "library-health",
		overrideHotspots: 0,
		deprecatedUsage: 0,
		detachedCandidates: 0,
		...lists,
	});
}

const rec = (...lines: string[]) => replayHistory(lines.join("\n"));

const D1 = "2026-09-01T10:00:00.000Z";
const D2 = "2026-09-08T10:00:00.000Z";
const D3 = "2026-09-15T10:00:00.000Z";

describe("buildLibraryHotspotsTrend", () => {
	it("is undefined without list-bearing library-health lines (counts-only history)", () => {
		expect(buildLibraryHotspotsTrend(rec())).toBeUndefined();
		const countsOnly = JSON.stringify({
			at: D1,
			kind: "library-health",
			overrideHotspots: 3,
			deprecatedUsage: 1,
			detachedCandidates: 0,
		});
		expect(buildLibraryHotspotsTrend(rec(countsOnly))).toBeUndefined();
	});

	it("builds one point per date per component, last-of-day wins, dateless skipped", () => {
		const trend = buildLibraryHotspotsTrend(
			rec(
				lh(D1, { topN: 10, topOverrides: [{ name: "Button", count: 4 }] }),
				lh("2026-09-01T18:00:00.000Z", {
					topN: 10,
					topOverrides: [{ name: "Button", count: 6 }],
				}),
				lh(undefined, {
					topN: 10,
					topOverrides: [{ name: "Button", count: 99 }],
				}),
				lh(D2, { topN: 10, topOverrides: [{ name: "Button", count: 9 }] }),
			),
		);
		expect(trend?.dates).toEqual(["2026-09-01", "2026-09-08"]);
		const button = trend?.rows.find((r) => r.name === "Button");
		expect(button).toEqual({
			signal: "overrides",
			name: "Button",
			points: [
				{ date: "2026-09-01", count: 6 },
				{ date: "2026-09-08", count: 9 },
			],
			first: 6,
			latest: 9,
			delta: 3,
			status: "rising",
		});
	});

	it("a component missing from a NOT-full list is 0 (resolved); from a FULL list it is unknown (below-top)", () => {
		const trend = buildLibraryHotspotsTrend(
			rec(
				lh(D1, {
					topN: 2,
					topDeprecated: [
						{ name: "OldButton", count: 5 },
						{ name: "Legacy Tag", count: 2 },
					],
				}),
				// Not full (1 < 2): OldButton is gone for real.
				lh(D2, { topN: 2, topDeprecated: [{ name: "Legacy Tag", count: 2 }] }),
			),
		);
		const old = trend?.rows.find((r) => r.name === "OldButton");
		expect(old?.points).toEqual([
			{ date: "2026-09-01", count: 5 },
			{ date: "2026-09-08", count: 0 },
		]);
		expect(old?.status).toBe("resolved");
		expect(old?.delta).toBe(-5);

		const full = buildLibraryHotspotsTrend(
			rec(
				lh(D1, {
					topN: 1,
					topDetached: [{ name: "Avatar", count: 3 }],
				}),
				lh(D2, { topN: 1, topDetached: [{ name: "Chip", count: 4 }] }),
			),
		);
		const avatar = full?.rows.find((r) => r.name === "Avatar");
		expect(avatar?.points[1]).toEqual({ date: "2026-09-08", count: null });
		expect(avatar?.latest).toBeNull();
		expect(avatar?.status).toBe("below-top");
		expect(avatar).not.toHaveProperty("delta");
		const chip = full?.rows.find((r) => r.name === "Chip");
		// Unknown on D1 (Avatar filled the 1-slot list), then 4.
		expect(chip?.points[0]).toEqual({ date: "2026-09-01", count: null });
		expect(chip?.status).toBe("new");
	});

	it("a day whose record lacks a signal's list leaves that signal unknown", () => {
		const trend = buildLibraryHotspotsTrend(
			rec(
				lh(D1, { topN: 10, topOverrides: [{ name: "Card", count: 2 }] }),
				lh(D2, { topN: 10, topDeprecated: [] }),
			),
		);
		const card = trend?.rows.find((r) => r.name === "Card");
		expect(card?.points[1]).toEqual({ date: "2026-09-08", count: null });
	});

	it("statuses: falling, flat, new on a later day, flat on a single date", () => {
		const trend = buildLibraryHotspotsTrend(
			rec(
				lh(D1, {
					topN: 10,
					topOverrides: [
						{ name: "A", count: 5 },
						{ name: "B", count: 2 },
					],
				}),
				lh(D2, {
					topN: 10,
					topOverrides: [
						{ name: "A", count: 3 },
						{ name: "B", count: 2 },
						{ name: "C", count: 1 },
					],
				}),
			),
		);
		const status = (n: string) => trend?.rows.find((r) => r.name === n)?.status;
		expect(status("A")).toBe("falling");
		expect(status("B")).toBe("flat");
		expect(status("C")).toBe("new");
		// C was knowably 0 on D1 (the list was not full).
		expect(trend?.rows.find((r) => r.name === "C")?.points[0]).toEqual({
			date: "2026-09-01",
			count: 0,
		});

		const single = buildLibraryHotspotsTrend(
			rec(lh(D1, { topN: 10, topOverrides: [{ name: "A", count: 5 }] })),
		);
		expect(single?.rows[0]?.status).toBe("flat");
	});

	it("orders by signal, then latest desc (unknown last), then name; caps rows per signal", () => {
		const trend = buildLibraryHotspotsTrend(
			rec(
				lh(D1, {
					topN: 10,
					topDetached: [{ name: "Z", count: 1 }],
					topDeprecated: [{ name: "Y", count: 1 }],
					topOverrides: [
						{ name: "b", count: 2 },
						{ name: "a", count: 2 },
						{ name: "c", count: 7 },
					],
				}),
				lh(D3, {
					topN: 10,
					topDetached: [{ name: "Z", count: 1 }],
					topDeprecated: [{ name: "Y", count: 1 }],
					topOverrides: [
						{ name: "b", count: 2 },
						{ name: "a", count: 2 },
						{ name: "c", count: 7 },
					],
				}),
			),
			{ limit: 2 },
		);
		expect(trend?.rows.map((r) => `${r.signal}:${r.name}`)).toEqual([
			"overrides:c",
			"overrides:a",
			"deprecated:Y",
			"detached:Z",
		]);
	});

	it("trends ONE Figma file: lines for another fileKey never make a component falsely resolved", () => {
		const withFile = (at: string, fileKey: string | undefined, list: Entry[]) =>
			JSON.stringify({
				...JSON.parse(lh(at, { topN: 10, topDeprecated: list })),
				...(fileKey !== undefined ? { fileKey } : {}),
			});
		// Day 1 checks file A, day 2 checks file B (newest) — A's Old is not "resolved".
		const switched = buildLibraryHotspotsTrend(
			rec(
				withFile(D1, "FILE_A", [{ name: "Old", count: 2 }]),
				withFile(D2, "FILE_B", []),
			),
		);
		expect(switched?.dates).toEqual(["2026-09-08"]);
		expect(switched?.rows.find((r) => r.name === "Old")).toBeUndefined();
		expect(switched?.rows.some((r) => r.status === "resolved")).toBe(false);

		// A, B, A — the trend follows file A only (B's day is dropped).
		const back = buildLibraryHotspotsTrend(
			rec(
				withFile(D1, "FILE_A", [{ name: "Old", count: 2 }]),
				withFile(D2, "FILE_B", [{ name: "Tag", count: 7 }]),
				withFile(D3, "FILE_A", [{ name: "Old", count: 1 }]),
			),
		);
		expect(back?.dates).toEqual(["2026-09-01", "2026-09-15"]);
		expect(back?.rows.map((r) => r.name)).toEqual(["Old"]);
		expect(back?.rows[0]?.status).toBe("falling");

		// Legacy lines (no fileKey) only match other legacy lines.
		const legacy = buildLibraryHotspotsTrend(
			rec(
				withFile(D1, undefined, [{ name: "Old", count: 2 }]),
				withFile(D2, "FILE_A", [{ name: "New", count: 1 }]),
			),
		);
		expect(legacy?.dates).toEqual(["2026-09-08"]);
		expect(legacy?.rows.map((r) => r.name)).toEqual(["New"]);
		const legacyOnly = buildLibraryHotspotsTrend(
			rec(
				withFile(D1, undefined, [{ name: "Old", count: 2 }]),
				withFile(D2, undefined, []),
			),
		);
		expect(legacyOnly?.rows.find((r) => r.name === "Old")?.status).toBe(
			"resolved",
		);
	});

	it("tolerates malformed entries (skips non-string names / non-numeric counts)", () => {
		const bad = JSON.stringify({
			at: D1,
			kind: "library-health",
			topN: 10,
			topOverrides: [
				{ name: "ok", count: 1 },
				{ name: 3, count: 1 },
				{ name: "nan", count: "x" },
				null,
			],
		});
		const trend = buildLibraryHotspotsTrend(rec(bad));
		expect(trend?.rows.map((r) => r.name)).toEqual(["ok"]);
	});
});
