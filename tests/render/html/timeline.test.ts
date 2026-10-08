// Dashboard header + timeline: logo far left, the timeline in the middle, the
// view and "Generated" on the right; one script-free state per earlier day.
import { describe, expect, it } from "vitest";
import type { ReportData } from "../../../src/engines/report/types.js";
import { renderDashboard } from "../../../src/render/html/dashboard.js";
import { LOGO_IMG } from "../../../src/render/html/logo.js";
import { normalizeSnapshot } from "../../../src/render/html/snapshot.js";
import { dayLabels } from "../../../src/render/html/timeline.js";

function data(score: number, generatedAt: string): ReportData {
	return {
		generatedAt,
		project: "acme",
		driftTrend: [],
		adoptionTrend: [],
		breakingCalendar: { entries: [], total: 0 },
		changeFrequency: { byKind: [] },
		systemScore: {
			current: score,
			components: [],
			trend: [{ date: generatedAt.slice(0, 10), score }],
		},
	} as ReportData;
}

const NOW = data(87, "2026-10-04T16:00:00.000Z");
const PAST = [
	{ day: "2026-10-01", data: data(41, "2026-10-01T23:59:59.999Z") },
	{ day: "2026-10-02", data: data(55, "2026-10-02T23:59:59.999Z") },
];

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe("dashboard header", () => {
	it("puts the wordmark + title left and the view + Generated right", () => {
		const html = renderDashboard(NOW, ["system-score"], { viewLabel: "exec" });
		const header = html.slice(
			html.indexOf("<header"),
			html.indexOf("</header>"),
		);
		expect(header).toMatch(
			// The brand wordmark (alt "ds-bridge") leads the heading: it reads
			// "ds-bridge report · acme".
			/<div class="bar top"><div class="brand"><h1><img class="logo"[^>]*alt="ds-bridge"[^>]*\/><span class="report">report<\/span> · <span class="project">acme<\/span><\/h1><\/div>/,
		);
		expect(header).toContain(
			'<div class="bar-meta"><span class="view">exec</span><span class="generated">Generated 4 Oct 2026, 16:00 UTC</span></div>',
		);
		expect(html).toContain(LOGO_IMG);
	});

	it("without earlier states: no timeline, no radios, a single plain body", () => {
		const html = renderDashboard(NOW, ["system-score"]);
		expect(html).not.toContain('class="timeline"');
		expect(html).not.toContain("tl-radio");
		expect(html).not.toContain("tl-state");
		expect(count(html, /<div class="wrap">/g)).toBe(1);
	});
});

describe("dashboard timeline", () => {
	const html = renderDashboard(NOW, ["system-score"], { timeline: PAST });

	it("offers one stop per earlier day, then Now (checked by default)", () => {
		expect(count(html, /<input type="radio" name="tl" class="tl-radio"/g)).toBe(
			3,
		);
		expect(html).toContain('id="tl-now" checked');
		expect(count(html, / checked/g)).toBe(1);
		const labels = [
			...html.matchAll(/<span class="tl-label">([^<]*)<\/span>/g),
		].map((m) => m[1]);
		expect(labels).toEqual(["1 Oct", "2 Oct", "Now"]);
		expect(html).toContain('<label for="tl-0" title="End of 1 Oct 2026">');
	});

	it("places the radios before the header so the ~ rules can reach it", () => {
		expect(html.indexOf('id="tl-now"')).toBeLessThan(html.indexOf("<header"));
	});

	it("renders every state's own numbers, each in its own body", () => {
		expect(count(html, /<div class="wrap tl-state tl-s\d"/g)).toBe(3);
		const body = (i: number) => {
			const start = html.indexOf(`<div class="wrap tl-state tl-s${i}">`);
			const next = html.indexOf('<div class="wrap tl-state', start + 1);
			return html.slice(start, next === -1 ? undefined : next);
		};
		expect(body(0)).toContain("<title>System score: 41/100</title>");
		expect(body(1)).toContain("<title>System score: 55/100</title>");
		expect(body(2)).toContain("<title>System score: 87/100</title>");
		expect(body(0)).toContain(
			"as it was at the end of <strong>1 Oct 2026</strong>",
		);
		expect(body(2)).not.toContain("tl-note");
	});

	it("shows only the checked state, its 'As of' text, and hides Generated for past states", () => {
		expect(html).toContain("#tl-0:checked ~ .tl-s0{display:block}");
		expect(html).toContain("#tl-now:checked ~ .tl-s2{display:block}");
		expect(html).toContain("#tl-1:checked ~ header .tl-g1{display:inline}");
		expect(html).toContain(
			'<span class="tl-asof tl-g0">As of 1 Oct 2026</span>',
		);
		expect(html).toContain(
			"#tl-0:checked ~ header .generated,#tl-1:checked ~ header .generated{display:none}",
		);
		expect(html).toContain(".tl-state { display: none; }");
	});

	it("stays script-free and snapshot-normalizable", () => {
		expect(html).not.toMatch(/<script\b/i);
		expect(normalizeSnapshot(html)).toContain(
			'<span class="generated">Generated __GENERATED_AT__</span>',
		);
	});
});

describe("dayLabels", () => {
	it("formats a UTC day short and long; passes other text through", () => {
		expect(dayLabels("2026-10-03")).toEqual({
			short: "3 Oct",
			long: "3 Oct 2026",
		});
		expect(dayLabels("2026-13-03")).toEqual({
			short: "2026-13-03",
			long: "2026-13-03",
		});
		expect(dayLabels("<b>")).toEqual({ short: "<b>", long: "<b>" });
	});

	it("escapes a day label that is not a date", () => {
		const html = renderDashboard(NOW, [], {
			timeline: [{ day: '<img src=x onerror="1">', data: NOW }],
		});
		expect(html).toContain("&lt;img src=x onerror=&quot;1&quot;&gt;");
		expect(html.replace(LOGO_IMG, "")).not.toMatch(/<img\b/i);
	});
});
