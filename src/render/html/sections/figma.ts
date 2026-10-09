import type { ReportData } from "../../../engines/report/types.js";
import {
	belowGateMeta,
	dateSpan,
	EXCEPTIONS_NOTE,
	exceptionDetail,
	exceptionsMeta,
	frameDetail,
	frameOverflow,
	hotspotDetail,
	passRateSub,
	passRateTrendLine,
	SIGNAL_LABEL,
	SIGNAL_ORDER,
} from "../../figma-trend-format.js";
import { escapeHtml, panel } from "../base.js";
import { toneFor } from "../charts.js";
import { emptyState } from "./shared.js";

/**
 * Library hotspots trend (F6) → one list per hygiene signal: component · text
 * sparkline · latest (Δ) · status. Unknown points (below the stored top-N) are
 * skipped in the sparkline and shown as "below top N", never as resolved.
 */
export function libraryHotspotsTrendSection(data: ReportData): string {
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
 * Recurring exceptions (X3) → one row per recurring deviation, the ones still
 * needing an owner first: component · signal · latest · runs · state · owner.
 */
export function exceptionsReviewSection(data: ReportData): string {
	const review = data.exceptionsReview;
	if (review === undefined || review.rows.length === 0) {
		return panel("Recurring exceptions", emptyState("library-health"));
	}
	const items = review.rows
		.map(
			(row) =>
				`<li><code>${escapeHtml(row.name)}</code><span class="detail">${escapeHtml(exceptionDetail(row, review.dates.length))}</span></li>`,
		)
		.join("");
	return panel(
		"Recurring exceptions",
		[
			`<div class="meta">${escapeHtml(exceptionsMeta(review))}</div>`,
			`<ul class="calendar stack">${items}</ul>`,
			`<div class="meta">${escapeHtml(EXCEPTIONS_NOTE)}</div>`,
		].join(""),
		"wide",
	);
}

/**
 * Frame readiness trend (F6) → one row per frame, frames below the gate first:
 * frame · sparkline · latest (Δ) · gate marker · runs.
 */
export function frameReadinessTrendSection(data: ReportData): string {
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
export function handoffPassRateSection(data: ReportData): string {
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
