// T1.8 — `ds-bridge tokens parse <path>` command builder.
// Impure edge: reads the file with node:fs, then drives the pure parser trio.
// All failure modes exit 1 with an actionable stderr message; the engines never
// throw, so every bad-input path is a typed outcome we translate to a message.
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { detectFormat } from "../engines/tokens/detect.js";
import { parseStyleDictionary } from "../engines/tokens/parse-style-dictionary.js";
import { parseTokensStudio } from "../engines/tokens/parse-tokens-studio.js";
import { parseW3c } from "../engines/tokens/parse-w3c.js";
import type {
	ParseOutcome,
	Token,
	TokenMap,
	TokenSourceFormat,
} from "../engines/tokens/types.js";
import {
	type BarChartItem,
	renderBarChart,
	renderTable,
	shouldColor,
} from "../render/terminal/index.js";

type ParseFormat = "json" | "term";

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

/** Register the `tokens` command group on the program. Wiring entry for cli.ts. */
export function registerTokensCommand(program: Command): void {
	const tokens = program
		.command("tokens")
		.description("Inspect and analyze design tokens");

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
