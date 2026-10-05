// R4 (SPEC-rollup §4) — term / md / html renderers of the org rollup model.
import { describe, expect, it } from "vitest";
import {
	buildRollup,
	type RollupRepoInput,
} from "../../src/engines/rollup/rollup.js";
import { renderRollupHtml } from "../../src/render/html/rollup.js";
import { renderRollupMarkdown } from "../../src/render/markdown/rollup.js";
import { trendText } from "../../src/render/rollup-cells.js";
import { renderRollupTerm } from "../../src/render/terminal/rollup.js";

const NOW = "2026-10-05T12:00:00.000Z";
const j = (r: Record<string, unknown>) => JSON.stringify(r);
const hist = (lines: Record<string, unknown>[]) =>
	`${lines.map(j).join("\n")}\n`;

const inputs: RollupRepoInput[] = [
	{
		name: "web|<b>",
		source: "/r/web",
		team: "Web",
		load: {
			kind: "ok",
			text: hist([
				{
					at: "2026-10-01T00:00:00Z",
					kind: "lint",
					byKind: { exact: 0, near: 0, offSystem: 0 },
					adoption: { refs: 80, literals: 20 },
				},
				{ at: "2026-10-02T00:00:00Z", kind: "handoff", score: 70 },
				{ at: "2026-10-03T00:00:00Z", kind: "handoff", score: 90 },
			]),
		},
	},
	{
		name: "ios",
		source: "/r/ios@origin/ds-bridge-data",
		load: {
			kind: "missing",
			message:
				"No .ds-bridge/history.jsonl committed at origin/ds-bridge-data.",
		},
	},
];
const model = buildRollup(inputs, { nowIso: NOW });
const empty = buildRollup([], { nowIso: NOW });

describe("renderRollupTerm", () => {
	const out = renderRollupTerm(model);

	it("prints the aggregate and a ranked table with a sparkline", () => {
		expect(out).toContain("Org rollup — 2 repos (1 scored)");
		expect(out).toMatch(/Mean score\s+\d+/);
		expect(out).toContain("web|<b>");
		expect(out).toMatch(/[▁▂▃▄▅▆▇█]{2}/);
		expect(out).toContain("80%");
	});

	it("shows unmeasured values as — and lists notes", () => {
		const iosLine = out.split("\n").find((l) => l.includes("ios"));
		expect(iosLine).toContain("—");
		expect(out).toContain("Notes");
		expect(out).toContain("ios: No .ds-bridge/history.jsonl committed");
	});

	it("handles an empty rollup", () => {
		expect(renderRollupTerm(empty)).toContain("No repos");
	});

	it("spells out the drift columns (no s/m/o jargon)", () => {
		expect(out).not.toContain("s/m/o");
		expect(out).toContain("Drift = stale/missing/orphan tokens.");
	});
});

describe("renderRollupMarkdown", () => {
	const md = renderRollupMarkdown(model);

	it("renders a heading, aggregate and an escaped table", () => {
		expect(md).toContain("## Design-system org rollup");
		expect(md).toContain("| # | Repo |");
		// `|` cannot split the cell; `<b>` stays literal text.
		expect(md).toContain("web\\|\\<b\\>");
		expect(md).not.toContain("<b>");
		expect(md).toContain("default weights");
	});

	it("lists notes and the team breakdown", () => {
		expect(md).toContain("**ios**: No .ds-bridge/history.jsonl committed");
		expect(md).toContain("| Web |");
	});

	it("handles an empty rollup", () => {
		expect(renderRollupMarkdown(empty)).toContain("No repos");
	});

	it("labels drift like the PR scorecard and explains the drill-down", () => {
		expect(md).not.toContain("s/m/o");
		expect(md).toContain("| Drift (stale/missing/orphan) |");
		expect(md).toContain(
			"so its score can differ from the default-weight rollup",
		);
	});
});

describe("renderRollupHtml", () => {
	const html = renderRollupHtml(model);

	it("is one offline, script-free document", () => {
		expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
		expect(html).not.toContain("<script");
		expect(html).not.toMatch(/(src|href)="https?:/);
		expect(html).toContain("<title>Design system org rollup</title>");
	});

	it("escapes caller strings and draws the charts", () => {
		expect(html).toContain("web|&lt;b&gt;");
		expect(html).not.toContain("web|<b>");
		expect(html).toContain("<svg");
		expect(html).toContain('class="kpi');
	});

	it("is byte-stable", () => {
		expect(renderRollupHtml(buildRollup(inputs, { nowIso: NOW }))).toBe(html);
	});

	it("handles an empty rollup", () => {
		expect(renderRollupHtml(empty)).toContain("No repos");
	});

	it("skips one-point trends and says when trends will appear", () => {
		expect(html).not.toContain("s/m/o");
		const single = buildRollup(
			[
				{
					name: "solo",
					source: "/r/solo",
					load: {
						kind: "ok",
						text: hist([
							{ at: "2026-10-02T00:00:00Z", kind: "handoff", score: 70 },
						]),
					},
				},
			],
			{ nowIso: NOW },
		);
		expect(renderRollupHtml(single)).toContain(
			"Trends appear after a second recorded run.",
		);
		expect(html).not.toContain("Trends appear after a second recorded run.");
	});
});

describe("trendText", () => {
	it("is — for fewer than two points (one run is not a trend)", () => {
		const [repo] = buildRollup(
			[
				{
					name: "solo",
					source: "/r/solo",
					load: {
						kind: "ok",
						text: hist([
							{ at: "2026-10-02T00:00:00Z", kind: "handoff", score: 70 },
						]),
					},
				},
			],
			{ nowIso: NOW },
		).repos;
		expect(repo && trendText(repo)).toBe("—");
	});
});

// Review fix — numeric columns stay right-aligned when a row is unmeasured ("—").
describe("renderRollupTerm — alignment with a missing source", () => {
	const out = renderRollupTerm(model);
	const rows = out
		.split("\n")
		.filter((l) => l.startsWith("│") && !l.includes("Repo"));
	const repoRows = rows.filter(
		(l) => l.includes("web|<b>") || l.includes("ios"),
	);

	/** A cell is right-aligned when its only trailing space is the pad. */
	const rightAligned = (cell: string) =>
		cell.endsWith(" ") && !cell.endsWith("  ");

	it("right-aligns #, Score, On-system, Contrast and Readiness for every row, dash or not", () => {
		expect(repoRows).toHaveLength(2);
		for (const row of repoRows) {
			const cells = row.split("│");
			// cells[0] is "" (before the first border); columns follow.
			for (const column of [1, 3, 5, 7, 8]) {
				const cell = cells[column] ?? "";
				expect(rightAligned(cell), `column ${column} of ${row}`).toBe(true);
			}
		}
	});
});

describe("renderRollupHtml — many repos", () => {
	it("charts the 5 highest-ranked trends, each in its own colour, and says how many more", () => {
		const many = buildRollup(
			Array.from({ length: 8 }, (_, i) => ({
				name: `repo-${i}`,
				source: `/r/${i}`,
				load: {
					kind: "ok" as const,
					text: hist(
						[1, 2].map((d) => ({
							at: `2026-10-0${d}T00:00:00Z`,
							kind: "handoff",
							score: 50 + i * 5 + d,
						})),
					),
				},
			})),
			{ nowIso: NOW },
		);
		const html = renderRollupHtml(many);
		const chart = html.slice(html.indexOf("<h2>Score trends</h2>"));
		const svg = chart.slice(0, chart.indexOf("</svg>"));
		const strokes = [...svg.matchAll(/<polyline[^>]*stroke="([^"]+)"/g)].map(
			(m) => m[1],
		);
		expect(strokes).toHaveLength(5);
		expect(new Set(strokes).size).toBe(5);
		// Highest-ranked first: repo-7 (best score) is drawn, repo-0 is not.
		expect(svg).toContain("repo-7");
		expect(svg).not.toContain("repo-0");
		expect(chart).toContain(
			"Showing the 5 highest-ranked repos; 3 more in the Repos table.",
		);
	});
});
