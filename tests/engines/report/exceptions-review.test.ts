// X2 — exceptions-review engine (SPEC-exceptions §3). Pure: the F3 hotspot
// trend + the configured `exceptions` entries + today in → a triage queue out.
// A recurring deviation is a conversation, not a failure: rows without an owner
// surface first, logged decisions show their owner, and nothing is ever hidden.
import { describe, expect, it } from "vitest";
import type { ExceptionEntry } from "../../../src/config.js";
import { buildExceptionsReview } from "../../../src/engines/report/exceptions-review.js";
import type {
	HotspotRow,
	HotspotSignal,
	LibraryHotspotsTrend,
} from "../../../src/engines/report/library-hotspots-trend.js";

const DATES = ["2026-09-01", "2026-09-08", "2026-09-15"];
const TODAY = "2026-10-09";

/** A trend row from per-date counts (status is irrelevant to the review). */
function row(
	name: string,
	counts: (number | null)[],
	signal: HotspotSignal = "overrides",
): HotspotRow {
	return {
		signal,
		name,
		points: counts.map((count, i) => ({ date: DATES[i] ?? "", count })),
		latest: counts[counts.length - 1] ?? null,
		status: "flat",
	};
}

function trend(...rows: HotspotRow[]): LibraryHotspotsTrend {
	return { dates: DATES, rows };
}

function entry(
	component: string,
	extra: Partial<ExceptionEntry> = {},
): ExceptionEntry {
	return { component, owner: "@checkout", decision: "investigating", ...extra };
}

describe("buildExceptionsReview", () => {
	it("is undefined with no trend and no entries", () => {
		expect(buildExceptionsReview(undefined, undefined, TODAY)).toBeUndefined();
		expect(buildExceptionsReview(trend(), [], TODAY)).toBeUndefined();
	});

	it("flags a component overridden on 2+ runs with no entry as needs-owner", () => {
		const review = buildExceptionsReview(
			trend(row("Card", [4, 6, 7])),
			undefined,
			TODAY,
		);
		expect(review?.rows).toEqual([
			{
				signal: "overrides",
				name: "Card",
				runs: 3,
				latest: 7,
				state: "needs-owner",
			},
		]);
		expect(review?.totals.needsOwner).toBe(1);
	});

	it("ignores one-off deviations and ones already back to zero", () => {
		const review = buildExceptionsReview(
			trend(row("Badge", [0, 0, 3]), row("Tag", [2, 1, 0])),
			undefined,
			TODAY,
		);
		expect(review).toBeUndefined();
	});

	it("keeps a row below the stored top-N (unknown latest) recurring, not resolved", () => {
		const review = buildExceptionsReview(
			trend(row("Card", [4, 5, null])),
			undefined,
			TODAY,
		);
		expect(review?.rows[0]).toMatchObject({
			latest: null,
			state: "needs-owner",
		});
	});

	it("attaches the owner, decision and note of a matching entry (trimmed, case-insensitive)", () => {
		const review = buildExceptionsReview(
			trend(row("Card", [4, 6, 7])),
			[
				entry("  card ", {
					decision: "evolve-component",
					note: "Needs a compact layout",
					reviewBy: "2026-11-15",
				}),
			],
			TODAY,
		);
		expect(review?.rows).toEqual([
			{
				signal: "overrides",
				name: "Card",
				runs: 3,
				latest: 7,
				state: "evolve-component",
				owner: "@checkout",
				decision: "evolve-component",
				note: "Needs a compact layout",
				reviewBy: "2026-11-15",
			},
		]);
		expect(review?.totals).toEqual({
			needsOwner: 0,
			overdue: 0,
			inReview: 0,
			decided: 1,
			resolved: 0,
			notSeen: 0,
		});
	});

	it("marks an entry past its review date as overdue", () => {
		const review = buildExceptionsReview(
			trend(row("Card", [4, 6, 7])),
			[entry("Card", { reviewBy: "2026-10-01" })],
			TODAY,
		);
		expect(review?.rows[0]?.state).toBe("overdue");
		// the review date is today → not yet overdue
		const onTime = buildExceptionsReview(
			trend(row("Card", [4, 6, 7])),
			[entry("Card", { reviewBy: TODAY })],
			TODAY,
		);
		expect(onTime?.rows[0]?.state).toBe("investigating");
	});

	it("marks an entry whose component dropped to zero as resolved (close it)", () => {
		const review = buildExceptionsReview(
			trend(row("Card", [4, 2, 0])),
			[entry("Card", { reviewBy: "2026-10-01" })],
			TODAY,
		);
		expect(review?.rows[0]).toMatchObject({ state: "resolved", latest: 0 });
	});

	it("lists an entry that matches no trend row as not-seen, never dropped", () => {
		const review = buildExceptionsReview(
			trend(row("Card", [0, 0, 1])),
			[entry("Crad")],
			TODAY,
		);
		expect(review?.rows).toEqual([
			{
				signal: "overrides",
				name: "Crad",
				runs: 0,
				latest: null,
				state: "not-seen",
				owner: "@checkout",
				decision: "investigating",
			},
		]);
		expect(review?.totals.notSeen).toBe(1);
	});

	it("shows a logged entry even when its component is not (yet) recurring", () => {
		const review = buildExceptionsReview(
			trend(row("Card", [0, 0, 2])),
			[entry("Card", { decision: "fix-implementation" })],
			TODAY,
		);
		expect(review?.rows[0]).toMatchObject({
			runs: 1,
			state: "fix-implementation",
		});
	});

	it("scopes an entry to one signal when `signal` is set", () => {
		const review = buildExceptionsReview(
			trend(
				row("Card", [3, 3, 3], "overrides"),
				row("Card", [2, 2, 2], "detached"),
			),
			[entry("Card", { signal: "detached", decision: "fix-implementation" })],
			TODAY,
		);
		expect(review?.rows.map((r) => [r.signal, r.state])).toEqual([
			["overrides", "needs-owner"],
			["detached", "fix-implementation"],
		]);
	});

	it("orders needs-owner → overdue → investigating → decided → resolved → not-seen, then latest desc", () => {
		const review = buildExceptionsReview(
			trend(
				row("Gone", [3, 1, 0]),
				row("Evolve", [5, 5, 5]),
				row("Fix", [6, 6, 6]),
				row("Review", [2, 2, 2]),
				row("Late", [1, 1, 1]),
				row("Small", [1, 1, 2]),
				row("Big", [9, 9, 9]),
			),
			[
				entry("Gone"),
				entry("Evolve", { decision: "evolve-component" }),
				entry("Fix", { decision: "fix-implementation" }),
				entry("Review"),
				entry("Late", { reviewBy: "2026-01-01" }),
				entry("Ghost"),
			],
			TODAY,
		);
		expect(review?.rows.map((r) => r.name)).toEqual([
			"Big",
			"Small",
			"Late",
			"Review",
			"Fix",
			"Evolve",
			"Gone",
			"Ghost",
		]);
		expect(review?.totals).toEqual({
			needsOwner: 2,
			overdue: 1,
			inReview: 1,
			decided: 2,
			resolved: 1,
			notSeen: 1,
		});
		expect(review?.dates).toEqual(DATES);
	});
});
