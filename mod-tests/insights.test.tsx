// The insights pane (hooks/register.tsx), under `claude plugin test`. Run with
// `npm run test:mod`: it stages the mod without the vitest suite, which the mod
// test runner would otherwise try to load. The vitest suite is `npm test`.
import { describe, expect, test } from "claude-code/testing";

import {
	historySection,
	libraryHealthSection,
	parseHistory,
} from "../hooks/insights/ds-bridge-data.js";
import { chartStyleFrom, chartSvg } from "../hooks/insights/echarts-svg.js";
import {
	summarizeMetadata,
	summarizeTokenUsage,
	summarizeVariables,
} from "../hooks/insights/figma.js";
import { barRows, reportText } from "../hooks/insights/text-charts.js";

const XML = `<frame id="1:1" name="Checkout" x="0" y="0" width="1440" height="900">
  <instance id="1:2" name="Button/Primary" />
  <instance id="1:3" name="Button/Secondary" />
  <instance id="1:4" name="Input, State=Default" />
  <frame id="1:5" name="Summary">
    <text id="1:6" name="Total" />
    <rectangle id="1:7" name="Divider" hidden="true" />
  </frame>
</frame>`;
const VARS =
	'{"color/primary":"#0055FF","color/surface":"#FFFFFF","space/4":"16","type/body":"Font(family: Inter, size: 14)"}';
const CODE = `<div className="bg-[var(--color\\/primary,#0055ff)] p-[var(--space\\/4,16px)] gap-[12px]">
  <p className="text-[#1a1a1a] text-[var(--color\\/text,#222222)] border-[1px]">Total</p>
  <span className="bg-[#1a1a1a] rounded-[var(--radius\\/md)] shadow-[0px_2px_4px_rgba(0,0,0,0.2)]" />
</div>`;
const HISTORY = [
	'{"at":"2026-06-11T18:34:07Z","kind":"handoff","score":90}',
	'{"at":"2026-06-11T18:35:07Z","kind":"handoff","score":80}',
	'{"at":"2026-06-12T04:58:25Z","kind":"parity","total":58,"score":2}',
	'{"at":"2026-06-12T05:00:00Z","kind":"note"}',
	'{"at":"torn',
].join("\n");
const LIBRARY = {
	overrideHotspots: [{ nodeId: "1", name: "Card / Promo", overrideCount: 7 }],
	deprecatedUsage: [{ componentName: "Button (legacy)", count: 4 }],
	detachedCandidates: [{ nodeId: "2", name: "Badge", heuristic: true }],
	totals: { overrideHotspots: 1, deprecatedUsage: 4, detachedCandidates: 1 },
};

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

describe("reading Figma", () => {
	test("counts layers, depth, instances and hidden layers", async () => {
		const s = summarizeMetadata(XML);
		expect(s.total).toBe(7);
		expect(s.maxDepth).toBe(3);
		expect(s.instances.get("Button")).toBe(2);
		expect(s.hidden).toBe(1);
	});

	test("classifies variables and counts token adoption", async () => {
		expect(summarizeVariables(VARS).byKind.get("color")).toBe(2);
		const t = summarizeTokenUsage(CODE);
		expect(t.colors).toEqual({ tokens: 2, raw: 3 });
		expect(t.sizes).toEqual({ tokens: 2, raw: 3 });
	});
});

describe("reading ds-bridge", () => {
	test("keeps scored history rows and skips the rest", async () => {
		const entries = parseHistory(HISTORY);
		expect(entries.map((e) => e.kind)).toEqual([
			"handoff",
			"handoff",
			"parity",
		]);
		const section = historySection(entries);
		expect(section.stats).toEqual([
			{ label: "Handoff score", value: "80" },
			{ label: "Parity score", value: "2" },
		]);
		expect(section.charts[0]?.series?.[0]?.points).toEqual([
			{ x: 1, y: 90 },
			{ x: 2, y: 80 },
		]);
		expect(section.notes[0]).toBe(
			"Handoff score fell from 90 to 80 over the last 2 runs.",
		);
	});

	test("labels the stored system score (H4 `score` records)", async () => {
		const entries = parseHistory(
			'{"v":2,"at":"2026-10-04T00:00:00Z","kind":"score","source":"ci","score":76}',
		);
		expect(historySection(entries).stats).toEqual([
			{ label: "System score", value: "76" },
		]);
	});

	test("charts library health and flags detaches as a heuristic", async () => {
		const section = libraryHealthSection(LIBRARY);
		expect(section.stats[1]).toEqual({ label: "Deprecated uses", value: "4" });
		expect(section.charts.map((c) => c.title)).toEqual([
			"Deprecated components still in use",
			"Override hotspots (overrides per instance)",
		]);
		expect(section.notes[0]).toContain("heuristic");
	});
});

describe("drawing", () => {
	test("text bars are ds-bridge's: a solid fill over a ░ track, toned, with percents for shares", async () => {
		const [tokens, raw] = barRows(
			{
				title: "Token adoption",
				kind: "share",
				items: [
					{ label: "tokens", value: 9, tone: "ok" },
					{ label: "hard-coded", value: 1, tone: "error" },
				],
			},
			60,
		);
		expect(tokens?.percent.trim()).toBe("90%");
		expect(tokens?.color).toBe("#8a9a4a");
		expect(raw?.color).toBe("#b4505c");
		expect(raw?.track).toMatch(/^░+$/);
		expect(
			[...(tokens?.fill ?? "")].length + [...(tokens?.track ?? "")].length,
		).toBe([...(raw?.fill ?? "")].length + [...(raw?.track ?? "")].length);
	});

	test("the configured style reaches the Desktop charts", async () => {
		const style = chartStyleFrom({
			insights_palette: "nivo",
			insights_share_style: "pie",
			insights_corner_radius: 99,
		});
		expect(style).toEqual({ palette: "nivo", share: "pie", radius: 12 });
		expect(chartStyleFrom({ insights_palette: "neon" }).palette).toBe(
			"harvest",
		);
		const bar = chartSvg(
			{
				title: "Components",
				kind: "bar",
				items: [{ label: "Icon", value: 22 }],
			},
			480,
			style,
		);
		expect(bar.svg).toContain("#e8c1a0");
		const line = chartSvg(
			{
				title: "Scores",
				kind: "line",
				items: [],
				series: [
					{
						label: "Handoff",
						points: [
							{ x: 1, y: 90 },
							{ x: 2, y: 80 },
						],
					},
				],
			},
			480,
		);
		expect(line.svg.startsWith("<svg")).toBe(true);
		expect(line.alt).toBe("Scores: latest Handoff 80");
	});
});

describe("the mod", () => {
	test("/ds-insights --library charts the selection, the history and library health", async ($, on) => {
		on("ui.open", () => ({ value: { isPlaced: true as const } }));
		on("mcp.call", async (_$, e) => {
			const text =
				e.tool === "get_metadata"
					? XML
					: e.tool === "get_design_context"
						? CODE
						: VARS;
			return { value: { content: [{ type: "text", text }], isError: false } };
		});
		on("fs.read", async () => ({ value: HISTORY }));
		on("fs.stat", async () => ({ value: { isFile: true } as never }));
		on("process.run", async (_$, e) => {
			expect(e.argv.slice(2)).toEqual(["library-health", "--format=json"]);
			return {
				value: {
					exitCode: 0,
					stdout: JSON.stringify(LIBRARY),
					stderr: "",
					isStdoutTruncated: false,
					isStderrTruncated: false,
				},
			};
		});
		const { text } = await $.command.run({
			command: "ds-insights",
			args: "--library",
		} as never);
		expect(text).toContain("Figma insights: Checkout");
		expect(text).toContain("Token adoption: 40%");
		expect(text).toContain("ds-bridge check scores, run by run");
		expect(text).toContain("Deprecated components still in use");
		expect(text).toMatch(/Token adoption\n {2}[█▏▎▍▌▋▊▉]+░+ 40%/);
		expect(text).toMatch(/■ tokens {2}40% · 2/);
	});

	test("a missing token is one note, and the other sources still draw", async ($, on) => {
		on("ui.open", () => ({ value: { isPlaced: true as const } }));
		on("mcp.call", async () => ({
			value: { content: [{ type: "text", text: XML }], isError: false },
		}));
		on("fs.read", async () => {
			throw new Error("ENOENT");
		});
		on("fs.stat", async () => ({ value: { isFile: true } as never }));
		on("process.run", async () => ({
			value: {
				exitCode: 2,
				stdout: "",
				stderr: "Missing Figma token.\n",
				isStdoutTruncated: false,
				isStderrTruncated: false,
			},
		}));
		const { text } = await $.command.run({
			command: "ds-insights",
			args: "--library",
		} as never);
		expect(text).toContain("Layers by type");
		expect(text).toContain("No ds-bridge check history here yet");
		expect(text).toContain(
			"Library health: Missing Figma token. Run /ds-bridge:connect",
		);
	});

	test("Claude's show_insights report draws as SVG on the Desktop and as text bars in the terminal", async ($, on) => {
		on("ui.open", () => ({ value: { isPlaced: true as const } }));
		const ran = await $.tool.call({
			tool: "mcp__ds-bridge__show_insights",
			tool_use_id: "toolu_1",
			title: "Lint",
			charts: [
				{
					title: "Findings",
					kind: "share",
					items: [
						{ label: "on-system", value: 38, tone: "ok" },
						{ label: "near-miss", value: 3, tone: "warn" },
						{ label: "off-system", value: 1, tone: "error" },
					],
				},
			],
		} as never);
		expect(String(ran.result)).toContain("on-system");

		const desktop = await $.ui.mount({ ...PANE, surface: "desktop" });
		expect((await desktop.findAll({ type: "Svg" })).length).toBe(1);
		await desktop.unmount();

		const terminal = await $.ui.mount({ ...PANE, surface: "terminal" });
		expect((await terminal.findAll({ type: "Svg" })).length).toBe(0);
		expect(await terminal.find({ type: "Text", text: /■/ })).toBeDefined();
		await terminal.unmount();
		expect(
			reportText({
				title: "t",
				source: "claude",
				stats: [],
				charts: [],
				notes: [],
			}),
		).toBe("t");
	});
});
