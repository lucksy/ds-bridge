// T1.8 — `ds-bridge tokens parse <path>` command builder.
// T3.5 — `ds-bridge tokens check [path]` drift-detection + history subcommand.
// Impure edge: reads the file with node:fs, then drives the pure parser trio.
// All failure modes exit 1 with an actionable stderr message; the engines never
// throw, so every bad-input path is a typed outcome we translate to a message.
import type { Dirent } from "node:fs";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import type { DriftTrendPoint } from "../engines/report/types.js";
import { detectFormat } from "../engines/tokens/detect.js";
import {
	classifyDrift,
	classifyDriftByMode,
	type DriftEntry,
	type DriftResult,
	type ModeTokens,
} from "../engines/tokens/drift.js";
import { parseStyleDictionary } from "../engines/tokens/parse-style-dictionary.js";
import { parseTokensStudio } from "../engines/tokens/parse-tokens-studio.js";
import { parseW3c } from "../engines/tokens/parse-w3c.js";
import {
	type OutputValue,
	scanOutputs,
} from "../engines/tokens/scan-outputs.js";
import { readThemes, themeSubDocument } from "../engines/tokens/themes.js";
import type {
	ParseOutcome,
	Token,
	TokenMap,
	TokenSourceFormat,
} from "../engines/tokens/types.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import { renderDashboard } from "../render/html/dashboard.js";
import {
	type BarChartItem,
	renderBarChart,
	renderTable,
	type Severity,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";

type ParseFormat = "json" | "term";
type CheckFormat = "json" | "term";

/** Max tokens listed in the term table — keeps output scannable. */
const TABLE_LIMIT = 20;

const PARSERS: Record<TokenSourceFormat, (source: unknown) => ParseOutcome> = {
	w3c: parseW3c,
	"tokens-studio": parseTokensStudio,
	"style-dictionary": parseStyleDictionary,
};

/** A short, single-line preview of a token value for the term table. */
function previewValue(value: Token["value"]): string {
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	// Composite values (shadow, typography) collapse to a compact JSON blob.
	return JSON.stringify(value);
}

/** Counts of tokens by type, sorted descending then by type name. */
function countsByType(map: TokenMap): BarChartItem[] {
	const counts = new Map<string, number>();
	for (const token of map.tokens) {
		counts.set(token.type, (counts.get(token.type) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : 1));
}

/** Build the human-readable terminal summary for a successful parse. */
function renderTerm(filePath: string, map: TokenMap, color: boolean): string {
	const heading = `${filePath} — format: ${map.format} — ${map.tokens.length} tokens`;

	const chart = renderBarChart(countsByType(map), { width: 24, color });

	const rows = map.tokens
		.slice(0, TABLE_LIMIT)
		.map((token) => [token.name, token.type, previewValue(token.value)]);
	const table = renderTable(["name", "type", "value"], rows, { color });

	const lines = [heading, "", chart, "", table];
	if (map.tokens.length > TABLE_LIMIT) {
		lines.push("", `… ${map.tokens.length - TABLE_LIMIT} more`);
	}
	return lines.join("\n");
}

/** Read + parse the source file into a TokenMap, or fail with exit code 1. */
function loadTokenMap(filePath: string): TokenMap | undefined {
	let raw: string;
	try {
		raw = readFileSync(filePath, "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		process.stderr.write(`Could not read file "${filePath}": ${detail}\n`);
		process.exitCode = 1;
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		process.stderr.write(`"${filePath}" is not valid JSON: ${detail}\n`);
		process.exitCode = 1;
		return undefined;
	}

	const format = detectFormat(parsed);
	if (format === "unknown") {
		process.stderr.write(
			`Could not detect a supported token format for "${filePath}". Expected W3C, Tokens Studio, or Style Dictionary.\n`,
		);
		process.exitCode = 1;
		return undefined;
	}

	const outcome = PARSERS[format](parsed);
	if (outcome.kind === "error") {
		process.stderr.write(`Failed to parse "${filePath}" as ${format}:\n`);
		for (const err of outcome.errors) {
			const where = err.path !== undefined ? ` (${err.path})` : "";
			process.stderr.write(`  ${err.code}${where}: ${err.message}\n`);
		}
		process.exitCode = 1;
		return undefined;
	}

	// Warnings are non-fatal: surface them on stderr but keep exit 0.
	for (const warning of outcome.warnings) {
		process.stderr.write(`warning: ${warning}\n`);
	}
	return outcome.map;
}

// ---------- `tokens check` (T3.5) ----------

/** Directories never walked for token sources or platform outputs. */
const EXCLUDED_DIRS = new Set([
	"node_modules",
	".git",
	".ds-bridge",
	"dist",
	"out",
	".next",
	"coverage",
]);

/** Extensions scanned as built platform outputs (CSS custom props / TS themes). */
const OUTPUT_EXTENSIONS = [".css", ".scss", ".ts"];

/** Drift entry kind → terminal severity (stale=error, missing=warn, orphan=info). */
const DRIFT_SEVERITY: Record<DriftEntry["kind"], Severity> = {
	"stale-output": "error",
	"missing-output": "warn",
	"orphan-output": "info",
};

/** A typed operational failure, translated to exit code 2 + stderr at the edge. */
interface CheckError {
	kind: "error";
	message: string;
}

/** One appended history record (also the shape read back for the report trend). */
interface HistoryRecord {
	at: string;
	kind: "tokens-check";
	stale: number;
	missing: number;
	orphan: number;
	inSync: boolean;
}

const PARSERS_CHECK: Record<
	TokenSourceFormat,
	(source: unknown) => ParseOutcome
> = {
	w3c: parseW3c,
	"tokens-studio": parseTokensStudio,
	"style-dictionary": parseStyleDictionary,
};

function hasOutputExtension(name: string): boolean {
	const lower = name.toLowerCase();
	return OUTPUT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Recursively collect output-file absolute paths under `dir`, sorted by path. */
function walkOutputFiles(dir: string, acc: string[]): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (EXCLUDED_DIRS.has(entry.name)) continue;
			walkOutputFiles(full, acc);
			continue;
		}
		if (entry.isFile() && hasOutputExtension(entry.name)) acc.push(full);
	}
}

function depthOf(path: string): number {
	return path.split(sep).filter((s) => s.length > 0).length;
}

function isConventionalTokenFile(name: string): boolean {
	if (!name.endsWith(".json")) return false;
	return (
		name === "tokens.json" ||
		name === "design-tokens.json" ||
		name.endsWith(".tokens.json")
	);
}

function isTokenDir(name: string): boolean {
	return name === "tokens" || name === "design-tokens";
}

function collectTokenCandidates(
	dir: string,
	insideTokenDir: boolean,
	acc: string[],
): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (EXCLUDED_DIRS.has(entry.name)) continue;
			collectTokenCandidates(
				full,
				insideTokenDir || isTokenDir(entry.name),
				acc,
			);
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		if (insideTokenDir || isConventionalTokenFile(entry.name)) acc.push(full);
	}
}

/** Detect a file's token format from its shape, or undefined when not a token file. */
function detectFileFormat(absPath: string): TokenSourceFormat | undefined {
	let raw: string;
	try {
		raw = readFileSync(absPath, "utf8");
	} catch {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	const format = detectFormat(parsed);
	return format === "unknown" ? undefined : format;
}

/** Shallowest conventional, shape-verified token file under `root`. */
function discoverFirstTokenSource(root: string): string | undefined {
	const candidates: string[] = [];
	collectTokenCandidates(root, false, candidates);
	const verified = candidates
		.filter((path) => detectFileFormat(path) !== undefined)
		.sort((a, b) => {
			const depth = depthOf(a) - depthOf(b);
			return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
		});
	return verified[0];
}

/**
 * Resolve the token source path, honoring the precedence:
 *   --tokens flag > .ds-bridge.json token_source in the target dir > discovery.
 */
function resolveTokenSource(
	targetDir: string,
	flagTokens: string | undefined,
): { kind: "ok"; path: string } | CheckError {
	if (flagTokens !== undefined) {
		const abs = isAbsolute(flagTokens)
			? flagTokens
			: resolve(process.cwd(), flagTokens);
		if (!existsSync(abs)) {
			return {
				kind: "error",
				message: `Token source "${abs}" (from --tokens) does not exist.`,
			};
		}
		return { kind: "ok", path: abs };
	}

	const configPath = join(targetDir, ".ds-bridge.json");
	if (existsSync(configPath)) {
		let projectFileText: string | undefined;
		try {
			projectFileText = readFileSync(configPath, "utf8");
		} catch {
			projectFileText = undefined;
		}
		if (projectFileText !== undefined) {
			const resolved = resolveConfig({ projectFileText });
			if (resolved.kind === "ok" && resolved.config.tokenSource !== undefined) {
				const src = resolved.config.tokenSource;
				const abs = isAbsolute(src) ? src : resolve(targetDir, src);
				if (existsSync(abs)) return { kind: "ok", path: abs };
				return {
					kind: "error",
					message: `token_source "${abs}" from .ds-bridge.json does not exist.`,
				};
			}
		}
	}

	const discovered = discoverFirstTokenSource(targetDir);
	if (discovered !== undefined) return { kind: "ok", path: discovered };

	return {
		kind: "error",
		message:
			`No design-token source found for "${targetDir}".\n` +
			"Pass one with --tokens <file>, set token_source in .ds-bridge.json, " +
			"or add a conventional token file (tokens.json, design-tokens.json, *.tokens.json).",
	};
}

/**
 * Parse the token source file into a TokenMap, or an error outcome. A Tokens
 * Studio document with two or more `$themes` also yields one map per theme
 * (default first) so drift is checked mode by mode.
 */
function loadTokenMapForCheck(
	tokenPath: string,
): { kind: "ok"; map: TokenMap; modes?: ModeTokens[] } | CheckError {
	let raw: string;
	try {
		raw = readFileSync(tokenPath, "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Could not read token source "${tokenPath}": ${detail}`,
		};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Token source "${tokenPath}" is not valid JSON: ${detail}`,
		};
	}
	const format = detectFormat(parsed);
	if (format === "unknown") {
		return {
			kind: "error",
			message: `Could not detect a supported token format for "${tokenPath}". Expected W3C, Tokens Studio, or Style Dictionary.`,
		};
	}
	const outcome = PARSERS_CHECK[format](parsed);
	if (outcome.kind === "error") {
		const lines = outcome.errors.map((e) => {
			const where = e.path !== undefined ? ` (${e.path})` : "";
			return `  ${e.code}${where}: ${e.message}`;
		});
		return {
			kind: "error",
			message: `Failed to parse token source "${tokenPath}" as ${format}:\n${lines.join("\n")}`,
		};
	}
	const themes = format === "tokens-studio" ? readThemes(parsed) : undefined;
	if (themes === undefined || themes.length < 2) {
		return { kind: "ok", map: outcome.map };
	}
	const modes: ModeTokens[] = [];
	for (const theme of themes) {
		const themed = parseTokensStudio(
			themeSubDocument(parsed as Record<string, unknown>, theme),
		);
		if (themed.kind === "error") {
			const lines = themed.errors.map((e) => {
				const where = e.path !== undefined ? ` (${e.path})` : "";
				return `  ${e.code}${where}: ${e.message}`;
			});
			return {
				kind: "error",
				message: `Failed to parse theme "${theme.name}" of "${tokenPath}":\n${lines.join("\n")}`,
			};
		}
		modes.push({ mode: theme.name, map: themed.map });
	}
	return { kind: "ok", map: outcome.map, modes };
}

/**
 * Scan every output file under `outputsDir`, merging into one value map.
 * Later files win on a name collision (a warning is emitted). The token source
 * file itself is skipped so its JSON is never mis-scanned as an output.
 */
function scanMergedOutputs(
	outputsDir: string,
	tokenSourcePath: string,
): { values: OutputValue[]; warnings: string[] } {
	const files: string[] = [];
	walkOutputFiles(outputsDir, files);
	files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

	// Keyed by scope + name: `--background` under :root and under .dark are two
	// outputs (two modes), not a collision.
	const merged = new Map<string, OutputValue>();
	const ownerByName = new Map<string, string>();
	const warnings: string[] = [];

	for (const file of files) {
		if (resolve(file) === resolve(tokenSourcePath)) continue;
		let content: string;
		try {
			content = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const outcome = scanOutputs({ path: file, content });
		if (outcome.kind !== "ok") continue;
		for (const warning of outcome.warnings) {
			warnings.push(`${relative(outputsDir, file)}: ${warning}`);
		}
		for (const value of outcome.values) {
			const key = `${value.scope ?? ""}\u0000${value.name}`;
			const prior = ownerByName.get(key);
			if (prior !== undefined && prior !== file) {
				warnings.push(
					`output "${value.name}" defined in both ${relative(outputsDir, prior)} and ${relative(outputsDir, file)} — later wins`,
				);
			}
			merged.set(key, value);
			ownerByName.set(key, file);
		}
	}

	const values = [...merged.values()].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	return { values, warnings };
}

/**
 * One output per name, the last scanned winning — the single-mode comparison,
 * where a scoped redefinition (e.g. `.dark`) has no mode of its own.
 */
function latestByName(values: readonly OutputValue[]): OutputValue[] {
	const byName = new Map<string, OutputValue>();
	for (const value of values) byName.set(value.name, value);
	return [...byName.values()];
}

function countByKind(result: DriftResult): {
	stale: number;
	missing: number;
	orphan: number;
} {
	let stale = 0;
	let missing = 0;
	let orphan = 0;
	for (const entry of result.entries) {
		if (entry.kind === "stale-output") stale += 1;
		else if (entry.kind === "missing-output") missing += 1;
		else orphan += 1;
	}
	return { stale, missing, orphan };
}

/** A token name labelled with its theme when the check is mode-aware. */
function withMode(name: string, mode: string | undefined): string {
	return mode === undefined ? name : `${name} (${mode})`;
}

/** One human-readable detail line for a drift entry's table row. */
function driftDetail(entry: DriftEntry): [string, string, string] {
	switch (entry.kind) {
		case "stale-output":
			return [
				withMode(entry.token.name, entry.mode),
				severityColorless(entry.kind),
				`source ${String(entry.token.value)} ≠ output ${entry.output.raw}`,
			];
		case "missing-output":
			return [
				withMode(entry.token.name, entry.mode),
				severityColorless(entry.kind),
				`no output for source ${String(entry.token.value)}`,
			];
		case "orphan-output":
			return [
				entry.output.name,
				severityColorless(entry.kind),
				`output ${entry.output.raw} has no source token`,
			];
	}
}

/** Plain (uncolored) kind label — coloring is applied per-cell where needed. */
function severityColorless(kind: DriftEntry["kind"]): string {
	return kind;
}

/** Render the term summary: severity-colored counts + an entry table. */
function renderCheckTerm(result: DriftResult, color: boolean): string {
	const { stale, missing, orphan } = countByKind(result);

	const countRows = [
		[severityColor("error", "stale-output", { color }), String(stale)],
		[severityColor("warn", "missing-output", { color }), String(missing)],
		[severityColor("info", "orphan-output", { color }), String(orphan)],
	];
	const countsTable = renderTable(["drift", "count"], countRows, { color });

	const total = result.entries.length;
	const heading =
		total === 0
			? `In sync — ${result.inSync} token${result.inSync === 1 ? "" : "s"} match output`
			: `${total} drift entr${total === 1 ? "y" : "ies"} (${result.inSync} in sync)`;

	const lines = [heading, "", countsTable];

	if (total > 0) {
		const rows = result.entries.map((entry) => {
			const [name, kind, detail] = driftDetail(entry);
			const label = severityColor(DRIFT_SEVERITY[entry.kind], kind, { color });
			return [name, label, detail];
		});
		lines.push("", renderTable(["name", "kind", "detail"], rows, { color }));
	}

	return lines.join("\n");
}

/** Serialize the drift result for --format=json. */
function checkJson(result: DriftResult, skippedModes: string[]): string {
	return JSON.stringify(
		{
			entries: result.entries,
			inSync: result.entries.length === 0,
			...(skippedModes.length > 0 ? { skippedModes } : {}),
		},
		null,
		2,
	);
}

/** Append one history record to <stateDir>/history.jsonl (creating the dir). */
function appendHistory(stateDir: string, record: HistoryRecord): void {
	appendHistoryRecord(stateDir, record);
}

/** Map history lines to drift-trend points (stale/missing/orphan per run). */
function readDriftTrend(stateDir: string): DriftTrendPoint[] {
	const historyPath = join(stateDir, "history.jsonl");
	let text: string;
	try {
		text = readFileSync(historyPath, "utf8");
	} catch {
		return [];
	}
	const points: DriftTrendPoint[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		let record: Partial<HistoryRecord>;
		try {
			record = JSON.parse(trimmed) as Partial<HistoryRecord>;
		} catch {
			continue;
		}
		if (record.kind !== "tokens-check") continue;
		const date = typeof record.at === "string" ? record.at.slice(0, 10) : "";
		points.push({
			date,
			breaking: record.stale ?? 0,
			additive: record.missing ?? 0,
			cosmetic: record.orphan ?? 0,
		});
	}
	return points;
}

/** Write the dashboard HTML report under <stateDir>/reports/, return its path. */
function writeReport(
	stateDir: string,
	project: string,
	generatedAt: string,
): string {
	const trend = readDriftTrend(stateDir);
	const html = renderDashboard({
		generatedAt,
		project,
		driftTrend: trend,
	});
	const reportsDir = join(stateDir, "reports");
	mkdirSync(reportsDir, { recursive: true });
	const date = generatedAt.slice(0, 10);
	const reportPath = join(reportsDir, `tokens-${date}.html`);
	writeFileSync(reportPath, html, "utf8");
	return reportPath;
}

interface CheckOptions {
	tokens: string | undefined;
	outputs: string | undefined;
	report: boolean;
	format: string;
}

function failCheck(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Execute the `tokens check` command. Exit codes: 0 in sync · 1 drift · 2 error. */
function runCheck(path: string, options: CheckOptions): void {
	const format = options.format as CheckFormat;
	if (format !== "json" && format !== "term") {
		failCheck(
			`Unknown --format "${options.format}". Expected "json" or "term".`,
		);
		return;
	}

	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		failCheck(`Path "${targetDir}" is not a directory.`);
		return;
	}

	const tokenSource = resolveTokenSource(targetDir, options.tokens);
	if (tokenSource.kind === "error") {
		failCheck(tokenSource.message);
		return;
	}

	const loaded = loadTokenMapForCheck(tokenSource.path);
	if (loaded.kind === "error") {
		failCheck(loaded.message);
		return;
	}

	const outputsDir =
		options.outputs !== undefined ? resolve(options.outputs) : targetDir;
	if (!existsSync(outputsDir) || !statSync(outputsDir).isDirectory()) {
		failCheck(`Outputs path "${outputsDir}" is not a directory.`);
		return;
	}

	const { values, warnings } = scanMergedOutputs(outputsDir, tokenSource.path);
	for (const warning of warnings) {
		process.stderr.write(`warning: ${warning}\n`);
	}

	const byMode =
		loaded.modes !== undefined
			? classifyDriftByMode(loaded.modes, values)
			: undefined;
	const result: DriftResult =
		byMode ?? classifyDrift(loaded.map, latestByName(values));
	const skippedModes = byMode?.skippedModes ?? [];
	for (const mode of skippedModes) {
		process.stderr.write(
			`warning: theme "${mode}" has no output scoped to it (e.g. .${mode} { … } or [data-theme="${mode}"]) — not compared\n`,
		);
	}
	const { stale, missing, orphan } = countByKind(result);
	const inSync = result.entries.length === 0;

	const stateDir = join(targetDir, ".ds-bridge");
	const generatedAt = new Date().toISOString();
	appendHistory(stateDir, {
		at: generatedAt,
		kind: "tokens-check",
		stale,
		missing,
		orphan,
		inSync,
	});

	if (format === "json") {
		process.stdout.write(`${checkJson(result, skippedModes)}\n`);
	} else {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		process.stdout.write(`${renderCheckTerm(result, color)}\n`);
	}

	if (options.report) {
		const reportPath = writeReport(stateDir, targetDir, generatedAt);
		process.stdout.write(`Report: ${reportPath}\n`);
	}

	process.exitCode = inSync ? 0 : 1;
}

/** Register the `tokens` command group on the program. Wiring entry for cli.ts. */
export function registerTokensCommand(program: Command): void {
	const tokens = program
		.command("tokens")
		.description("Inspect and analyze design tokens");

	tokens
		.command("check")
		.description("Detect drift between the token source and built outputs")
		.argument("[path]", "project directory to check", ".")
		.option("--tokens <file>", "explicit token source file")
		.option("--outputs <dir>", "directory of built CSS/SCSS/TS outputs to scan")
		.option(
			"--report",
			"also write an HTML dashboard with the drift trend",
			false,
		)
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: CheckOptions) => {
			runCheck(path, options);
		});

	tokens
		.command("parse")
		.description("Parse a design-token file and print its normalized model")
		.argument("<path>", "path to a W3C / Tokens Studio / Style Dictionary file")
		.option("--format <format>", "output format: json | term", "term")
		.action((path: string, options: { format: string }) => {
			const format = options.format as ParseFormat;
			if (format !== "json" && format !== "term") {
				process.stderr.write(
					`Unknown --format "${options.format}". Expected "json" or "term".\n`,
				);
				process.exitCode = 1;
				return;
			}

			const map = loadTokenMap(path);
			if (map === undefined) return; // exit code + stderr already set

			if (format === "json") {
				process.stdout.write(`${JSON.stringify(map, null, 2)}\n`);
				return;
			}

			const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
			process.stdout.write(`${renderTerm(path, map, color)}\n`);
		});
}
