// F6 — the three Figma/frame trend sections (SPEC-figma-trends §3.4), HTML and
// terminal twins. Text + unicode sparklines (no new svg); every name escaped;
// empty states name the command that fills them.
import { describe, expect, it } from "vitest";
import type { ArtifactId } from "../../../src/engines/report/catalog.js";
import type { ReportData } from "../../../src/engines/report/types.js";
import { hotspotDetail } from "../../../src/render/figma-trend-format.js";
import { renderDashboard } from "../../../src/render/html/dashboard.js";
import { renderTerminalDashboard } from "../../../src/render/terminal/dashboard.js";

const base: ReportData = {
	generatedAt: "2026-09-15T12:00:00.000Z",
	project: "acme",
};

const SELECTION: ArtifactId[] = [
	"library-hotspots-trend",
	"frame-readiness-trend",
	"handoff-pass-rate",
];

const data: ReportData = {
	...base,
	libraryHotspotsTrend: {
		dates: ["2026-09-01", "2026-09-08", "2026-09-15"],
		rows: [
			{
				signal: "overrides",
				name: "Button <primary>",
				points: [
					{ date: "2026-09-01", count: 4 },
					{ date: "2026-09-08", count: 6 },
					{ date: "2026-09-15", count: 9 },
				],
				first: 4,
				latest: 9,
				delta: 5,
				status: "rising",
			},
			{
				signal: "deprecated",
				name: "OldButton",
				points: [
					{ date: "2026-09-01", count: 5 },
					{ date: "2026-09-08", count: 2 },
					{ date: "2026-09-15", count: 0 },
				],
				first: 5,
				latest: 0,
				delta: -5,
				status: "resolved",
			},
			{
				signal: "detached",
				name: "Avatar",
				points: [
					{ date: "2026-09-01", count: 3 },
					{ date: "2026-09-08", count: null },
					{ date: "2026-09-15", count: null },
				],
				first: 3,
				latest: null,
				status: "below-top",
			},
		],
	},
	frameReadinessTrend: {
		threshold: 80,
		total: 3,
		failing: 1,
		frames: [
			{
				key: "F:1",
				frameName: "Checkout & pay",
				points: [
					{ date: "2026-09-01", score: 60 },
					{ date: "2026-09-15", score: 72 },
				],
				latest: 72,
				first: 60,
				delta: 12,
				runs: 4,
				passing: false,
			},
			{
				key: "F:2",
				frameName: "Cart",
				points: [{ date: "2026-09-15", score: 90 }],
				latest: 90,
				first: 90,
				delta: 0,
				runs: 1,
				passing: true,
			},
		],
	},
	handoffPassRate: {
		threshold: 80,
		frames: 3,
		passing: 2,
		pct: 67,
		trend: [
			{ date: "2026-09-01", frames: 2, passing: 0, pct: 0 },
			{ date: "2026-09-15", frames: 3, passing: 2, pct: 67 },
		],
	},
};

describe("HTML — Figma/frame trend sections (F6)", () => {
	it("selected but absent: three empty states naming library-health / handoff", () => {
		const html = renderDashboard(base, SELECTION);
		expect(html).toContain("<h2>Library hotspots trend</h2>");
		expect(html).toContain("<h2>Frame readiness trend</h2>");
		expect(html).toContain("<h2>Handoff pass rate</h2>");
		expect((html.match(/No data yet/g) ?? []).length).toBe(3);
		expect(html).toContain("<code>ds-bridge library-health</code>");
		expect(html).toContain("<code>ds-bridge handoff &lt;frame-url&gt;</code>");
	});

	it("hotspots: one list per signal with sparkline, latest (Δ) and status; names escaped", () => {
		const html = renderDashboard(data, ["library-hotspots-trend"]);
		expect(html).not.toContain("No data yet");
		expect(html).not.toMatch(/<svg\b/);
		expect(html).toContain("Button &lt;primary&gt;");
		expect(html).not.toContain("Button <primary>");
		expect(html).toContain("Overrides");
		expect(html).toContain("Deprecated");
		expect(html).toMatch(/Detached[^<]*heuristic/);
		expect(html).toContain("9 (+5)");
		expect(html).toContain("rising");
		expect(html).toContain("0 (−5)");
		expect(html).toContain("resolved");
		expect(html).toContain("below top");
		// The sparkline uses the unicode ticks (unknown points skipped).
		expect(html).toContain("▁▄█");
		expect(html).toContain("2026-09-01 → 2026-09-15");
	});

	it("frames: failing first, gate marker, Δ, the below-gate meta and the overflow note", () => {
		const html = renderDashboard(data, ["frame-readiness-trend"]);
		expect(html).toContain("Checkout &amp; pay");
		expect(html.indexOf("Checkout &amp; pay")).toBeLessThan(
			html.indexOf("Cart"),
		);
		expect(html).toContain("72 (+12)");
		expect(html).toContain("below gate");
		expect(html).toContain("ready");
		expect(html).toContain("1 of 3 frames below the 80 gate");
		expect(html).toContain("+1 more");
		expect(html).not.toMatch(/<svg\b/);
	});

	it("pass rate: the headline pct, passing of frames, and the trend line", () => {
		const html = renderDashboard(data, ["handoff-pass-rate"]);
		expect(html).toContain("67%");
		expect(html).toContain("2 of 3 frames ≥ 80");
		expect(html).toMatch(/0% → 67%/);
		expect(html).not.toMatch(/<svg\b/);
	});
});

describe("hotspotDetail", () => {
	it("one known point shows no delta (±0 would claim a measured change)", () => {
		expect(
			hotspotDetail({
				signal: "overrides",
				name: "Tag",
				points: [
					{ date: "2026-09-01", count: null },
					{ date: "2026-09-08", count: 4 },
				],
				first: 4,
				latest: 4,
				delta: 0,
				status: "new",
			}),
		).toBe("4 · new");
	});
});

describe("terminal — Figma/frame trend twins (F6)", () => {
	const opts = { generatedAt: base.generatedAt, color: false } as const;

	it("selected but absent: three empty states with the same hints", () => {
		const out = renderTerminalDashboard(base, SELECTION, opts);
		expect(out.match(/No data yet/g)?.length).toBe(3);
		expect(out).toContain("`ds-bridge library-health`");
		expect(out).toContain("`ds-bridge handoff <frame-url>`");
	});

	it("renders the same facts as the HTML twins", () => {
		const out = renderTerminalDashboard(data, SELECTION, opts);
		expect(out).toContain("Library hotspots trend");
		expect(out).toContain("Button <primary>");
		expect(out).toContain("9 (+5)");
		expect(out).toContain("resolved");
		expect(out).toContain("below top");
		expect(out).toMatch(/heuristic/);
		expect(out).toContain("Frame readiness trend");
		expect(out).toContain("1 of 3 frames below the 80 gate");
		expect(out).toContain("+1 more");
		expect(out).toContain("Handoff pass rate");
		expect(out).toContain("67%");
		expect(out).toContain("2 of 3 frames ≥ 80");
	});
});
