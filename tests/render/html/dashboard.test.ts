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
	systemScore: {
		current: 78,
		components: [
			{ kind: "drift", score: 80, weight: 30 },
			{ kind: "lint", score: 65, weight: 30 },
			{ kind: "readiness", score: 82, weight: 20 },
			{ kind: "a11y", score: 85, weight: 20 },
		],
		trend: [
			{ date: "2026-06-01", score: 70 },
			{ date: "2026-06-02", score: 74 },
			{ date: "2026-06-03", score: 78 },
		],
	},
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
	adoptionTrend: [
		{ date: "2026-06-01", pct: 60 },
		{ date: "2026-06-02", pct: 68 },
		{ date: "2026-06-03", pct: 75 },
	],
	importCoverage: {
		imported: 17,
		total: 22,
		uncovered: ["Spinner", "Tooltip"],
		uncoveredTotal: 5,
	},
	leaderboard: [
		{ dir: "src/legacy", refs: 2, literals: 18 },
		{ dir: "src/components", refs: 211, literals: 9 },
	],
	libraryHealth: {
		overrideHotspots: [
			{
				nodeId: "1:10",
				name: "Primary CTA",
				componentName: "Button / Primary",
				overrideCount: 3,
			},
			{
				nodeId: "1:20",
				name: "Old Button A",
				componentName: "[deprecated] OldButton",
				overrideCount: 2,
			},
		],
		deprecatedUsage: [{ componentName: "[deprecated] OldButton", count: 2 }],
		detachedCandidates: [
			{ nodeId: "1:30", name: "Button / Primary", heuristic: true },
		],
		totals: {
			overrideHotspots: 2,
			deprecatedUsage: 2,
			detachedCandidates: 1,
		},
	},
	breakingCalendar: {
		entries: [
			{
				date: "2026-06-03",
				source: "figma",
				count: 2,
				detail: "2 breaking component changes",
			},
			{
				date: "2026-06-01",
				source: "tokens",
				count: 1,
				detail: "1 stale output",
			},
		],
		total: 3,
	},
	changeFrequency: {
		byKind: [
			{ kind: "tokens-check", count: 2 },
			{ kind: "impact", count: 1 },
		],
		windowFirst: "2026-06-01T10:00:00.000Z",
		windowLast: "2026-06-03T10:00:00.000Z",
	},
	// Persona-wave metric sections (C1–C13) — present so the full render has no
	// empty-state stub. Real chart renderers land in M4.
	targets: [
		{ metric: "on-system", measured: 88, target: 90, op: ">=", band: "amber" },
	],
	parityTrend: [{ date: "2026-06-01", pct: 80 }],
	componentHealth: [
		{ component: "Button", healthScore: 70, issues: ["prop-mismatch"] },
	],
	libraryHealthTrend: [
		{ date: "2026-06-01", overrides: 2, deprecated: 1, detached: 0 },
	],
	migrationChecklist: {
		sites: [
			{
				file: "src/Button.tsx",
				line: 9,
				subject: "Button",
				from: "a",
				to: "b",
			},
		],
		truncated: false,
	},
	scoreVelocity: {
		delta: 4,
		windowDays: 30,
		direction: "up",
		regressionStreak: 0,
	},
	ownershipLeaderboard: [
		{ owner: "team-web", refs: 100, literals: 5, pct: 95 },
	],
	audienceChangelog: {
		slices: [
			{
				audience: "designers",
				breaking: 1,
				additive: 2,
				cosmetic: 0,
				recent: ["Button renamed"],
			},
		],
	},
	frameImplementability: {
		pct: 80,
		resolved: 8,
		total: 10,
		gaps: [{ reason: "no-token-match", count: 2 }],
	},
	releaseReadiness: {
		go: false,
		checks: [{ name: "drift-zero", pass: true }],
	},
	dataFreshness: [
		{ kind: "a11y", lastRun: "2026-06-05", ageDays: 0, band: "green" },
	],
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

	it("renders all thirteen section titles", () => {
		expect(html).toMatch(/System score/i);
		expect(html).toMatch(/Drift trend/i);
		expect(html).toMatch(/Lint/i);
		expect(html).toMatch(/Readiness/i);
		expect(html).toMatch(/Parity/i);
		expect(html).toMatch(/Adoption trend/i);
		expect(html).toMatch(/Import coverage/i);
		expect(html).toMatch(/Adoption leaderboard/i);
		expect(html).toMatch(/Library health/i);
		expect(html).toMatch(/Breaking calendar/i);
		expect(html).toMatch(/Change frequency/i);
	});

	it("emits exactly nineteen <svg> charts (one per chart section + the score gauge & trend)", () => {
		// six wave-1 sections (one svg each) + system-score's gauge + trend (2) +
		// the three owner sections (adoption-trend line, coverage donut,
		// leaderboard bar) = 6 + 2 + 3 = 11 (B2) + library-health's totals bar = 12
		// (B5) + change-frequency's per-kind bar = 13 (B6). breaking-calendar is a
		// LIST, not a chart — it adds NO svg.
		// M4: the persona-wave metric sections add six more chart svgs — targets
		// (statusGrid) + parity-trend (line) + component-health (bar) +
		// library-health-trend (line) + ownership-leaderboard (bar) +
		// frame-implementability (donut) = +6 → 19. The LIST/stat-block sections
		// (migration-checklist, score-velocity, audience-changelog,
		// release-readiness, data-freshness) draw NO svg.
		expect(countMatches(html, /<svg\b/g)).toBe(19);
	});

	it("renders the breaking-calendar as a date-grouped list with source badges (B6)", () => {
		expect(html).toMatch(TITLE_FOR["breaking-calendar"]);
		// Scope the ordering check to the breaking-calendar list (other fixtures
		// reuse the same dates), tracked via its <ul class="calendar"> container.
		const listStart = html.indexOf('<ul class="calendar">');
		expect(listStart).toBeGreaterThan(-1);
		const listEnd = html.indexOf("</ul>", listStart);
		const list = html.slice(listStart, listEnd);
		// most-recent first: the 2026-06-03 figma entry precedes the 2026-06-01 tokens entry.
		const recentAt = list.indexOf("2026-06-03");
		const olderAt = list.indexOf("2026-06-01");
		expect(recentAt).toBeGreaterThan(-1);
		expect(recentAt).toBeLessThan(olderAt);
		// the source badges distinguish figma (library) vs tokens (build) breakage.
		expect(list.toLowerCase()).toContain("figma");
		expect(list.toLowerCase()).toContain("tokens");
		// the per-entry detail text is surfaced.
		expect(html).toContain("2 breaking component changes");
		expect(html).toContain("1 stale output");
		// breaking-calendar is a LIST — it draws NO svg of its own.
	});

	it("renders the change-frequency as a per-kind bar chart (B6)", () => {
		expect(html).toMatch(TITLE_FOR["change-frequency"]);
		// the tallied kinds surface as bar labels.
		expect(html).toContain("tokens-check");
		expect(html).toContain("impact");
	});

	it("renders the library-health totals as a bar chart with the top hotspot list + the heuristic caveat (B5)", () => {
		expect(html).toMatch(TITLE_FOR["library-health"]);
		// the top override-hotspot list surfaces names + counts.
		expect(html).toContain("Primary CTA");
		expect(html).toContain("Old Button A");
		// the detached-candidate heuristic caveat is rendered inline.
		expect(html.toLowerCase()).toContain("heuristic");
		expect(html).toContain(
			"REST cannot truly detect detachment; expect false positives",
		);
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
		// drift: breaking, additive, cosmetic → three series; the system-score
		// trend adds one (S3) and the adoption-trend line adds one (B2) → five
		// polylines from the wave-1/owner sections.
		// M4: parity-trend's single pct series adds one and library-health-trend's
		// three hygiene series add three → +4 → nine polylines document-wide.
		expect(countMatches(html, /<polyline\b/g)).toBe(9);
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

	it("renders the system-score gauge with the current composite (S3)", () => {
		expect(html).toMatch(TITLE_FOR["system-score"]);
		// donutGauge renders the current value as a centered numeral.
		expect(html).toMatch(/<text[^>]*>78<\/text>/);
	});

	it("renders the system-score trend as a line chart (S3)", () => {
		// the trend has three points → one polyline in the score's own svg.
		expect(html).toMatch(/Line chart/);
	});

	it("renders a components/weights legend table (kind · sub-score · weight) (S3)", () => {
		// every present component is legible with its applied weight.
		expect(html).toContain("drift");
		expect(html).toContain("lint");
		expect(html).toContain("readiness");
		expect(html).toContain("a11y");
		// the applied weights echo into the legend (default 25/25/15/15/20).
		expect(html).toMatch(/25/);
		expect(html).toMatch(/15/);
	});

	it("renders the adoption-trend as a line chart of the pct series (B2)", () => {
		expect(html).toMatch(TITLE_FOR["adoption-trend"]);
		// the dated pct points → one polyline in the adoption-trend svg.
		expect(html).toMatch(/Line chart/);
		// honest-scope one-liner: css/scss only (SPEC §1).
		expect(html.toLowerCase()).toContain("css");
	});

	it("renders import coverage as a donut gauge with the uncovered list (B2)", () => {
		expect(html).toMatch(TITLE_FOR["import-coverage"]);
		// 17/22 → 77% rounded → centered numeral 77.
		expect(html).toMatch(/<text[^>]*>77<\/text>/);
		// the capped uncovered names are listed.
		expect(html).toContain("Spinner");
		expect(html).toContain("Tooltip");
		// overflow note for the 5 − 2 = 3 names beyond the shown list.
		expect(html).toContain("3 more");
		// honest-scope one-liner: .tsx imports only (SPEC §1 / A3a).
		expect(html.toLowerCase()).toContain("tsx");
	});

	it("renders the leaderboard as a worst-first bar chart with pct labels (B2)", () => {
		expect(html).toMatch(TITLE_FOR.leaderboard);
		// worst-first: src/legacy (2/20 = 10%) precedes src/components (211/220 = 96%).
		const legacyAt = html.indexOf("src/legacy");
		const componentsAt = html.indexOf("src/components");
		expect(legacyAt).toBeGreaterThan(-1);
		expect(componentsAt).toBeGreaterThan(-1);
		expect(legacyAt).toBeLessThan(componentsAt);
		// pct labels (the bar value is the on-system percentage).
		expect(html).toContain("10%");
		expect(html).toContain("96%");
	});
});

describe("renderDashboard — empty data", () => {
	const html = renderDashboard(emptyData);

	it("renders all thirteen empty-state panels", () => {
		expect(countMatches(html, /No data yet/gi)).toBe(24);
	});

	it("emits zero <svg> charts", () => {
		expect(countMatches(html, /<svg\b/g)).toBe(0);
	});

	it("still renders all thirteen section titles", () => {
		expect(html).toMatch(/System score/i);
		expect(html).toMatch(/Drift trend/i);
		expect(html).toMatch(/Lint/i);
		expect(html).toMatch(/Readiness/i);
		expect(html).toMatch(/Parity/i);
		expect(html).toMatch(/Contrast/i);
		expect(html).toMatch(/Change impact/i);
		expect(html).toMatch(/Adoption trend/i);
		expect(html).toMatch(/Import coverage/i);
		expect(html).toMatch(/Adoption leaderboard/i);
		expect(html).toMatch(/Library health/i);
		expect(html).toMatch(/Breaking calendar/i);
		expect(html).toMatch(/Change frequency/i);
	});

	it("mentions the ds-bridge command in each empty state", () => {
		expect(countMatches(html, /ds-bridge/g)).toBeGreaterThanOrEqual(13);
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
		// two charts present, eleven empty states (incl. absent system-score + the
		// three owner sections + library-health + the two B6 consumer sections).
		expect(countMatches(html, /<svg\b/g)).toBe(2);
		expect(countMatches(html, /No data yet/gi)).toBe(22);
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
		expect(countMatches(html, /No data yet/gi)).toBe(23);
	});

	it("treats an empty parity rows array as an empty state", () => {
		const html = renderDashboard({
			generatedAt: emptyData.generatedAt,
			project: "partial",
			parity: { columns: ["a", "b"], rows: [] },
		});
		expect(countMatches(html, /<svg\b/g)).toBe(0);
		expect(countMatches(html, /No data yet/gi)).toBe(24);
	});

	it("treats an empty a11y modes array as an empty state (T7.22)", () => {
		const html = renderDashboard({
			generatedAt: emptyData.generatedAt,
			project: "partial",
			a11y: { level: "AA", modes: [] },
		});
		expect(countMatches(html, /<svg\b/g)).toBe(0);
		expect(countMatches(html, /No data yet/gi)).toBe(24);
	});

	it("renders an all-clear impact run as a real chart, not an empty state (T7.22)", () => {
		const html = renderDashboard({
			generatedAt: emptyData.generatedAt,
			project: "partial",
			impact: { breaking: 0, additive: 0, cosmetic: 0, touchedCallSites: 0 },
		});
		expect(countMatches(html, /<svg\b/g)).toBe(1);
		expect(countMatches(html, /No data yet/gi)).toBe(23);
	});

	it("treats an empty adoptionTrend / leaderboard array as an empty state (B2)", () => {
		const html = renderDashboard({
			generatedAt: emptyData.generatedAt,
			project: "partial",
			adoptionTrend: [],
			leaderboard: [],
		});
		expect(countMatches(html, /<svg\b/g)).toBe(0);
		expect(countMatches(html, /No data yet/gi)).toBe(24);
	});

	it("renders import coverage even when nothing is uncovered (B2)", () => {
		const html = renderDashboard({
			generatedAt: emptyData.generatedAt,
			project: "partial",
			importCoverage: {
				imported: 22,
				total: 22,
				uncovered: [],
				uncoveredTotal: 0,
			},
		});
		// the donut gauge renders (a real chart), the other twelve sections stay empty.
		expect(countMatches(html, /<svg\b/g)).toBe(1);
		expect(countMatches(html, /No data yet/gi)).toBe(23);
		expect(html).toMatch(/<text[^>]*>100<\/text>/);
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
	"system-score": /<h2>System score<\/h2>/,
	"drift-trend": /<h2>Drift trend<\/h2>/,
	"lint-summary": /<h2>Lint violations<\/h2>/,
	readiness: /<h2>Readiness<\/h2>/,
	parity: /<h2>Parity matrix<\/h2>/,
	a11y: /<h2>Contrast \(a11y\)<\/h2>/,
	impact: /<h2>Change impact<\/h2>/,
	"adoption-trend": /<h2>Adoption trend<\/h2>/,
	"import-coverage": /<h2>Import coverage<\/h2>/,
	leaderboard: /<h2>Adoption leaderboard<\/h2>/,
	"library-health": /<h2>Library health<\/h2>/,
	"breaking-calendar": /<h2>Breaking calendar<\/h2>/,
	"change-frequency": /<h2>Change frequency<\/h2>/,
	// Persona-wave metric artifacts (C1–C13) — section titles from the M0.1 stubs.
	targets: /<h2>Targets \/ SLAs<\/h2>/,
	"parity-trend": /<h2>Parity trend<\/h2>/,
	"component-health": /<h2>Component health<\/h2>/,
	"library-health-trend": /<h2>Library health trend<\/h2>/,
	"migration-checklist": /<h2>Migration checklist<\/h2>/,
	"score-velocity": /<h2>Score velocity<\/h2>/,
	"ownership-leaderboard": /<h2>Ownership leaderboard<\/h2>/,
	"audience-changelog": /<h2>Changelog by audience<\/h2>/,
	"frame-implementability": /<h2>Frame implementability<\/h2>/,
	"release-readiness": /<h2>Release readiness<\/h2>/,
	"data-freshness": /<h2>Data freshness<\/h2>/,
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
