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
import type { LineSeries } from "./charts.js";
import {
	barChart,
	donutGauge,
	heatGrid,
	lineChart,
	statusGrid,
} from "./charts.js";

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
table.weights { width: 100%; margin-top: 12px; font-size: 12px; border-collapse: collapse; }
table.weights th, table.weights td { padding: 4px 8px; border-top: 1px solid var(--border); text-align: left; }
table.weights th { color: var(--text-subtle); font-weight: 600; }
table.weights td.num, table.weights th + th { text-align: right; font-variant-numeric: tabular-nums; }
ul.offenders { margin: 12px 0 0; padding: 0; list-style: none; font-size: 12px; }
ul.offenders li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-top: 1px solid var(--border); }
ul.offenders code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--text); }
ul.offenders .count { color: var(--accent); font-variant-numeric: tabular-nums; font-weight: 600; }
ul.deductions { margin: 12px 0 0; padding: 0; list-style: none; font-size: 12px; }
ul.deductions li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
ul.deductions .pts { color: var(--text-subtle); font-variant-numeric: tabular-nums; }
.frame-name { font-size: 13px; color: var(--text-subtle); margin-top: 10px; text-align: center; }
ul.calendar { margin: 12px 0 0; padding: 0; list-style: none; font-size: 12px; }
ul.calendar li { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-top: 1px solid var(--border); }
ul.calendar .date { font-variant-numeric: tabular-nums; color: var(--text); font-weight: 600; }
ul.calendar .detail { color: var(--text-subtle); text-align: right; }
.badge {
	display: inline-block;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 11px;
	background: var(--accent-soft);
	color: var(--accent);
	padding: 1px 6px;
	border-radius: 6px;
	margin-right: 4px;
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

/** Wrap section content in a titled panel. */
function panel(title: string, body: string): string {
	return [
		'<section class="panel">',
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
	adoption: "adoption",
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
			`<div class="chart" style="text-align:center">${donutGauge(score.current, { label: "System score" })}</div>`,
			`<div class="chart">${lineChart(trendSeries)}</div>`,
			legend,
			caption,
		].join(""),
	);
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
		'<ul class="modes">',
		...a11y.modes.map(
			(m) =>
				`<li><code>${escapeHtml(m.mode)}</code><span class="count">${escapeHtml(String(m.passed))} passed · ${escapeHtml(String(m.failed))} failed</span></li>`,
		),
		"</ul>",
	].join("");

	return panel(
		"Contrast (a11y)",
		[
			`<div class="meta">Failures by mode · level ${escapeHtml(a11y.level)}</div>`,
			`<div class="chart">${barChart(bars)}</div>`,
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
		{ label: "Breaking", value: impact.breaking },
		{ label: "Additive", value: impact.additive },
		{ label: "Cosmetic", value: impact.cosmetic },
	];
	const sites = impact.touchedCallSites;
	const radius = `<div class="meta">Touches ${escapeHtml(String(sites))} call site${sites === 1 ? "" : "s"}</div>`;

	return panel(
		"Change impact",
		`<div class="chart">${barChart(bars)}</div>${radius}`,
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
			`<div class="chart">${lineChart(series)}</div>`,
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
			`<div class="chart" style="text-align:center">${donutGauge(pct, { label: "Import coverage" })}</div>`,
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

	const bars = rows.map((row) => ({
		label: row.dir,
		value: onSystemPct(row.refs, row.literals),
	}));

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
			`<div class="chart">${barChart(bars, { color: "#dc2626" })}</div>`,
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
		{ label: "Override hotspots", value: totals.overrideHotspots },
		{ label: "Deprecated usage", value: totals.deprecatedUsage },
		{ label: "Detached candidates", value: totals.detachedCandidates },
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
			`<div class="chart">${barChart(bars)}</div>`,
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
		return panel("Breaking calendar", emptyState("tokens-check"));
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
		return panel("Change frequency", emptyState("tokens-check"));
	}

	const bars = frequency.byKind.map((bucket) => ({
		label: bucket.kind,
		value: bucket.count,
	}));

	const window =
		frequency.windowFirst !== undefined && frequency.windowLast !== undefined
			? `<div class="meta">Records per kind · ${escapeHtml(frequency.windowFirst)} → ${escapeHtml(frequency.windowLast)}</div>`
			: '<div class="meta">Records per kind</div>';

	return panel(
		"Change frequency",
		[window, `<div class="chart">${barChart(bars)}</div>`].join(""),
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
		[`<div class="chart">${statusGrid(rows)}</div>`, legend].join(""),
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
			`<div class="chart">${lineChart(series)}</div>`,
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
			`<div class="chart">${barChart(bars, { color: "#dc2626" })}</div>`,
			list,
		].join(""),
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
			`<div class="chart">${lineChart(series)}</div>`,
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
			`<ul class="calendar">${rows}</ul>`,
			overflow,
		].join(""),
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
			`<div class="cols"><b>${escapeHtml(arrow)} ${escapeHtml(signedDelta)}</b> over ${escapeHtml(String(windowDays))} day${windowDays === 1 ? "" : "s"}</div>`,
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
			`<div class="chart">${barChart(bars, { color: "#dc2626" })}</div>`,
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
		return panel("Changelog by audience", emptyState("ds-changelog"));
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

	return panel("Changelog by audience", `<div class="cols">${columns}</div>`);
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
			`<div class="chart" style="text-align:center">${donutGauge(pct, { label: "Frame implementability" })}</div>`,
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

	// RAG palette (mirrors badge.ts BAND_GREEN/BAND_RED): green = go, red = no-go.
	const GO_FILL = "#16a34a";
	const NO_GO_FILL = "#dc2626";

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
		green: "#16a34a",
		amber: "#d97706",
		red: "#dc2626",
		unknown: "#57606a",
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
};

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
	const generatedAt = escapeHtml(data.generatedAt);

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
		'<div class="wrap">',
		'<header class="dash">',
		`<h1>ds-bridge report · <span class="project">${project}</span></h1>`,
		viewLabel,
		`<span class="generated">Generated ${generatedAt}</span>`,
		"</header>",
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
