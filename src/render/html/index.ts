// M11.1 — the static-site index page (SPEC-personas §7). PURE string building:
// a list of published-dashboard entries in → one self-contained HTML document
// out, reusing the dashboard's STYLE + escapeHtml. Links are RELATIVE
// (`./<name>.html`) so the site works at any URL with no basePath, and there is
// NO live timestamp — the index is snapshot-stable (identical entries → identical
// bytes), which is what makes a committed site diff reviewable.
import { escapeHtml, STYLE } from "./dashboard.js";

/** One published dashboard: its display name + the relative href of its page. */
export interface IndexEntry {
	name: string;
	href: string;
}

/**
 * Render the site index: a titled grid of cards, one per entry, each linking to
 * its dashboard page. Reuses the dashboard `.wrap`/`.grid`/`.panel` CSS. Empty
 * entries → a single empty-state panel. Deterministic (no clock).
 */
export function renderIndex(entries: readonly IndexEntry[]): string {
	const cards =
		entries.length > 0
			? entries
					.map((entry) =>
						[
							'<section class="panel">',
							`<h2><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.name)}</a></h2>`,
							"</section>",
						].join(""),
					)
					.join("")
			: [
					'<section class="panel">',
					'<div class="empty">',
					'<span class="empty-title">No dashboards published</span>',
					"<span>Configure <code>publish</code> or pass <code>--dashboards</code>.</span>",
					"</div>",
					"</section>",
				].join("");

	const body = [
		'<div class="wrap">',
		'<header class="dash">',
		"<h1>ds-bridge dashboards</h1>",
		"</header>",
		'<div class="grid">',
		cards,
		"</div>",
		"</div>",
	].join("");

	return [
		"<!DOCTYPE html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		"<title>ds-bridge dashboards</title>",
		`<style>${STYLE}</style>`,
		"</head>",
		"<body>",
		body,
		"</body>",
		"</html>",
		"",
	].join("\n");
}
