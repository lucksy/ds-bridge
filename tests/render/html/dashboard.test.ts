// T3.2 — Self-contained HTML dashboard renderer. Pure function: same input →
// byte-identical output, no clock/fs/network. These tests assert structure,
// the four sections (full + empty + partial), self-containment (offline-safe)
// and escaping of untrusted strings.
import { describe, expect, it } from "vitest";
import {
	ALL_ARTIFACT_IDS,
	type ArtifactId,
} from "../../../src/engines/report/catalog.js";
import type {
	DriftTrendPoint,
	ReportData,
} from "../../../src/engines/report/types.js";
import { renderDashboard } from "../../../src/render/html/dashboard.js";

function countMatches(haystack: string, pattern: RegExp): number {
	return (haystack.match(pattern) ?? []).length;
}

const fullData: ReportData = {
	generatedAt: "2026-06-05T12:00:00.000Z",
	project: "acme-design-system",
	driftTrend: [
		{ date: "2026-06-01", breaking: 2, additive: 5, cosmetic: 3 },
		{ date: "2026-06-02", breaking: 1, additive: 7, cosmetic: 4 },
		{ date: "2026-06-03", breaking: 0, additive: 9, cosmetic: 2 },
	],
	lintSummary: {
		byKind: { exact: 42, near: 11, offSystem: 7 },
		topOffenders: [
			{ file: "src/Button.tsx", count: 9 },
			{ file: "src/Card.tsx", count: 5 },
		],
	},
	readiness: {
		score: 82,
		frameName: "Checkout / Desktop",
		deductions: [
			{ reason: "Detached instance", points: 10 },
			{ reason: "Hard-coded color", points: 8 },
		],
	},
	a11y: {
		level: "AA",
		modes: [
			{ mode: "light", passed: 12, failed: 2 },
			{ mode: "dark", passed: 10, failed: 4 },
		],
	},
	impact: {
		breaking: 3,
		additive: 5,
		cosmetic: 2,
		touchedCallSites: 37,
	},
	parity: {
		columns: ["variant", "size", "icon"],
		rows: [
			{
				component: "Button",
				cells: [
					{ status: "ok" },
					{ status: "prop-mismatch" },
					{ status: "missing-in-code" },
				],
			},
			{
				component: "Card",
				cells: [
					{ status: "ok" },
					{ status: "ok" },
					{ status: "missing-in-figma" },
				],
			},
		],
	},
};

const emptyData: ReportData = {
	generatedAt: "2026-06-05T12:00:00.000Z",
	project: "fresh-project",
};

describe("renderDashboard — document shape", () => {
	it("starts with <!DOCTYPE html> (case-insensitive)", () => {
		const html = renderDashboard(emptyData);
		expect(html.trimStart().slice(0, 15).toLowerCase()).toBe("<!doctype html>");
	});

	it("has exactly one balanced <html> and <body> pair", () => {
		const html = renderDashboard(fullData);
		expect(countMatches(html, /<html\b/gi)).toBe(1);
		expect(countMatches(html, /<\/html>/gi)).toBe(1);
		expect(countMatches(html, /<body\b/gi)).toBe(1);
		expect(countMatches(html, /<\/body>/gi)).toBe(1);
	});

	it("renders the project name and generatedAt verbatim in the header", () => {
		const html = renderDashboard(fullData);
		expect(html).toContain("acme-design-system");
		expect(html).toContain("2026-06-05T12:00:00.000Z");
	});

	it("includes an inline <style> block", () => {
		const html = renderDashboard(emptyData);
		expect(html).toMatch(/<style>[\s\S]+<\/style>/);
	});
});

describe("renderDashboard — self-containment (offline safe)", () => {
	const samples = [renderDashboard(fullData), renderDashboard(emptyData)];

	for (const html of samples) {
		it("has no <link> tags (no external CSS/fonts)", () => {
			expect(html).not.toMatch(/<link\b/i);
		});

		it("has no <script> tags", () => {
			expect(html).not.toMatch(/<script\b/i);
		});

		it("has no @import in CSS", () => {
			expect(html).not.toMatch(/@import/i);
		});

		it("has no url( references anywhere (no remote/data assets)", () => {
			expect(html).not.toMatch(/url\(/i);
		});

		it("references no http(s) URLs except the SVG xmlns", () => {
			// Strip the only allowed external reference: the SVG namespace.
			const stripped = html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "");
			expect(stripped).not.toMatch(/https?:\/\//i);
		});
	}
});

describe("renderDashboard — full data", () => {
	const html = renderDashboard(fullData);

	it("renders all six section titles", () => {
		expect(html).toMatch(/Drift trend/i);
		expect(html).toMatch(/Lint/i);
		expect(html).toMatch(/Readiness/i);
		expect(html).toMatch(/Parity/i);
	});

	it("emits exactly six <svg> charts (one per section)", () => {
		expect(countMatches(html, /<svg\b/g)).toBe(6);
	});

	it("includes a11y mode labels and failure counts (T7.22)", () => {
		expect(html).toMatch(/Contrast/i);
		expect(html).toContain("light");
		expect(html).toContain("dark");
		expect(html).toContain("12 passed");
		expect(html).toContain("4 failed");
		expect(html).toContain("AA");
	});

	it("includes impact severity bars and the call-site blast radius (T7.22)", () => {
		expect(html).toMatch(/Change impact/i);
		expect(html).toMatch(/Breaking/);
		expect(html).toMatch(/Additive/);
		expect(html).toMatch(/Cosmetic/);
		expect(html).toContain("37 call site");
	});

	it("shows no empty-state placeholder copy when all sections present", () => {
		expect(html).not.toMatch(/No data yet/i);
	});

	it("includes a line chart with one polyline per drift series", () => {
		// breaking, additive, cosmetic → three series.
		expect(countMatches(html, /<polyline\b/g)).toBe(3);
	});

	it("includes lint counts in the bar chart", () => {
		expect(html).toMatch(/<rect[^>]*class="bar"/);
	});

	it("includes the readiness score in the gauge", () => {
		expect(html).toMatch(/<text[^>]*>82<\/text>/);
	});

	it("includes a heat-grid with one cell per parity cell", () => {
		// 2 rows × 3 columns = 6 cells.
		expect(countMatches(html, /<rect[^>]*class="cell"/g)).toBe(6);
	});

	it("renders the parity column headers", () => {
		expect(html).toContain("variant");
		expect(html).toContain("size");
		expect(html).toContain("icon");
	});
});

describe("renderDashboard — empty data", () => {
	const html = renderDashboard(emptyData);

	it("renders all six empty-state panels", () => {
		expect(countMatches(html, /No data yet/gi)).toBe(6);
	});

	it("emits zero <svg> charts", () => {
		expect(countMatches(html, /<svg\b/g)).toBe(0);
	});

	it("still renders all six section titles", () => {
		expect(html).toMatch(/Drift trend/i);
		expect(html).toMatch(/Lint/i);
		expect(html).toMatch(/Readiness/i);
		expect(html).toMatch(/Parity/i);
		expect(html).toMatch(/Contrast/i);
		expect(html).toMatch(/Change impact/i);
	});

	it("mentions the ds-bridge command in each empty state", () => {
		expect(countMatches(html, /ds-bridge/g)).toBeGreaterThanOrEqual(6);
	});
});

describe("renderDashboard — partial mixes", () => {
	it("renders only the present sections as charts (drift + readiness)", () => {
		const html = renderDashboard({
			generatedAt: "2026-06-05T12:00:00.000Z",
			project: "partial",
			driftTrend: [
				{ date: "2026-06-01", breaking: 1, additive: 2, cosmetic: 3 },
			],
			readiness: { score: 70, frameName: "Frame", deductions: [] },
		});
		// two charts present, four empty states.
		expect(countMatches(html, /<svg\b/g)).toBe(2);
		expect(countMatches(html, /No data yet/gi)).toBe(4);
	});

	it("treats an empty driftTrend array as an empty state", () => {
		const html = renderDashboard({
			generatedAt: "2026-06-05T12:00:00.000Z",
			project: "partial",
			driftTrend: [],
			lintSummary: {
				byKind: { exact: 3, near: 1, offSystem: 0 },
				topOffenders: [],
			},
		});
		// only lint renders a chart; drift's empty array → empty state.
		expect(countMatches(html, /<svg\b/g)).toBe(1);
		expect(countMatches(html, /No data yet/gi)).toBe(5);
	});

	it("treats an empty parity rows array as an empty state", () => {
		const html = renderDashboard({
			generatedAt: emptyData.generatedAt,
			project: "partial",
			parity: { columns: ["a", "b"], rows: [] },
		});
		expect(countMatches(html, /<svg\b/g)).toBe(0);
		expect(countMatches(html, /No data yet/gi)).toBe(6);
	});

	it("treats an empty a11y modes array as an empty state (T7.22)", () => {
		const html = renderDashboard({
			generatedAt: emptyData.generatedAt,
			project: "partial",
			a11y: { level: "AA", modes: [] },
		});
		expect(countMatches(html, /<svg\b/g)).toBe(0);
		expect(countMatches(html, /No data yet/gi)).toBe(6);
	});

	it("renders an all-clear impact run as a real chart, not an empty state (T7.22)", () => {
		const html = renderDashboard({
			generatedAt: emptyData.generatedAt,
			project: "partial",
			impact: { breaking: 0, additive: 0, cosmetic: 0, touchedCallSites: 0 },
		});
		expect(countMatches(html, /<svg\b/g)).toBe(1);
		expect(countMatches(html, /No data yet/gi)).toBe(5);
	});
});

describe("renderDashboard — escaping untrusted strings", () => {
	const hostile: ReportData = {
		generatedAt: "<img src=x onerror=alert(1)>",
		project: '<script>alert("xss")</script> & "friends" <b>',
		readiness: {
			score: 50,
			frameName: "<svg onload=alert(2)>",
			deductions: [{ reason: "<b>injected</b>", points: 5 }],
		},
		parity: {
			columns: ["<i>col</i>"],
			rows: [{ component: "<x>comp</x>", cells: [{ status: "ok" }] }],
		},
	};
	const html = renderDashboard(hostile);

	it("does not emit a raw injected <script> tag from the project name", () => {
		expect(html).not.toMatch(/<script\b/i);
	});

	it("escapes the angle brackets of the project name", () => {
		expect(html).toContain("&lt;script&gt;");
	});

	it("escapes ampersands and quotes in the project name", () => {
		expect(html).toContain("&amp;");
		expect(html).toContain("&quot;");
	});

	it("escapes the hostile generatedAt string", () => {
		expect(html).toContain("&lt;img");
		expect(html).not.toMatch(/<img\b/i);
	});

	it("escapes parity column and component labels", () => {
		expect(html).toContain("&lt;i&gt;col&lt;/i&gt;");
		expect(html).toContain("&lt;x&gt;comp&lt;/x&gt;");
	});

	it("escapes readiness frame name and deduction reasons", () => {
		expect(html).toContain("&lt;svg onload=alert(2)&gt;");
		expect(html).toContain("&lt;b&gt;injected&lt;/b&gt;");
	});

	it("self-containment holds even with hostile input", () => {
		expect(html).not.toMatch(/<link\b/i);
		expect(html).not.toMatch(/@import/i);
		expect(html).not.toMatch(/url\(/i);
	});
});

// M1.2 — Renderer renders a selection. Selection gates DOM inclusion BEFORE any
// per-section data-presence check; an artifact absent from the selection is
// omitted from the DOM entirely (no <section>, no <h2>, no empty-state).
//
// The section <h2> title is the DOM-inclusion probe per artifact id.
const TITLE_FOR: Record<ArtifactId, RegExp> = {
	"drift-trend": /<h2>Drift trend<\/h2>/,
	"lint-summary": /<h2>Lint violations<\/h2>/,
	readiness: /<h2>Readiness<\/h2>/,
	parity: /<h2>Parity matrix<\/h2>/,
	a11y: /<h2>Contrast \(a11y\)<\/h2>/,
	impact: /<h2>Change impact<\/h2>/,
};

describe("renderDashboard — default-call equivalence", () => {
	it("renderDashboard(fullData) is text-equal to passing ALL_ARTIFACT_IDS explicitly", () => {
		expect(renderDashboard(fullData)).toBe(
			renderDashboard(fullData, ALL_ARTIFACT_IDS),
		);
	});

	it("an empty selection renders no sections at all", () => {
		const html = renderDashboard(fullData, []);
		expect(countMatches(html, /<section class="panel">/g)).toBe(0);
		expect(countMatches(html, /<svg\b/g)).toBe(0);
		expect(html).not.toMatch(/No data yet/i);
		// the document scaffold and header still render.
		expect(html.trimStart().slice(0, 15).toLowerCase()).toBe("<!doctype html>");
		expect(html).toContain("acme-design-system");
	});
});

describe("renderDashboard — selection gates DOM inclusion (four quadrants)", () => {
	const driftData: DriftTrendPoint[] = [
		{ date: "2026-06-01", breaking: 1, additive: 2, cosmetic: 3 },
	];

	it("selected + data → renders the drift chart, no empty-state", () => {
		const html = renderDashboard(
			{
				generatedAt: emptyData.generatedAt,
				project: "q1",
				driftTrend: driftData,
			},
			["drift-trend"],
		);
		expect(html).toMatch(TITLE_FOR["drift-trend"]);
		expect(countMatches(html, /<polyline\b/g)).toBe(3);
		expect(html).not.toMatch(/No data yet/i);
	});

	it("selected + no-data (driftTrend: []) → keeps its empty-state", () => {
		const html = renderDashboard(
			{
				generatedAt: emptyData.generatedAt,
				project: "q2",
				driftTrend: [],
			},
			["drift-trend"],
		);
		expect(html).toMatch(TITLE_FOR["drift-trend"]);
		expect(countMatches(html, /<svg\b/g)).toBe(0);
		expect(countMatches(html, /No data yet/gi)).toBe(1);
	});

	it("deselected + data → omitted from the DOM entirely (no section, no title)", () => {
		const html = renderDashboard(
			{
				generatedAt: emptyData.generatedAt,
				project: "q3",
				driftTrend: driftData,
			},
			["lint-summary"],
		);
		expect(html).not.toMatch(TITLE_FOR["drift-trend"]);
		expect(html).not.toMatch(/Drift trend/);
		expect(countMatches(html, /<polyline\b/g)).toBe(0);
	});

	it("deselected + no-data (driftTrend: []) → omitted, not an empty-state (the load-bearing quirk)", () => {
		const html = renderDashboard(
			{
				generatedAt: emptyData.generatedAt,
				project: "q4",
				driftTrend: [],
			},
			["lint-summary"],
		);
		expect(html).not.toMatch(TITLE_FOR["drift-trend"]);
		expect(html).not.toMatch(/Drift trend/);
		// only the selected lint section is present (here as an empty-state).
		expect(html).toMatch(TITLE_FOR["lint-summary"]);
		expect(countMatches(html, /No data yet/gi)).toBe(1);
	});
});

describe("renderDashboard — selection order drives section order", () => {
	it("renders parity before drift-trend when the selection says so", () => {
		const html = renderDashboard(fullData, ["parity", "drift-trend"]);
		const parityAt = html.search(TITLE_FOR.parity);
		const driftAt = html.search(TITLE_FOR["drift-trend"]);
		expect(parityAt).toBeGreaterThan(-1);
		expect(driftAt).toBeGreaterThan(-1);
		expect(parityAt).toBeLessThan(driftAt);
		// exactly the two selected sections, nothing else.
		expect(countMatches(html, /<section class="panel">/g)).toBe(2);
	});

	it("renders only the subset's sections (no other artifact leaks in)", () => {
		const html = renderDashboard(fullData, ["a11y", "impact"]);
		expect(html).toMatch(TITLE_FOR.a11y);
		expect(html).toMatch(TITLE_FOR.impact);
		expect(html).not.toMatch(TITLE_FOR["drift-trend"]);
		expect(html).not.toMatch(TITLE_FOR["lint-summary"]);
		expect(html).not.toMatch(TITLE_FOR.readiness);
		expect(html).not.toMatch(TITLE_FOR.parity);
		const a11yAt = html.search(TITLE_FOR.a11y);
		const impactAt = html.search(TITLE_FOR.impact);
		expect(a11yAt).toBeLessThan(impactAt);
	});
});

describe("renderDashboard — active view label in the header", () => {
	it("omitting viewLabel keeps the header byte-identical to today", () => {
		expect(renderDashboard(fullData, ALL_ARTIFACT_IDS, {})).toBe(
			renderDashboard(fullData),
		);
	});

	it("renders the view label in the header when supplied", () => {
		const html = renderDashboard(fullData, ALL_ARTIFACT_IDS, {
			viewLabel: "owner",
		});
		expect(html).toContain("owner");
		// it lives in the document header, not as a section.
		const headerEnd = html.indexOf("</header>");
		expect(headerEnd).toBeGreaterThan(-1);
		expect(html.slice(0, headerEnd)).toContain("owner");
	});

	it("escapes a hostile view label", () => {
		const html = renderDashboard(fullData, ALL_ARTIFACT_IDS, {
			viewLabel: "<script>alert(1)</script>",
		});
		expect(html).not.toMatch(/<script\b/i);
		expect(html).toContain("&lt;script&gt;");
	});
});
