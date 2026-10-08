import type {
	ParityStatus,
	ReportData,
} from "../../../engines/report/types.js";
import { escapeHtml, panel } from "../base.js";
import type { LineSeries } from "../charts.js";
import {
	bandColor,
	barChart,
	donutGauge,
	heatGrid,
	lineChart,
	PALETTE,
	TONE,
} from "../charts.js";
import { CARD_W, dateEnds, emptyState, WIDE_W } from "./shared.js";

// The human label for each score component kind in the legend table.
export const COMPONENT_LABEL: Record<string, string> = {
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
export function systemScoreSection(
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
			`<div class="chart center">${donutGauge(score.current, { label: "System score", unit: "score" })}</div>`,
			`<div class="chart">${lineChart(trendSeries, { width: WIDE_W - 170, height: 180, colors: [PALETTE[0]] })}</div>`,
			"</div>",
			legend,
			caption,
		].join(""),
		"wide",
	);
}

/** Drift trend → multi-series line chart (stale / missing / orphan outputs). */
export function driftSection(data: ReportData): string {
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
		toSeries("stale", (p) => p.breaking),
		toSeries("missing", (p) => p.additive),
		toSeries("orphan", (p) => p.cosmetic),
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
export function lintSection(data: ReportData): string {
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
export function readinessSection(data: ReportData): string {
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
export const PARITY_INTENSITY: Record<ParityStatus, number> = {
	ok: 0.12,
	"prop-mismatch": 0.55,
	"missing-in-code": 0.8,
	"missing-in-figma": 1,
};

/** Parity matrix → heat grid (rows = components, cols = aspects). */
export function paritySection(data: ReportData): string {
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
export function a11ySection(data: ReportData): string {
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
export function impactSection(data: ReportData): string {
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
export function onSystemPct(refs: number, literals: number): number {
	const total = refs + literals;
	return total === 0 ? 0 : Math.round((refs / total) * 100);
}

/**
 * Adoption trend → line chart of the on-system pct over dated points (B2).
 * Honest-scope one-liner: the ratio counts css/scss + inline style values (SPEC §1).
 */
export function adoptionTrendSection(data: ReportData): string {
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
			`<div class="meta">On-system % over ${dateRange} · css/scss + inline style values (var(--…) vs literals)</div>`,
		].join(""),
	);
}

/**
 * Import coverage → donut gauge of imported/total + the capped uncovered list
 * with an overflow note (B2). Honest-scope one-liner: mapUsage scans resolved
 * `.tsx` imports only, so the number is a floor (SPEC §1 / A3a).
 */
export function importCoverageSection(data: ReportData): string {
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
			`<div class="meta">${escapeHtml(String(imported))}/${escapeHtml(String(total))} registry components imported · resolved .ts/.tsx imports, barrels followed (a floor)</div>`,
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
export function leaderboardSection(data: ReportData): string {
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
			`<div class="meta">On-system % by directory, worst-first · css/scss + inline style values</div>`,
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
export function libraryHealthSection(data: ReportData): string {
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
