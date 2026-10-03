import type {
	InsightChart,
	InsightItem,
	InsightReport,
	InsightTone,
} from "../../types";

export type LayerSummary = {
	total: number;
	maxDepth: number;
	byType: Map<string, number>;
	instances: Map<string, number>;
	textLayers: number;
	hidden: number;
	rootName: string | undefined;
};

function bump(map: Map<string, number>, key: string): void {
	map.set(key, (map.get(key) ?? 0) + 1);
}

function attr(attrs: string, name: string): string | undefined {
	return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
}

/** Reads the XML outline the Figma MCP's `get_metadata` returns. */
export function summarizeMetadata(xml: string): LayerSummary {
	const summary: LayerSummary = {
		total: 0,
		maxDepth: 0,
		byType: new Map(),
		instances: new Map(),
		textLayers: 0,
		hidden: 0,
		rootName: undefined,
	};
	let depth = 0;
	for (const match of xml.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
		const [, closing, tag = "", attrs = "", selfClosing] = match;
		if (tag.startsWith("?") || tag === "xml") continue;
		if (closing) {
			depth = Math.max(0, depth - 1);
			continue;
		}
		const type = tag.toLowerCase();
		summary.total += 1;
		depth += 1;
		summary.maxDepth = Math.max(summary.maxDepth, depth);
		bump(summary.byType, type);
		const name = attr(attrs, "name");
		if (summary.rootName === undefined) summary.rootName = name;
		if (type === "instance")
			bump(summary.instances, componentName(name ?? "unnamed"));
		if (type === "text") summary.textLayers += 1;
		if (attr(attrs, "hidden") === "true" || attr(attrs, "visible") === "false")
			summary.hidden += 1;
		if (selfClosing) depth -= 1;
	}
	return summary;
}

/** `Button/Primary/Large` and `Button, State=Hover` both count as `Button`. */
export function componentName(name: string): string {
	return name.split(/[/,=]/)[0]?.trim() || name;
}

export type VariableSummary = {
	total: number;
	byKind: Map<string, number>;
	byGroup: Map<string, number>;
};

/** Reads `get_variable_defs`: a JSON object of variable name to value, or `"name": "value"` lines. */
export function summarizeVariables(text: string): VariableSummary {
	let pairs: [string, string][] = [];
	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed && typeof parsed === "object") {
			pairs = Object.entries(parsed as Record<string, unknown>).map(
				([k, v]) => [k, String(v)],
			);
		}
	} catch {
		pairs = [...text.matchAll(/"([^"]+)"\s*:\s*"?([^",}\n]+)"?/g)].map((m) => [
			m[1] ?? "",
			m[2] ?? "",
		]);
	}
	const summary: VariableSummary = {
		total: 0,
		byKind: new Map(),
		byGroup: new Map(),
	};
	for (const [name, value] of pairs) {
		if (!name) continue;
		summary.total += 1;
		bump(summary.byKind, variableKind(value));
		bump(
			summary.byGroup,
			name.includes("/") ? (name.split("/")[0] ?? name) : "ungrouped",
		);
	}
	return summary;
}

export function variableKind(value: string): string {
	const v = value.trim();
	if (/^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|hsl)a?\(/i.test(v)) return "color";
	if (/^Font\(|font/i.test(v)) return "typography";
	if (/^Effect\(|shadow|blur/i.test(v)) return "effect";
	if (/^-?\d+(\.\d+)?(px|rem|%)?$/.test(v)) return "number";
	return "string";
}

export type TokenUsage = {
	colors: { tokens: number; raw: number };
	sizes: { tokens: number; raw: number };
	/** Hard-coded colours, by value, lower-cased. */
	rawColors: Map<string, number>;
};

const COLOR = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/gi;
const SIZE = /-?\d+(?:\.\d+)?px(?![a-z])/gi;
// A value bound to a variable, as get_design_context writes it: var(--name, fallback).
const VAR_REF = /var\(\s*--([^,)]+)(?:,([^()]*(?:\([^)]*\)[^()]*)*))?\)/g;
const IS_COLOR = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(/i;
const IS_SIZE = /\d(?:px|rem)(?![a-z])/i;
const COLOR_NAME =
	/colou?r|fill|stroke|bg|background|surface|text|border-color/i;
const SIZE_NAME = /space|spacing|gap|size|radius|padding|margin|width|height/i;

/** Whether a bound variable holds a colour or a size: by its fallback value, else by its name. */
function tokenKind(
	name: string,
	fallback: string,
): "color" | "size" | undefined {
	if (IS_COLOR.test(fallback)) return "color";
	if (IS_SIZE.test(fallback)) return "size";
	if (COLOR_NAME.test(name)) return "color";
	if (SIZE_NAME.test(name)) return "size";
	return undefined;
}

/**
 * Reads the code `get_design_context` returns. A value bound to a variable is written
 * `var(--name, fallback)`; a hard-coded value is written bare, as `#0055ff` or `16px`.
 */
export function summarizeTokenUsage(code: string): TokenUsage {
	const usage: TokenUsage = {
		colors: { tokens: 0, raw: 0 },
		sizes: { tokens: 0, raw: 0 },
		rawColors: new Map(),
	};
	// Count each bound value, then blank it out so its fallback isn't counted again as hard-coded.
	const bare = code.replace(
		VAR_REF,
		(_ref, name: string, fallback: string | undefined) => {
			const kind = tokenKind(name, fallback ?? "");
			if (kind === "color") usage.colors.tokens += 1;
			if (kind === "size") usage.sizes.tokens += 1;
			return " ";
		},
	);
	for (const match of bare.matchAll(COLOR)) {
		usage.colors.raw += 1;
		bump(usage.rawColors, match[0].toLowerCase().replace(/\s+/g, ""));
	}
	for (const match of bare.matchAll(SIZE)) {
		// 0px and 1px borders are rarely tokenized; counting them would only add noise.
		if (!/^-?[01]px$/.test(match[0])) usage.sizes.raw += 1;
	}
	return usage;
}

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function percent(part: number, whole: number): number {
	return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function tokenCharts(usage: TokenUsage): {
	charts: InsightChart[];
	adoption: number | undefined;
	notes: string[];
} {
	const charts: InsightChart[] = [];
	const notes: string[] = [];
	const { colors, sizes } = usage;
	if (colors.tokens + colors.raw > 0) {
		charts.push({
			title: "Token adoption: colors",
			kind: "share",
			items: [
				{ label: "tokens", value: colors.tokens, tone: "ok" },
				{ label: "hard-coded", value: colors.raw, tone: "error" },
			],
		});
	}
	if (sizes.tokens + sizes.raw > 0) {
		charts.push({
			title: "Token adoption: spacing & sizes",
			kind: "share",
			items: [
				{ label: "tokens", value: sizes.tokens, tone: "ok" },
				{ label: "hard-coded", value: sizes.raw, tone: "error" },
			],
		});
	}
	if (usage.rawColors.size > 0) {
		charts.push({
			title: "Hard-coded colors to replace (uses)",
			kind: "bar",
			items: items(usage.rawColors, "error"),
		});
	}
	const total = colors.tokens + colors.raw + sizes.tokens + sizes.raw;
	const adoption =
		total > 0 ? percent(colors.tokens + sizes.tokens, total) : undefined;
	if (adoption !== undefined && adoption < 80) {
		notes.push(
			`Token adoption is ${adoption}%: ${plural(colors.raw, "color")} and ${plural(sizes.raw, "size")} are hard-coded.`,
		);
	}
	return { charts, adoption, notes };
}

function items(map: Map<string, number>, tone?: InsightTone): InsightItem[] {
	return [...map].map(([label, value]) =>
		tone ? { label, value, tone } : { label, value },
	);
}

export function buildReport(
	layers: LayerSummary,
	variables: VariableSummary | undefined,
	target: string,
	tokens?: TokenUsage,
): InsightReport {
	const instanceCount = [...layers.instances.values()].reduce(
		(a, b) => a + b,
		0,
	);
	const charts: InsightChart[] = [
		{ title: "Layers by type", kind: "bar", items: items(layers.byType) },
		{
			title: "Most used components (instances)",
			kind: "bar",
			items: items(layers.instances),
		},
	];
	if (variables && variables.total > 0) {
		charts.push({
			title: "Variables by kind",
			kind: "share",
			items: items(variables.byKind),
		});
		charts.push({
			title: "Variables by collection",
			kind: "bar",
			items: items(variables.byGroup),
		});
	}
	const tokenView = tokens ? tokenCharts(tokens) : undefined;
	if (tokenView) charts.push(...tokenView.charts);
	const notes: string[] = [...(tokenView?.notes ?? [])];
	if (layers.maxDepth > 12)
		notes.push(
			`Nesting reaches ${layers.maxDepth} levels; deep trees are slow to edit and inspect.`,
		);
	if (layers.hidden > 0)
		notes.push(
			`${plural(layers.hidden, "hidden layer")}: candidates for cleanup.`,
		);
	if (layers.total > 0 && instanceCount / layers.total < 0.05) {
		notes.push(
			"Under 5% of layers are component instances; parts of this design may not use the library.",
		);
	}
	return {
		title: `Figma insights: ${layers.rootName ?? target}`,
		subtitle: target,
		source: "scan",
		stats: [
			{ label: "Layers", value: String(layers.total) },
			{ label: "Depth", value: String(layers.maxDepth) },
			{ label: "Instances", value: String(instanceCount) },
			{ label: "Components", value: String(layers.instances.size) },
			{ label: "Text", value: String(layers.textLayers) },
			{
				label: "Variables",
				value: variables ? String(variables.total) : "n/a",
			},
			{
				label: "Token adoption",
				value:
					tokenView?.adoption !== undefined ? `${tokenView.adoption}%` : "n/a",
			},
		],
		charts,
		notes,
	};
}
