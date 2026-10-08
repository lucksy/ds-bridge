import type {
	FreshnessRow,
	ReportData,
} from "../../../engines/report/types.js";
import { escapeHtml, panel } from "../base.js";
import type { LineSeries } from "../charts.js";
import {
	bandColor,
	barChart,
	donutGauge,
	lineChart,
	PALETTE,
	statusGrid,
	TONE,
} from "../charts.js";
import { COMPONENT_LABEL } from "./checks.js";
import {
	CARD_W,
	dateEnds,
	dayOf,
	emptyHint,
	emptyState,
	WIDE_W,
} from "./shared.js";

/** Human-readable source badge for a breaking-calendar entry (B6). */
export const BREAKING_SOURCE_LABEL: Record<"tokens" | "figma", string> = {
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
export function breakingCalendarSection(data: ReportData): string {
	const calendar = data.breakingCalendar;
	if (calendar === undefined || calendar.entries.length === 0) {
		// Measured with no breaking events is good news, not missing data.
		const measured = (data.driftTrend?.length ?? 0) > 0;
		return panel(
			"Breaking calendar",
			measured
				? emptyHint(
						"No breaking changes recorded — no stale tokens and no breaking library changes.",
					)
				: emptyState("tokens check"),
		);
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
export function changeFrequencySection(data: ReportData): string {
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
export function targetsSection(data: ReportData): string {
	const targets = data.targets;
	if (targets === undefined || targets.length === 0) {
		return panel(
			"Targets / SLAs",
			emptyHint(
				"No targets set — add metric_targets to .ds-bridge.json to track goals.",
			),
		);
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
export function parityTrendSection(data: ReportData): string {
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
export function componentHealthSection(data: ReportData): string {
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
export function libraryHealthTrendSection(data: ReportData): string {
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
export function migrationChecklistSection(data: ReportData): string {
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
export function scoreVelocitySection(data: ReportData): string {
	const velocity = data.scoreVelocity;
	if (velocity === undefined) {
		return panel(
			"Score velocity",
			emptyHint(
				"Needs system scores from two different days — run ds-bridge record again on another day.",
			),
		);
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
export function ownershipLeaderboardSection(data: ReportData): string {
	const rows = data.ownershipLeaderboard;
	if (rows === undefined || rows.length === 0) {
		return panel(
			"Ownership leaderboard",
			emptyHint(
				"Needs owners — add ownership (or ownership_file, a CODEOWNERS file) to .ds-bridge.json, then run ds-bridge lint.",
			),
		);
	}

	const bars = rows.map((row) => ({
		label: row.owner,
		value: row.pct,
		color: bandColor(row.pct),
	}));

	// Per-owner pct labels with the refs/literals split (the bar widths are the
	// same percentages); css/scss + inline style values, worst-first.
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
			`<div class="meta">On-system % by owner, worst-first · css/scss + inline style values</div>`,
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
export function audienceChangelogSection(data: ReportData): string {
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
export function frameImplementabilitySection(data: ReportData): string {
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
export function releaseReadinessSection(data: ReportData): string {
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
export function dataFreshnessSection(data: ReportData): string {
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
