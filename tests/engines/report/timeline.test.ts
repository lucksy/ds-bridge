// Dashboard timeline engine: which earlier days a dashboard offers, and the
// history as it stood at the end of one of them.
import { describe, expect, it } from "vitest";
import {
	historyAsOf,
	timelineDays,
} from "../../../src/engines/report/timeline.js";

const j = (r: Record<string, unknown>) => JSON.stringify(r);

describe("timelineDays", () => {
	it("offers each earlier UTC day with records, oldest first; the newest day is Now", () => {
		const text = [
			j({ at: "2026-10-01T09:00:00Z", kind: "lint" }),
			j({ at: "2026-10-01T18:00:00Z", kind: "lint" }),
			j({ at: "2026-10-03T08:00:00Z", kind: "a11y" }),
			j({ at: "2026-10-04T08:00:00Z", kind: "lint" }),
		].join("\n");
		expect(timelineDays(text)).toEqual([
			{ day: "2026-10-01", endOfDay: "2026-10-01T23:59:59.999Z" },
			{ day: "2026-10-03", endOfDay: "2026-10-03T23:59:59.999Z" },
		]);
	});

	it("buckets by UTC day, whatever the offset the record was written with", () => {
		const text = [
			j({ at: "2026-10-01T23:30:00-02:00", kind: "lint" }), // 2 Oct UTC
			j({ at: "2026-10-03T00:00:00Z", kind: "lint" }),
		].join("\n");
		expect(timelineDays(text).map((d) => d.day)).toEqual(["2026-10-02"]);
	});

	it("keeps the newest days when there are more than the cap (Now counts as one)", () => {
		const text = Array.from({ length: 20 }, (_, i) =>
			j({
				at: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
				kind: "lint",
			}),
		).join("\n");
		const days = timelineDays(text, 5).map((d) => d.day);
		expect(days).toEqual([
			"2026-09-16",
			"2026-09-17",
			"2026-09-18",
			"2026-09-19",
		]);
	});

	it("is empty for a single day, no dated records, or a cap of one", () => {
		expect(
			timelineDays(j({ at: "2026-10-01T10:00:00Z", kind: "lint" })),
		).toEqual([]);
		expect(timelineDays([j({ kind: "lint" }), "{bad"].join("\n"))).toEqual([]);
		expect(timelineDays("")).toEqual([]);
		const twoDays = [
			j({ at: "2026-10-01T10:00:00Z", kind: "lint" }),
			j({ at: "2026-10-02T10:00:00Z", kind: "lint" }),
		].join("\n");
		expect(timelineDays(twoDays, 1)).toEqual([]);
	});
});

describe("historyAsOf", () => {
	it("keeps dated lines at or before the instant, in file order", () => {
		const a = j({ at: "2026-10-01T10:00:00Z", kind: "lint", n: 1 });
		const b = j({ at: "2026-10-02T10:00:00Z", kind: "lint", n: 2 });
		const edge = j({ at: "2026-10-01T23:59:59.999Z", kind: "a11y" });
		const text = [a, b, edge].join("\n");
		expect(historyAsOf(text, "2026-10-01T23:59:59.999Z")).toBe(
			`${a}\n${edge}\n`,
		);
	});

	it("drops dateless, unparseable and corrupt lines", () => {
		const a = j({ at: "2026-10-01T10:00:00Z", kind: "lint" });
		const text = [
			a,
			j({ kind: "lint" }),
			j({ at: "soon", kind: "lint" }),
			"{bad",
			"",
		].join("\n");
		expect(historyAsOf(text, "2026-10-01T23:59:59.999Z")).toBe(`${a}\n`);
	});

	it("is empty when nothing had happened yet", () => {
		const text = j({ at: "2026-10-05T10:00:00Z", kind: "lint" });
		expect(historyAsOf(text, "2026-10-01T23:59:59.999Z")).toBe("");
	});
});
