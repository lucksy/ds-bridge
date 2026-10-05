// T3.2 — Self-contained HTML dashboard renderer.
//
// `renderDashboard` is a pure function: identical input → byte-identical
// output. It reads no clock, filesystem or network (the caller supplies
// `generatedAt`). The result is ONE offline-safe HTML document — inline
// `<style>` only, system font stacks, no CDN/link/script/@import/url(). The
// four product artifacts are drawn via the T3.1 SVG chart functions; every
// section degrades to a styled empty-state panel when its data is absent.

import {
	ALL_ARTIFACT_IDS,
	type ArtifactId,
} from "../../engines/report/catalog.js";
import type {
	FreshnessRow,
	ParityStatus,
	ReportData,
} from "../../engines/report/types.js";
import {
	belowGateMeta,
	dateSpan,
	frameDetail,
	frameOverflow,
	hotspotDetail,
	passRateSub,
	passRateTrendLine,
	SIGNAL_LABEL,
	SIGNAL_ORDER,
} from "../figma-trend-format.js";
import type { LineSeries } from "./charts.js";
import {
	bandColor,
	barChart,
	donutGauge,
	heatGrid,
	lineChart,
	PALETTE,
	statusGrid,
	TONE,
	toneFor,
} from "./charts.js";

// Chart widths that match the cards they sit in (a 1200px page, 3 columns), so
// the SVG draws at 1:1 and its 11–12px labels stay 11–12px. Narrower screens
// scale them down.
const CARD_W = 332;
const WIDE_W = 720;

/** The first and last date of a dated trend, for a line chart's x axis. */
function dateEnds(trend: readonly { date: string }[]): [string, string] {
	return [trend[0]?.date ?? "", trend[trend.length - 1]?.date ?? ""];
}

/** "2026-06-01T10:00:00.000Z" → "2026-06-01"; other text unchanged. */
function dayOf(value: string): string {
	return /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : value;
}

/** Escape the five XML-significant characters for safe HTML text/attributes. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Harvest palette + tokens shared with the website and the insights pane.
// System font stacks keep the document fully offline — no web-font requests.
export const STYLE = `
:root {
	--bg: #f6f5f1;
	--surface: #ffffff;
	--text: #1f1e1b;
	--text-subtle: #6b6a63;
	--border: #e6e3da;
	--track: #eceae4;
	--accent: #a3384b;
	--accent-soft: #f6e9ec;
	--ok: #6f8a2e;
	--warn: #c98a1e;
	--error: #b83f4f;
	--radius: 14px;
	--bar: #2a2622;
	--bar-text: #f6f5f1;
	--bar-subtle: #b9b3a6;
	--bar-accent: #e3a73b;
	--mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	font-size: 14px;
	line-height: 1.5;
	-webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1200px; margin: 0 auto; padding: 24px 24px 72px; }
header.dash { background: var(--bar); color: var(--bar-text); }
header.dash .bar {
	max-width: 1200px;
	margin: 0 auto;
	padding: 18px 24px;
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px 16px;
}
header.dash h1 { font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.02em; flex: 1 1 auto; }
header.dash .project { color: var(--bar-accent); }
header.dash .view {
	font-size: 12px;
	font-weight: 600;
	color: var(--bar-text);
	border: 1px solid rgba(255, 255, 255, 0.22);
	background: rgba(255, 255, 255, 0.08);
	border-radius: 999px;
	padding: 2px 10px;
}
header.dash .generated { color: var(--bar-subtle); font-size: 13px; font-variant-numeric: tabular-nums; }
.kpis {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: 12px;
	margin-bottom: 16px;
}
.kpi {
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: var(--radius);
	padding: 14px 16px 12px;
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}
.kpi.ok { --tone: var(--ok); }
.kpi.warn { --tone: var(--warn); }
.kpi.error { --tone: var(--error); }
.kpi-label { font-size: 12px; font-weight: 600; color: var(--text-subtle); }
.kpi-value { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; color: var(--tone, var(--text)); font-variant-numeric: tabular-nums; }
.kpi-sub { font-size: 12px; color: var(--text-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
	grid-auto-flow: row dense;
	align-items: start;
	gap: 16px;
}
section.panel {
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: var(--radius);
	padding: 18px 20px 20px;
	min-width: 0;
}
section.panel.wide { grid-column: span 2; }
@media (max-width: 780px) { section.panel.wide { grid-column: auto; } }
section.panel h2 {
	font-size: 15px;
	font-weight: 650;
	margin: 0 0 12px;
	color: var(--text);
	letter-spacing: -0.005em;
}
.chart { overflow-x: auto; margin: 4px 0; }
.chart svg { max-width: 100%; height: auto; display: block; }
.chart.center svg { margin: 0 auto; }
.split { display: grid; grid-template-columns: 150px 1fr; gap: 20px; align-items: center; }
@media (max-width: 560px) { .split { grid-template-columns: 1fr; } }
.empty {
	display: flex;
	flex-direction: column;
	gap: 4px;
	align-items: flex-start;
	justify-content: center;
	min-height: 96px;
	padding: 14px 16px;
	border: 1px dashed var(--border);
	border-radius: 10px;
	background: var(--bg);
	color: var(--text-subtle);
	font-size: 13px;
}
.empty .empty-title { font-weight: 600; color: var(--text); }
.empty code, .meta code {
	font-family: var(--mono);
	font-size: 12px;
	background: var(--accent-soft);
	color: var(--accent);
	padding: 1px 6px;
	border-radius: 6px;
}
table.parity-key, .meta {
	width: 100%;
	margin: 8px 0 0;
	font-size: 12px;
	color: var(--text-subtle);
	border-collapse: collapse;
}
.meta:first-of-type { margin-top: 0; }
.cols { margin-top: 8px; font-size: 12px; color: var(--text-subtle); }
.cols b { color: var(--text); font-weight: 600; }
.cols:has(.audience-col) { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px 24px; margin-top: 0; }
.audience-col .cols b { font-size: 13px; text-transform: capitalize; }
.stat { display: flex; align-items: baseline; gap: 10px; margin: 2px 0 4px; }
.stat-value { font-size: 34px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.stat-value.ok { color: var(--ok); }
.stat-value.error { color: var(--error); }
.stat-sub { color: var(--text-subtle); font-size: 13px; }
table.weights { width: 100%; margin-top: 12px; font-size: 12px; border-collapse: collapse; }
table.weights th, table.weights td { padding: 5px 8px; border-top: 1px solid var(--border); text-align: left; }
table.weights th { color: var(--text-subtle); font-weight: 600; border-top: 0; }
table.weights td.num, table.weights th + th { text-align: right; font-variant-numeric: tabular-nums; }
ul.offenders, ul.deductions, ul.calendar { margin: 10px 0 0; padding: 0; list-style: none; font-size: 12px; }
ul.offenders li, ul.calendar li {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	gap: 12px;
	padding: 6px 0;
	border-top: 1px solid var(--border);
}
ul.offenders code, ul.calendar code {
	font-family: var(--mono);
	color: var(--text);
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
ul.offenders .count { color: var(--text); font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
ul.deductions li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
ul.deductions .pts { color: var(--error); font-variant-numeric: tabular-nums; font-weight: 600; }
.frame-name { font-size: 13px; color: var(--text-subtle); margin-top: 6px; text-align: center; }
ul.calendar .date { font-variant-numeric: tabular-nums; color: var(--text); font-weight: 600; white-space: nowrap; }
ul.calendar .detail { color: var(--text-subtle); text-align: right; }
ul.calendar.stack li { flex-direction: column; align-items: flex-start; gap: 1px; }
ul.calendar.stack .detail { text-align: left; }
.badge {
	display: inline-block;
	font-family: var(--mono);
	font-size: 11px;
	background: var(--accent-soft);
	color: var(--accent);
	padding: 1px 7px;
	border-radius: 999px;
	margin-right: 4px;
	white-space: nowrap;
}
`.trim();

/** A styled "no data yet" panel body shown when a section is absent. */
function emptyState(command: string): string {
	return [
		'<div class="empty">',
		'<span class="empty-title">No data yet</span>',
		`<span>Run <code>ds-bridge ${escapeHtml(command)}</code> to populate this section.</span>`,
		"</div>",
	].join("");
}

/**
 * Wrap section content in a titled panel. A `wide` panel spans two grid columns
 * (trends, tables, long lists); its charts are drawn at {@link WIDE_W}.
 */
function panel(title: string, body: string, size?: "wide"): string {
	return [
		size === "wide"
			? '<section class="panel wide">'
			: '<section class="panel">',
		`<h2>${escapeHtml(title)}</h2>`,
		body,
		"</section>",
	].join("");
}

// The human label for each score component kind in the legend table.
const COMPONENT_LABEL: Record<string, string> = {
	drift: "drift",
	lint: "lint",
	readiness: "readiness",
	a11y: "a11y",
	adoption: "on-system",
	parity: "parity",
};

/**
 * The active weight profile (C2): which weights table drove the system score and
 * where it came from. Only a `view`-source profile (a by-view override matched
 * the active view) renders the caption; `project`/`default` stay silent so the
 * no-config render is byte-identical. Mirrors score.ts's `WeightProfile` shape
 * minus the weights table the renderer does not need.
 */
export interface WeightProfileMeta {
	source: "view" | "project" | "default";
	/** The active view name; present only when source is `view`. */
	name?: string;
}

/**
 * System score → donut gauge (current 0–100) + line chart (trend) + a
 * components/weights legend table (kind · sub-score · applied weight). Empty
 * state reuses the shared `emptyState` helper verbatim with a run-a-check hint.
 *
 * When a `view`-source weight profile is active (C2), a small caption names it
 * (`weights: <view> profile`) next to the legend; a `project`/`default` source
 * (or an absent profile) renders NO caption, so the no-config render stays
 * byte-identical to today.
 */
function systemScoreSection(
	data: ReportData,
	weightProfile?: WeightProfileMeta,
): string {
	const score = data.systemScore;
	if (score === undefined) {
		return panel("System score", emptyState("report"));
	}

	const trendSeries: LineSeries[] = [
		{
			label: "score",
			points: score.trend.map((point, index) => ({
				x: index,
				y: point.score,
			})),
		},
	];

	const legendRows = score.components
		.map(
			(c) =>
				`<tr><td>${escapeHtml(COMPONENT_LABEL[c.kind] ?? c.kind)}</td><td class="num">${escapeHtml(String(c.score))}</td><td class="num">${escapeHtml(String(c.weight))}</td></tr>`,
		)
		.join("");

	const legend = [
		'<table class="weights">',
		"<thead><tr><th>Component</th><th>Sub-score</th><th>Weight</th></tr></thead>",
		`<tbody>${legendRows}</tbody>`,
		"</table>",
	].join("");

	// C2 caption: only a `view`-source profile names itself; project/default
	// render nothing (golden-neutral — the no-config render is unchanged).
	const caption =
		weightProfile?.source === "view" && weightProfile.name !== undefined
			? `<div class="meta">weights: ${escapeHtml(weightProfile.name)} profile</div>`
			: "";

	return panel(
		"System score",
		[
			'<div class="split">',
			`<div class="chart center">${donutGauge(score.current, { label: "System score" })}</div>`,
			`<div class="chart">${lineChart(trendSeries, { width: WIDE_W - 170, height: 180, colors: [PALETTE[0]] })}</div>`,
			"</div>",
			legend,
			caption,
		].join(""),
		"wide",
	);
}

/** Drift trend → multi-series line chart (breaking / additive / cosmetic). */
function driftSection(data: ReportData): string {
	const trend = data.driftTrend;
	if (trend === undefined || trend.length === 0) {
		return panel("Drift trend", emptyState("tokens check"));
	}

	const toSeries = (
		label: string,
		pick: (p: {
			breaking: number;
			additive: number;
			cosmetic: number;
		}) => number,
	): LineSeries => ({
		label,
		points: trend.map((point, index) => ({ x: index, y: pick(point) })),
	});

	const series: LineSeries[] = [
		toSeries("breaking", (p) => p.breaking),
		toSeries("additive", (p) => p.additive),
		toSeries("cosmetic", (p) => p.cosmetic),
	];

	const dateRange =
		trend.length > 0
			? `${escapeHtml(trend[0]?.date ?? "")} → ${escapeHtml(trend[trend.length - 1]?.date ?? "")}`
			: "";

	return panel(
		"Drift trend",
		[
			`<div class="chart">${lineChart(series, { width: WIDE_W, height: 220, xLabels: dateEnds(trend), colors: [TONE.error, TONE.ok, PALETTE[4]] })}</div>`,
			`<div class="cols"><b>Breaking</b> · <b>Additive</b> · <b>Cosmetic</b> over ${dateRange}</div>`,
		].join(""),
		"wide",
	);
}

/** Lint violations → bar chart by kind, plus the top offending files. */
function lintSection(data: ReportData): string {
	const lint = data.lintSummary;
	if (lint === undefined) {
		return panel("Lint violations", emptyState("lint"));
	}

	const bars = [
		{ label: "Exact", value: lint.byKind.exact, color: PALETTE[2] },
		{ label: "Near", value: lint.byKind.near, color: PALETTE[3] },
		{ label: "Off-system", value: lint.byKind.offSystem, color: PALETTE[0] },
	];

	const offenders =
		lint.topOffenders.length > 0
			? [
					'<ul class="offenders">',
					...lint.topOffenders.map(
						(o) =>
							`<li><code>${escapeHtml(o.file)}</code><span class="count">${escapeHtml(String(o.count))}</span></li>`,
					),
					"</ul>",
				].join("")
			: "";

	return panel(
		"Lint violations",
		`<div class="chart">${barChart(bars, { width: CARD_W })}</div>${offenders}`,
	);
}

/** Readiness → donut gauge of the score, frame name and deduction list. */
function readinessSection(data: ReportData): string {
	const readiness = data.readiness;
	if (readiness === undefined) {
		return panel("Readiness", emptyState("handoff <frame-url>"));
	}

	const deductions =
		readiness.deductions.length > 0
			? [
					'<ul class="deductions">',
					...readiness.deductions.map(
						(d) =>
							`<li><span>${escapeHtml(d.reason)}</span><span class="pts">-${escapeHtml(String(d.points))}</span></li>`,
					),
					"</ul>",
				].join("")
			: "";

	return panel(
		"Readiness",
		[
			`<div class="chart center">${donutGauge(readiness.score, { label: "Readiness" })}</div>`,
			`<div class="frame-name">${escapeHtml(readiness.frameName)}</div>`,
			deductions,
		].join(""),
	);
}

// Parity status → heat intensity (clamped to [0,1] by the chart). "ok" is the
// calmest fill; mismatches and gaps grow progressively more intense.
const PARITY_INTENSITY: Record<ParityStatus, number> = {
	ok: 0.12,
	"prop-mismatch": 0.55,
	"missing-in-code": 0.8,
	"missing-in-figma": 1,
};

/** Parity matrix → heat grid (rows = components, cols = aspects). */
function paritySection(data: ReportData): string {
	const parity = data.parity;
	if (parity === undefined || parity.rows.length === 0) {
		return panel("Parity matrix", emptyState("parity"));
	}

	const rows = parity.rows.map((row) => ({
		label: row.component,
		cells: row.cells.map((cell) => ({
			label: cell.status,
			intensity: PARITY_INTENSITY[cell.status],
		})),
	}));

	const columns =
		parity.columns.length > 0
			? `<div class="cols">Columns: ${parity.columns.map((c) => `<b>${escapeHtml(c)}</b>`).join(" · ")}</div>`
			: "";

	return panel(
		"Parity matrix",
		`<div class="chart">${heatGrid(rows)}</div>${columns}`,
	);
}

/** Contrast audit → bar chart of failures by mode + per-mode tallies (T7.22). */
function a11ySection(data: ReportData): string {
	const a11y = data.a11y;
	if (a11y === undefined || a11y.modes.length === 0) {
		return panel("Contrast (a11y)", emptyState("a11y"));
	}

	const bars = a11y.modes.map((m) => ({
		label: m.mode,
		value: m.failed,
	}));

	const tallies = [
		// The offenders list's layout (mode left, tally right), and a real space
		// between the two so the text reads "light 12 passed", not "light12 passed".
		'<ul class="offenders modes">',
		...a11y.modes.map(
			(m) =>
				`<li><code>${escapeHtml(m.mode)}</code> <span class="count">${escapeHtml(String(m.passed))} passed · ${escapeHtml(String(m.failed))} failed</span></li>`,
		),
		"</ul>",
	].join("");

	return panel(
		"Contrast (a11y)",
		[
			`<div class="meta">Failures by mode · level ${escapeHtml(a11y.level)}</div>`,
			`<div class="chart">${barChart(bars, { width: CARD_W, color: TONE.error })}</div>`,
			tallies,
		].join(""),
	);
}

/** Impact run → severity bar chart + call-site blast radius (T7.22). */
function impactSection(data: ReportData): string {
	const impact = data.impact;
	if (impact === undefined) {
		return panel("Change impact", emptyState("impact"));
	}

	const bars = [
		{ label: "Breaking", value: impact.breaking, color: TONE.error },
		{ label: "Additive", value: impact.additive, color: TONE.ok },
		{ label: "Cosmetic", value: impact.cosmetic, color: PALETTE[4] },
	];
	const sites = impact.touchedCallSites;
	const radius = `<div class="meta">Touches ${escapeHtml(String(sites))} call site${sites === 1 ? "" : "s"}</div>`;

	return panel(
		"Change impact",
		`<div class="chart">${barChart(bars, { width: CARD_W })}</div>${radius}`,
	);
}

// The on-system percentage for a refs/literals pair (B2). 0 when no values.
function onSystemPct(refs: number, literals: number): number {
	const total = refs + literals;
	return total === 0 ? 0 : Math.round((refs / total) * 100);
}

/**
 * Adoption trend → line chart of the on-system pct over dated points (B2).
 * Honest-scope one-liner: the ratio counts css/scss values only (SPEC §1).
 */
function adoptionTrendSection(data: ReportData): string {
	const trend = data.adoptionTrend;
	if (trend === undefined || trend.length === 0) {
		return panel("Adoption trend", emptyState("lint <dir>"));
	}

	const series: LineSeries[] = [
		{
			label: "on-system %",
			points: trend.map((point, index) => ({ x: index, y: point.pct })),
		},
	];

	const dateRange = `${escapeHtml(trend[0]?.date ?? "")} → ${escapeHtml(
		trend[trend.length - 1]?.date ?? "",
	)}`;

	return panel(
		"Adoption trend",
		[
			`<div class="chart">${lineChart(series, { width: CARD_W, height: 190, unit: "%", xLabels: dateEnds(trend), colors: [PALETTE[1]] })}</div>`,
			`<div class="meta">On-system % over ${dateRange} · css/scss values only (var(--…) vs literals)</div>`,
		].join(""),
	);
}

/**
 * Import coverage → donut gauge of imported/total + the capped uncovered list
 * with an overflow note (B2). Honest-scope one-liner: mapUsage scans resolved
 * `.tsx` imports only, so the number is a floor (SPEC §1 / A3a).
 */
function importCoverageSection(data: ReportData): string {
	const coverage = data.importCoverage;
	if (coverage === undefined) {
		return panel("Import coverage", emptyState("adoption"));
	}

	const { imported, total, uncovered, uncoveredTotal } = coverage;
	const pct = total === 0 ? 0 : Math.round((imported / total) * 100);

	const list =
		uncovered.length > 0
			? [
					'<ul class="offenders">',
					...uncovered.map(
						(name) => `<li><code>${escapeHtml(name)}</code></li>`,
					),
					"</ul>",
				].join("")
			: "";

	const overflow =
		uncoveredTotal > uncovered.length
			? `<div class="meta">… and ${escapeHtml(
					String(uncoveredTotal - uncovered.length),
				)} more</div>`
			: "";

	return panel(
		"Import coverage",
		[
			`<div class="chart center">${donutGauge(pct, { label: "Import coverage" })}</div>`,
			`<div class="meta">${escapeHtml(String(imported))}/${escapeHtml(String(total))} registry components imported · resolved .tsx imports only (a floor)</div>`,
			list,
			overflow,
		].join(""),
	);
}

/**
 * Adoption leaderboard → bar chart of on-system % by directory, worst-first
 * (B2). The renderer trusts the assembly's worst-first ordering; each bar's
 * value is the directory's on-system percentage.
 */
function leaderboardSection(data: ReportData): string {
	const rows = data.leaderboard;
	if (rows === undefined || rows.length === 0) {
		return panel("Adoption leaderboard", emptyState("lint <dir>"));
	}

	const bars = rows.map((row) => {
		const pct = onSystemPct(row.refs, row.literals);
		return { label: row.dir, value: pct, color: bandColor(pct) };
	});

	// Per-directory pct labels (the bar widths are the same percentages).
	const labels = [
		'<ul class="offenders">',
		...rows.map(
			(row) =>
				`<li><code>${escapeHtml(row.dir)}</code><span class="count">${escapeHtml(
					String(onSystemPct(row.refs, row.literals)),
				)}%</span></li>`,
		),
		"</ul>",
	].join("");

	return panel(
		"Adoption leaderboard",
		[
			`<div class="meta">On-system % by directory, worst-first · css/scss values only</div>`,
			`<div class="chart">${barChart(bars, { width: CARD_W, max: 100, unit: "%" })}</div>`,
			labels,
		].join(""),
	);
}

/**
 * Library health → bar chart of the three totals (override hotspots, deprecated
 * usage, detached candidates) + the top override-hotspot list (name + count) +
 * the detached-candidate heuristic caveat rendered INLINE next to the detached
 * count (B5). The caveat is load-bearing: a detached "candidate" over REST is a
 * guess (SPEC §1.3), so the number never stands alone. Absent data → the shared
 * empty-state helper.
 */
function libraryHealthSection(data: ReportData): string {
	const health = data.libraryHealth;
	if (health === undefined) {
		return panel("Library health", emptyState("library-health"));
	}

	const { totals } = health;
	const bars = [
		{
			label: "Override hotspots",
			value: totals.overrideHotspots,
			color: PALETTE[3],
		},
		{
			label: "Deprecated usage",
			value: totals.deprecatedUsage,
			color: PALETTE[0],
		},
		{
			label: "Detached candidates",
			value: totals.detachedCandidates,
			color: PALETTE[4],
		},
	];

	// The detached-candidate caveat lives INLINE adjacent to the detached count:
	// the heuristic cannot truly detect detachment, so the number is qualified at
	// its render site (SPEC §1.3 honest scope).
	const detachedCaveat = [
		'<div class="meta">',
		`Detached candidates: ${escapeHtml(String(totals.detachedCandidates))} `,
		"— heuristic — REST cannot truly detect detachment; expect false positives.",
		"</div>",
	].join("");

	// Top override hotspots (name + count). The list may be empty when the data
	// was reconstructed from a counts-only history line (SPEC §3).
	const hotspots =
		health.overrideHotspots.length > 0
			? [
					'<ul class="offenders">',
					...health.overrideHotspots.map(
						(h) =>
							`<li><code>${escapeHtml(h.name)}</code><span class="count">${escapeHtml(String(h.overrideCount))}</span></li>`,
					),
					"</ul>",
				].join("")
			: "";

	return panel(
		"Library health",
		[
			`<div class="chart">${barChart(bars, { width: CARD_W })}</div>`,
			detachedCaveat,
			hotspots,
		].join(""),
	);
}

/** Human-readable source badge for a breaking-calendar entry (B6). */
const BREAKING_SOURCE_LABEL: Record<"tokens" | "figma", string> = {
	tokens: "tokens",
	figma: "figma",
};

/**
 * Breaking calendar → a date-grouped LIST (NOT a chart), most-recent first
 * (B6). Each entry reads `<date> — <source badge> <detail>`; the source badge
 * distinguishes built-output drift ("tokens") from Figma component-API breakage
 * ("figma"). The assembly hands entries pre-sorted date-desc; the renderer
 * trusts that order. Absent data → the shared empty-state helper.
 */
function breakingCalendarSection(data: ReportData): string {
	const calendar = data.breakingCalendar;
	if (calendar === undefined || calendar.entries.length === 0) {
		return panel("Breaking calendar", emptyState("tokens check"));
	}

	const rows = calendar.entries
		.map((entry) => {
			const badge = `<span class="badge">${escapeHtml(
				BREAKING_SOURCE_LABEL[entry.source],
			)}</span>`;
			const detail = entry.detail ?? `${entry.count}`;
			return `<li><span class="date">${escapeHtml(entry.date)}</span><span class="detail">${badge} ${escapeHtml(detail)}</span></li>`;
		})
		.join("");

	return panel(
		"Breaking calendar",
		[
			`<div class="meta">${escapeHtml(String(calendar.total))} breaking event${calendar.total === 1 ? "" : "s"}, most-recent first</div>`,
			`<ul class="calendar">${rows}</ul>`,
		].join(""),
	);
}

/**
 * Change frequency → a per-kind bar chart of activity density (B6): how many
 * history records of each surface kind exist. The assembly omits zero-count
 * kinds and fixes the order; the renderer draws one bar per bucket. Absent (or
 * no-bucket) data → the shared empty-state helper.
 */
function changeFrequencySection(data: ReportData): string {
	const frequency = data.changeFrequency;
	if (frequency === undefined || frequency.byKind.length === 0) {
		return panel("Change frequency", emptyState("tokens check"));
	}

	const bars = frequency.byKind.map((bucket) => ({
		label: bucket.kind,
		value: bucket.count,
	}));

	const window =
		frequency.windowFirst !== undefined && frequency.windowLast !== undefined
			? `<div class="meta">Records per kind · ${escapeHtml(dayOf(frequency.windowFirst))} → ${escapeHtml(dayOf(frequency.windowLast))}</div>`
			: '<div class="meta">Records per kind</div>';

	return panel(
		"Change frequency",
		[
			window,
			`<div class="chart">${barChart(bars, { width: CARD_W, color: PALETTE[1] })}</div>`,
		].join(""),
	);
}

/**
 * C1 — Targets / SLAs → a RAG status grid (one row per verdict: metric label ·
 * measured · target+op · a band-colored pill) plus a band-key legend table. The
 * `band` discriminator drives the pill fill (green/amber/red, neutral for
 * "unknown"); a never-recorded `measured` reads "—". Absent (or empty) data →
 * the shared empty-state helper with a run-a-report hint.
 */
function targetsSection(data: ReportData): string {
	const targets = data.targets;
	if (targets === undefined || targets.length === 0) {
		return panel("Targets / SLAs", emptyState("report"));
	}

	const rows = targets.map((verdict) => ({
		label: COMPONENT_LABEL[verdict.metric] ?? verdict.metric,
		measured: verdict.measured === undefined ? "—" : String(verdict.measured),
		target: `${verdict.op} ${verdict.target}`,
		band: verdict.band,
	}));

	const legendRows = (["green", "amber", "red", "unknown"] as const)
		.map(
			(band) =>
				`<tr><td>${escapeHtml(band)}</td><td>${escapeHtml(
					band === "green"
						? "meets target"
						: band === "amber"
							? "near target"
							: band === "red"
								? "misses target"
								: "not measured",
				)}</td></tr>`,
		)
		.join("");

	const legend = [
		'<table class="weights">',
		"<thead><tr><th>Band</th><th>Meaning</th></tr></thead>",
		`<tbody>${legendRows}</tbody>`,
		"</table>",
	].join("");

	return panel(
		"Targets / SLAs",
		[
			`<div class="chart">${statusGrid(rows, { width: CARD_W })}</div>`,
			legend,
		].join(""),
	);
}

/**
 * Parity trend → line chart of component parity pass-% over dated points (C3).
 * Mirrors {@link adoptionTrendSection}: one series of `pct` over `parityTrend`
 * points, with a date-range scope line. Absent/empty data → the shared
 * empty-state helper with a run-a-build hint.
 */
function parityTrendSection(data: ReportData): string {
	const trend = data.parityTrend;
	if (trend === undefined || trend.length === 0) {
		return panel("Parity trend", emptyState("registry build"));
	}

	const series: LineSeries[] = [
		{
			label: "parity %",
			points: trend.map((point, index) => ({ x: index, y: point.pct })),
		},
	];

	const dateRange = `${escapeHtml(trend[0]?.date ?? "")} → ${escapeHtml(
		trend[trend.length - 1]?.date ?? "",
	)}`;

	return panel(
		"Parity trend",
		[
			`<div class="chart">${lineChart(series, { width: CARD_W, height: 190, unit: "%", xLabels: dateEnds(trend), colors: [PALETTE[2]] })}</div>`,
			`<div class="meta">Component parity pass-% over ${dateRange}</div>`,
		].join(""),
	);
}

/**
 * Component health → bar chart of each component's 0–100 composite health,
 * worst-first (C5), plus an offenders-style list of the worst few with their
 * contributing issues. The assembly hands rows pre-sorted worst-first; the
 * renderer trusts that order (mirroring `leaderboardSection`). The red bar
 * accent matches the worst-first leaderboard. Absent (or empty) data → the
 * shared empty-state helper.
 */
function componentHealthSection(data: ReportData): string {
	const rows = data.componentHealth;
	if (rows === undefined || rows.length === 0) {
		return panel("Component health", emptyState("registry build"));
	}

	const bars = rows.map((row) => ({
		label: row.component,
		value: row.healthScore,
		color: bandColor(row.healthScore),
	}));

	// The worst few components (already worst-first) with their joined issues.
	const offenders = rows.slice(0, 5);
	const list = [
		'<ul class="offenders">',
		...offenders.map((row) => {
			const issues =
				row.issues.length > 0 ? row.issues.join(", ") : "no issues";
			return `<li><code>${escapeHtml(row.component)}</code><span class="count">${escapeHtml(String(row.healthScore))} · ${escapeHtml(issues)}</span></li>`;
		}),
		"</ul>",
	].join("");

	return panel(
		"Component health",
		[
			'<div class="meta">Composite health per component, worst-first</div>',
			`<div class="chart">${barChart(bars, { width: WIDE_W, max: 100 })}</div>`,
			list,
		].join(""),
		"wide",
	);
}

/**
 * Library health trend → multi-series line chart of the three hygiene counts
 * (overrides / deprecated / detached) over dated states (C6). Mirrors
 * driftSection's multi-series idiom: each series maps the trend with `x: index`
 * so the polylines share the date ordering. Absent (or empty) data → the shared
 * empty-state helper.
 */
function libraryHealthTrendSection(data: ReportData): string {
	const trend = data.libraryHealthTrend;
	if (trend === undefined || trend.length === 0) {
		return panel("Library health trend", emptyState("library-health"));
	}

	const toSeries = (
		label: string,
		pick: (p: {
			overrides: number;
			deprecated: number;
			detached: number;
		}) => number,
	): LineSeries => ({
		label,
		points: trend.map((point, index) => ({ x: index, y: pick(point) })),
	});

	const series: LineSeries[] = [
		toSeries("overrides", (p) => p.overrides),
		toSeries("deprecated", (p) => p.deprecated),
		toSeries("detached", (p) => p.detached),
	];

	const dateRange = `${escapeHtml(trend[0]?.date ?? "")} → ${escapeHtml(
		trend[trend.length - 1]?.date ?? "",
	)}`;

	return panel(
		"Library health trend",
		[
			`<div class="chart">${lineChart(series, { width: CARD_W, height: 200, xLabels: dateEnds(trend), colors: [PALETTE[3], PALETTE[0], PALETTE[4]] })}</div>`,
			`<div class="cols"><b>Overrides</b> · <b>Deprecated</b> · <b>Detached</b> over ${dateRange}</div>`,
		].join(""),
	);
}

/**
 * Migration checklist → a per-call-site LIST (NOT a chart) of where each
 * breaking change lands and the fix to apply (C7). Each entry reads
 * `<file:line> · <subject> · <from> → <to>`; the assembly hands the sites
 * pre-ordered and capped, and a `truncated` flag drives a "+N more" overflow
 * note when sites were dropped at the cap. Absent (or no-site) data → the
 * shared empty-state helper.
 */
function migrationChecklistSection(data: ReportData): string {
	const checklist = data.migrationChecklist;
	if (checklist === undefined || checklist.sites.length === 0) {
		return panel("Migration checklist", emptyState("impact --checklist"));
	}

	const rows = checklist.sites
		.map((site) => {
			const where = `${site.file}:${site.line}`;
			const detail = `${escapeHtml(site.subject)} · ${escapeHtml(site.from)} → ${escapeHtml(site.to)}`;
			return `<li><code>${escapeHtml(where)}</code><span class="detail">${detail}</span></li>`;
		})
		.join("");

	const overflow = checklist.truncated
		? '<div class="meta">… and more sites beyond the cap</div>'
		: "";

	return panel(
		"Migration checklist",
		[
			`<div class="meta">${escapeHtml(String(checklist.sites.length))} call site${checklist.sites.length === 1 ? "" : "s"} to migrate · file:line · subject · from → to</div>`,
			`<ul class="calendar stack">${rows}</ul>`,
			overflow,
		].join(""),
		"wide",
	);
}

/**
 * Score velocity → a compact stat block (NO chart) of the windowed composite
 * motion (C8). Reads the signed `delta` with a direction arrow (▲ up / ▼ down /
 * ▬ flat), the `windowDays` window, and the consecutive `regressionStreak` as a
 * trailing badge. The delta is rendered with an explicit sign so a positive
 * move reads "+N" and a negative one "−N"; the arrow mirrors `direction`
 * verbatim (the assembly owns the up/down/flat classification). Absent data →
 * the shared empty-state helper.
 */
function scoreVelocitySection(data: ReportData): string {
	const velocity = data.scoreVelocity;
	if (velocity === undefined) {
		return panel("Score velocity", emptyState("report"));
	}

	const { delta, windowDays, direction, regressionStreak } = velocity;

	// Direction arrow mirrors the assembly's classification; the signed delta
	// carries an explicit "+"/"−" so the number never reads ambiguously.
	const ARROW: Record<"up" | "down" | "flat", string> = {
		up: "▲",
		down: "▼",
		flat: "▬",
	};
	const arrow = ARROW[direction];
	const signedDelta =
		delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0";

	const streakBadge =
		regressionStreak > 0
			? `<span class="badge">${escapeHtml(String(regressionStreak))} regression${regressionStreak === 1 ? "" : "s"}</span>`
			: "";

	return panel(
		"Score velocity",
		[
			`<div class="stat"><span class="stat-value ${direction === "up" ? "ok" : direction === "down" ? "error" : ""}">${escapeHtml(arrow)} ${escapeHtml(signedDelta)}</span><span class="stat-sub">over ${escapeHtml(String(windowDays))} day${windowDays === 1 ? "" : "s"}</span></div>`,
			`<div class="meta">${escapeHtml(direction)} · regression streak ${streakBadge}${regressionStreak === 0 ? escapeHtml("0") : ""}</div>`,
		].join(""),
	);
}

/**
 * Ownership leaderboard → bar chart of on-system % by owner, worst-first (C9).
 * Mirrors the adoption leaderboard: the renderer trusts the assembly's
 * worst-first ordering; each bar's value is the owner's precomputed on-system
 * percentage. A per-owner list pairs the pct with its refs/literals tally so the
 * accountability number never stands alone. Absent (or empty) data → the shared
 * empty-state helper.
 */
function ownershipLeaderboardSection(data: ReportData): string {
	const rows = data.ownershipLeaderboard;
	if (rows === undefined || rows.length === 0) {
		return panel("Ownership leaderboard", emptyState("lint"));
	}

	const bars = rows.map((row) => ({
		label: row.owner,
		value: row.pct,
		color: bandColor(row.pct),
	}));

	// Per-owner pct labels with the refs/literals split (the bar widths are the
	// same percentages); css/scss values only, worst-first.
	const labels = [
		'<ul class="offenders">',
		...rows.map(
			(row) =>
				`<li><code>${escapeHtml(row.owner)}</code><span class="count">${escapeHtml(
					String(row.pct),
				)}% · ${escapeHtml(String(row.refs))} refs / ${escapeHtml(
					String(row.literals),
				)} literals</span></li>`,
		),
		"</ul>",
	].join("");

	return panel(
		"Ownership leaderboard",
		[
			`<div class="meta">On-system % by owner, worst-first · css/scss values only</div>`,
			`<div class="chart">${barChart(bars, { width: CARD_W, max: 100, unit: "%" })}</div>`,
			labels,
		].join(""),
	);
}

/**
 * Changelog by audience → two labeled columns (designers / developers), each
 * showing breaking/additive/cosmetic counts as badges plus a short recent list
 * (C10). The assembly hands slices pre-shaped (recent capped, breaking-first);
 * the renderer trusts that order. Pure markup — no chart fns. Absent (or
 * no-slice) data → the shared empty-state helper.
 */
function audienceChangelogSection(data: ReportData): string {
	const changelog = data.audienceChangelog;
	if (changelog === undefined || changelog.slices.length === 0) {
		return panel("Changelog by audience", emptyState("changelog"));
	}

	const columns = changelog.slices
		.map((slice) => {
			const badges = [
				`<span class="badge">breaking ${escapeHtml(String(slice.breaking))}</span>`,
				`<span class="badge">additive ${escapeHtml(String(slice.additive))}</span>`,
				`<span class="badge">cosmetic ${escapeHtml(String(slice.cosmetic))}</span>`,
			].join("");

			const recent =
				slice.recent.length > 0
					? [
							'<ul class="offenders">',
							...slice.recent.map(
								(entry) => `<li><code>${escapeHtml(entry)}</code></li>`,
							),
							"</ul>",
						].join("")
					: '<div class="meta">No recent entries</div>';

			return [
				'<div class="audience-col">',
				`<div class="cols"><b>${escapeHtml(slice.audience)}</b></div>`,
				`<div class="meta">${badges}</div>`,
				recent,
				"</div>",
			].join("");
		})
		.join("");

	return panel(
		"Changelog by audience",
		`<div class="cols">${columns}</div>`,
		"wide",
	);
}

/**
 * Frame implementability → donut gauge of the on-system pct (resolved/total) +
 * a gaps-by-reason list (C11). The gauge shows how many of the frame's
 * requirements resolve to the design system; each gap row names a reason and
 * its count. Absent data → the shared empty-state helper.
 */
function frameImplementabilitySection(data: ReportData): string {
	const frame = data.frameImplementability;
	if (frame === undefined) {
		return panel("Frame implementability", emptyState("frame-impl"));
	}

	const { pct, resolved, total, gaps } = frame;

	const gapList =
		gaps.length > 0
			? [
					'<ul class="offenders">',
					...gaps.map(
						(gap) =>
							`<li><code>${escapeHtml(gap.reason)}</code><span class="count">${escapeHtml(String(gap.count))}</span></li>`,
					),
					"</ul>",
				].join("")
			: "";

	return panel(
		"Frame implementability",
		[
			`<div class="chart center">${donutGauge(pct, { label: "Frame implementability" })}</div>`,
			`<div class="meta">${escapeHtml(String(resolved))}/${escapeHtml(String(total))} requirements resolve to the system</div>`,
			gapList,
		].join(""),
	);
}

/**
 * Release readiness (C13) → a go/no-go header badge + a per-check checklist.
 * The badge fill follows the RAG palette (green when `go`, red otherwise; band
 * hexes mirror badge.ts) and each check renders `✓|✗ · name · detail`, its mark
 * tinted by the same green/red. The assembly hands the rollup pre-composed; the
 * renderer trusts the `go` flag and the per-check order. Absent data — or a
 * present-but-checkless rollup — degrades to the shared empty-state helper.
 */
function releaseReadinessSection(data: ReportData): string {
	const readiness = data.releaseReadiness;
	if (readiness === undefined || readiness.checks.length === 0) {
		return panel("Release readiness", emptyState("release-check"));
	}

	// The harvest tones: ok = go, error = no-go.
	const GO_FILL = TONE.ok;
	const NO_GO_FILL = TONE.error;

	const headerFill = readiness.go ? GO_FILL : NO_GO_FILL;
	const headerText = readiness.go ? "GO" : "NO-GO";
	const header = `<div class="meta"><span class="badge" style="background:${headerFill};color:#ffffff">${escapeHtml(headerText)}</span></div>`;

	const items = readiness.checks
		.map((check) => {
			const mark = check.pass ? "✓" : "✗";
			const markFill = check.pass ? GO_FILL : NO_GO_FILL;
			const detail =
				check.detail !== undefined && check.detail.length > 0
					? `<span class="detail">${escapeHtml(check.detail)}</span>`
					: "";
			return `<li><span class="date" style="color:${markFill}">${mark}</span><span class="detail">${escapeHtml(check.name)}</span>${detail}</li>`;
		})
		.join("");

	return panel(
		"Release readiness",
		[header, `<ul class="calendar">${items}</ul>`].join(""),
	);
}

/**
 * Data freshness → a per-kind LIST (NOT a chart): one row per check-kind with
 * its measurement age ("today" / "3d ago" / "never") and a band-colored pill
 * (green/amber/red/unknown) signalling how trustworthy that surface's numbers
 * are (C4). The renderer trusts the assembly's row order. A kind that has never
 * run reports "never" with the neutral "unknown" pill; an absent (or empty)
 * section → the shared empty-state helper.
 */
function dataFreshnessSection(data: ReportData): string {
	const rows = data.dataFreshness;
	if (rows === undefined || rows.length === 0) {
		return panel("Data freshness", emptyState("report"));
	}

	// Band → pill fill. Greens/ambers/reds mirror the RAG palette (badge.ts);
	// "unknown" (never run) gets a neutral subtle fill so it reads as absence,
	// not a verdict. Inlined here because the section may import no new modules.
	const BAND_FILL: Record<"green" | "amber" | "red" | "unknown", string> = {
		green: TONE.ok,
		amber: TONE.warn,
		red: TONE.error,
		unknown: TONE.neutral,
	};

	// Human age label: never-run → "never"; 0 days → "today"; else "Nd ago".
	const ageLabel = (row: FreshnessRow): string => {
		if (row.ageDays === undefined) return "never";
		if (row.ageDays === 0) return "today";
		return `${row.ageDays}d ago`;
	};

	const items = rows
		.map((row) => {
			const fill = BAND_FILL[row.band];
			const pill = `<span class="badge" style="background:${fill};color:#ffffff">${escapeHtml(row.band)}</span>`;
			const age = escapeHtml(ageLabel(row));
			return `<li><span class="date">${escapeHtml(row.kind)}</span><span class="detail">${pill} ${age}</span></li>`;
		})
		.join("");

	return panel(
		"Data freshness",
		[
			'<div class="meta">Measurement age per check-kind · band signals trust</div>',
			`<ul class="calendar">${items}</ul>`,
		].join(""),
	);
}

// ─── Executive layer (AN7, SPEC-exec-report §4) ─────────────────────────────

/** Design-debt % → tone: ok < 25 · warn < 60 · error (the AN2 level bands). */
function debtTone(pct: number): "ok" | "warn" | "error" {
	if (pct < 25) return "ok";
	if (pct < 60) return "warn";
	return "error";
}

/** One headline tile (reuses the KPI tile markup); "—" when not measured. */
function headlineTile(
	label: string,
	value: string | undefined,
	tone: "ok" | "warn" | "error" | undefined,
	sub?: string,
): string {
	return [
		`<div class="kpi${value !== undefined && tone !== undefined ? ` ${tone}` : ""}">`,
		`<span class="kpi-label">${escapeHtml(label)}</span>`,
		`<span class="kpi-value">${escapeHtml(value ?? "—")}</span>`,
		`<span class="kpi-sub">${escapeHtml(value === undefined ? "not measured" : (sub ?? ""))}</span>`,
		"</div>",
	].join("");
}

/**
 * Executive summary → the four leadership headlines (system score · import
 * coverage · consistency · debt — the one-pager's names) as tiles + the score trend line when it has ≥ 2 points.
 * Absent headlines read "—" / not measured (absent-not-zero). Absent section →
 * the shared empty state.
 */
function executiveSection(data: ReportData): string {
	const exec = data.executive;
	if (exec === undefined) {
		return panel("Executive summary", emptyState("record"));
	}
	const tiles = [
		headlineTile(
			"System score",
			exec.health === undefined ? undefined : String(exec.health),
			exec.health === undefined ? undefined : toneFor(exec.health),
			"out of 100",
		),
		headlineTile(
			"Import coverage",
			exec.adoption === undefined ? undefined : `${exec.adoption}%`,
			exec.adoption === undefined ? undefined : toneFor(exec.adoption),
			"components imported",
		),
		headlineTile(
			"Consistency",
			exec.consistency === undefined ? undefined : String(exec.consistency),
			exec.consistency === undefined ? undefined : toneFor(exec.consistency),
			"on-system blend",
		),
		headlineTile(
			"Design debt",
			exec.debt === undefined ? undefined : `${exec.debt}%`,
			exec.debt === undefined ? undefined : debtTone(exec.debt),
			"lower is better",
		),
	].join("");
	const trend = exec.trend ?? [];
	const chart =
		trend.length >= 2
			? `<div class="chart">${lineChart(
					[
						{
							label: "score",
							points: trend.map((p, i) => ({ x: i, y: p.score })),
						},
					],
					{
						width: CARD_W,
						height: 140,
						colors: [PALETTE[0]],
						xLabels: dateEnds(trend),
					},
				)}</div>`
			: "";
	return panel(
		"Executive summary",
		[`<div class="kpis">${tiles}</div>`, chart].join(""),
	);
}

/**
 * Consistency → donut gauge of the AN1 score + the sub-signal legend (signal ·
 * score · weight) + the documented-opinion caveat for the override penalty.
 */
function consistencySection(data: ReportData): string {
	const consistency = data.consistency;
	if (consistency === undefined) {
		return panel("Consistency", emptyState("lint <dir>"));
	}
	const rows = consistency.components
		.map(
			(c) =>
				`<tr><td>${escapeHtml(c.kind)}</td><td class="num">${escapeHtml(String(c.score))}</td><td class="num">${escapeHtml(String(c.weight))}</td></tr>`,
		)
		.join("");
	return panel(
		"Consistency",
		[
			`<div class="chart center">${donutGauge(consistency.score, { label: "Consistency" })}</div>`,
			'<table class="weights">',
			"<thead><tr><th>Signal</th><th>Score</th><th>Weight</th></tr></thead>",
			`<tbody>${rows}</tbody>`,
			"</table>",
			'<div class="meta">tokens and components are true ratios · overrides is a documented-opinion penalty (8 per hotspot)</div>',
		].join(""),
	);
}

/** How many debt items the dashboard lists before "… and N more". */
const DEBT_ITEMS_SHOWN = 8;

/**
 * Design debt → `pct% · level` stat + the itemized, worst-first list (subject ·
 * count · directed recommendation). A real zero-debt rollup renders "0%" with
 * no list (zero debt is meaningful, not an empty state).
 */
function designDebtSection(data: ReportData): string {
	const debt = data.debt;
	if (debt === undefined) {
		return panel("Design debt", emptyState("lint <dir>"));
	}
	const tone = debtTone(debt.pct);
	const shown = debt.items.slice(0, DEBT_ITEMS_SHOWN);
	const items = shown
		.map(
			(item) =>
				`<li><span class="date">${escapeHtml(item.subject)} <span class="badge">${escapeHtml(item.kind)} · ${escapeHtml(String(item.count))}</span></span><span class="detail">${escapeHtml(item.recommendation)}</span></li>`,
		)
		.join("");
	const more =
		debt.items.length > shown.length
			? `<div class="meta">… and ${escapeHtml(String(debt.items.length - shown.length))} more</div>`
			: "";
	return panel(
		"Design debt",
		[
			`<div class="stat"><span class="stat-value ${tone === "ok" ? "ok" : tone === "error" ? "error" : ""}">${escapeHtml(String(debt.pct))}%</span><span class="stat-sub">${escapeHtml(debt.level)} · ${escapeHtml(String(debt.items.length))} item${debt.items.length === 1 ? "" : "s"}</span></div>`,
			items === "" ? "" : `<ul class="calendar stack">${items}</ul>`,
			more,
		].join(""),
	);
}

/**
 * Library hotspots trend (F6) → one list per hygiene signal: component · text
 * sparkline · latest (Δ) · status. Unknown points (below the stored top-N) are
 * skipped in the sparkline and shown as "below top N", never as resolved.
 */
function libraryHotspotsTrendSection(data: ReportData): string {
	const trend = data.libraryHotspotsTrend;
	if (trend === undefined || trend.rows.length === 0) {
		return panel("Library hotspots trend", emptyState("library-health"));
	}
	const blocks = SIGNAL_ORDER.flatMap((signal) => {
		const rows = trend.rows.filter((r) => r.signal === signal);
		if (rows.length === 0) return [];
		const items = rows
			.map(
				(row) =>
					`<li><code>${escapeHtml(row.name)}</code><span class="detail">${escapeHtml(hotspotDetail(row))}</span></li>`,
			)
			.join("");
		return [
			`<div class="cols"><b>${escapeHtml(SIGNAL_LABEL[signal])}</b></div>`,
			`<ul class="calendar stack">${items}</ul>`,
		];
	});
	return panel(
		"Library hotspots trend",
		[
			`<div class="meta">Top components per signal · ${escapeHtml(dateSpan(trend.dates))}</div>`,
			...blocks,
		].join(""),
		"wide",
	);
}

/**
 * Frame readiness trend (F6) → one row per frame, frames below the gate first:
 * frame · sparkline · latest (Δ) · gate marker · runs.
 */
function frameReadinessTrendSection(data: ReportData): string {
	const trend = data.frameReadinessTrend;
	if (trend === undefined || trend.frames.length === 0) {
		return panel("Frame readiness trend", emptyState("handoff <frame-url>"));
	}
	const items = trend.frames
		.map(
			(frame) =>
				`<li><code>${escapeHtml(frame.frameName === "" ? frame.key : frame.frameName)}</code><span class="detail">${escapeHtml(frameDetail(frame))}</span></li>`,
		)
		.join("");
	const more = frameOverflow(trend);
	return panel(
		"Frame readiness trend",
		[
			`<div class="meta">${escapeHtml(belowGateMeta(trend))}</div>`,
			`<ul class="calendar stack">${items}</ul>`,
			more === undefined ? "" : `<div class="meta">${escapeHtml(more)}</div>`,
		].join(""),
		"wide",
	);
}

/** Handoff pass rate (F6) → the headline share of ready frames + its trend line. */
function handoffPassRateSection(data: ReportData): string {
	const rate = data.handoffPassRate;
	if (rate === undefined || rate.frames === 0) {
		return panel("Handoff pass rate", emptyState("handoff <frame-url>"));
	}
	const tone = toneFor(rate.pct);
	const line = passRateTrendLine(rate);
	return panel(
		"Handoff pass rate",
		[
			`<div class="stat"><span class="stat-value ${tone === "ok" ? "ok" : tone === "error" ? "error" : ""}">${escapeHtml(String(rate.pct))}%</span><span class="stat-sub">${escapeHtml(passRateSub(rate))}</span></div>`,
			line === undefined ? "" : `<div class="meta">${escapeHtml(line)}</div>`,
		].join(""),
	);
}

// Each artifact id maps to the section renderer for its ReportData slice. The
// keys mirror the catalog's ArtifactId↔reportDataKey bridge; iterating a
// caller-supplied selection over this map is what gates DOM inclusion (an id
// absent from the selection is never rendered — see renderDashboard).
const SECTION_RENDERERS: Record<ArtifactId, (data: ReportData) => string> = {
	"system-score": systemScoreSection,
	"drift-trend": driftSection,
	"lint-summary": lintSection,
	readiness: readinessSection,
	parity: paritySection,
	a11y: a11ySection,
	impact: impactSection,
	"adoption-trend": adoptionTrendSection,
	"import-coverage": importCoverageSection,
	leaderboard: leaderboardSection,
	"library-health": libraryHealthSection,
	"breaking-calendar": breakingCalendarSection,
	"change-frequency": changeFrequencySection,
	// Persona-wave metric sections (C1–C13). Real chart/list renderers (M4.1 +
	// M4.2); the completeness gate (24 artifacts) holds via the Record type.
	targets: targetsSection,
	"parity-trend": parityTrendSection,
	"component-health": componentHealthSection,
	"library-health-trend": libraryHealthTrendSection,
	"migration-checklist": migrationChecklistSection,
	"score-velocity": scoreVelocitySection,
	"ownership-leaderboard": ownershipLeaderboardSection,
	"audience-changelog": audienceChangelogSection,
	"frame-implementability": frameImplementabilitySection,
	"release-readiness": releaseReadinessSection,
	"data-freshness": dataFreshnessSection,
	// Executive layer (AN7) — the completeness gate is now 27 via the Record type.
	consistency: consistencySection,
	"design-debt": designDebtSection,
	executive: executiveSection,
	// Figma + per-frame trends (F6) — the completeness gate is now 30.
	"library-hotspots-trend": libraryHotspotsTrendSection,
	"frame-readiness-trend": frameReadinessTrendSection,
	"handoff-pass-rate": handoffPassRateSection,
};

/** One headline number in the summary strip above the cards. */
interface Kpi {
	label: string;
	value: string;
	sub?: string;
	tone?: "ok" | "warn" | "error";
}

/** "+3" / "−3" / "±0" — a signed change that never reads ambiguously. */
function signed(delta: number): string {
	if (delta > 0) return `+${delta}`;
	if (delta < 0) return `−${Math.abs(delta)}`;
	return "±0";
}

/**
 * The headline numbers for the strip above the cards: one per selected artifact
 * that has data, in a fixed order, each toned by its band. Text only, no SVG.
 * Empty when nothing selected carries a headline number.
 */
function kpis(data: ReportData, selection: readonly ArtifactId[]): Kpi[] {
	const on = new Set(selection);
	const out: Kpi[] = [];

	const score = data.systemScore;
	if (on.has("system-score") && score !== undefined) {
		const velocity = data.scoreVelocity;
		const first = score.trend[0]?.score;
		const sub =
			velocity !== undefined
				? `${signed(velocity.delta)} over ${velocity.windowDays} day${velocity.windowDays === 1 ? "" : "s"}`
				: first !== undefined && score.trend.length > 1
					? `${signed(score.current - first)} over ${score.trend.length} runs`
					: undefined;
		out.push({
			label: "System score",
			value: String(score.current),
			tone: toneFor(score.current),
			...(sub === undefined ? {} : { sub }),
		});
	}

	const adoption = data.adoptionTrend;
	const lastAdoption = adoption?.[adoption.length - 1];
	if (on.has("adoption-trend") && adoption !== undefined && lastAdoption) {
		const first = adoption[0];
		out.push({
			label: "On-system",
			value: `${lastAdoption.pct}%`,
			tone: toneFor(lastAdoption.pct),
			...(first !== undefined && adoption.length > 1
				? {
						sub: `${signed(lastAdoption.pct - first.pct)} pts since ${first.date}`,
					}
				: {}),
		});
	}

	if (on.has("readiness") && data.readiness !== undefined) {
		out.push({
			label: "Readiness",
			value: String(data.readiness.score),
			tone: toneFor(data.readiness.score),
			sub: data.readiness.frameName,
		});
	}

	const parity = data.parityTrend;
	const lastParity = parity?.[parity.length - 1];
	if (on.has("parity-trend") && lastParity) {
		out.push({
			label: "Parity",
			value: `${lastParity.pct}%`,
			tone: toneFor(lastParity.pct),
			sub: `as of ${lastParity.date}`,
		});
	}

	const drift = data.driftTrend;
	const lastDrift = drift?.[drift.length - 1];
	if (on.has("drift-trend") && lastDrift) {
		out.push({
			label: "Breaking drift",
			value: String(lastDrift.breaking),
			tone: lastDrift.breaking > 0 ? "error" : "ok",
			sub: `${lastDrift.additive} additive · ${lastDrift.cosmetic} cosmetic`,
		});
	}

	const a11y = data.a11y;
	if (on.has("a11y") && a11y !== undefined && a11y.modes.length > 0) {
		const failed = a11y.modes.reduce((sum, m) => sum + m.failed, 0);
		out.push({
			label: "Contrast failures",
			value: String(failed),
			tone: failed > 0 ? "error" : "ok",
			sub: `${a11y.modes.length} mode${a11y.modes.length === 1 ? "" : "s"} · level ${a11y.level}`,
		});
	}

	const release = data.releaseReadiness;
	if (
		on.has("release-readiness") &&
		release !== undefined &&
		release.checks.length > 0
	) {
		const passed = release.checks.filter((c) => c.pass).length;
		out.push({
			label: "Release",
			value: release.go ? "Go" : "No-go",
			tone: release.go ? "ok" : "error",
			sub: `${passed}/${release.checks.length} checks pass`,
		});
	}

	if (on.has("consistency") && data.consistency !== undefined) {
		out.push({
			label: "Consistency",
			value: String(data.consistency.score),
			tone: toneFor(data.consistency.score),
			sub: `${data.consistency.components.length} signal${data.consistency.components.length === 1 ? "" : "s"}`,
		});
	}

	if (on.has("design-debt") && data.debt !== undefined) {
		out.push({
			label: "Design debt",
			value: `${data.debt.pct}%`,
			tone: debtTone(data.debt.pct),
			sub: `${data.debt.level} · ${data.debt.items.length} item${data.debt.items.length === 1 ? "" : "s"}`,
		});
	}

	return out;
}

/** The summary strip's markup; "" when there is nothing to headline. */
function kpiStrip(items: readonly Kpi[]): string {
	if (items.length === 0) return "";
	const cards = items.map((k) =>
		[
			`<div class="kpi${k.tone === undefined ? "" : ` ${k.tone}`}">`,
			`<span class="kpi-label">${escapeHtml(k.label)}</span>`,
			`<span class="kpi-value">${escapeHtml(k.value)}</span>`,
			k.sub === undefined
				? ""
				: `<span class="kpi-sub">${escapeHtml(k.sub)}</span>`,
			"</div>",
		].join(""),
	);
	return `<div class="kpis">${cards.join("")}</div>`;
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/**
 * "2026-10-04T16:00:00.000Z" → "4 Oct 2026, 16:00 UTC". Always UTC, so the
 * output is the same on every machine; text that isn't a date passes through.
 */
export function readableInstant(iso: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return iso;
	const hh = String(at.getUTCHours()).padStart(2, "0");
	const mm = String(at.getUTCMinutes()).padStart(2, "0");
	return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/** Optional rendering controls that do not affect which sections appear. */
export interface RenderDashboardOptions {
	/** Active view name; rendered in the document header when supplied. */
	viewLabel?: string;
	/**
	 * The active system-score weight profile (C2): drives the small caption near
	 * the system-score legend. Only a `view`-source profile renders a caption;
	 * `project`/`default` (or an absent profile) render none — so the no-config
	 * render stays byte-identical.
	 */
	weightProfile?: WeightProfileMeta;
}

/**
 * Render the offline dashboard for a {@link ReportData}, including only the
 * artifacts in `selection` (default: all six, in catalog order — today's
 * behavior). Returns one self-contained `<!DOCTYPE html>` document with inline
 * styles.
 *
 * **Selection gates DOM inclusion BEFORE any data-presence check:** an artifact
 * absent from `selection` is omitted entirely (no `<section>`, no title, no
 * empty-state); only for an *included* artifact does the per-section logic
 * decide chart-vs-empty-state. This ordering is load-bearing for `drift-trend`,
 * which the report CLI passes unconditionally as `[]` when empty while the
 * other sections are conditionally spread — gating-first makes a deselected
 * drift-trend disappear while a selected-but-`[]` one keeps its empty-state.
 *
 * Sections render in `selection` order. All caller-supplied strings are
 * HTML-escaped.
 */
export function renderDashboard(
	data: ReportData,
	selection: readonly ArtifactId[] = ALL_ARTIFACT_IDS,
	options: RenderDashboardOptions = {},
): string {
	const project = escapeHtml(data.project);
	const generatedAt = escapeHtml(readableInstant(data.generatedAt));

	const viewLabel =
		options.viewLabel === undefined
			? ""
			: `<span class="view">${escapeHtml(options.viewLabel)}</span>`;

	// The system-score section alone takes the C2 weight profile (a second arg);
	// every other section is a plain `(data) => string`. Special-cased here rather
	// than widening the whole SECTION_RENDERERS signature.
	const sections = selection.map((id) =>
		id === "system-score"
			? systemScoreSection(data, options.weightProfile)
			: SECTION_RENDERERS[id](data),
	);

	const body = [
		'<header class="dash"><div class="bar">',
		`<h1>ds-bridge report · <span class="project">${project}</span></h1>`,
		viewLabel,
		`<span class="generated">Generated ${generatedAt}</span>`,
		"</div></header>",
		'<div class="wrap">',
		kpiStrip(kpis(data, selection)),
		'<div class="grid">',
		...sections,
		"</div>",
		"</div>",
	].join("");

	return [
		"<!DOCTYPE html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		`<title>ds-bridge report · ${project}</title>`,
		`<style>${STYLE}</style>`,
		"</head>",
		"<body>",
		body,
		"</body>",
		"</html>",
		"",
	].join("\n");
}
