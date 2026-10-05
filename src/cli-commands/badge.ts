// S5b — `ds-bridge badge [path] [--out <file>]` command. Reads the project's
// history.jsonl, replays it into the weighted system score (the SAME pure engine
// the dashboard uses), renders a self-contained badge SVG and writes it to disk.
//
// Impure edge: reads <path>/.ds-bridge/history.jsonl + the project .ds-bridge.json
// (for score_weights), writes the SVG. All judgement is delegated to the pure
// engine (scoreFromHistory) and the pure renderer (renderBadge). A plain
// writeFileSync (the report-writer precedent — no atomic dance for a derived
// artifact), mkdir as needed. The path is printed on success.
//
// Exit codes: 0 success · 2 operational error (path not a directory, no history /
// no score-relevant data → naming the commands that create history, unwritable
// --out). CLI-only — no slash wrapper.
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Command } from "commander";
import { type ResolvedConfig, resolveConfig } from "../config.js";
import { resolveView } from "../engines/report/presets.js";
import {
	resolveWeightProfile,
	scoreFromHistory,
	type WeightProfile,
} from "../engines/report/score.js";
import { renderBadge } from "../render/html/badge.js";

interface BadgeOptions {
	out: string | undefined;
}

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/**
 * Guidance shown when there is no history yet, or no score-relevant data in it.
 * Names the commands that populate history.jsonl so the score has something to
 * compute from.
 */
function noDataMessage(historyPath: string): string {
	return [
		`No system-score data in ${historyPath}.`,
		"",
		"The badge is computed by replaying the project history. Populate it first by",
		"running a check that appends a history line, for example:",
		"",
		"  /ds-bridge:ds-lint        — DS-aware lint violations",
		"  ds-bridge tokens check    — token drift (token-check)",
		"",
		"Then run `ds-bridge badge` again.",
	].join("\n");
}

/** Read <path>/.ds-bridge.json text (for score_weights), or undefined when absent. */
function readProjectConfigText(targetDir: string): string | undefined {
	const configPath = join(targetDir, ".ds-bridge.json");
	if (!existsSync(configPath)) return undefined;
	try {
		return readFileSync(configPath, "utf8");
	} catch {
		return undefined;
	}
}

/**
 * The project's effective score weights with the SAME C2 precedence the
 * dashboard uses (active view's by-view override > global score_weights >
 * engine defaults). The active view is the project's configured dashboard_view
 * (resolveView over the project config alone); a custom artifact list or the
 * default carries no viewName → no by-view profile. Shared with `record` (H5)
 * so the stored score equals the badge and the dashboard.
 */
export function weightProfileForConfig(cfg: ResolvedConfig): WeightProfile {
	const view = resolveView(
		{},
		{
			...(cfg.dashboardView !== undefined ? { view: cfg.dashboardView } : {}),
			...(cfg.dashboardArtifacts !== undefined
				? { artifacts: cfg.dashboardArtifacts }
				: {}),
		},
	);
	const viewName =
		view.kind === "ok" && view.source !== "default" ? view.viewName : undefined;
	return resolveWeightProfile(
		viewName,
		cfg.scoreWeights,
		cfg.scoreWeightsByView,
	);
}

/** Execute the `badge` command. Exit codes: 0 success · 2 operational error. */
function runBadge(path: string, options: BadgeOptions): void {
	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return;
	}

	const stateDir = join(targetDir, ".ds-bridge");
	const historyPath = join(stateDir, "history.jsonl");

	let historyText: string;
	try {
		historyText = readFileSync(historyPath, "utf8");
	} catch {
		// Absent history → exit 2 naming the history-creating commands.
		fail(noDataMessage(historyPath));
		return;
	}

	// Weights from the project config, resolved with the SAME C2 precedence the
	// dashboard uses (active view's by-view override > global score_weights >
	// engine defaults) so a PR badge shows the SAME number as the dashboard. The
	// badge has no --view flag, so the active view is the project's configured
	// dashboard_view (resolveView over the project config alone); a custom
	// artifact list or the default carries no viewName → no by-view profile.
	// Render-scoped — never written back. Engine defaults when no config at all.
	const projectFileText = readProjectConfigText(targetDir);
	let weightProfile = resolveWeightProfile(undefined, undefined, undefined);
	if (projectFileText !== undefined) {
		const resolved = resolveConfig({ projectFileText });
		if (resolved.kind !== "ok") {
			fail(resolved.message);
			return;
		}
		weightProfile = weightProfileForConfig(resolved.config);
	}

	const outcome = scoreFromHistory(historyText, weightProfile.weights);
	if (outcome.kind === "no-data") {
		fail(noDataMessage(historyPath));
		return;
	}

	const svg = renderBadge({ score: outcome.current });

	const outPath =
		options.out !== undefined
			? resolve(options.out)
			: join(stateDir, "badge.svg");

	try {
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, svg, "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not write badge to "${outPath}": ${detail}`);
		return;
	}

	process.stdout.write(`${outPath}\n`);
	process.exitCode = 0;
}

/** Register the `badge` command on the program. Wiring entry for cli.ts. */
export function registerBadgeCommand(program: Command): void {
	program
		.command("badge")
		.description(
			"Render a self-contained system-score SVG badge from the project history",
		)
		.argument("[path]", "project directory to badge", ".")
		.option("--out <file>", "output file (default <path>/.ds-bridge/badge.svg)")
		.action((path: string, options: BadgeOptions) => {
			runBadge(path, options);
		});
}
