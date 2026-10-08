import { escapeHtml } from "../base.js";

// Chart widths that match the cards they sit in (a 1200px page, 3 columns), so
// the SVG draws at 1:1 and its 11–12px labels stay 11–12px. Narrower screens
// scale them down.
export const CARD_W = 332;
export const WIDE_W = 720;

/** The first and last date of a dated trend, for a line chart's x axis. */
export function dateEnds(trend: readonly { date: string }[]): [string, string] {
	return [trend[0]?.date ?? "", trend[trend.length - 1]?.date ?? ""];
}

/** "2026-06-01T10:00:00.000Z" → "2026-06-01"; other text unchanged. */
export function dayOf(value: string): string {
	return /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : value;
}

/** A styled "no data yet" panel body shown when a section is absent. */
/** An empty state whose fix is not a single command: say what is needed. */
export function emptyHint(text: string): string {
	return [
		'<div class="empty">',
		'<span class="empty-title">No data yet</span>',
		`<span>${escapeHtml(text)}</span>`,
		"</div>",
	].join("");
}

export function emptyState(command: string): string {
	return [
		'<div class="empty">',
		'<span class="empty-title">No data yet</span>',
		`<span>Run <code>ds-bridge ${escapeHtml(command)}</code> to populate this section.</span>`,
		"</div>",
	].join("");
}
