// Shared building blocks for every offline ds-bridge HTML page (dashboard,
// manager one-pager, rollup, digest, site index). PURE string building.
//
// Contract: every helper here ESCAPES the text it is given. The one way to put
// trusted markup into a table cell is an explicit {@link RawHtml} — so a plain
// string from Figma, a config or git can never become markup by accident.
import { debtLevel } from "../../engines/report/debt.js";

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

export type Tone = "ok" | "warn" | "error";

/** The KPI tone of a design-debt index — from the engine's own level bands. */
export function debtTone(pct: number): Tone {
	const level = debtLevel(pct);
	return level === "low" ? "ok" : level === "medium" ? "warn" : "error";
}

/** A titled card; `wide` spans two grid columns. `body` is markup. */
export function panel(title: string, body: string, size?: "wide"): string {
	return [
		size === "wide"
			? '<section class="panel wide">'
			: '<section class="panel">',
		`<h2>${escapeHtml(title)}</h2>`,
		body,
		"</section>",
	].join("");
}

/**
 * One KPI tile. An unmeasured value reads "—" with "not measured" below it
 * (never 0); the tone only colours a measured value.
 */
export function kpiTile(
	label: string,
	value: string | undefined,
	tone: Tone | undefined,
	sub?: string,
): string {
	const measured = value !== undefined;
	return [
		`<div class="kpi${measured && tone !== undefined ? ` ${tone}` : ""}">`,
		`<span class="kpi-label">${escapeHtml(label)}</span>`,
		`<span class="kpi-value">${escapeHtml(value ?? "—")}</span>`,
		`<span class="kpi-sub">${escapeHtml(measured ? (sub ?? "") : "not measured")}</span>`,
		"</div>",
	].join("");
}

/** Trusted markup for a table cell (e.g. a status badge we built). */
export interface RawHtml {
	html: string;
}

/** A data table. Plain-string cells are escaped; only {@link RawHtml} is not. */
export function tableHtml(
	headers: readonly string[],
	rows: readonly (readonly (string | RawHtml)[])[],
): string {
	const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
	const body = rows
		.map(
			(r) =>
				`<tr>${r.map((c) => `<td>${typeof c === "string" ? escapeHtml(c) : c.html}</td>`).join("")}</tr>`,
		)
		.join("");
	return `<table class="weights"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
