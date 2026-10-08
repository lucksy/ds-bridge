import type { ReportData } from "../../../engines/report/types.js";
import { debtTone, escapeHtml, kpiTile, panel } from "../base.js";
import { donutGauge, lineChart, PALETTE, toneFor } from "../charts.js";
import { CARD_W, dateEnds, emptyState } from "./shared.js";

/**
 * Executive summary → the four leadership headlines (system score · import
 * coverage · consistency · debt — the one-pager's names) as tiles + the score trend line when it has ≥ 2 points.
 * Absent headlines read "—" / not measured (absent-not-zero). Absent section →
 * the shared empty state.
 */
export function executiveSection(data: ReportData): string {
	const exec = data.executive;
	if (exec === undefined) {
		return panel("Executive summary", emptyState("record"));
	}
	const tiles = [
		kpiTile(
			"System score",
			exec.health === undefined ? undefined : String(exec.health),
			exec.health === undefined ? undefined : toneFor(exec.health),
			"out of 100",
		),
		kpiTile(
			"Import coverage",
			exec.adoption === undefined ? undefined : `${exec.adoption}%`,
			exec.adoption === undefined ? undefined : toneFor(exec.adoption),
			"components imported",
		),
		kpiTile(
			"Consistency",
			exec.consistency === undefined ? undefined : String(exec.consistency),
			exec.consistency === undefined ? undefined : toneFor(exec.consistency),
			"tokens · components · overrides",
		),
		kpiTile(
			"Design debt",
			exec.debt === undefined ? undefined : `${exec.debt}/100`,
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
export function consistencySection(data: ReportData): string {
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
export const DEBT_ITEMS_SHOWN = 8;

/**
 * Design debt → `pct% · level` stat + the itemized, worst-first list (subject ·
 * count · directed recommendation). A real zero-debt rollup renders "0%" with
 * no list (zero debt is meaningful, not an empty state).
 */
export function designDebtSection(data: ReportData): string {
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
			`<div class="stat"><span class="stat-value ${tone === "ok" ? "ok" : tone === "error" ? "error" : ""}">${escapeHtml(String(debt.pct))}/100</span><span class="stat-sub">${escapeHtml(debt.level)} · ${escapeHtml(String(debt.items.length))} item${debt.items.length === 1 ? "" : "s"}</span></div>`,
			items === "" ? "" : `<ul class="calendar stack">${items}</ul>`,
			more,
		].join(""),
	);
}
