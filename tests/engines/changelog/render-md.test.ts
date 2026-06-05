// T7.13 — audience-segmented markdown renderer. Golden tests: the exact output
// IS the contract (inline expected strings). Layout:
//
//   # Changelog
//
//   ## For designers       (audience designer + both)
//   ### <date>
//   - **[badge]** title — detail
//
//   ## For developers      (audience developer + both)
//   ### <date>
//   - **[badge]** title — detail
//
// `both`-audience entries appear in BOTH sections. A single-audience filter
// renders just that one section (no heading for the other). Within a date group
// entries keep the engine's order (already sorted). Pure string building — no I/O.
import { describe, expect, it } from "vitest";
import type { ChangelogEntry } from "../../../src/engines/changelog/aggregate.js";
import { renderChangelogMarkdown } from "../../../src/engines/changelog/render-md.js";

function entry(partial: Partial<ChangelogEntry>): ChangelogEntry {
	return {
		id: "x",
		dateIso: "2026-06-04T18:22:10.000Z",
		source: "code",
		audience: "developer",
		severity: "notable",
		title: "untitled",
		...partial,
	};
}

describe("renderChangelogMarkdown", () => {
	it("renders an empty changelog with a friendly note", () => {
		const md = renderChangelogMarkdown([], {});
		expect(md).toBe("# Changelog\n\n_No changes in the selected window._\n");
	});

	it("renders both sections with a heading, date group, and severity badge", () => {
		const md = renderChangelogMarkdown(
			[
				entry({
					id: "code:a",
					source: "code",
					audience: "developer",
					severity: "notable",
					title: "add date picker",
					detail: "Avery",
				}),
				entry({
					id: "figma:b",
					source: "figma",
					audience: "designer",
					severity: "notable",
					title: "Button hover state",
				}),
			],
			{},
		);
		expect(md).toBe(
			[
				"# Changelog",
				"",
				"## For designers",
				"",
				"### 2026-06-04",
				"",
				"- **[notable]** Button hover state",
				"",
				"## For developers",
				"",
				"### 2026-06-04",
				"",
				"- **[notable]** add date picker — Avery",
				"",
			].join("\n"),
		);
	});

	it("places a `both`-audience entry in both designer and developer sections", () => {
		const md = renderChangelogMarkdown(
			[
				entry({
					id: "tokens:c",
					source: "tokens",
					audience: "both",
					severity: "breaking",
					title: "Token removed: color.old",
					detail: "was color = #000",
				}),
			],
			{},
		);
		expect(md).toBe(
			[
				"# Changelog",
				"",
				"## For designers",
				"",
				"### 2026-06-04",
				"",
				"- **[breaking]** Token removed: color.old — was color = #000",
				"",
				"## For developers",
				"",
				"### 2026-06-04",
				"",
				"- **[breaking]** Token removed: color.old — was color = #000",
				"",
			].join("\n"),
		);
	});

	it("filters to a single audience and renders only that section", () => {
		const md = renderChangelogMarkdown(
			[
				entry({
					id: "code:a",
					audience: "developer",
					severity: "minor",
					title: "fix overflow",
				}),
				entry({
					id: "figma:b",
					audience: "designer",
					severity: "notable",
					title: "New cover art",
				}),
			],
			{ audience: "developer" },
		);
		expect(md).toBe(
			[
				"# Changelog",
				"",
				"## For developers",
				"",
				"### 2026-06-04",
				"",
				"- **[minor]** fix overflow",
				"",
			].join("\n"),
		);
	});

	it("includes a `both` entry when filtering to designers only", () => {
		const md = renderChangelogMarkdown(
			[
				entry({
					id: "tokens:c",
					audience: "both",
					severity: "breaking",
					title: "Token changed: color.primary",
				}),
				entry({
					id: "code:a",
					audience: "developer",
					severity: "notable",
					title: "dev-only thing",
				}),
			],
			{ audience: "designer" },
		);
		expect(md).toBe(
			[
				"# Changelog",
				"",
				"## For designers",
				"",
				"### 2026-06-04",
				"",
				"- **[breaking]** Token changed: color.primary",
				"",
			].join("\n"),
		);
	});

	it("groups entries by date (desc), each date as its own ### heading", () => {
		const md = renderChangelogMarkdown(
			[
				entry({
					id: "code:new",
					dateIso: "2026-06-04T10:00:00.000Z",
					audience: "developer",
					severity: "notable",
					title: "newer",
				}),
				entry({
					id: "code:old",
					dateIso: "2026-06-01T10:00:00.000Z",
					audience: "developer",
					severity: "minor",
					title: "older",
				}),
			],
			{},
		);
		expect(md).toBe(
			[
				"# Changelog",
				"",
				"## For developers",
				"",
				"### 2026-06-04",
				"",
				"- **[notable]** newer",
				"",
				"### 2026-06-01",
				"",
				"- **[minor]** older",
				"",
			].join("\n"),
		);
	});

	it("renders a single-audience filter with no matching entries as the empty note", () => {
		const md = renderChangelogMarkdown(
			[entry({ audience: "developer", title: "dev thing" })],
			{ audience: "designer" },
		);
		expect(md).toBe("# Changelog\n\n_No changes in the selected window._\n");
	});

	it("escapes characters that would break a markdown list line", () => {
		const md = renderChangelogMarkdown(
			[
				entry({
					id: "code:a",
					audience: "developer",
					severity: "notable",
					title: "feat: handle a*b and _c_",
				}),
			],
			{},
		);
		// Asterisks and underscores in the title are escaped so they render literally.
		expect(md).toContain("- **[notable]** feat: handle a\\*b and \\_c\\_");
	});
});
