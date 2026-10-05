// T3.2 — Self-contained HTML dashboard renderer.
//
// `renderDashboard` is a pure function: identical input → byte-identical
// output. It reads no clock, filesystem or network (the caller supplies
// `generatedAt`). The result is ONE offline-safe HTML document — inline
// `<style>` only, system font stacks, no CDN/link/script/@import/url(). The
// four product artifacts are drawn via the T3.1 SVG chart functions; every
// section degrades to a styled empty-state panel when its data is absent.
//
// This module is the composer: the section registry, the KPI strip, the
// header + timeline and the page. The sections live in ./sections/ by group
// (checks, metrics, executive, figma); the page primitives in ./base.ts.

import {
	ALL_ARTIFACT_IDS,
	type ArtifactId,
} from "../../engines/report/catalog.js";
import type { ReportData } from "../../engines/report/types.js";
import { debtTone, escapeHtml, readableInstant, STYLE } from "./base.js";
import { toneFor } from "./charts.js";
import { LOGO_IMG } from "./logo.js";
import {
	a11ySection,
	adoptionTrendSection,
	driftSection,
	impactSection,
	importCoverageSection,
	leaderboardSection,
	libraryHealthSection,
	lintSection,
	paritySection,
	readinessSection,
	systemScoreSection,
	type WeightProfileMeta,
} from "./sections/checks.js";
import {
	consistencySection,
	designDebtSection,
	executiveSection,
} from "./sections/executive.js";
import {
	frameReadinessTrendSection,
	handoffPassRateSection,
	libraryHotspotsTrendSection,
} from "./sections/figma.js";
import {
	audienceChangelogSection,
	breakingCalendarSection,
	changeFrequencySection,
	componentHealthSection,
	dataFreshnessSection,
	frameImplementabilitySection,
	libraryHealthTrendSection,
	migrationChecklistSection,
	ownershipLeaderboardSection,
	parityTrendSection,
	releaseReadinessSection,
	scoreVelocitySection,
	targetsSection,
} from "./sections/metrics.js";
import {
	dayLabels,
	HEADER_STYLE,
	TIMELINE_STYLE,
	type TimelineStop,
	timelineNav,
	timelineRadios,
	timelineStyle,
} from "./timeline.js";

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
			// A weighted 0–100 index, not a percentage (same as the manager page).
			value: `${data.debt.pct}/100`,
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
	/**
	 * Earlier states for the header timeline, oldest first (the dashboard as it
	 * stood at the end of each `day`, `YYYY-MM-DD`). `data` is the current state
	 * ("Now"). Absent or empty → no timeline, a single state.
	 */
	timeline?: readonly DashboardPastState[];
}

/** One earlier dashboard state on the timeline. */
export interface DashboardPastState {
	day: string;
	data: ReportData;
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
	const stateBody = (state: ReportData): string =>
		[
			kpiStrip(kpis(state, selection)),
			'<div class="grid">',
			...selection.map((id) =>
				id === "system-score"
					? systemScoreSection(state, options.weightProfile)
					: SECTION_RENDERERS[id](state),
			),
			"</div>",
		].join("");

	// Timeline: one state per earlier day, then "Now". Each state renders the
	// whole dashboard; CSS shows the checked one (see ./timeline.ts).
	const past = options.timeline ?? [];
	const stops: TimelineStop[] = [
		...past.map((state, i) => {
			const labels = dayLabels(state.day);
			return {
				id: `tl-${i}`,
				label: labels.short,
				title: `End of ${labels.long}`,
			};
		}),
		{
			id: "tl-now",
			label: "Now",
			title: `Now · generated ${readableInstant(data.generatedAt)}`,
		},
	];
	const hasTimeline = past.length > 0;

	const asOf = past
		.map(
			(state, i) =>
				`<span class="tl-asof tl-g${i}">As of ${escapeHtml(dayLabels(state.day).long)}</span>`,
		)
		.join("");
	const header = [
		'<header class="dash"><div class="bar top">',
		`<div class="brand">${LOGO_IMG}<h1>ds-bridge report · <span class="project">${project}</span></h1></div>`,
		hasTimeline ? timelineNav(stops) : "<div></div>",
		`<div class="bar-meta">${viewLabel}${asOf}<span class="generated">Generated ${generatedAt}</span></div>`,
		"</div></header>",
	].join("");

	const bodies = hasTimeline
		? [
				...past.map(
					(state, i) =>
						`<div class="wrap tl-state tl-s${i}"><p class="tl-note">You are viewing this dashboard as it was at the end of <strong>${escapeHtml(dayLabels(state.day).long)}</strong>. The parity grid and component health come from the current registry, not from history.</p>${stateBody(state.data)}</div>`,
				),
				`<div class="wrap tl-state tl-s${past.length}">${stateBody(data)}</div>`,
			]
		: [`<div class="wrap">${stateBody(data)}</div>`];

	const body = [
		hasTimeline ? timelineRadios(stops) : "",
		header,
		...bodies,
	].join("");

	return [
		"<!DOCTYPE html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		`<title>ds-bridge report · ${project}</title>`,
		`<style>${STYLE}${HEADER_STYLE}${hasTimeline ? `${TIMELINE_STYLE}${timelineStyle(stops)}` : ""}</style>`,
		"</head>",
		"<body>",
		body,
		"</body>",
		"</html>",
		"",
	].join("\n");
}
