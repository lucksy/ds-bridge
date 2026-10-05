// X6 — the one-page HTML manager report (SPEC-exec-report §5.2). PURE: a
// ManagerReport in → one offline, self-contained, script-free document out
// (inline <style> only — the dashboard STYLE plus a few one-pager rules),
// byte-stable for a given input. Every caller-supplied string is escaped.
import {
	DEBT_INDEX_NOTE,
	frameLabel,
	kindLabel,
	type ManagerReport,
	onSystemChangeText,
	scoreChangeText,
	targetLabel,
	targetOp,
	targetValue,
} from "../../engines/report/manager-report.js";
import type { TargetVerdict } from "../../engines/report/types.js";
import {
	debtTone,
	escapeHtml,
	kpiTile,
	panel,
	type RawHtml,
	readableInstant,
	STYLE,
	tableHtml,
} from "./base.js";
import { TONE, toneFor } from "./charts.js";

/** One-pager additions on top of the dashboard STYLE (print-friendly). */
const PAGE_STYLE = `
.page { max-width: 960px; }
.page .grid { grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); }
ol.ranked { margin: 0; padding-left: 20px; font-size: 14px; }
ol.ranked li { padding: 4px 0; }
.empty-line { color: var(--text-subtle); font-size: 13px; margin: 0; }
@media print {
	body { background: #ffffff; }
	header.dash { background: #ffffff; color: var(--text); border-bottom: 1px solid var(--border); }
	header.dash .generated { color: var(--text-subtle); }
	section.panel, .kpi { break-inside: avoid; }
}
`.trim();

function emptyLine(text: string): string {
	return `<p class="empty-line">${escapeHtml(text)}</p>`;
}

function ranked(items: readonly string[], empty: string): string {
	if (items.length === 0) return emptyLine(empty);
	return `<ol class="ranked">${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ol>`;
}

const STATUS: Record<TargetVerdict["band"], { text: string; fill: string }> = {
	green: { text: "On track", fill: TONE.ok },
	amber: { text: "At risk", fill: TONE.warn },
	red: { text: "Off track", fill: TONE.error },
	unknown: { text: "Not measured", fill: TONE.neutral },
};

function days(n: number): string {
	return `${n} ${n === 1 ? "day" : "days"}`;
}

function age(n: number | undefined): string {
	if (n === undefined) return "age unknown";
	return n === 0 ? "today" : `${n}d ago`;
}

const FRAMES_SHOWN = 10;

/** Render the manager report as one offline HTML page. Pure. */
export function renderManagerHtml(report: ManagerReport): string {
	const h = report.headline;
	const project = escapeHtml(report.project);

	const tiles = [
		kpiTile(
			"System score",
			h.score === undefined ? undefined : String(h.score.current),
			h.score === undefined ? undefined : toneFor(h.score.current),
			scoreChangeText(h, report.windowDays) ?? "out of 100",
		),
		kpiTile(
			"On-system usage",
			h.onSystem === undefined ? undefined : `${h.onSystem.pct}%`,
			h.onSystem === undefined ? undefined : toneFor(h.onSystem.pct),
			onSystemChangeText(h) ?? "tokens vs literals",
		),
		kpiTile(
			"Component import coverage",
			h.importCoverage === undefined ? undefined : `${h.importCoverage.pct}%`,
			h.importCoverage === undefined
				? undefined
				: toneFor(h.importCoverage.pct),
			h.importCoverage === undefined
				? undefined
				: `${h.importCoverage.imported} of ${h.importCoverage.total} components`,
		),
		kpiTile(
			"Consistency",
			h.consistency === undefined ? undefined : String(h.consistency),
			h.consistency === undefined ? undefined : toneFor(h.consistency),
			"out of 100",
		),
		kpiTile(
			"Design debt",
			h.debt === undefined ? undefined : `${h.debt.pct}/100`,
			h.debt === undefined ? undefined : debtTone(h.debt.pct),
			h.debt === undefined ? undefined : `${h.debt.level} · lower is better`,
		),
		kpiTile(
			"Handoff readiness",
			h.handoff === undefined
				? undefined
				: `${h.handoff.ready}/${h.handoff.frames}`,
			h.handoff === undefined
				? undefined
				: toneFor((100 * h.handoff.ready) / h.handoff.frames),
			"frames at the readiness bar",
		),
	].join("");

	const targets =
		report.targets.length === 0
			? emptyLine(
					"No targets set. Add metric_targets to .ds-bridge.json to track goals.",
				)
			: tableHtml(
					["Target", "Now", "Goal", "Status"],
					report.targets.map((t) => {
						const status = STATUS[t.band];
						const badge: RawHtml = {
							html: `<span class="badge" style="background:${status.fill};color:#ffffff">${escapeHtml(status.text)}</span>`,
						};
						return [
							targetLabel(t.metric),
							targetValue(t.metric, t.measured),
							`${targetOp(t.op)} ${targetValue(t.metric, t.target)}`,
							badge,
						];
					}),
				);

	const shownFrames = report.frames.slice(0, FRAMES_SHOWN);
	const frames =
		report.frames.length === 0
			? emptyLine(
					"No handoff checks yet. Run ds-bridge handoff <frame-url> to track frame readiness.",
				)
			: [
					tableHtml(
						["Frame", "Readiness", "Pass rate", "Runs"],
						shownFrames.map((f) => [
							frameLabel(f),
							String(f.latest),
							`${f.passRate}%`,
							String(f.runs),
						]),
					),
					report.frames.length > shownFrames.length
						? `<div class="meta">… and ${escapeHtml(String(report.frames.length - shownFrames.length))} more frames</div>`
						: "",
				].join("");

	const { measured, stale, never } = report.coverage;
	const coverageItems: string[] = [];
	if (measured.length > 0) {
		coverageItems.push(
			`<li><span class="date">Measured</span><span class="detail">${escapeHtml(measured.map((m) => `${kindLabel(m.kind)} (${age(m.ageDays)})`).join(", "))}</span></li>`,
		);
	}
	if (stale.length > 0) {
		coverageItems.push(
			`<li><span class="date">Stale</span><span class="detail">${escapeHtml(stale.map((m) => `${kindLabel(m.kind)} (${age(m.ageDays)})`).join(", "))}</span></li>`,
		);
	}
	if (never.length > 0) {
		coverageItems.push(
			`<li><span class="date">Never measured</span><span class="detail">${escapeHtml(never.map(kindLabel).join(", "))}</span></li>`,
		);
	}
	const coverage =
		coverageItems.length === 0
			? emptyLine("No checks recorded yet. Run ds-bridge record.")
			: `<ul class="calendar stack">${coverageItems.join("")}</ul>`;

	const body = [
		'<header class="dash"><div class="bar">',
		`<h1>Design system report · <span class="project">${project}</span></h1>`,
		`<span class="generated">${escapeHtml(readableInstant(report.generatedAt))} · last ${escapeHtml(days(report.windowDays))}</span>`,
		"</div></header>",
		'<div class="wrap page">',
		`<div class="kpis">${tiles}</div>`,
		'<div class="grid">',
		panel("Top risks", ranked(report.risks, "No risks flagged.")),
		panel("Next actions", ranked(report.actions, "Nothing urgent.")),
		panel("Targets", targets),
		panel("Handoff readiness by frame", frames),
		panel("Data coverage", coverage),
		"</div>",
		h.debt !== undefined
			? `<div class="meta">${escapeHtml(DEBT_INDEX_NOTE)}</div>`
			: "",
		'<div class="meta">Generated by ds-bridge (report --format exec-html) from .ds-bridge/history.jsonl. Numbers marked “not measured” were never recorded; they are not zero.</div>',
		"</div>",
	].join("");

	return [
		"<!DOCTYPE html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		`<title>Design system report · ${project}</title>`,
		`<style>${STYLE}\n${PAGE_STYLE}</style>`,
		"</head>",
		"<body>",
		body,
		"</body>",
		"</html>",
		"",
	].join("\n");
}
