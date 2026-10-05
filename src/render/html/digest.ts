// F7 — the digest as one self-contained HTML page (SPEC-figma-trends §4), for a
// GitHub Pages site next to the dashboard. PURE: identical input → identical
// bytes; no clock/fs/network. Offline-safe: inline <style> only — no script,
// link, @import or url(). Reads the SAME `digestDocument` as the markdown
// renderer, so the two can never disagree.
import type { DigestModel } from "../../engines/report/digest.js";
import {
	type DigestView,
	digestDocument,
} from "../../engines/report/digest-md.js";
import { escapeHtml } from "./base.js";

const STYLE = `
:root { --bg: #f6f5f1; --surface: #ffffff; --text: #1f1e1b; --text-subtle: #6b6a63; --border: #e6e3da; --accent: #a3384b; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 17px; margin: 28px 0 8px; }
.window, .quiet { color: var(--text-subtle); margin: 0; font-style: italic; }
ul, ol { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin: 0; padding: 12px 16px 12px 36px; }
li { margin: 4px 0; font-variant-numeric: tabular-nums; }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f6e9ec; color: var(--accent); padding: 1px 5px; border-radius: 5px; }
`.trim();

/** Escape text, turning `backtick spans` into <code>. */
function inline(text: string): string {
	return text
		.split("`")
		.map((part, i) =>
			i % 2 === 1 ? `<code>${escapeHtml(part)}</code>` : escapeHtml(part),
		)
		.join("");
}

/** Render the digest model as one offline HTML page. */
export function renderDigestHtml(
	model: DigestModel,
	view?: DigestView,
): string {
	const doc = digestDocument(model, view);
	const body: string[] = [`<h1>${escapeHtml(doc.title)}</h1>`];
	if (doc.quiet !== undefined) {
		body.push(`<p class="quiet">${escapeHtml(doc.quiet)}</p>`);
	}
	if (doc.window !== undefined) {
		body.push(`<p class="window">${escapeHtml(doc.window)}</p>`);
	}
	for (const section of doc.sections) {
		body.push(
			`<h2>${escapeHtml(section.heading)}</h2>`,
			`<ul>${section.lines.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`,
		);
	}
	if (doc.actions.length > 0) {
		body.push(
			"<h2>Actions</h2>",
			`<ol>${doc.actions.map((a) => `<li>${inline(a)}</li>`).join("")}</ol>`,
		);
	}
	return [
		"<!DOCTYPE html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${escapeHtml(doc.title)}</title>`,
		`<style>${STYLE}</style>`,
		"</head>",
		"<body>",
		`<main>${body.join("\n")}</main>`,
		"</body>",
		"</html>",
		"",
	].join("\n");
}
