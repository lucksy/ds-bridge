// M10.2 — the selection-aware terminal dashboard (SPEC-personas §8). The pure
// terminal analog of renderDashboard: ReportData + an ordered selection in →
// ANSI/Unicode text out. No clock/fs/network — `generatedAt` and the color
// boolean are injected. Each section is a thin twin of its HTML counterpart,
// reading the SAME ReportData slice with the SAME presence checks, empty-state
// command hints, caveat strings, and label maps. Sections render in selection
// order; a deselected artifact emits NO block, a selected-but-empty one its
// empty-state. (Section bodies drafted by the m10.2-terminal-twins workflow,
// then reconciled + golden-pinned here.)

import type { ArtifactId } from "../../engines/report/catalog.js";
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
import { renderBarChart } from "./bar-chart.js";
import { renderGauge } from "./gauge.js";
import { renderMatrix } from "./matrix.js";
import { terminalSafe } from "./sanitize.js";
import { severityColor } from "./severity.js";
import { sparkline } from "./sparkline.js";
import { renderTable } from "./table.js";
import { displayWidth, padToWidth } from "./width.js";

/** A "no data yet" body — the command hint mirrors the HTML emptyState verbatim. */
function emptyState(command: string): string {
	return `No data yet — run \`ds-bridge ${command}\` to populate this section.`;
}

/** Wrap a section body under an underlined title (the terminal panel twin). */
function panel(title: string, body: string): string {
	return `${title}\n${"─".repeat([...title].length)}\n${body}`;
}

function systemScoreTerminalSection(data: ReportData, color: boolean): string {
	const score = data.systemScore;
	if (score === undefined) {
		return panel("System score", emptyState("report"));
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

	// §8 mapping: score artifact → gauge for the current composite.
	const gauge = renderGauge(score.current, {
		label: "System score",
		width: 24,
		color,
	});

	// §8 mapping: the score trend → sparkline of each dated composite.
	const trend = sparkline(score.trend.map((point) => point.score));

	// Components/weights legend (kind · sub-score · applied weight).
	const legend = renderTable(
		["Component", "Sub-score", "Weight"],
		score.components.map((c) => [
			COMPONENT_LABEL[c.kind] ?? c.kind,
			String(c.score),
			String(c.weight),
		]),
		{ color },
	);

	return panel("System score", [gauge, trend, legend].join("\n"));
}

function driftTrendTerminalSection(data: ReportData, _color: boolean): string {
	const trend = data.driftTrend;
	if (trend === undefined || trend.length === 0) {
		return panel("Drift trend", emptyState("tokens check"));
	}

	// §8 mapping: trend artifact → one sparkline per severity series.
	const breaking = sparkline(trend.map((point) => point.breaking));
	const additive = sparkline(trend.map((point) => point.additive));
	const cosmetic = sparkline(trend.map((point) => point.cosmetic));

	const dateRange =
		trend.length > 0
			? `${trend[0]?.date ?? ""} → ${trend[trend.length - 1]?.date ?? ""}`
			: "";

	return panel(
		"Drift trend",
		[
			// Token drift is stale / missing / orphan outputs — not a change log.
			`Stale    ${breaking}`,
			`Missing  ${additive}`,
			`Orphan   ${cosmetic}`,
			`Stale · Missing · Orphan outputs over ${dateRange}`,
		].join("\n"),
	);
}

function lintSummaryTerminalSection(data: ReportData, color: boolean): string {
	const lint = data.lintSummary;
	if (lint === undefined) {
		return panel("Lint violations", emptyState("lint"));
	}

	// §8 mapping: count artifact → bar chart of byKind tallies.
	const bars = renderBarChart(
		[
			{ label: "Exact", value: lint.byKind.exact },
			{ label: "Near", value: lint.byKind.near },
			{ label: "Off-system", value: lint.byKind.offSystem },
		],
		{ width: 24, color },
	);

	// Top offending files as a plain text list (file · count), when present.
	const offenders =
		lint.topOffenders.length > 0
			? lint.topOffenders.map((o) => `${o.file}  ${o.count}`).join("\n")
			: "";

	const body = offenders === "" ? bars : `${bars}\n${offenders}`;
	return panel("Lint violations", body);
}

function readinessTerminalSection(data: ReportData, color: boolean): string {
	const readiness = data.readiness;
	if (readiness === undefined) {
		return panel("Readiness", emptyState("handoff <frame-url>"));
	}

	// §8 mapping: score artifact → gauge of the readiness score.
	const gauge = renderGauge(readiness.score, {
		label: "Readiness",
		width: 24,
		color,
	});

	// Deduction list (reason · -points) as plain text, when present.
	const deductions =
		readiness.deductions.length > 0
			? readiness.deductions.map((d) => `${d.reason}  -${d.points}`).join("\n")
			: "";

	const lines = [gauge, readiness.frameName];
	if (deductions !== "") {
		lines.push(deductions);
	}
	return panel("Readiness", lines.join("\n"));
}

function parityTerminalSection(data: ReportData, color: boolean): string {
	// Parity matrix → renderMatrix (rows = components, cols = aspects). Mirrors
	// paritySection: empty when absent or no rows. The §8 RAG mapping turns each
	// ParityStatus into a matrix cell state: ok→ok, prop-mismatch→warn, and either
	// missing-* gap→fail.
	const parity = data.parity;
	if (parity === undefined || parity.rows.length === 0) {
		return panel("Parity matrix", emptyState("parity"));
	}

	const STATUS_CELL: Record<ParityStatus, "ok" | "warn" | "fail" | "none"> = {
		ok: "ok",
		"prop-mismatch": "warn",
		"missing-in-code": "fail",
		"missing-in-figma": "fail",
	};

	const rows = parity.rows.map((row) => ({
		label: row.component,
		cells: row.cells.map((cell) => STATUS_CELL[cell.status]),
	}));

	const body = [renderMatrix(rows, parity.columns, { color })];
	if (parity.columns.length > 0) {
		body.push(`Columns: ${parity.columns.join(" · ")}`);
	}

	return panel("Parity matrix", body.join("\n"));
}

function a11yTerminalSection(data: ReportData, color: boolean): string {
	// Contrast audit → renderBarChart of failures by mode (count artifact, §8),
	// plus per-mode passed/failed tallies. Mirrors a11ySection: empty when absent
	// or no modes; the scope meta line names the WCAG conformance level.
	const a11y = data.a11y;
	if (a11y === undefined || a11y.modes.length === 0) {
		return panel("Contrast (a11y)", emptyState("a11y"));
	}

	const bars = a11y.modes.map((m) => ({
		label: m.mode,
		value: m.failed,
	}));

	const tallies = a11y.modes.map(
		(m) => `${m.mode}  ${m.passed} passed · ${m.failed} failed`,
	);

	const body = [
		`Failures by mode · level ${a11y.level}`,
		renderBarChart(bars, { width: 24, color }),
		...tallies,
	].join("\n");

	return panel("Contrast (a11y)", body);
}

function impactTerminalSection(data: ReportData, color: boolean): string {
	// Change impact → renderBarChart of severity counts (count artifact, §8) plus
	// the call-site blast-radius line. Mirrors impactSection: empty when absent;
	// the radius line preserves the HTML twin's singular/plural site wording.
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
	const radius = `Touches ${sites} call site${sites === 1 ? "" : "s"}`;

	const body = [renderBarChart(bars, { width: 24, color }), radius].join("\n");

	return panel("Change impact", body);
}

function adoptionTrendTerminalSection(
	data: ReportData,
	_color: boolean,
): string {
	// Adoption trend → sparkline of the on-system pct over dated points (trend
	// artifact, §8). Mirrors adoptionTrendSection: empty when absent or no points.
	// The honest-scope one-liner is preserved verbatim: the ratio counts css/scss
	// values only (SPEC §1).
	const trend = data.adoptionTrend;
	if (trend === undefined || trend.length === 0) {
		return panel("Adoption trend", emptyState("lint <dir>"));
	}

	const spark = sparkline(trend.map((point) => point.pct));

	const dateRange = `${trend[0]?.date ?? ""} → ${trend[trend.length - 1]?.date ?? ""}`;

	const body = [
		`on-system %  ${spark}`,
		`On-system % over ${dateRange} · css/scss + inline style values (var(--…) vs literals)`,
	].join("\n");

	return panel("Adoption trend", body);
}

function importCoverageTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const coverage = data.importCoverage;
	if (coverage === undefined) {
		return panel("Import coverage", emptyState("adoption"));
	}

	const { imported, total, uncovered, uncoveredTotal } = coverage;
	const pct = total === 0 ? 0 : Math.round((imported / total) * 100);

	const lines: string[] = [];
	lines.push(renderGauge(pct, { label: "Import coverage", width: 24, color }));
	// Honest-scope caveat (SPEC §1 / A3a): mapCodeUsage scans resolved .ts/.tsx imports
	// only, so the number is a floor.
	lines.push(
		`${imported}/${total} registry components imported · resolved .ts/.tsx imports, barrels followed (a floor)`,
	);

	if (uncovered.length > 0) {
		for (const name of uncovered) {
			lines.push(`• ${name}`);
		}
	}

	if (uncoveredTotal > uncovered.length) {
		lines.push(`… and ${uncoveredTotal - uncovered.length} more`);
	}

	return panel("Import coverage", lines.join("\n"));
}

function leaderboardTerminalSection(data: ReportData, color: boolean): string {
	const rows = data.leaderboard;
	if (rows === undefined || rows.length === 0) {
		return panel("Adoption leaderboard", emptyState("lint <dir>"));
	}

	// On-system % = round(100·refs/(refs+literals)); 0 when no values seen.
	const onSystemPct = (refs: number, literals: number): number => {
		const total = refs + literals;
		return total === 0 ? 0 : Math.round((refs / total) * 100);
	};

	// The renderer trusts the assembly's worst-first ordering; each bar's value
	// is the directory's on-system percentage.
	const bars = rows.map((row) => ({
		label: row.dir,
		value: onSystemPct(row.refs, row.literals),
	}));

	const lines: string[] = [];
	// Honest-scope caveat (SPEC §1): css/scss + inline style values.
	lines.push(
		"On-system % by directory, worst-first · css/scss + inline style values",
	);
	lines.push(renderBarChart(bars, { width: 24, color }));

	return panel("Adoption leaderboard", lines.join("\n"));
}

function libraryHealthTerminalSection(
	data: ReportData,
	color: boolean,
): string {
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

	const lines: string[] = [];
	lines.push(renderBarChart(bars, { width: 24, color }));

	// The detached-candidate caveat is load-bearing (SPEC §1.3 honest scope): a
	// detached "candidate" over REST is a guess, so the number never stands alone.
	lines.push(
		`Detached candidates: ${totals.detachedCandidates} — heuristic — REST cannot truly detect detachment; expect false positives.`,
	);

	// Top override hotspots (name + count). The list may be empty when the data
	// was reconstructed from a counts-only history line (SPEC §3).
	if (health.overrideHotspots.length > 0) {
		for (const h of health.overrideHotspots) {
			lines.push(`• ${h.name} (${h.overrideCount})`);
		}
	}

	return panel("Library health", lines.join("\n"));
}

function breakingCalendarTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const calendar = data.breakingCalendar;
	if (calendar === undefined || calendar.entries.length === 0) {
		return panel("Breaking calendar", emptyState("tokens check"));
	}

	// Human-readable source badge: built-output drift ("tokens") vs Figma
	// component-API breakage ("figma") (B6).
	const BREAKING_SOURCE_LABEL: Record<"tokens" | "figma", string> = {
		tokens: "tokens",
		figma: "figma",
	};

	// A date-grouped LIST (NOT a chart), most-recent first; the assembly hands
	// entries pre-sorted date-desc and the renderer trusts that order. Each row
	// reads `<date> — <source> <detail>`.
	const rows = calendar.entries.map((entry) => {
		const detail = entry.detail ?? `${entry.count}`;
		return [entry.date, BREAKING_SOURCE_LABEL[entry.source], detail];
	});

	const lines: string[] = [];
	lines.push(
		`${calendar.total} breaking event${calendar.total === 1 ? "" : "s"}, most-recent first`,
	);
	lines.push(renderTable(["Date", "Source", "Detail"], rows, { color }));

	return panel("Breaking calendar", lines.join("\n"));
}

function changeFrequencyTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const frequency = data.changeFrequency;
	if (frequency === undefined || frequency.byKind.length === 0) {
		return panel("Change frequency", emptyState("tokens check"));
	}

	const items = frequency.byKind.map((bucket) => ({
		label: bucket.kind,
		value: bucket.count,
	}));

	const window =
		frequency.windowFirst !== undefined && frequency.windowLast !== undefined
			? `Records per kind · ${frequency.windowFirst} → ${frequency.windowLast}`
			: "Records per kind";

	const body = [window, renderBarChart(items, { width: 24, color })].join("\n");

	return panel("Change frequency", body);
}

function targetsTerminalSection(data: ReportData, color: boolean): string {
	const targets = data.targets;
	if (targets === undefined || targets.length === 0) {
		return panel("Targets / SLAs", emptyState("report"));
	}

	const COMPONENT_LABEL: Record<string, string> = {
		drift: "drift",
		lint: "lint",
		readiness: "readiness",
		a11y: "a11y",
		adoption: "on-system",
		parity: "parity",
	};

	// RAG band -> severity level: green meets, amber near, red misses, unknown not measured.
	const bandLevel = (
		band: "green" | "amber" | "red" | "unknown",
	): "ok" | "warn" | "error" | "info" =>
		band === "green"
			? "ok"
			: band === "amber"
				? "warn"
				: band === "red"
					? "error"
					: "info";

	const rows = targets.map((verdict) => [
		COMPONENT_LABEL[verdict.metric] ?? verdict.metric,
		verdict.measured === undefined ? "—" : String(verdict.measured),
		`${verdict.op} ${verdict.target}`,
		severityColor(bandLevel(verdict.band), verdict.band, { color }),
	]);

	const table = renderTable(["Metric", "Measured", "Target", "Status"], rows, {
		color,
	});

	const legend = [
		"green = meets target",
		"amber = near target",
		"red = misses target",
		"unknown = not measured",
	].join("  ·  ");

	return panel("Targets / SLAs", [table, legend].join("\n"));
}

function parityTrendTerminalSection(data: ReportData, _color: boolean): string {
	const trend = data.parityTrend;
	if (trend === undefined || trend.length === 0) {
		return panel("Parity trend", emptyState("registry build"));
	}

	const values = trend.map((point) => point.pct);
	const dateRange = `${trend[0]?.date ?? ""} → ${trend[trend.length - 1]?.date ?? ""}`;

	const body = [
		`parity %  ${sparkline(values)}`,
		`Component parity pass-% over ${dateRange}`,
	].join("\n");

	return panel("Parity trend", body);
}

function componentHealthTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const rows = data.componentHealth;
	if (rows === undefined || rows.length === 0) {
		return panel("Component health", emptyState("registry build"));
	}

	// The assembly hands rows pre-sorted worst-first; the renderer trusts that order.
	const tableRows = rows.map((row) => [
		row.component,
		String(row.healthScore),
		row.issues.length > 0 ? row.issues.join(", ") : "no issues",
	]);

	const table = renderTable(["Component", "Health", "Issues"], tableRows, {
		color,
	});

	const body = ["Composite health per component, worst-first", table].join(
		"\n",
	);

	return panel("Component health", body);
}

function libraryHealthTrendTerminalSection(
	data: ReportData,
	_color: boolean,
): string {
	const trend = data.libraryHealthTrend;
	if (trend === undefined || trend.length === 0) {
		return panel("Library health trend", emptyState("library-health"));
	}

	// §8 primitive mapping: trend artifact → sparkline, one per hygiene series,
	// all sharing the dated ordering the assembly handed us.
	const overrides = sparkline(trend.map((p) => p.overrides));
	const deprecated = sparkline(trend.map((p) => p.deprecated));
	const detached = sparkline(trend.map((p) => p.detached));

	const dateRange = `${trend[0]?.date ?? ""} → ${trend[trend.length - 1]?.date ?? ""}`;

	// Detached-candidate caveat is load-bearing (SPEC §1.3 honest scope): the
	// heuristic cannot truly detect detachment, so the detached series is qualified
	// at its render site. Copied verbatim from the library-health twin.
	const detachedCaveat =
		"Detached: — heuristic — REST cannot truly detect detachment; expect false positives.";

	const body = [
		`Overrides  ${overrides}`,
		`Deprecated ${deprecated}`,
		`Detached   ${detached}`,
		`over ${dateRange}`,
		detachedCaveat,
	].join("\n");

	return panel("Library health trend", body);
}

function migrationChecklistTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const checklist = data.migrationChecklist;
	if (checklist === undefined || checklist.sites.length === 0) {
		return panel("Migration checklist", emptyState("impact --checklist"));
	}

	// §8 primitive mapping: a per-call-site list → renderTable. Each row reads
	// site (file:line) · subject · from → to, pre-ordered + capped by the assembly.
	const headers = ["site", "subject", "from → to"];
	const rows = checklist.sites.map((site) => [
		`${site.file}:${site.line}`,
		site.subject,
		`${site.from} → ${site.to}`,
	]);

	const count = checklist.sites.length;
	const meta = `${count} call site${count === 1 ? "" : "s"} to migrate · file:line · subject · from → to`;

	// truncation note when sites were dropped at the cap (mirrors the HTML overflow).
	const overflow = checklist.truncated ? "… and more sites beyond the cap" : "";

	// Honest-scope caveat (SPEC §1 / A3a): mapCodeUsage scans resolved .ts/.tsx imports
	// only, so the site count is a floor. Preserved verbatim.
	const mapUsageCaveat =
		"import coverage counts resolved .ts/.tsx imports (barrels followed), so the number is a floor.";

	const body = [
		meta,
		renderTable(headers, rows, { color }),
		...(overflow !== "" ? [overflow] : []),
		mapUsageCaveat,
	].join("\n");

	return panel("Migration checklist", body);
}

function scoreVelocityTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const velocity = data.scoreVelocity;
	if (velocity === undefined) {
		return panel(
			"Score velocity",
			"No data yet — needs system scores from two different days — run ds-bridge record again on another day.",
		);
	}

	const { delta, windowDays, direction, regressionStreak } = velocity;

	// §8 primitive mapping: a windowed motion verdict → a plain text stat line
	// (NO chart). Direction arrow mirrors the assembly's classification verbatim;
	// the signed delta carries an explicit "+"/"−" so the number never reads
	// ambiguously. Arrow map preserved from the HTML twin.
	const ARROW: Record<"up" | "down" | "flat", string> = {
		up: "▲",
		down: "▼",
		flat: "▬",
	};
	const arrow = ARROW[direction];
	const signedDelta =
		delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0";

	// A non-zero regression streak reads as a warn-colored trailing badge; a clean
	// streak stays neutral at 0.
	const streakText =
		regressionStreak > 0
			? severityColor("warn", `${regressionStreak}-decline streak`, { color })
			: "0-decline streak";

	const headline = `${arrow} ${signedDelta} over ${windowDays} day${windowDays === 1 ? "" : "s"}`;

	const body = [headline, `${direction} · ${streakText}`].join("\n");

	return panel("Score velocity", body);
}

function ownershipLeaderboardTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const rows = data.ownershipLeaderboard;
	if (rows === undefined || rows.length === 0) {
		return panel(
			"Ownership leaderboard",
			"No data yet — needs owners — add ownership (or ownership_file, a CODEOWNERS file) to .ds-bridge.json, then run ds-bridge lint.",
		);
	}

	// §8 primitive mapping: per-owner on-system % → renderBarChart. The renderer
	// trusts the assembly's worst-first ordering; each bar's value is the owner's
	// precomputed on-system percentage.
	const bars = rows.map((row) => ({ label: row.owner, value: row.pct }));

	// Per-owner labels pair the pct with its refs/literals split so the
	// accountability number never stands alone (worst-first, css/scss + inline style values).
	const labels = rows
		.map(
			(row) =>
				`${row.owner}: ${row.pct}% · ${row.refs} refs / ${row.literals} literals`,
		)
		.join("\n");

	const body = [
		"On-system % by owner, worst-first · css/scss + inline style values",
		renderBarChart(bars, { width: 24, color }),
		labels,
	].join("\n");

	return panel("Ownership leaderboard", body);
}

function audienceChangelogTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const changelog = data.audienceChangelog;
	if (changelog === undefined || changelog.slices.length === 0) {
		return panel("Changelog by audience", emptyState("changelog"));
	}

	// The assembly hands slices pre-shaped (recent capped, breaking-first); the
	// renderer trusts that order. One row per audience: counts + a short recent
	// list (mirrors the HTML twin's two labeled columns).
	const headers = ["audience", "breaking", "additive", "cosmetic", "recent"];
	const rows = changelog.slices.map((slice) => [
		slice.audience,
		String(slice.breaking),
		String(slice.additive),
		String(slice.cosmetic),
		slice.recent.length > 0 ? slice.recent.join(", ") : "No recent entries",
	]);

	return panel("Changelog by audience", renderTable(headers, rows, { color }));
}

function frameImplementabilityTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const frame = data.frameImplementability;
	if (frame === undefined) {
		return panel("Frame implementability", emptyState("frame-impl"));
	}

	const { pct, resolved, total, gaps } = frame;

	// Gauge of the on-system pct + a gaps-by-reason bar chart. Preserve the HTML
	// twin's "N/M requirements resolve to the system" caption verbatim.
	const gauge = renderGauge(pct, {
		label: "Frame implementability",
		width: 24,
		color,
	});
	const meta = `${resolved}/${total} requirements resolve to the system`;

	const body = [gauge, meta];
	if (gaps.length > 0) {
		body.push(
			renderBarChart(
				gaps.map((gap) => ({ label: gap.reason, value: gap.count })),
				{ width: 24, color },
			),
		);
	}

	return panel("Frame implementability", body.join("\n"));
}

function releaseReadinessTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const readiness = data.releaseReadiness;
	// Absent — or a present-but-checkless rollup — degrades to the empty state.
	if (readiness === undefined || readiness.checks.length === 0) {
		return panel("Release readiness", emptyState("release-check"));
	}

	// go/no-go header line: green when go, red otherwise (RAG palette → severity).
	const verdict = readiness.go
		? severityColor("ok", "GO", { color })
		: severityColor("error", "NO-GO", { color });

	// One row per check: a mark (✓/✗) tinted by the same green/red, name, detail.
	// The assembly hands the rollup pre-composed; trust the per-check order.
	const headers = ["check", "pass", "detail"];
	const rows = readiness.checks.map((check) => [
		check.name,
		check.pass
			? severityColor("ok", "✓", { color })
			: severityColor("error", "✗", { color }),
		check.detail !== undefined && check.detail.length > 0 ? check.detail : "",
	]);

	return panel(
		"Release readiness",
		[verdict, renderTable(headers, rows, { color })].join("\n"),
	);
}

function dataFreshnessTerminalSection(
	data: ReportData,
	color: boolean,
): string {
	const rows = data.dataFreshness;
	if (rows === undefined || rows.length === 0) {
		return panel("Data freshness", emptyState("report"));
	}

	// Band → severity (mirrors matrix.ts SEVERITY + the HTML twin's RAG palette):
	// green = ok, amber = warn, red = fail/error, unknown = info (neutral, reads as
	// absence not a verdict). Inlined — the section imports no new modules.
	const BAND_SEVERITY: Record<
		"green" | "amber" | "red" | "unknown",
		"ok" | "warn" | "error" | "info"
	> = {
		green: "ok",
		amber: "warn",
		red: "error",
		unknown: "info",
	};

	// Human age label: never-run → "never"; 0 days → "today"; else "Nd ago".
	const ageLabel = (row: FreshnessRow): string => {
		if (row.ageDays === undefined) return "never";
		if (row.ageDays === 0) return "today";
		return `${row.ageDays}d ago`;
	};

	// Per-kind list (NOT a chart): kind | lastRun | age | band-colored band.
	// The renderer trusts the assembly's row order.
	const headers = ["kind", "lastRun", "age", "band"];
	const tableRows = rows.map((row) => [
		row.kind,
		row.lastRun ?? "never",
		ageLabel(row),
		severityColor(BAND_SEVERITY[row.band], row.band, { color }),
	]);

	return panel(
		"Data freshness",
		[
			"Measurement age per check-kind · band signals trust",
			renderTable(headers, tableRows, { color }),
		].join("\n"),
	);
}

// ─── Executive layer (AN7, SPEC-exec-report §4) — terminal twins ────────────

function executiveTerminalSection(data: ReportData, _color: boolean): string {
	const exec = data.executive;
	if (exec === undefined) {
		return panel("Executive summary", emptyState("record"));
	}
	const row = (label: string, value: string | undefined): string =>
		`${label.padEnd(17)}${value ?? "—"}`;
	const lines = [
		row(
			"System score",
			exec.health === undefined ? undefined : String(exec.health),
		),
		row(
			"Import coverage",
			exec.adoption === undefined ? undefined : `${exec.adoption}%`,
		),
		row(
			"Consistency",
			exec.consistency === undefined ? undefined : String(exec.consistency),
		),
		row(
			"Design debt",
			exec.debt === undefined ? undefined : `${exec.debt}/100`,
		),
	];
	const trend = exec.trend ?? [];
	if (trend.length >= 2) {
		lines.push(`${"Trend".padEnd(17)}${sparkline(trend.map((p) => p.score))}`);
	}
	return panel("Executive summary", lines.join("\n"));
}

function consistencyTerminalSection(data: ReportData, color: boolean): string {
	const consistency = data.consistency;
	if (consistency === undefined) {
		return panel("Consistency", emptyState("lint <dir>"));
	}
	const gauge = renderGauge(consistency.score, {
		label: "Consistency",
		width: 24,
		color,
	});
	const table = renderTable(
		["Signal", "Score", "Weight"],
		consistency.components.map((c) => [
			c.kind,
			String(c.score),
			String(c.weight),
		]),
		{ color },
	);
	return panel(
		"Consistency",
		[
			gauge,
			table,
			"overrides is a documented-opinion penalty (8 per hotspot)",
		].join("\n"),
	);
}

function designDebtTerminalSection(data: ReportData, color: boolean): string {
	const debt = data.debt;
	if (debt === undefined) {
		return panel("Design debt", emptyState("lint <dir>"));
	}
	const LEVEL_SEVERITY: Record<
		"low" | "medium" | "high",
		"ok" | "warn" | "error"
	> = { low: "ok", medium: "warn", high: "error" };
	const headline = `${debt.pct}/100 · ${severityColor(LEVEL_SEVERITY[debt.level], debt.level, { color })}`;
	if (debt.items.length === 0) return panel("Design debt", headline);
	const shown = debt.items.slice(0, 8);
	const table = renderTable(
		["Subject", "Kind", "Count", "Recommendation"],
		shown.map((i) => [i.subject, i.kind, String(i.count), i.recommendation]),
		{ color },
	);
	const more =
		debt.items.length > shown.length
			? [`… and ${debt.items.length - shown.length} more`]
			: [];
	return panel("Design debt", [headline, table, ...more].join("\n"));
}

function libraryHotspotsTrendTerminalSection(
	data: ReportData,
	_color: boolean,
): string {
	const trend = data.libraryHotspotsTrend;
	if (trend === undefined || trend.rows.length === 0) {
		return panel("Library hotspots trend", emptyState("library-health"));
	}
	const lines = [`Top components per signal · ${dateSpan(trend.dates)}`];
	for (const signal of SIGNAL_ORDER) {
		const rows = trend.rows.filter((r) => r.signal === signal);
		if (rows.length === 0) continue;
		const width = Math.max(...rows.map((r) => displayWidth(r.name)));
		lines.push("", SIGNAL_LABEL[signal]);
		for (const row of rows) {
			lines.push(`  ${padToWidth(row.name, width)}  ${hotspotDetail(row)}`);
		}
	}
	return panel("Library hotspots trend", lines.join("\n"));
}

function frameReadinessTrendTerminalSection(
	data: ReportData,
	_color: boolean,
): string {
	const trend = data.frameReadinessTrend;
	if (trend === undefined || trend.frames.length === 0) {
		return panel("Frame readiness trend", emptyState("handoff <frame-url>"));
	}
	const names = trend.frames.map((f) =>
		f.frameName === "" ? f.key : f.frameName,
	);
	const width = Math.max(...names.map((n) => displayWidth(n)));
	const lines = [
		belowGateMeta(trend),
		...trend.frames.map(
			(frame, i) =>
				`  ${padToWidth(names[i] ?? "", width)}  ${frameDetail(frame)}`,
		),
	];
	const more = frameOverflow(trend);
	if (more !== undefined) lines.push(more);
	return panel("Frame readiness trend", lines.join("\n"));
}

function handoffPassRateTerminalSection(
	data: ReportData,
	_color: boolean,
): string {
	const rate = data.handoffPassRate;
	if (rate === undefined || rate.frames === 0) {
		return panel("Handoff pass rate", emptyState("handoff <frame-url>"));
	}
	const lines = [`${rate.pct}% · ${passRateSub(rate)}`];
	const line = passRateTrendLine(rate);
	if (line !== undefined) lines.push(line);
	return panel("Handoff pass rate", lines.join("\n"));
}

/** Every artifact's terminal twin, keyed by id (the SECTION_RENDERERS analog). */
const SECTION_RENDERERS_TERMINAL: Record<
	ArtifactId,
	(data: ReportData, color: boolean) => string
> = {
	"system-score": systemScoreTerminalSection,
	"drift-trend": driftTrendTerminalSection,
	"lint-summary": lintSummaryTerminalSection,
	readiness: readinessTerminalSection,
	parity: parityTerminalSection,
	a11y: a11yTerminalSection,
	impact: impactTerminalSection,
	"adoption-trend": adoptionTrendTerminalSection,
	"import-coverage": importCoverageTerminalSection,
	leaderboard: leaderboardTerminalSection,
	"library-health": libraryHealthTerminalSection,
	"breaking-calendar": breakingCalendarTerminalSection,
	"change-frequency": changeFrequencyTerminalSection,
	targets: targetsTerminalSection,
	"parity-trend": parityTrendTerminalSection,
	"component-health": componentHealthTerminalSection,
	"library-health-trend": libraryHealthTrendTerminalSection,
	"migration-checklist": migrationChecklistTerminalSection,
	"score-velocity": scoreVelocityTerminalSection,
	"ownership-leaderboard": ownershipLeaderboardTerminalSection,
	"audience-changelog": audienceChangelogTerminalSection,
	"frame-implementability": frameImplementabilityTerminalSection,
	"release-readiness": releaseReadinessTerminalSection,
	"data-freshness": dataFreshnessTerminalSection,
	consistency: consistencyTerminalSection,
	"design-debt": designDebtTerminalSection,
	executive: executiveTerminalSection,
	"library-hotspots-trend": libraryHotspotsTrendTerminalSection,
	"frame-readiness-trend": frameReadinessTrendTerminalSection,
	"handoff-pass-rate": handoffPassRateTerminalSection,
};

/** Options for the terminal composer: the injected render instant + color + label. */
export interface RenderTerminalOptions {
	generatedAt: string;
	color: boolean;
	viewLabel?: string;
}

/**
 * Compose the terminal dashboard: a header (project · optional view label ·
 * generated-at) followed by each SELECTED artifact's twin, in selection order,
 * separated by blank lines. Selection-gating mirrors the HTML renderer: a
 * deselected id emits nothing; a selected-but-empty one keeps its empty-state.
 */
export function renderTerminalDashboard(
	data: ReportData,
	selection: readonly ArtifactId[],
	opts: RenderTerminalOptions,
): string {
	const headerLines = [`ds-bridge report · ${data.project}`];
	if (opts.viewLabel !== undefined) headerLines.push(`View: ${opts.viewLabel}`);
	headerLines.push(`Generated ${opts.generatedAt}`);
	const header = headerLines.join("\n");
	const sections = selection.map((id) =>
		SECTION_RENDERERS_TERMINAL[id](data, opts.color),
	);
	// Untrusted names (Figma components/frames, debt subjects…) are printed
	// raw above; strip any control sequence but our SGR colour at the boundary.
	return terminalSafe([header, ...sections].join("\n\n"));
}
