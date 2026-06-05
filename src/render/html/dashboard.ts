// T3.2 — Self-contained HTML dashboard renderer.
//
// `renderDashboard` is a pure function: identical input → byte-identical
// output. It reads no clock, filesystem or network (the caller supplies
// `generatedAt`). The result is ONE offline-safe HTML document — inline
// `<style>` only, system font stacks, no CDN/link/script/@import/url(). The
// four product artifacts are drawn via the T3.1 SVG chart functions; every
// section degrades to a styled empty-state panel when its data is absent.

import type { ParityStatus, ReportData } from "../../engines/report/types.js";
import type { LineSeries } from "./charts.js";
import { barChart, donutGauge, heatGrid, lineChart } from "./charts.js";

/** Escape the five XML-significant characters for safe HTML text/attributes. */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Palette + tokens inspired by docs/ds-bridge.html (mood only). System font
// stacks keep the document fully offline — no web-font requests.
const STYLE = `
:root {
	--bg: #f7f8fa;
	--surface: #ffffff;
	--text: #1c2128;
	--text-subtle: #57606a;
	--border: #d8dee4;
	--accent: #0d7d62;
	--accent-soft: #e6f7f1;
	--radius: 12px;
	--shadow: 0 1px 2px rgba(28, 33, 40, 0.06), 0 4px 12px rgba(28, 33, 40, 0.04);
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	line-height: 1.5;
	-webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px; }
header.dash {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px 24px;
	padding-bottom: 20px;
	border-bottom: 1px solid var(--border);
	margin-bottom: 28px;
}
header.dash h1 { font-size: 22px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
header.dash .project { color: var(--accent); }
header.dash .generated { color: var(--text-subtle); font-size: 13px; font-variant-numeric: tabular-nums; }
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
	gap: 20px;
}
section.panel {
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: var(--radius);
	box-shadow: var(--shadow);
	padding: 18px 20px 20px;
	min-width: 0;
}
section.panel h2 {
	font-size: 14px;
	font-weight: 600;
	margin: 0 0 14px;
	color: var(--text);
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.chart { overflow-x: auto; }
.chart svg { max-width: 100%; height: auto; display: block; }
.empty {
	display: flex;
	flex-direction: column;
	gap: 6px;
	align-items: flex-start;
	justify-content: center;
	min-height: 120px;
	padding: 16px;
	border: 1px dashed var(--border);
	border-radius: 8px;
	background: var(--bg);
	color: var(--text-subtle);
}
.empty .empty-title { font-weight: 600; color: var(--text); }
.empty code {
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
	font-size: 12px;
	background: var(--accent-soft);
	color: var(--accent);
	padding: 2px 6px;
	border-radius: 6px;
}
table.parity-key, .meta {
	width: 100%;
	margin-top: 12px;
	font-size: 12px;
	color: var(--text-subtle);
	border-collapse: collapse;
}
.cols { margin-top: 10px; font-size: 12px; color: var(--text-subtle); }
.cols b { color: var(--text); font-weight: 600; }
ul.offenders { margin: 12px 0 0; padding: 0; list-style: none; font-size: 12px; }
ul.offenders li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-top: 1px solid var(--border); }
ul.offenders code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--text); }
ul.offenders .count { color: var(--accent); font-variant-numeric: tabular-nums; font-weight: 600; }
ul.deductions { margin: 12px 0 0; padding: 0; list-style: none; font-size: 12px; }
ul.deductions li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
ul.deductions .pts { color: var(--text-subtle); font-variant-numeric: tabular-nums; }
.frame-name { font-size: 13px; color: var(--text-subtle); margin-top: 10px; text-align: center; }
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

/** Wrap section content in a titled panel. */
function panel(title: string, body: string): string {
	return [
		'<section class="panel">',
		`<h2>${escapeHtml(title)}</h2>`,
		body,
		"</section>",
	].join("");
}

/** Drift trend → multi-series line chart (breaking / additive / cosmetic). */
function driftSection(data: ReportData): string {
	const trend = data.driftTrend;
	if (trend === undefined || trend.length === 0) {
		return panel("Drift trend", emptyState("diff --since <ref>"));
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
			`<div class="chart">${lineChart(series)}</div>`,
			`<div class="cols"><b>Breaking</b> · <b>Additive</b> · <b>Cosmetic</b> over ${dateRange}</div>`,
		].join(""),
	);
}

/** Lint violations → bar chart by kind, plus the top offending files. */
function lintSection(data: ReportData): string {
	const lint = data.lintSummary;
	if (lint === undefined) {
		return panel("Lint violations", emptyState("ds-lint"));
	}

	const bars = [
		{ label: "Exact", value: lint.byKind.exact },
		{ label: "Near", value: lint.byKind.near },
		{ label: "Off-system", value: lint.byKind.offSystem },
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
		`<div class="chart">${barChart(bars)}</div>${offenders}`,
	);
}

/** Readiness → donut gauge of the score, frame name and deduction list. */
function readinessSection(data: ReportData): string {
	const readiness = data.readiness;
	if (readiness === undefined) {
		return panel("Readiness", emptyState("qa <frame>"));
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
			`<div class="chart" style="text-align:center">${donutGauge(readiness.score, { label: "Readiness" })}</div>`,
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

/**
 * Render the complete offline dashboard for a {@link ReportData}. Returns one
 * self-contained `<!DOCTYPE html>` document with inline styles and four
 * sections (drift trend, lint, readiness, parity), each falling back to a
 * styled empty state. All caller-supplied strings are HTML-escaped.
 */
export function renderDashboard(data: ReportData): string {
	const project = escapeHtml(data.project);
	const generatedAt = escapeHtml(data.generatedAt);

	const body = [
		'<div class="wrap">',
		'<header class="dash">',
		`<h1>ds-bridge report · <span class="project">${project}</span></h1>`,
		`<span class="generated">Generated ${generatedAt}</span>`,
		"</header>",
		'<div class="grid">',
		driftSection(data),
		lintSection(data),
		readinessSection(data),
		paritySection(data),
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
