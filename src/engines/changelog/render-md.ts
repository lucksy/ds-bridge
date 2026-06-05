// T7.13 — audience-segmented markdown renderer. Turns aggregated changelog
// entries (T7.12) into a designer/developer-split markdown document. PURE string
// building — no I/O, no clock; the input is the already-sorted entry list.
//
// `both`-audience entries appear under BOTH sections. A single-audience filter
// renders only that one section. The exact output shape is pinned by the golden
// tests in render-md.test.ts.
import type {
	ChangelogAudience,
	ChangelogEntry,
	ChangelogSeverity,
} from "./aggregate.js";

export interface RenderMarkdownOptions {
	/**
	 * Restrict the document to one audience. `designer` keeps designer + both;
	 * `developer` keeps developer + both; omitted (or `both`) renders both sections.
	 */
	audience?: ChangelogAudience;
}

const EMPTY = "# Changelog\n\n_No changes in the selected window._\n";

/** The two rendered sections, in order, with their heading and audience filter. */
const SECTIONS: { heading: string; audience: "designer" | "developer" }[] = [
	{ heading: "## For designers", audience: "designer" },
	{ heading: "## For developers", audience: "developer" },
];

/** Severity badge shown at the head of each list item. */
function badge(severity: ChangelogSeverity): string {
	return `**[${severity}]**`;
}

/** Calendar date (YYYY-MM-DD) of an entry, for date grouping. */
function dateKey(entry: ChangelogEntry): string {
	return entry.dateIso.slice(0, 10);
}

/**
 * Escape the markdown inline-emphasis characters so titles/details render
 * literally and never break the list line. Backslash first to avoid double-escape.
 */
function escapeInline(text: string): string {
	return text.replace(/([\\*_`])/g, "\\$1");
}

/** Whether an entry belongs in a given section (the audience matches, or `both`). */
function inSection(
	entry: ChangelogEntry,
	sectionAudience: "designer" | "developer",
): boolean {
	return entry.audience === sectionAudience || entry.audience === "both";
}

/** Render one entry as a markdown list item: `- **[badge]** title — detail`. */
function renderItem(entry: ChangelogEntry): string {
	const head = `- ${badge(entry.severity)} ${escapeInline(entry.title)}`;
	if (entry.detail === undefined || entry.detail.trim() === "") return head;
	return `${head} — ${escapeInline(entry.detail)}`;
}

/** Render one section's body (date groups), or undefined when it has no entries. */
function renderSection(
	heading: string,
	entries: ChangelogEntry[],
): string | undefined {
	if (entries.length === 0) return undefined;

	const lines: string[] = [heading, ""];

	let currentDate: string | undefined;
	for (const entry of entries) {
		const date = dateKey(entry);
		if (date !== currentDate) {
			// Blank line between consecutive date groups (not before the first).
			if (currentDate !== undefined) lines.push("");
			lines.push(`### ${date}`, "");
			currentDate = date;
		}
		lines.push(renderItem(entry));
	}
	lines.push("");
	return lines.join("\n");
}

/**
 * Render the aggregated entries to audience-segmented markdown. Entries are
 * assumed pre-sorted (date-desc) by the aggregation engine.
 */
export function renderChangelogMarkdown(
	entries: ChangelogEntry[],
	options: RenderMarkdownOptions,
): string {
	const wanted = options.audience;

	const sectionBlocks: string[] = [];
	for (const section of SECTIONS) {
		// Skip a section the audience filter excludes.
		if (
			wanted !== undefined &&
			wanted !== "both" &&
			wanted !== section.audience
		) {
			continue;
		}
		const sectionEntries = entries.filter((entry) =>
			inSection(entry, section.audience),
		);
		const block = renderSection(section.heading, sectionEntries);
		if (block !== undefined) sectionBlocks.push(block);
	}

	if (sectionBlocks.length === 0) return EMPTY;

	return `# Changelog\n\n${sectionBlocks.join("\n")}`;
}
