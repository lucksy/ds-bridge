// The ds-bridge mod: the insights pane. It charts the live Figma selection (over the
// Figma desktop MCP), ds-bridge's own check history, and on request the library-wide
// hygiene signals of `ds-bridge library-health`, in one pane beside the transcript.
// The terminal draws ds-bridge's text bars; the Desktop app draws ECharts SVG.
import type { EngineInterface, McpToolResult, Register } from "claude-code";
import { atom, read, update } from "claude-code";

import type { InsightChart, InsightReport, InsightTone } from "../types";
import type { Section } from "./insights/ds-bridge-data.js";
import {
	historySection,
	libraryHealthSection,
	parseHistory,
} from "./insights/ds-bridge-data.js";
import type { ChartStyle, ChartSvg } from "./insights/echarts-svg.js";
import { chartStyleFrom, chartSvg } from "./insights/echarts-svg.js";
import {
	buildReport,
	summarizeMetadata,
	summarizeTokenUsage,
	summarizeVariables,
} from "./insights/figma.js";
import { barRows, reportText, trendRows } from "./insights/text-charts.js";

const PANE = "ds-insights";
const TITLE = "Design system insights";
// The local Figma desktop MCP server, as /mcp lists it. It reads the current selection when no node id is given.
const FIGMA_SERVER = "figma-desktop";
const HISTORY = ".ds-bridge/history.jsonl";

const report = atom({ plugin: "ds-bridge", key: "report" } as const, null);
const status = atom({ plugin: "ds-bridge", key: "status" } as const, null);

const TONES: readonly InsightTone[] = ["ok", "warn", "error", "info"];

const SHOW_TOOL = {
	name: "show_insights",
	description:
		"Draws a report of design-system insights as charts in the ds-bridge insights pane beside the transcript, and returns the same report as text. " +
		"Use it when the person asks to see insights, stats, or a chart or graph of a Figma file, page, frame or selection, or of ds-bridge check results, " +
		"after gathering the numbers with the Figma MCP tools (get_metadata, get_variable_defs, get_design_context) or the ds-bridge CLI's --format=json output. " +
		"Pass only numbers you read from those sources: the tool draws them and reads nothing itself. " +
		'Charts of kind "bar" draw one row per item, largest first; kind "share" draws the parts of a whole with their percentages. ' +
		'An item\'s optional "tone" colours it by meaning: "ok" (on-system), "warn" (near-miss), "error" (off-system), "info". ' +
		'At most 8 items are drawn per bar chart and 6 per share chart; the rest are folded into "other". A new call replaces the previous report.',
	inputSchema: {
		type: "object",
		properties: {
			title: {
				type: "string",
				description: 'Report heading, e.g. "Checkout flow: component usage".',
			},
			subtitle: {
				type: "string",
				description:
					"Optional second line: the file, page or node the data came from.",
			},
			stats: {
				type: "array",
				description: "Headline numbers shown in one row above the charts.",
				items: {
					type: "object",
					properties: { label: { type: "string" }, value: { type: "string" } },
					required: ["label", "value"],
				},
			},
			charts: {
				type: "array",
				items: {
					type: "object",
					properties: {
						title: { type: "string" },
						kind: { type: "string", enum: ["bar", "share"] },
						unit: {
							type: "string",
							description:
								'Optional unit printed after each value, e.g. "px" or "uses".',
						},
						items: {
							type: "array",
							items: {
								type: "object",
								properties: {
									label: { type: "string" },
									value: { type: "number" },
									tone: { type: "string", enum: TONES },
								},
								required: ["label", "value"],
							},
						},
					},
					required: ["title", "kind", "items"],
				},
			},
			notes: {
				type: "array",
				items: { type: "string" },
				description: "Short findings shown under the charts.",
			},
		},
		required: ["title", "charts"],
	},
};

function textOf(result: McpToolResult): string {
	return result.content
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

function messageOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** The live selection, read through the Figma desktop MCP; throws with a readable message. */
async function scanSelection(
	$: EngineInterface,
	nodeId: string,
): Promise<InsightReport> {
	const args = nodeId ? { nodeId } : {};
	let metadata: McpToolResult;
	try {
		metadata = await $.mcp.call(FIGMA_SERVER, "get_metadata", args);
	} catch (err) {
		throw new Error(
			`could not reach the ${FIGMA_SERVER} MCP server (${messageOf(err)}). ` +
				"Open the Figma desktop app, turn on its Dev Mode MCP server, then run /mcp to reconnect.",
		);
	}
	if (metadata.isError)
		throw new Error(`get_metadata failed: ${textOf(metadata).slice(0, 200)}`);
	const xml = textOf(metadata);
	if (!xml.includes("<")) {
		throw new Error(
			"nothing is selected. Select a frame or page in Figma, or pass a node id: /ds-insights 12:34",
		);
	}

	let variables: ReturnType<typeof summarizeVariables> | undefined;
	try {
		const defs = await $.mcp.call(FIGMA_SERVER, "get_variable_defs", args);
		if (!defs.isError) variables = summarizeVariables(textOf(defs));
	} catch {
		// Variables are optional: the layer charts still draw without them.
	}
	let tokens: ReturnType<typeof summarizeTokenUsage> | undefined;
	try {
		const context = await $.mcp.call(FIGMA_SERVER, "get_design_context", args);
		if (!context.isError) tokens = summarizeTokenUsage(textOf(context));
	} catch {
		// Token adoption is optional too: without design context those charts are left out.
	}
	return buildReport(
		summarizeMetadata(xml),
		variables,
		nodeId ? `node ${nodeId}` : "current selection",
		tokens,
	);
}

/** ds-bridge's check history in this project, or undefined when no check has run here yet. */
async function readHistory($: EngineInterface): Promise<Section | undefined> {
	let text: string;
	try {
		text = await $.fs.read(HISTORY);
	} catch {
		return undefined;
	}
	const entries = parseHistory(text);
	return entries.length > 0 ? historySection(entries) : undefined;
}

/** `ds-bridge library-health`, run through the plugin's own CLI; throws with its one fix. */
async function readLibraryHealth($: EngineInterface): Promise<Section> {
	const cli = `${$.plugin.root}/dist/cli.mjs`;
	try {
		await $.fs.stat(cli);
	} catch {
		throw new Error(
			`the ds-bridge CLI isn't built at ${cli}. Run npm run build in the plugin folder.`,
		);
	}
	// The CLI loads the Figma token from .ds-bridge.env itself; it never passes through this mod.
	const run = await $.process.run(
		["node", cli, "library-health", "--format=json"],
		{ timeoutMs: 120_000 },
	);
	if (run.exitCode !== 0) {
		const reason =
			run.stderr.trim().split("\n")[0] || `exit code ${run.exitCode}`;
		throw new Error(
			`${reason}${run.exitCode === 2 ? " Run /ds-bridge:connect to set the Figma token and library file key." : ""}`,
		);
	}
	return libraryHealthSection(JSON.parse(run.stdout));
}

/**
 * Everything the pane shows, gathered from each source in turn. A source that fails
 * becomes one note saying why, and the others still draw.
 */
async function gather(
	$: EngineInterface,
	nodeId: string,
	withLibrary: boolean,
): Promise<InsightReport> {
	const next: InsightReport = {
		title: TITLE,
		source: "scan",
		stats: [],
		charts: [],
		notes: [],
	};
	const add = (section: Section) => {
		next.stats.push(...section.stats);
		next.charts.push(...section.charts);
		next.notes.push(...section.notes);
	};

	try {
		const selection = await scanSelection($, nodeId);
		next.title = selection.title;
		if (selection.subtitle !== undefined) next.subtitle = selection.subtitle;
		add(selection);
	} catch (err) {
		next.notes.push(`Figma selection: ${messageOf(err)}`);
	}

	const history = await readHistory($);
	if (history) add(history);
	else
		next.notes.push(
			"No ds-bridge check history here yet: run /ds-bridge:handoff-qa or another check to start one.",
		);

	if (withLibrary) {
		try {
			add(await readLibraryHealth($));
		} catch (err) {
			next.notes.push(`Library health: ${messageOf(err)}`);
		}
	}
	return next;
}

async function refresh(
	$: EngineInterface,
	nodeId: string,
	withLibrary: boolean,
): Promise<string> {
	await update($, status, () =>
		withLibrary ? "Reading Figma and the library…" : "Reading Figma…",
	);
	const next = await gather($, nodeId, withLibrary);
	await update($, report, () => next);
	await update($, status, () => null);
	return reportText(next);
}

function asTone(value: unknown): InsightTone | undefined {
	return TONES.find((tone) => tone === value);
}

/** The tool's input as a report, keeping only well-formed charts and finite numbers. */
function asReport(input: Record<string, unknown>): InsightReport {
	const list = <T,>(value: unknown): T[] =>
		Array.isArray(value) ? (value as T[]) : [];
	const charts: InsightChart[] = list<Record<string, unknown>>(
		input.charts,
	).map((chart) => ({
		title: String(chart.title ?? ""),
		kind: chart.kind === "share" ? "share" : "bar",
		...(typeof chart.unit === "string" ? { unit: chart.unit } : {}),
		items: list<Record<string, unknown>>(chart.items)
			.map((item) => {
				const tone = asTone(item.tone);
				return {
					label: String(item.label ?? ""),
					value: Number(item.value),
					...(tone ? { tone } : {}),
				};
			})
			.filter((item) => Number.isFinite(item.value)),
	}));
	return {
		title: String(input.title ?? TITLE),
		...(typeof input.subtitle === "string" ? { subtitle: input.subtitle } : {}),
		source: "claude",
		stats: list<Record<string, unknown>>(input.stats).map((s) => ({
			label: String(s.label),
			value: String(s.value),
		})),
		charts,
		notes: list<unknown>(input.notes).map(String),
	};
}

/** `[node id] [--library]`, in either order. */
function parseArgs(args: string): { nodeId: string; withLibrary: boolean } {
	const words = args.trim().split(/\s+/).filter(Boolean);
	return {
		withLibrary: words.includes("--library"),
		nodeId: words.find((w) => !w.startsWith("--")) ?? "",
	};
}

export const register: Register = (on, options) => {
	const style: ChartStyle = chartStyleFrom(options);

	on("session.start", async ($, e, next) => {
		await $.command.register({
			name: "ds-insights",
			description:
				"Chart the Figma selection, ds-bridge check history and (with --library) library health",
			argumentHint: "[node id] [--library]",
		});
		await $.tool.register(SHOW_TOOL);
		return next(e);
	});

	on("command.run", { command: "ds-insights" }, async ($, e) => {
		await $.ui.open({ id: PANE, title: TITLE });
		const { nodeId, withLibrary } = parseArgs(e.args);
		return { text: await refresh($, nodeId, withLibrary) };
	});

	on("tool.call", { tool: "mcp__ds-bridge__show_insights" }, async ($, e) => {
		const next = asReport(e as unknown as Record<string, unknown>);
		await update($, report, () => next);
		await update($, status, () => null);
		await $.ui.open({ id: PANE, title: TITLE });
		return {
			result: `Drawn in the ds-bridge insights pane.\n\n${reportText(next)}`,
		};
	});

	on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
		const { Box, Text, Button } = $.ui.resolve(e);
		const shown = await read($, report);
		const note = await read($, status);
		const columns = Math.max(24, e.props.bodyColumns - 2);

		// The Desktop app draws SVG, so it gets ECharts; every other surface gets ds-bridge's text bars.
		const Svg = e.surface === "desktop" ? $.ui.resolve(e).Svg : undefined;
		const pixels = Math.min(720, Math.max(280, e.props.bodyColumns * 8));
		const svgFor = (chart: InsightChart): ChartSvg | undefined => {
			if (Svg === undefined) return undefined;
			if (
				chart.kind === "line"
					? (chart.series ?? []).length === 0
					: chart.items.length === 0
			)
				return undefined;
			try {
				return chartSvg(chart, pixels, style);
			} catch {
				return undefined; // A chart ECharts can't draw falls back to text.
			}
		};

		const textChart = (chart: InsightChart) =>
			chart.kind === "line"
				? trendRows(chart, columns).map((row) => (
						<Text>
							{"  "}
							<Text color={row.color}>{row.label}</Text>{" "}
							<Text color={row.color}>{row.spark}</Text> {row.last}
						</Text>
					))
				: barRows(chart, columns).map((row) => (
						<Text>
							{"  "}
							<Text color={row.color}>{row.label}</Text>{" "}
							<Text color={row.color}>{row.fill}</Text>
							<Text color={row.color} dimColor>
								{row.track}
							</Text>{" "}
							<Text color={row.color}>{row.value}</Text>
							{row.percent ? (
								<Text color={row.color}>{`  ${row.percent}`}</Text>
							) : null}
						</Text>
					));

		const chartView = (chart: InsightChart, n: number) => {
			const drawn = svgFor(chart);
			const isEmpty =
				chart.kind === "line"
					? (chart.series ?? []).length === 0
					: chart.items.length === 0;
			return (
				<Box key={`chart-${n}`} flexDirection="column" marginTop={1}>
					<Text bold>{chart.title}</Text>
					{isEmpty && <Text dimColor>(no data)</Text>}
					{drawn !== undefined && Svg !== undefined ? (
						<Svg
							source={drawn.svg}
							alt={drawn.alt}
							width={drawn.width}
							height={drawn.height}
						/>
					) : (
						textChart(chart)
					)}
				</Box>
			);
		};

		return (
			<Box flexDirection="column">
				{note !== null && <Text color="yellow">{note}</Text>}
				{shown === null && note === null && (
					<Text dimColor>
						No report yet. Run /ds-insights, or ask Claude for design-system
						insights.
					</Text>
				)}
				{shown !== null && (
					<Box flexDirection="column">
						<Text bold color="cyan">
							{shown.title}
						</Text>
						{shown.subtitle !== undefined && (
							<Text dimColor>{shown.subtitle}</Text>
						)}
						{shown.stats.length > 0 && (
							<Box flexWrap="wrap" marginTop={1}>
								{shown.stats.map((stat) => (
									<Text>
										<Text dimColor>{stat.label} </Text>
										<Text bold>{stat.value}</Text>
										{"   "}
									</Text>
								))}
							</Box>
						)}
						{shown.charts.map(chartView)}
						{shown.notes.length > 0 && (
							<Box flexDirection="column" marginTop={1}>
								{shown.notes.map((n) => (
									<Text dimColor>• {n}</Text>
								))}
							</Box>
						)}
					</Box>
				)}
				<Box marginTop={1}>
					<Button
						key="rescan"
						label="Rescan selection"
						hotkey="r"
						onPress={() => refresh($, "", false)}
					/>
					<Text> </Text>
					<Button
						key="library"
						label="Library health"
						hotkey="l"
						onPress={() => refresh($, "", true)}
					/>
					<Text> </Text>
					{/* biome-ignore lint/a11y/useValidAriaRole: a Claude Code Button prop marking the close control, not an ARIA role */}
					<Button
						key="close"
						label="Close"
						hotkey="q"
						role="dismiss"
						onPress={() => $.ui.close({ id: PANE })}
					/>
				</Box>
			</Box>
		);
	});
};
