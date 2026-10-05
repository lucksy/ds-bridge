// E5 — `ds-bridge analytics [path] [--emit <domain>] [--out <dir>] [--format]`
// (SPEC-analytics-export §3; SPEC-analytics §5, AN8). The Layer-1 front door:
// a REPLAY of the latest history through the same ReportData assembly `report`
// uses (loadReportData) — it never runs checks (`ds-bridge record` does) and
// never touches Figma. All shaping lives in the pure analytics-artifacts engine;
// this edge only resolves the path, writes files and prints.
//
// Exit codes: 0 ok (no-data domains included) · 2 bad flag / path / invalid
// project config / write error.
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import {
	ARTIFACT_FILE,
	buildAnalytics,
	buildDomainArtifact,
	MERGED_ARTIFACT_FILE,
	parseEmit,
	renderAnalyticsTerm,
	stableStringify,
} from "../engines/report/analytics-artifacts.js";
import { loadReportData } from "../io/report-data.js";

interface AnalyticsOptions {
	emit: string | undefined;
	out: string | undefined;
	format: string;
}

function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

function runAnalytics(path: string, options: AnalyticsOptions): void {
	const format = options.format;
	if (format !== "term" && format !== "json") {
		fail(`Unknown --format "${format}". Expected "term" or "json".`);
		return;
	}
	const emit = options.emit !== undefined ? parseEmit(options.emit) : undefined;
	if (emit?.kind === "error") {
		fail(emit.message);
		return;
	}
	if (options.out !== undefined && emit === undefined) {
		fail("--out requires --emit <domain> (nothing is written without --emit).");
		return;
	}
	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return;
	}
	const loaded = loadReportData(targetDir);
	if (loaded.kind === "error") {
		fail(loaded.message);
		return;
	}
	const data = loaded.data;

	if (emit === undefined) {
		const doc = buildAnalytics(data);
		process.stdout.write(
			format === "json" ? stableStringify(doc) : renderAnalyticsTerm(doc),
		);
		process.exitCode = 0;
		return;
	}

	const outDir =
		options.out !== undefined
			? resolve(options.out)
			: join(targetDir, ".ds-bridge", "analytics");
	const files: [string, unknown][] = emit.domains.map((domain) => [
		ARTIFACT_FILE[domain],
		buildDomainArtifact(domain, data),
	]);
	if (emit.merged) files.push([MERGED_ARTIFACT_FILE, buildAnalytics(data)]);

	const written: string[] = [];
	try {
		mkdirSync(outDir, { recursive: true });
		for (const [name, value] of files) {
			const file = join(outDir, name);
			writeFileSync(file, stableStringify(value), "utf8");
			written.push(file);
		}
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not write analytics artifacts to ${outDir}: ${detail}`);
		return;
	}
	process.stdout.write(
		format === "json"
			? `${JSON.stringify({ written }, null, 2)}\n`
			: `${written.join("\n")}\n`,
	);
	process.exitCode = 0;
}

/** Register the `analytics` command on the program. Wiring entry for cli.ts. */
export function registerAnalyticsCommand(program: Command): void {
	program
		.command("analytics")
		.description(
			"Design-system analytics from the recorded history: executive rollup (health · adoption · consistency · debt) and per-domain JSON artifacts",
		)
		.argument("[path]", "project directory", ".")
		.option(
			"--emit <domain>",
			"write a schema-versioned JSON artifact: figma | code | token | git | score | all (all also writes analytics.json)",
		)
		.option(
			"--out <dir>",
			"artifact directory for --emit (default <path>/.ds-bridge/analytics/)",
		)
		.option(
			"--format <format>",
			"output format: term | json (json without --emit prints analytics.json)",
			"term",
		)
		.action((path: string, options: AnalyticsOptions) => {
			runAnalytics(path, options);
		});
}
