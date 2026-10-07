// T4.5 — `ds-bridge handoff <url>` command builder. Pre-handoff QA: fetch a
// Figma frame over REST, score its machine-readability, and report it (term or
// json), gating the exit code on a readiness threshold for CI use.
//
// Impure edge: it performs HTTP through the injectable Figma client and reads
// config from the environment. All judgement is delegated to the pure engines
// (parse-url, score). Bad input becomes an exit code + actionable stderr, never
// a thrown stack trace; the client/engines never throw, so each failure mode is
// a typed outcome we translate here.
//
// Exit codes:
//   0  score >= threshold (gate passed)
//   1  score <  threshold (gate failed) — CI-friendly
//   2  operational error (invalid URL, missing token, API error)
//
// --comment posts the top deductions as ONE Figma comment, but only with the
// explicit --comment flag AND --yes (a non-interactive confirmation). Without
// --yes we refuse and still report — never write to Figma on a guess.
import { join } from "node:path";
import { cwd } from "node:process";
import type { Command } from "commander";
import { readProjectConfigText, resolveConfig } from "../config.js";
import { parseFigmaUrl } from "../engines/handoff/parse-url.js";
import {
	type ReadinessReport,
	type RuleId,
	type ScoreReadinessOptions,
	scoreReadiness,
} from "../engines/handoff/score.js";
import {
	createFigmaClient,
	type FigmaClient,
	type FigmaFile,
	type FigmaFileNodes,
	type FigmaNode,
	type FigmaResult,
} from "../io/figma/client.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import {
	renderTable,
	type Severity,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";
import {
	figmaAuthErrorMessage,
	missingFigmaTokenMessage,
} from "./figma-auth-help.js";

type HandoffFormat = "json" | "term";

/** How many deductions are listed in the term report / comment body. */
const DEDUCTION_LIMIT = 10;

const DEFAULT_FIGMA_API_BASE = "https://api.figma.com";

/** Human-readable label per deduction rule. */
const RULE_LABEL: Record<string, string> = {
	"var-binding": "Variable binding",
	"auto-layout": "Auto layout",
	component: "Component usage",
	naming: "Naming",
};

interface HandoffOptions {
	threshold: string | undefined;
	format: string;
	comment: boolean;
	yes: boolean;
	/** Commander maps the negatable `--no-history` flag to `history: false`. */
	history: boolean;
}

/** How many top deductions are recorded in the history line. */
const HISTORY_DEDUCTION_LIMIT = 3;

/**
 * One appended handoff history record (read back by `report` for the readiness
 * gauge). Mirrors the tokens-check / lint append pattern. The deductions carry
 * only the rule + points (the report maps the rule to a human-readable reason).
 */
interface HandoffHistoryRecord {
	at: string;
	kind: "handoff";
	score: number;
	frameName: string;
	/** H7: the frame identity, so readiness can be trended per frame. */
	fileKey: string;
	nodeId?: string;
	deductions: { rule: RuleId; points: number }[];
}

/**
 * Append ONE handoff history line to <cwd>/.ds-bridge/history.jsonl.
 *
 * The directory is the process working directory (documented: the project the
 * user runs `ds-bridge handoff` from, the same place `report` reads). Suppressed
 * by `--no-history`. The record keeps the top {@link HISTORY_DEDUCTION_LIMIT}
 * deductions (the report already sorts worst-first).
 */
function appendHandoffHistory(
	report: ReadinessReport,
	frameName: string,
	frame: { fileKey: string; nodeId?: string },
): void {
	const stateDir = join(cwd(), ".ds-bridge");
	const record: HandoffHistoryRecord = {
		at: new Date().toISOString(),
		kind: "handoff",
		score: report.score,
		frameName,
		fileKey: frame.fileKey,
		...(frame.nodeId !== undefined ? { nodeId: frame.nodeId } : {}),
		deductions: report.deductions
			.slice(0, HISTORY_DEDUCTION_LIMIT)
			.map((d) => ({ rule: d.rule, points: d.points })),
	};
	appendHistoryRecord(stateDir, record);
}

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Guidance shown when no Figma PAT is configured. Scopes per SPEC §3. */
function missingTokenMessage(): string {
	return missingFigmaTokenMessage([
		"Create the token at figma.com → Settings → Security → Personal access",
		"tokens, with these scopes:",
		"  file_content:read, library_content:read, file_versions:read,",
		"  file_comments:read, file_comments:write",
		"",
		"Note: the PAT must come from a Dev or Full seat — a View seat is rate-",
		"limited to roughly a handful of requests per month and cannot be used here.",
	]);
}

/** Translate a non-ok Figma client result into an actionable stderr message. */
function clientErrorMessage(
	result: Exclude<FigmaResult<unknown>, { kind: "ok" }>,
): string {
	switch (result.kind) {
		case "auth-error":
			return figmaAuthErrorMessage(result);
		case "scope-error":
			return `Figma token is missing a required scope: ${result.message}. The token needs file_content:read (and file_comments:write for --comment).`;
		case "not-found":
			return "Figma could not find that file or node. Check the frame URL is correct and the token's account can access the file.";
		case "rate-limited":
			return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited — use a Dev/Full-seat PAT.`;
		case "network-error":
			return `Could not reach the Figma API: ${result.message}.`;
	}
}

/** Round a deduction's points to one decimal for compact display. */
function formatPoints(points: number): string {
	return points.toFixed(1).replace(/\.0$/, "");
}

/** Map a deduction rule to a terminal severity for coloring. */
function ruleSeverity(): Severity {
	return "error";
}

/** Render the human-readable term report for a readiness score. */
function renderTerm(
	report: ReadinessReport,
	threshold: number,
	color: boolean,
): string {
	const passed = report.score >= threshold;
	const scoreSeverity: Severity = passed ? "ok" : "error";
	const verdict = passed ? "PASS" : "BELOW THRESHOLD";
	const scoreLine = severityColor(
		scoreSeverity,
		`Readiness ${report.score}/100 (threshold ${threshold}) — ${verdict}`,
		{ color },
	);

	const { stats } = report;
	const statsRows: string[][] = [
		["nodes", String(stats.totalNodes)],
		["bound coverage", `${Math.round(stats.boundCoverage * 100)}%`],
		["auto-layout coverage", `${Math.round(stats.autoLayoutCoverage * 100)}%`],
		["instances", String(stats.instanceCount)],
		["detached suspects", String(stats.detachedSuspects)],
		["default names", String(stats.badNames)],
	];
	const statsTable = renderTable(["stat", "value"], statsRows, { color });

	const lines = [scoreLine, "", statsTable];

	if (report.deductions.length > 0) {
		const listed = report.deductions.slice(0, DEDUCTION_LIMIT);
		const rows = listed.map((d) => [
			severityColor(ruleSeverity(), RULE_LABEL[d.rule] ?? d.rule, { color }),
			`${d.nodeName} (${d.nodeId})`,
			`-${formatPoints(d.points)}`,
			d.fix,
		]);
		const table = renderTable(["rule", "node", "points", "fix"], rows, {
			color,
		});
		lines.push("", `${report.deductions.length} deduction(s):`, table);
		if (report.deductions.length > DEDUCTION_LIMIT) {
			lines.push(`… ${report.deductions.length - DEDUCTION_LIMIT} more`);
		}
	} else {
		lines.push("", "No deductions — this frame is handoff-ready.");
	}

	return lines.join("\n");
}

/** Build the single Figma comment body summarizing the score + top deductions. */
function commentBody(report: ReadinessReport, threshold: number): string {
	const verdict = report.score >= threshold ? "passes" : "is below";
	const header = `Handoff readiness: ${report.score}/100 — ${verdict} the ${threshold} threshold.`;
	if (report.deductions.length === 0) {
		return `${header}\nNo deductions — this frame is handoff-ready.`;
	}
	const listed = report.deductions.slice(0, DEDUCTION_LIMIT);
	const lines = listed.map(
		(d) =>
			`• ${RULE_LABEL[d.rule] ?? d.rule} (-${formatPoints(d.points)}): ${d.nodeName} — ${d.fix}`,
	);
	const more =
		report.deductions.length > DEDUCTION_LIMIT
			? [`… and ${report.deductions.length - DEDUCTION_LIMIT} more`]
			: [];
	return [header, "Top deductions:", ...lines, ...more].join("\n");
}

/** Validate + clamp the --threshold flag against the config default. */
function resolveThreshold(
	flag: string | undefined,
	configDefault: number,
): { kind: "ok"; value: number } | { kind: "error"; message: string } {
	if (flag === undefined) return { kind: "ok", value: configDefault };
	const n = Number(flag);
	if (!Number.isFinite(n) || n < 0 || n > 100) {
		return {
			kind: "error",
			message: `--threshold must be a number between 0 and 100 (got ${JSON.stringify(flag)}).`,
		};
	}
	return { kind: "ok", value: n };
}

type NodeEntry = NonNullable<FigmaFileNodes["nodes"][string]>;

/** Extract the scored node entry from a getFileNodes result for one node id. */
function nodeFromFileNodes(
	nodes: FigmaFileNodes["nodes"],
	nodeId: string,
): NodeEntry | undefined {
	const direct = nodes[nodeId];
	if (direct !== undefined) return direct;
	// Defensive: the API echoes the requested id verbatim, but fall back to the
	// single returned entry if the key differs (e.g. canonicalization mismatch).
	const entries = Object.values(nodes).filter(
		(v): v is NodeEntry => v !== undefined,
	);
	return entries[0];
}

/** The components maps scoreReadiness reads to spot deprecated instances. */
function componentMaps(source: {
	components?: FigmaFile["components"];
	componentSets?: FigmaFile["componentSets"];
}): ScoreReadinessOptions {
	return {
		...(source.components !== undefined
			? { components: source.components }
			: {}),
		...(source.componentSets !== undefined
			? { componentSets: source.componentSets }
			: {}),
	};
}

/** Fetch the node tree to score: a subtree when nodeId is present, else the root. */
async function fetchRoot(
	client: FigmaClient,
	fileKey: string,
	nodeId: string | undefined,
): Promise<
	| { kind: "ok"; root: FigmaNode; maps: ScoreReadinessOptions }
	| { kind: "error"; message: string }
> {
	if (nodeId !== undefined) {
		const result = await client.getFileNodes(fileKey, [nodeId]);
		if (result.kind !== "ok") {
			return { kind: "error", message: clientErrorMessage(result) };
		}
		const entry = nodeFromFileNodes(result.data.nodes, nodeId);
		if (entry === undefined) {
			return {
				kind: "error",
				message: `Figma returned no node for "${nodeId}" in file ${fileKey}.`,
			};
		}
		return { kind: "ok", root: entry.document, maps: componentMaps(entry) };
	}

	const result = await client.getFile(fileKey);
	if (result.kind !== "ok") {
		return { kind: "error", message: clientErrorMessage(result) };
	}
	return {
		kind: "ok",
		root: result.data.document,
		maps: componentMaps(result.data),
	};
}

/** Execute the `handoff` command. */
async function runHandoff(url: string, options: HandoffOptions): Promise<void> {
	const format = options.format as HandoffFormat;
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

	// Resolve config from the environment and the project file in cwd (token,
	// readiness_threshold gate).
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

	const threshold = resolveThreshold(
		options.threshold,
		config.readinessThreshold,
	);
	if (threshold.kind === "error") {
		fail(threshold.message);
		return;
	}

	const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE;
	const client = createFigmaClient({
		token: config.figmaToken.value,
		baseUrl,
	});

	const fetched = await fetchRoot(client, parsed.fileKey, parsed.nodeId);
	if (fetched.kind !== "ok") {
		fail(fetched.message);
		return;
	}

	const report = scoreReadiness(fetched.root, fetched.maps);

	// History: record the score for the dashboard readiness gauge (suppressible
	// with --no-history). The frame name is the scored root node's name.
	if (options.history) {
		appendHandoffHistory(report, fetched.root.name, {
			fileKey: parsed.fileKey,
			...(parsed.nodeId !== undefined ? { nodeId: parsed.nodeId } : {}),
		});
	}

	if (format === "json") {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		process.stdout.write(`${renderTerm(report, threshold.value, color)}\n`);
	}

	// --comment: post ONE comment, but only with explicit --yes confirmation.
	if (options.comment) {
		if (!options.yes) {
			process.stderr.write(
				"refusing to comment without --yes (pass --comment --yes to write the summary to Figma)\n",
			);
		} else {
			const clientMeta =
				parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : undefined;
			const posted = await client.postComment(
				parsed.fileKey,
				commentBody(report, threshold.value),
				clientMeta,
			);
			if (posted.kind !== "ok") {
				// A comment failure is non-fatal to the report; warn and keep the
				// gate's exit code so CI still sees the readiness verdict.
				process.stderr.write(
					`warning: could not post the Figma comment: ${clientErrorMessage(posted)}\n`,
				);
			} else {
				process.stdout.write(`Posted Figma comment ${posted.data.id}.\n`);
			}
		}
	}

	// CI gate semantics: exit 0 when at/above the threshold, else 1.
	process.exitCode = report.score >= threshold.value ? 0 : 1;
}

/** Register the `handoff` command on the program. Wiring entry for cli.ts. */
export function registerHandoffCommand(program: Command): void {
	program
		.command("handoff")
		.description("Score a Figma frame's pre-handoff machine-readability")
		.argument("<url>", "Figma frame URL (file/design/proto, optional node-id)")
		.option(
			"--threshold <n>",
			"readiness gate (0-100); exit 1 below it (default from config, 80)",
		)
		.option("--format <format>", "output format: term | json", "term")
		.option(
			"--comment",
			"post the score + top deductions as ONE Figma comment (requires --yes)",
			false,
		)
		.option(
			"--yes",
			"confirm writing the --comment to Figma without an interactive prompt",
			false,
		)
		.option(
			"--no-history",
			"do not append a readiness record to .ds-bridge/history.jsonl in the current directory",
		)
		.action((url: string, options: HandoffOptions) => {
			void runHandoff(url, options);
		});
}
