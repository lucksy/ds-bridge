// The insights pane's chart system: which kind the data picks, the terminal
// grids, the history the pane reads, and the Desktop SVG for every kind.
import { describe, expect, test } from "claude-code/testing";
import {
	brailleLine,
	gridRuns,
	gridText,
	heatmapGrid,
	waffleGrid,
} from "../hooks/insights/cell-grid.js";
import { resolveKind } from "../hooks/insights/chart-kinds.js";
import {
	historySection,
	parseHistory,
} from "../hooks/insights/ds-bridge-data.js";
import { chartSvg } from "../hooks/insights/echarts-svg.js";
import { PALETTES } from "../hooks/insights/palette.js";
import { terminalChart } from "../hooks/insights/text-charts.js";
import type { InsightChart } from "../types";

const chart = (fields: Partial<InsightChart>): InsightChart => ({
	title: "t",
	kind: "auto",
	items: [],
	...fields,
});
const items = (...values: number[]) =>
	values.map((value, i) => ({ label: `item ${i}`, value }));

const PANE = {
	plugin: "ds-bridge",
	component: "Pane",
	requestId: "ds-insights",
	props: {
		title: "Design system insights",
		isFocused: false,
		bodyColumns: 70,
		placement: "dock",
		scroll: { offset: 0, bodyRows: 40 },
		view: {},
	},
} as const;

describe("which chart the data gets", () => {
	test("auto reads the data's shape", async () => {
		expect(
			resolveKind(
				chart({ matrix: { rows: ["a"], columns: ["x"], values: [[1]] } }),
			),
		).toBe("heatmap");
		expect(
			resolveKind(
				chart({ series: [{ label: "s", points: [{ x: 1, y: 2 }] }] }),
			),
		).toBe("line");
		expect(resolveKind(chart({ value: 65 }))).toBe("gauge");
		expect(resolveKind(chart({ unit: "%", items: items(70, 30) }))).toBe(
			"share",
		);
		expect(resolveKind(chart({ items: items(70, 30) }))).toBe("bar");
	});

	test("an explicit kind is kept when its data is there, and falls back when it isn't", async () => {
		expect(resolveKind(chart({ kind: "share", items: items(3, 1) }))).toBe(
			"share",
		);
		expect(resolveKind(chart({ kind: "line", items: items(3, 1) }))).toBe(
			"bar",
		);
		// Seven parts can't be read as slices or waffle squares.
		expect(
			resolveKind(chart({ kind: "share", items: items(1, 1, 1, 1, 1, 1, 1) })),
		).toBe("bar");
	});
});

describe("terminal grids", () => {
	test("a waffle is exactly 100 squares, split by largest remainder", async () => {
		const { grid, counts } = waffleGrid(items(1, 1, 1), ["#a", "#b", "#c"]);
		expect(counts).toEqual([34, 33, 33]);
		expect(gridText(grid).split("■").length - 1).toBe(100);
	});

	test("a line plot is braille on a labelled axis", async () => {
		const grid = brailleLine(
			[
				{
					label: "s",
					points: [
						{ x: 1, y: 0 },
						{ x: 2, y: 10 },
						{ x: 3, y: 5 },
					],
				},
			],
			["#a3384b"],
			30,
			5,
		);
		const text = gridText(grid);
		expect(grid.length).toBe(5);
		expect(text.split("\n")[0]).toMatch(/^10 │/);
		expect(text).toMatch(/[⠁-⣿]/);
		// The plotted cells carry the series colour.
		expect(
			grid.flat().some((cell) => cell.fg === "#a3384b" && cell.ch !== " "),
		).toBe(true);
	});

	test("a heatmap shades each cell by its share of the largest value", async () => {
		const grid = heatmapGrid(
			{
				rows: ["exact", "near"],
				columns: ["09-05", "09-12"],
				values: [
					[3, 0],
					[1, 3],
				],
			},
			5,
			"#000000",
			"#ffffff",
		);
		const runs = gridRuns(grid);
		expect(gridText(grid).split("\n")[1]).toContain("3");
		expect(runs[1]?.some((run) => run.bg === "#ffffff")).toBe(true); // 3 of 3 → the high colour
		expect(gridText(grid)).toContain("·"); // a zero is a dim dot
	});

	test("a share legend in % shows each value once, otherwise share · value", async () => {
		const pct = terminalChart(
			chart({ kind: "share", unit: "%", items: items(85, 15) }),
			60,
		);
		const counts = terminalChart(
			chart({ kind: "share", unit: "uses", items: items(3, 1) }),
			60,
		);
		if (pct.kind !== "share" || counts.kind !== "share") {
			throw new Error("expected share charts");
		}
		expect(pct.legend.map((l) => l.detail)).toEqual(["85%", "15%"]);
		expect(counts.legend[0]?.detail).toBe("75% · 3 uses");
	});

	test("terminalChart draws each kind for the pane", async () => {
		expect(terminalChart(chart({ value: 65 }), 60).kind).toBe("gauge");
		expect(
			terminalChart(chart({ kind: "share", items: items(3, 1) }), 60).kind,
		).toBe("share");
		expect(
			terminalChart(
				chart({
					series: [
						{
							label: "s",
							points: [
								{ x: 1, y: 1 },
								{ x: 2, y: 2 },
							],
						},
					],
				}),
				60,
			).kind,
		).toBe("line");
		expect(terminalChart(chart({ items: [] }), 60).kind).toBe("empty");
	});
});

describe("the history the pane reads", () => {
	const HISTORY = [
		'{"at":"2026-09-05T16:00:00.000Z","kind":"lint","byKind":{"exact":3,"near":3,"offSystem":1},"adoption":{"refs":7,"literals":4}}',
		'{"at":"2026-09-05T16:01:00.000Z","kind":"tokens-check","stale":1,"missing":2,"orphan":1}',
		'{"at":"2026-09-05T16:02:00.000Z","kind":"a11y","modes":[{"mode":"default","passed":0,"failed":1}]}',
		'{"at":"2026-09-12T16:00:00.000Z","kind":"lint","byKind":{"exact":0,"near":1,"offSystem":1},"adoption":{"refs":11,"literals":0}}',
	].join("\n");

	test("lint, drift and a11y rows become scores and open findings", async () => {
		const entries = parseHistory(HISTORY);
		expect(entries.map((e) => [e.kind, e.score, e.findings])).toEqual([
			["lint", 64, 7],
			["tokens-check", undefined, 4],
			["a11y", undefined, 1],
			["lint", 100, 2],
		]);
	});

	test("charts the scores, the findings and a lint heatmap", async () => {
		const section = historySection(parseHistory(HISTORY));
		expect(section.stats).toEqual([
			{ label: "On-system", value: "100%" },
			{ label: "Lint findings", value: "2" },
			{ label: "Drift entries", value: "4" },
			{ label: "Contrast failures", value: "1" },
		]);
		expect(section.charts.map((c) => [c.title, resolveKind(c)])).toEqual([
			["ds-bridge check scores, run by run", "line"],
			["Open findings, run by run", "line"],
			["Lint findings by kind, run by run", "heatmap"],
		]);
		expect(section.charts[2]?.matrix).toEqual({
			rows: ["exact", "near-miss", "off-system"],
			columns: ["09-05", "09-12"],
			values: [
				[3, 0],
				[3, 1],
				[1, 1],
			],
		});
	});
});

describe("Desktop SVG", () => {
	test("draws every kind, in the harvest palette by default", async () => {
		const charts: InsightChart[] = [
			chart({ title: "Components", kind: "bar", items: items(22, 14) }),
			chart({ title: "Adoption", kind: "share", items: items(70, 30) }),
			chart({
				title: "Scores",
				series: [
					{
						label: "On-system",
						points: [
							{ x: 1, y: 64 },
							{ x: 2, y: 100 },
						],
					},
				],
			}),
			chart({ title: "Token adoption", value: 65, unit: "%" }),
			chart({
				title: "Findings",
				matrix: {
					rows: ["exact"],
					columns: ["09-05", "09-12"],
					values: [[3, 1]],
				},
			}),
		];
		for (const c of charts) {
			const drawn = chartSvg(c, 480);
			expect(drawn.svg.startsWith("<svg")).toBe(true);
			expect(drawn.svg.length).toBeLessThan(131072);
			expect(drawn.alt.startsWith(c.title)).toBe(true);
		}
		expect(
			chartSvg(charts[0] as InsightChart, 480).svg.toLowerCase(),
		).toContain(PALETTES.harvest[0]);
		expect(chartSvg(charts[3] as InsightChart, 480).svg).toContain("65%");
	});
});

describe("the pane", () => {
	test("draws a heatmap Claude sends, as coloured cells in the terminal and SVG on the Desktop", async ($, on) => {
		on("ui.open", () => ({ value: { isPlaced: true as const } }));
		const ran = await $.tool.call({
			tool: "mcp__ds-bridge__show_insights",
			tool_use_id: "toolu_1",
			title: "Findings",
			charts: [
				{
					title: "By file and kind",
					kind: "auto",
					matrix: {
						rows: ["Banner.tsx", "button.css"],
						columns: ["exact", "near"],
						values: [
							[1, 1],
							[1, 2],
						],
					},
				},
				{ title: "Adoption", kind: "gauge", value: 64 },
			],
		} as never);
		expect(String(ran.result)).toContain("By file and kind");

		const terminal = await $.ui.mount({ ...PANE, surface: "terminal" });
		const shaded = (await terminal.findAll({ type: "Text" })).filter(
			(t) => typeof t.props.backgroundColor === "string",
		);
		expect(shaded.length).toBeGreaterThan(0);
		await terminal.unmount();

		const desktop = await $.ui.mount({ ...PANE, surface: "desktop" });
		expect((await desktop.findAll({ type: "Svg" })).length).toBe(2);
		await desktop.unmount();
	});
});
