// Markdown text safety, shared by the paste-ready Markdown renderers. PURE.
//
// Names and messages reach these documents from untrusted places — Figma frame
// names, rollup.json repo/team names, git stderr — and the output is pasted
// into GitHub, Confluence, Notion or Slack, whose Markdown importers differ.
// So every such string is ONE line with Markdown's active characters
// backslash-escaped: a frame named `<img onerror=…>` or `[x](javascript:…)`
// stays literal text, `|` cannot split a table cell, `*`/`_` cannot open
// emphasis. Our own prose carries no Markdown, so escaping it is invisible.
const ACTIVE = /[\\`*_[\]<>|~]/g;

/** Untrusted inline text (or a whole table cell): one line, escaped. */
export function mdText(text: string): string {
	return text.replace(/\s*\r?\n\s*/g, " ").replace(ACTIVE, (c) => `\\${c}`);
}
