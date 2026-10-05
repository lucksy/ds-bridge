// X6 (SPEC-exec-report §5.2) — the one-page HTML manager report. PURE: a
// ManagerReport in → one offline, script-free document out, byte-stable, every
// caller string escaped.
import { describe, expect, it } from "vitest";
import { buildManagerReport } from "../../../src/engines/report/manager-report.js";
import { renderManagerHtml } from "../../../src/render/html/manager.js";

const report = buildManagerReport({
	project: "acme <b>",
	generatedAt: "2026-10-05T12:00:00.000Z",
	windowDays: 30,
	readinessThreshold: 80,
	systemScore: {
		current: 76,
		components: [],
		trend: [
			{ date: "2026-09-01", score: 70 },
			{ date: "2026-10-01", score: 76 },
		],
	},
	scoreVelocity: {
		delta: 6,
		windowDays: 30,
		direction: "up",
		regressionStreak: 0,
	},
	adoptionTrend: [{ date: "2026-10-01", pct: 82 }],
	targets: [
		{ metric: "parity", measured: 62, target: 80, op: ">=", band: "red" },
	],
	debt: { pct: 72, level: "high", items: [] },
	consistency: { score: 91, components: [] },
	dataFreshness: [
		{ kind: "lint", lastRun: "2026-10-05", ageDays: 0, band: "green" },
		{ kind: "impact", band: "unknown" },
	],
	frames: [
		{
			key: "f:1",
			frameName: "<script>alert(1)</script>",
			latest: 55,
			runs: 2,
			passRate: 0,
		},
	],
});

const countMatches = (s: string, re: RegExp): number =>
	s.match(re)?.length ?? 0;

describe("renderManagerHtml", () => {
	const html = renderManagerHtml(report);

	it("is one self-contained offline document", () => {
		expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
		expect(html).not.toMatch(/<script\b/i);
		expect(html).not.toMatch(/<link\b/i);
		expect(html).not.toMatch(/url\(/i);
		expect(html).not.toMatch(/@import/i);
	});

	it("escapes every caller string", () => {
		expect(html).toContain("acme &lt;b&gt;");
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
	});

	it("shows the headline tiles with absent metrics as not measured", () => {
		expect(html).toContain('<span class="kpi-label">System score</span>');
		expect(html).toContain('<span class="kpi-value">76</span>');
		expect(html).toContain("▲ +6 in 30 days");
		expect(html).toContain('<span class="kpi-value">82%</span>');
		// Design debt is an index, not a share.
		expect(html).toContain('<span class="kpi-value">72/100</span>');
		// Import coverage was never recorded.
		const coverageTile = html.slice(
			html.indexOf("Component import coverage"),
			html.indexOf("</div>", html.indexOf("Component import coverage")),
		);
		expect(coverageTile).toContain("not measured");
	});

	it("lists targets, risks, actions, frames and coverage", () => {
		for (const title of [
			"Targets",
			"Top risks",
			"Next actions",
			"Handoff readiness by frame",
			"Data coverage",
		]) {
			expect(html).toContain(`<h2>${title}</h2>`);
		}
		expect(html).toContain("Off track");
		expect(countMatches(html, /<ol class="ranked">/g)).toBe(2);
		expect(html).toContain(
			"Figma↔code parity is off target: 62% vs goal ≥ 80%",
		);
		expect(html).toContain(
			"<td>Figma↔code parity</td><td>62%</td><td>≥ 80%</td>",
		);
		expect(html).toContain("weighted index");
		expect(html).toContain("Never measured");
	});

	it("labels a nameless frame by its key, plain coverage kinds and a one-day window", () => {
		const page = renderManagerHtml(
			buildManagerReport({
				project: "p",
				generatedAt: "2026-10-05T12:00:00.000Z",
				windowDays: 1,
				readinessThreshold: 80,
				frames: [
					{ key: "name:", frameName: "", latest: 40, runs: 1, passRate: 0 },
				],
				dataFreshness: [
					{ kind: "drift", lastRun: "2026-10-05", ageDays: 0, band: "green" },
					{ kind: "frame-impl", band: "unknown" },
				],
			}),
		);
		expect(page).toContain("· last 1 day</span>");
		expect(page).toContain("<td>name:</td>");
		expect(page).toContain("token drift (today)");
		expect(page).toContain("frame implementability");
		expect(page).not.toContain("weighted index");
	});

	it("is deterministic", () => {
		expect(renderManagerHtml(report)).toBe(html);
	});

	it("renders an empty report with hints, not errors", () => {
		const empty = renderManagerHtml(
			buildManagerReport({
				project: "fresh",
				generatedAt: "2026-10-05T12:00:00.000Z",
				windowDays: 30,
				readinessThreshold: 80,
			}),
		);
		expect(empty).toContain("No risks flagged.");
		expect(empty).toContain("Nothing urgent.");
		expect(empty).toContain("No targets set.");
		expect(empty).toContain("ds-bridge record");
	});
});
