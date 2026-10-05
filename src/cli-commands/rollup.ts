// R5 — `ds-bridge rollup [sources...] [--config <file>] [--format] [--out]`
// (SPEC-rollup §4, PLAN-analytics-positioning §6.1). The org view: reads several
// repos' already-recorded history LOCALLY (working tree, history file or
// <path>@<git-ref>) and ranks them. Never runs checks, never fetches, never
// writes into a source repo. All judgement lives in the pure rollup engines;
// this edge resolves sources, loads them and prints.
//
// Exit codes: 0 rendered (missing / corrupt / v1 sources are notes, not
// failures) · 2 bad flag / no sources / invalid config / write error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Command } from "commander";
import { buildRollup, type RollupRepoInput } from "../engines/rollup/rollup.js";
import {
	defaultName,
	parseRollupConfig,
	parseSourceArg,
	type SourceSpec,
	uniqueNames,
} from "../engines/rollup/sources.js";
import { spawnGitExec } from "../io/git-log.js";
import { loadRollupSource } from "../io/rollup-sources.js";
import { renderRollupHtml } from "../render/html/rollup.js";
import { renderRollupMarkdown } from "../render/markdown/rollup.js";
import { renderRollupTerm } from "../render/terminal/rollup.js";
import { renderInstant } from "./report.js";

type RollupFormat = "term" | "md" | "json" | "html";
const FORMATS: readonly RollupFormat[] = ["term", "md", "json", "html"];

interface RollupOptions {
	config: string | undefined;
	format: string;
	out: string | undefined;
}

interface Pending {
	name: string | undefined;
	raw: string;
	spec: SourceSpec;
	team?: string;
}

function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** The project dir a config belongs to: the parent of `.ds-bridge/`, else its own dir. */
function configBase(configPath: string): string {
	const dir = dirname(configPath);
	return basename(dir) === ".ds-bridge" ? dirname(dir) : dir;
}

function specFor(raw: string, base: string): SourceSpec {
	const spec = parseSourceArg(raw, (p) => existsSync(resolve(base, p)));
	const out: SourceSpec = { path: resolve(base, spec.path), label: spec.path };
	if (spec.ref !== undefined) out.ref = spec.ref;
	return out;
}

function loadConfig(path: string): Pending[] | undefined {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not read rollup config ${path}: ${detail}`);
		return undefined;
	}
	const parsed = parseRollupConfig(text);
	if (parsed.kind === "error") {
		fail(`${path}: ${parsed.message}`);
		return undefined;
	}
	const base = configBase(path);
	return parsed.entries.map((e) => ({
		name: e.name,
		raw: e.source,
		spec: specFor(e.source, base),
		...(e.team !== undefined ? { team: e.team } : {}),
	}));
}

function runRollup(sources: string[], options: RollupOptions): void {
	const format = options.format as RollupFormat;
	if (!FORMATS.includes(format)) {
		fail(
			`Unknown --format "${options.format}". Expected one of: ${FORMATS.join(", ")}.`,
		);
		return;
	}
	const cwd = process.cwd();
	const pending: Pending[] = [];
	const defaultConfig = join(cwd, ".ds-bridge", "rollup.json");
	const configPath =
		options.config !== undefined
			? resolve(options.config)
			: sources.length === 0 && existsSync(defaultConfig)
				? defaultConfig
				: undefined;
	if (configPath !== undefined) {
		const entries = loadConfig(configPath);
		if (entries === undefined) return;
		pending.push(...entries);
	}
	for (const raw of sources) {
		pending.push({ name: undefined, raw, spec: specFor(raw, cwd) });
	}
	if (pending.length === 0) {
		fail(
			"No sources. Pass repo paths (or <path>@<git-ref>), --config <file>, or add .ds-bridge/rollup.json.",
		);
		return;
	}

	const names = uniqueNames(pending.map((p) => p.name ?? defaultName(p.spec)));
	const inputs: RollupRepoInput[] = pending.map((p, i) => ({
		name: names[i] ?? p.raw,
		source: p.raw,
		...(p.team !== undefined ? { team: p.team } : {}),
		load: loadRollupSource(p.spec, spawnGitExec),
	}));
	const model = buildRollup(inputs, { nowIso: renderInstant() });

	const rendered =
		format === "json"
			? `${JSON.stringify(model, null, 2)}\n`
			: format === "md"
				? renderRollupMarkdown(model)
				: format === "html"
					? renderRollupHtml(model)
					: renderRollupTerm(model);

	if (options.out === undefined) {
		process.stdout.write(rendered);
		process.exitCode = 0;
		return;
	}
	const outPath = resolve(options.out);
	try {
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, rendered, "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not write ${outPath}: ${detail}`);
		return;
	}
	process.stdout.write(`${outPath}\n`);
	process.exitCode = 0;
}

/** Register the `rollup` command on the program. Wiring entry for cli.ts. */
export function registerRollupCommand(program: Command): void {
	program
		.command("rollup")
		.description(
			"Org view across repos: rank several repos' recorded history (local paths, history files or <path>@<git-ref>) by System Score, with on-system %, drift, contrast, readiness and freshness — local only, nothing hosted",
		)
		.argument(
			"[sources...]",
			"repo directories, history.jsonl files, or <path>@<git-ref> (e.g. ../web@origin/ds-bridge-data); default: ./.ds-bridge/rollup.json",
		)
		.option(
			"--config <file>",
			'rollup config: a JSON array of {"name", "source", "team"?} (sources resolve against the config\'s project dir)',
		)
		.option(
			"--format <format>",
			"output format: term | md | json | html",
			"term",
		)
		.option("--out <file>", "write the output to a file instead of stdout")
		.action((sources: string[], options: RollupOptions) => {
			runRollup(sources, options);
		});
}
