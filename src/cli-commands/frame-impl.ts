// C11 / M2.4 — `ds-bridge frame-impl <frame-url>` command. The thin CLI sibling
// of `handoff`: fetch a Figma frame's node tree over REST, derive its
// FrameRequirement[] (component-ish nodes + raw style values), run the existing
// `findGaps` resolve-vs-gap pass against the committed registry + parsed tokens,
// compute the frame's implementability (% on-system) with gaps grouped by reason,
// persist a `frame-impl` history line, and print the report (term | json).
//
// Impure edge: HTTP through the Figma client (FIGMA_API_BASE-overridable like
// handoff/impact) + reads config from the environment + reads the committed
// registry + parsed tokens + writes the history line. All judgement is delegated
// to the pure engines (parse-url, findGaps). Bad input becomes an exit code +
// actionable stderr, never a thrown stack trace.
//
// Exit codes:
//   0  success (the report printed; this is a generator, not a gate)
//   2  operational error (invalid URL, missing token/file-key/registry/tokens,
//      API error)
//
// SPEC-personas §5 C11: figma-impl.md step 5 invokes this to persist the artifact.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { cwd } from "node:process";
import type { Command } from "commander";
import { readProjectConfigText, resolveConfig } from "../config.js";
import { parseFigmaUrl } from "../engines/handoff/parse-url.js";
import {
	type FrameRequirement,
	findGaps,
	type Gap,
	type GapReason,
	type GapsReport,
} from "../engines/registry/gaps.js";
import type { RegistryFile } from "../engines/registry/persist.js";
import { parseStyleDictionary } from "../engines/tokens/parse-style-dictionary.js";
import { parseTokensStudio } from "../engines/tokens/parse-tokens-studio.js";
import { parseW3c } from "../engines/tokens/parse-w3c.js";
import type {
	ParseOutcome,
	Token,
	TokenSourceFormat,
} from "../engines/tokens/types.js";
import {
	createFigmaClient,
	type FigmaClient,
	type FigmaFile,
	type FigmaNode,
	type FigmaResult,
} from "../io/figma/client.js";
import { resolveFileKey } from "../io/figma/file-key.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import { loadTokens as loadTokenSource } from "../io/load-tokens.js";
import { findTokenSource } from "../io/token-set.js";
import {
	renderTable,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";
import {
	figmaAuthErrorMessage,
	missingFigmaTokenMessage,
} from "./figma-auth-help.js";

type FrameImplFormat = "json" | "term";

const DEFAULT_FIGMA_API_BASE = "https://api.figma.com";

/** How many gap reasons the term report / history line surfaces (topGaps cap). */
const TOP_GAPS_LIMIT = 5;

/** The token parsers keyed by detected format (mirrors lint.ts / tokens.ts). */
const _PARSERS: Record<TokenSourceFormat, (source: unknown) => ParseOutcome> = {
	w3c: parseW3c,
	"tokens-studio": parseTokensStudio,
	"style-dictionary": parseStyleDictionary,
};

/** Conventional token-source directories never descended for discovery. */
const _EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

interface FrameImplOptions {
	fileKey: string | undefined;
	format: string;
	/** Commander maps the negatable `--no-history` flag to `history: false`. */
	history: boolean;
}

/**
 * One appended frame-impl history record (read back by `report` for the
 * frame-implementability section, C11/M2.4). `pct = round(100*resolved/total)`;
 * `byReason` tallies the gap reasons; `topGaps` is capped. The `at` ISO timestamp
 * is read at the io edge.
 */
interface FrameImplHistoryRecord {
	at: string;
	kind: "frame-impl";
	frameName: string;
	fileKey: string;
	nodeId?: string;
	resolvedCount: number;
	gapCount: number;
	pct: number;
	byReason: Record<string, number>;
	topGaps: { reason: GapReason; requirement: string }[];
}

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Guidance shown when no Figma PAT is configured (shared via figma-auth-help). */
function missingTokenMessage(): string {
	return missingFigmaTokenMessage([
		"The token needs the file_content:read scope, and must come from a Dev or",
		"Full seat — a View seat is rate-limited and cannot be used here.",
	]);
}

/** Guidance shown when --file-key names an unknown product alias (M1.3). */
function unknownAliasMessage(
	outcome: { alias: string; suggestions: string[] },
	productFileKeys: Record<string, string>,
): string {
	const aliases = Object.keys(productFileKeys);
	const lines = [`Unknown --file-key alias "${outcome.alias}".`];
	if (outcome.suggestions.length > 0) {
		lines.push(`Did you mean ${outcome.suggestions.join(", ")}?`);
	}
	lines.push(
		"",
		aliases.length > 0
			? `Available product_file_keys aliases: ${aliases.join(", ")}.`
			: "No product_file_keys aliases are configured.",
		"Or pass --file-key <raw-figma-file-key> directly.",
	);
	return lines.join("\n");
}

/** Guidance shown when no committed registry exists (resolution is impossible). */
function missingRegistryMessage(registryPath: string): string {
	return [
		`No component registry found at ${registryPath}.`,
		"",
		'Run "ds-bridge registry build" first — it maps the Figma library to your',
		"code components, which frame-impl needs to resolve component requirements.",
	].join("\n");
}

/** Translate a non-ok Figma client result into an actionable stderr message. */
function clientErrorMessage(
	result: Exclude<FigmaResult<unknown>, { kind: "ok" }>,
): string {
	switch (result.kind) {
		case "auth-error":
			return figmaAuthErrorMessage(result);
		case "scope-error":
			return `Figma token is missing a required scope: ${result.message}. The token needs file_content:read.`;
		case "not-found":
			return "Figma could not find that file or node. Check the frame URL is correct and the token's account can access the file.";
		case "rate-limited":
			return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited — use a Dev/Full-seat PAT.`;
		case "network-error":
			return `Could not reach the Figma API: ${result.message}.`;
	}
}

/** Load the committed registry, or a typed not-found / unreadable outcome. */
function loadRegistry(
	registryPath: string,
): { kind: "ok"; registry: RegistryFile } | { kind: "error"; message: string } {
	if (!existsSync(registryPath)) {
		return { kind: "error", message: missingRegistryMessage(registryPath) };
	}
	try {
		const registry = JSON.parse(
			readFileSync(registryPath, "utf8"),
		) as RegistryFile;
		return { kind: "ok", registry };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Could not read the registry at ${registryPath}: ${detail}. Re-run "ds-bridge registry build".`,
		};
	}
}

// ── Token source resolution (a focused mirror of lint.ts) ──

function _isConventionalTokenFile(name: string): boolean {
	if (!name.endsWith(".json")) return false;
	return (
		name === "tokens.json" ||
		name === "design-tokens.json" ||
		name.endsWith(".tokens.json")
	);
}

function _isTokenDir(name: string): boolean {
	return name === "tokens" || name === "design-tokens";
}

/**
 * Resolve + parse the token source into Token[]: token_source in the project
 * config (target = cwd), else discovery. Missing → a typed error with the same
 * guidance lint gives.
 */
function loadTokens(
	targetDir: string,
): { kind: "ok"; tokens: Token[] } | { kind: "error"; message: string } {
	let tokenPath: string | undefined;

	const configPath = join(targetDir, ".ds-bridge.json");
	if (existsSync(configPath)) {
		try {
			const resolved = resolveConfig({
				projectFileText: readFileSync(configPath, "utf8"),
			});
			if (resolved.kind === "ok" && resolved.config.tokenSource !== undefined) {
				const src = resolved.config.tokenSource;
				tokenPath = isAbsolute(src) ? src : resolve(targetDir, src);
			}
		} catch {
			tokenPath = undefined;
		}
	}
	if (tokenPath === undefined) {
		tokenPath = findTokenSource(targetDir);
	}
	if (tokenPath === undefined || !existsSync(tokenPath)) {
		return {
			kind: "error",
			message:
				`No design-token source found for "${targetDir}".\n` +
				"Set token_source in .ds-bridge.json, or add a conventional token file " +
				"(tokens.json, design-tokens.json, *.tokens.json).",
		};
	}

	const loaded = loadTokenSource(tokenPath);
	if (loaded.kind === "error") return loaded;
	return { kind: "ok", tokens: loaded.map.tokens };
}

// ── Requirement derivation (FigmaNode tree → FrameRequirement[]) ──

/** True when the node's fills include at least one variable-bound fill. */
function hasBoundFill(node: FigmaNode): boolean {
	const fills = node.boundVariables?.fills;
	return Array.isArray(fills) && fills.length > 0;
}

/** The first SOLID fill's color as an rgb()/rgba() string, or undefined. */
function firstSolidFillColor(node: FigmaNode): string | undefined {
	if (!Array.isArray(node.fills)) return undefined;
	for (const paint of node.fills) {
		if (paint.type !== "SOLID" || paint.color === undefined) continue;
		const { r, g, b, a } = paint.color;
		const to255 = (v: number): number => Math.round(v * 255);
		return a >= 1
			? `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`
			: `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${a})`;
	}
	return undefined;
}

/** The component maps a Figma file / nodes response carries. */
export interface ComponentMaps {
	components?: FigmaFile["components"];
	componentSets?: FigmaFile["componentSets"];
}

/** An instance's main component name: its set's (`Button`), else its own. */
function mainComponentName(
	node: FigmaNode,
	maps: ComponentMaps,
): string | undefined {
	if (node.componentId === undefined) return undefined;
	const component = maps.components?.[node.componentId];
	if (component === undefined) return undefined;
	const set =
		component.componentSetId !== undefined
			? maps.componentSets?.[component.componentSetId]?.name
			: undefined;
	return set ?? component.name;
}

/**
 * Derive the frame's requirements from its node tree (PURE shape, exported for
 * testing): every INSTANCE node is a component requirement, named by its main
 * component (set) when the maps know it — a renamed "Cancel" instance still
 * needs Button; every node carrying an UNBOUND solid fill is a color token
 * requirement (its raw rgb value). Bound fills are already on-system, so they
 * raise no requirement. An instance's subtree belongs to its component, so the
 * walk does not descend into it.
 */
export function deriveRequirements(
	root: FigmaNode,
	maps: ComponentMaps = {},
): FrameRequirement[] {
	const requirements: FrameRequirement[] = [];
	const stack: FigmaNode[] = [root];
	while (stack.length > 0) {
		const node = stack.pop() as FigmaNode;
		if (node.type === "INSTANCE") {
			const componentName = mainComponentName(node, maps);
			requirements.push({
				kind: "component",
				nodeId: node.id,
				name: node.name,
				...(componentName !== undefined ? { componentName } : {}),
			});
			continue;
		}
		if (!hasBoundFill(node)) {
			const rawValue = firstSolidFillColor(node);
			if (rawValue !== undefined) {
				requirements.push({
					kind: "token",
					property: "fill",
					rawValue,
					valueKind: "color",
				});
			}
		}
		const children = node.children;
		if (Array.isArray(children)) {
			for (let i = children.length - 1; i >= 0; i -= 1) {
				const child = children[i];
				if (child !== undefined) stack.push(child);
			}
		}
	}
	return requirements;
}

// ── Fetch the frame root (subtree when nodeId present, else the file root) ──

function nodeFromFileNodes(
	nodes: Record<string, { document: FigmaNode } | undefined>,
	nodeId: string,
): FigmaNode | undefined {
	const direct = nodes[nodeId];
	if (direct !== undefined) return direct.document;
	const entries = Object.values(nodes).filter(
		(v): v is { document: FigmaNode } => v !== undefined,
	);
	return entries[0]?.document;
}

async function fetchRoot(
	client: FigmaClient,
	fileKey: string,
	nodeId: string | undefined,
): Promise<
	| { kind: "ok"; root: FigmaNode; maps: ComponentMaps }
	| { kind: "error"; message: string }
> {
	if (nodeId !== undefined) {
		const result = await client.getFileNodes(fileKey, [nodeId]);
		if (result.kind !== "ok") {
			return { kind: "error", message: clientErrorMessage(result) };
		}
		const root = nodeFromFileNodes(result.data.nodes, nodeId);
		if (root === undefined) {
			return {
				kind: "error",
				message: `Figma returned no node for "${nodeId}" in file ${fileKey}.`,
			};
		}
		const entry =
			result.data.nodes[nodeId] ?? Object.values(result.data.nodes)[0];
		return {
			kind: "ok",
			root,
			maps: {
				...(entry?.components !== undefined
					? { components: entry.components }
					: {}),
				...(entry?.componentSets !== undefined
					? { componentSets: entry.componentSets }
					: {}),
			},
		};
	}
	const result = await client.getFile(fileKey);
	if (result.kind !== "ok") {
		return { kind: "error", message: clientErrorMessage(result) };
	}
	return {
		kind: "ok",
		root: result.data.document,
		maps: {
			...(result.data.components !== undefined
				? { components: result.data.components }
				: {}),
			...(result.data.componentSets !== undefined
				? { componentSets: result.data.componentSets }
				: {}),
		},
	};
}

// ── Implementability rollup ──

interface Implementability {
	frameName: string;
	resolvedCount: number;
	gapCount: number;
	pct: number;
	byReason: Record<string, number>;
	topGaps: { reason: GapReason; requirement: string }[];
}

/** A short, human label for one requirement (for topGaps + the term report). */
function requirementLabel(requirement: FrameRequirement): string {
	return requirement.kind === "component"
		? requirement.name
		: `${requirement.property}: ${requirement.rawValue}`;
}

/** Tally gaps by reason and pick the topGaps (most reasons surface; capped). */
function rollUp(report: GapsReport, frameName: string): Implementability {
	const resolvedCount = report.resolved.length;
	const gapCount = report.gaps.length;
	const total = resolvedCount + gapCount;
	const pct = total === 0 ? 0 : Math.round((100 * resolvedCount) / total);

	const byReason: Record<string, number> = {};
	for (const gap of report.gaps) {
		byReason[gap.reason] = (byReason[gap.reason] ?? 0) + 1;
	}

	const topGaps = report.gaps.slice(0, TOP_GAPS_LIMIT).map((gap: Gap) => ({
		reason: gap.reason,
		requirement: requirementLabel(gap.requirement),
	}));

	return { frameName, resolvedCount, gapCount, pct, byReason, topGaps };
}

// ── Output ──

function renderTerm(impl: Implementability, color: boolean): string {
	const severity = impl.pct >= 80 ? "ok" : impl.pct >= 50 ? "warn" : "error";
	const headline = severityColor(
		severity,
		`Frame "${impl.frameName}" is ${impl.pct}% implementable (${impl.resolvedCount} resolved / ${impl.resolvedCount + impl.gapCount} requirements).`,
		{ color },
	);
	const lines = [headline];
	if (impl.gapCount === 0) {
		lines.push("", "No gaps — every requirement resolves to the system.");
		return lines.join("\n");
	}
	const rows = Object.entries(impl.byReason)
		.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
		.map(([reason, count]) => [reason, String(count)]);
	lines.push(
		"",
		`${impl.gapCount} gap(s) by reason:`,
		renderTable(["reason", "count"], rows, { color }),
	);
	if (impl.topGaps.length > 0) {
		lines.push(
			"",
			"Gaps:",
			renderTable(
				["requirement", "reason"],
				impl.topGaps.map((gap) => [gap.requirement, gap.reason]),
				{ color },
			),
		);
		if (impl.gapCount > impl.topGaps.length) {
			lines.push(
				`… ${impl.gapCount - impl.topGaps.length} more (--format=json)`,
			);
		}
	}
	return lines.join("\n");
}

/** Append ONE frame-impl history line to <cwd>/.ds-bridge/history.jsonl. */
function appendFrameImplHistory(record: FrameImplHistoryRecord): void {
	const stateDir = join(cwd(), ".ds-bridge");
	appendHistoryRecord(stateDir, record);
}

/** Execute the `frame-impl` command. */
async function runFrameImpl(
	url: string,
	options: FrameImplOptions,
): Promise<void> {
	const format = options.format as FrameImplFormat;
	if (format !== "json" && format !== "term") {
		fail(`Unknown --format "${options.format}". Expected "json" or "term".`);
		return;
	}

	// Parse the URL (pure) — bad input is data, exit 2.
	const parsed = parseFigmaUrl(url);
	if (parsed.kind !== "ok") {
		fail(
			`${parsed.message}\nExpected a Figma frame URL like https://www.figma.com/design/<key>/<name>?node-id=1-2`,
		);
		return;
	}

	// Resolve config (token + product_file_keys aliases + default key).
	const projectFileText = readProjectConfigText(cwd());
	const resolved = resolveConfig({
		env: process.env,
		...(projectFileText !== undefined ? { projectFileText } : {}),
	});
	if (resolved.kind !== "ok") {
		fail(resolved.message);
		return;
	}
	for (const warning of resolved.warnings) {
		process.stderr.write(`warning: ${warning}\n`);
	}
	const { config } = resolved;

	if (config.figmaToken.kind === "missing") {
		fail(missingTokenMessage());
		return;
	}

	// File key: --file-key (alias-resolved, M1.3) wins, else the URL's own key.
	const fileKeyOutcome = resolveFileKey({
		...(options.fileKey !== undefined ? { flagValue: options.fileKey } : {}),
		productFileKeys: config.productFileKeys,
		defaultKey: parsed.fileKey,
	});
	if (fileKeyOutcome.kind === "unknown-alias") {
		fail(unknownAliasMessage(fileKeyOutcome, config.productFileKeys));
		return;
	}
	// `missing` is unreachable (the URL always supplies a default key), but handle
	// it defensively rather than asserting.
	if (fileKeyOutcome.kind === "missing") {
		fail("No Figma file key resolved from the URL or --file-key.");
		return;
	}
	const fileKey = fileKeyOutcome.key;

	// Registry: required for component resolution. Missing → actionable stderr.
	const targetDir = cwd();
	const registryPath = join(targetDir, ".ds-bridge", "registry.json");
	const registryOutcome = loadRegistry(registryPath);
	if (registryOutcome.kind === "error") {
		fail(registryOutcome.message);
		return;
	}

	// Tokens: required for token resolution. Missing → the same guidance lint gives.
	const tokensOutcome = loadTokens(targetDir);
	if (tokensOutcome.kind === "error") {
		fail(tokensOutcome.message);
		return;
	}

	// Fetch the frame node tree over REST.
	const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE;
	const client = createFigmaClient({ token: config.figmaToken.value, baseUrl });
	const fetched = await fetchRoot(client, fileKey, parsed.nodeId);
	if (fetched.kind !== "ok") {
		fail(fetched.message);
		return;
	}

	// Derive requirements, resolve against the system (pure), roll up.
	const requirements = deriveRequirements(fetched.root, fetched.maps);
	const gapsReport = findGaps({
		requirements,
		registry: registryOutcome.registry,
		tokens: tokensOutcome.tokens,
	});
	const impl = rollUp(gapsReport, fetched.root.name);

	// History (C11, M2.4): persist the implementability artifact, suppressible with
	// --no-history. The `at` clock read happens at this io edge.
	if (options.history) {
		appendFrameImplHistory({
			at: new Date().toISOString(),
			kind: "frame-impl",
			frameName: impl.frameName,
			fileKey,
			...(parsed.nodeId !== undefined ? { nodeId: parsed.nodeId } : {}),
			resolvedCount: impl.resolvedCount,
			gapCount: impl.gapCount,
			pct: impl.pct,
			byReason: impl.byReason,
			topGaps: impl.topGaps,
		});
	}

	if (format === "json") {
		process.stdout.write(
			`${JSON.stringify(
				{
					frameName: impl.frameName,
					fileKey,
					...(parsed.nodeId !== undefined ? { nodeId: parsed.nodeId } : {}),
					pct: impl.pct,
					resolvedCount: impl.resolvedCount,
					gapCount: impl.gapCount,
					byReason: impl.byReason,
					topGaps: impl.topGaps,
				},
				null,
				2,
			)}\n`,
		);
	} else {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		process.stdout.write(`${renderTerm(impl, color)}\n`);
	}

	process.exitCode = 0;
}

/** Register the `frame-impl` command on the program. Wiring entry for cli.ts. */
export function registerFrameImplCommand(program: Command): void {
	program
		.command("frame-impl")
		.description(
			"Resolve a Figma frame against the system and report its implementability (% on-system)",
		)
		.argument("<url>", "Figma frame URL (file/design/proto, optional node-id)")
		.option(
			"--file-key <keyOrAlias>",
			"target a product file by raw key or product_file_keys alias (default: the URL's key)",
		)
		.option("--format <format>", "output format: term | json", "term")
		.option(
			"--no-history",
			"do not append a frame-impl record to .ds-bridge/history.jsonl in the current directory",
		)
		.action((url: string, options: FrameImplOptions) => {
			void runFrameImpl(url, options);
		});
}
