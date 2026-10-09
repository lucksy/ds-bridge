// X3 — the recurring-exceptions section (SPEC-exceptions §4), HTML and terminal
// twins. Rows needing an owner lead; logged rows carry owner + decision; every
// name is escaped; the honesty note (exceptions stay counted) is always shown.
import { describe, expect, it } from "vitest";
import type { ArtifactId } from "../../../src/engines/report/catalog.js";
import type { ReportData } from "../../../src/engines/report/types.js";
import {
	EXCEPTIONS_NOTE,
	exceptionDetail,
	exceptionsMeta,
} from "../../../src/render/figma-trend-format.js";
import { renderDashboard } from "../../../src/render/html/dashboard.js";
import { renderTerminalDashboard } from "../../../src/render/terminal/dashboard.js";

const SELECTION: ArtifactId[] = ["exceptions-review"];

const data: ReportData = {
	generatedAt: "2026-10-09T12:00:00.000Z",
	project: "acme",
	exceptionsReview: {
		dates: ["2026-09-01", "2026-09-08", "2026-09-15"],
		rows: [
			{
				signal: "overrides",
				name: "Card <compact>",
				runs: 3,
				latest: 7,
				state: "needs-owner",
			},
			{
				signal: "overrides",
				name: "Button",
				runs: 2,
				latest: 4,
				state: "overdue",
				owner: "@checkout-design",
				decision: "investigating",
				reviewBy: "2026-10-01",
			},
			{
				signal: "deprecated",
				name: "OldModal",
				runs: 3,
				latest: 2,
				state: "evolve-component",
				owner: "@core",
				decision: "evolve-component",
				note: "Needs a sheet variant",
			},
			{
				signal: "overrides",
				name: "Crad",
				runs: 0,
				latest: null,
				state: "not-seen",
				owner: "@core",
				decision: "investigating",
			},
		],
		totals: {
			needsOwner: 1,
			overdue: 1,
			inReview: 0,
			decided: 1,
			resolved: 0,
			notSeen: 1,
		},
	},
};

describe("exception text helpers", () => {
	it("summarises the queue, leaving out empty buckets", () => {
		const review = data.exceptionsReview;
		if (review === undefined) throw new Error("fixture");
		expect(exceptionsMeta(review)).toBe(
			"4 listed · 1 needs an owner · 1 overdue · 1 decided · 1 not seen",
		);
	});

	it("asks the owner question for an unowned recurring row", () => {
		expect(exceptionDetail(data.exceptionsReview?.rows[0] as never, 3)).toBe(
			"overrides · 7 latest · 3 of 3 runs · ⚑ needs an owner — fix the usage, or evolve the component?",
		);
	});

	it("asks a signal-specific question for deprecated and detached rows", () => {
		const row = data.exceptionsReview?.rows[0];
		if (row === undefined) throw new Error("fixture");
		expect(exceptionDetail({ ...row, signal: "deprecated" }, 3)).toContain(
			"⚑ needs an owner — migrate off it, or does the replacement miss a use case?",
		);
		expect(exceptionDetail({ ...row, signal: "detached" }, 3)).toContain(
			"⚑ needs an owner — re-attach it, or does the component miss a use case?",
		);
	});

	it("shows owner, review date and the original decision when overdue", () => {
		expect(exceptionDetail(data.exceptionsReview?.rows[1] as never, 3)).toBe(
			"overrides · 4 latest · 2 of 3 runs · ⏰ review overdue · was: investigating · owner @checkout-design · review by 2026-10-01",
		);
	});

	it("quotes the note on a decided row and skips counts for a not-seen one", () => {
		expect(exceptionDetail(data.exceptionsReview?.rows[2] as never, 3)).toBe(
			"deprecated · 2 latest · 3 of 3 runs · → evolve the component · owner @core · “Needs a sheet variant”",
		);
		expect(exceptionDetail(data.exceptionsReview?.rows[3] as never, 3)).toBe(
			"overrides · ? not in the stored hotspots (check the name) · owner @core",
		);
	});
});

describe("Recurring exceptions — HTML", () => {
	const html = renderDashboard(data, SELECTION);

	it("renders the panel with escaped names, the summary and the honesty note", () => {
		expect(html).toContain("<h2>Recurring exceptions</h2>");
		expect(html).toContain("<code>Card &lt;compact&gt;</code>");
		expect(html).not.toContain("Card <compact>");
		expect(html).toContain("1 needs an owner");
		expect(html).toContain("owner @checkout-design");
		expect(html).toContain("Exceptions stay counted in every score");
	});

	it("lists rows in the engine's order (needs-owner first)", () => {
		expect(html.indexOf("Card &lt;compact&gt;")).toBeLessThan(
			html.indexOf("<code>Button</code>"),
		);
	});

	it("falls back to the library-health empty state with no review", () => {
		const empty = renderDashboard(
			{ generatedAt: data.generatedAt, project: "acme" },
			SELECTION,
		);
		expect(empty).toContain("<h2>Recurring exceptions</h2>");
		expect(empty).toContain("<code>ds-bridge library-health</code>");
	});
});

describe("Recurring exceptions — terminal", () => {
	const out = renderTerminalDashboard(data, SELECTION, {
		generatedAt: data.generatedAt,
		color: false,
	});

	it("prints the same summary, rows and note as the HTML twin", () => {
		expect(out).toContain("Recurring exceptions");
		expect(out).toContain(
			"4 listed · 1 needs an owner · 1 overdue · 1 decided · 1 not seen",
		);
		expect(out).toMatch(/Card <compact>\s+overrides · 7 latest/);
		expect(out).toContain(EXCEPTIONS_NOTE);
	});
});
