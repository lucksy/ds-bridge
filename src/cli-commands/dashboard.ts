// M2.1 — `ds-bridge dashboard list` command (the composer command group's
// first member; set/add/remove land in M2.2, the setup wizard in M2.3).
//
// `list` reads `.ds-bridge.json` at [path] (via src/config.ts), resolves the
// active artifact selection (via the pure resolveView), and prints the frozen
// catalog with a per-artifact enabled marker. Pure judgement is delegated to
// the catalog/presets engines; bad input becomes an exit code + actionable
// stderr, never a thrown stack.
//
// Exit codes (composer convention, SPEC-measure §3):
//   0  success
//   2  usage/config error (bad --format, invalid .ds-bridge.json)
import { existsSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import { CATALOG } from "../engines/report/catalog.js";
import { resolveView } from "../engines/report/presets.js";
import { renderTable } from "../render/terminal/index.js";

type DashboardFormat = "json" | "term";

interface ListOptions {
	format: string;
}

/** Print a fatal usage/config error and set exit code 2. */
export function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** The project config file name, read relative to a command's [path]. */
const PROJECT_FILE_NAME = ".ds-bridge.json";

/**
 * Read the resolved dashboard selection for a project directory. Returns the
 * ordered enabled ids plus which precedence layer/view produced them, or a
 * typed error message (invalid file, conflicting/unknown selection). The
 * project file's mutual-exclusion + id validity is enforced by resolveConfig;
 * the view name (preset) semantics by resolveView.
 */
export interface ResolvedSelection {
	enabled: Set<string>;
	source: string;
	viewName?: string | undefined;
}

export function readSelection(
	targetDir: string,
):
	| { kind: "ok"; selection: ResolvedSelection }
	| { kind: "error"; message: string } {
	const configPath = join(targetDir, PROJECT_FILE_NAME);
	let projectFileText: string | undefined;
	if (existsSync(configPath)) {
		try {
			projectFileText = readFileSync(configPath, "utf8");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return {
				kind: "error",
				message: `Could not read ${PROJECT_FILE_NAME} at "${configPath}": ${detail}`,
			};
		}
	}

	const resolved = resolveConfig(
		projectFileText !== undefined ? { projectFileText } : {},
	);
	if (resolved.kind === "invalid-project-file") {
		return { kind: "error", message: resolved.message };
	}

	const { dashboardView, dashboardArtifacts } = resolved.config;
	const projectSelection: { view?: string; artifacts?: readonly string[] } = {};
	if (dashboardView !== undefined) projectSelection.view = dashboardView;
	if (dashboardArtifacts !== undefined)
		projectSelection.artifacts = dashboardArtifacts;
	const view = resolveView({}, projectSelection);
	if (view.kind === "conflicting-selection") {
		return {
			kind: "error",
			message:
				"dashboard_view and dashboard_artifacts are mutually exclusive — set one, not both",
		};
	}
	if (view.kind === "unknown-view") {
		const hint =
			view.suggestions.length > 0
				? ` — did you mean ${view.suggestions.join(", ")}?`
				: "";
		return {
			kind: "error",
			message: `Unknown dashboard_view "${view.view}"${hint}`,
		};
	}
	if (view.kind === "unknown-artifact") {
		const hint =
			view.suggestions.length > 0
				? ` — did you mean ${view.suggestions.join(", ")}?`
				: "";
		return {
			kind: "error",
			message: `Unknown artifact id "${view.id}"${hint}`,
		};
	}

	return {
		kind: "ok",
		selection: {
			enabled: new Set(view.artifacts),
			source: view.source,
			viewName: view.viewName,
		},
	};
}

interface ListArtifact {
	id: string;
	title: string;
	personas: string[];
	enabled: boolean;
}

interface ListJson {
	artifacts: ListArtifact[];
	view: { source: string; viewName?: string };
}

/** Project the catalog + resolved selection into the stable JSON shape. */
function toListJson(selection: ResolvedSelection): ListJson {
	const artifacts: ListArtifact[] = CATALOG.map((meta) => ({
		id: meta.id,
		title: meta.title,
		personas: [...meta.personas],
		enabled: selection.enabled.has(meta.id),
	}));
	const view: ListJson["view"] = { source: selection.source };
	if (selection.viewName !== undefined) view.viewName = selection.viewName;
	return { artifacts, view };
}

/** Render the catalog as an aligned term table (id, title, personas, on). */
function renderTerm(data: ListJson): string {
	const rows = data.artifacts.map((a) => [
		a.enabled ? "✓" : " ",
		a.id,
		a.title,
		a.personas.join(", "),
	]);
	const table = renderTable(["on", "id", "title", "personas"], rows, {
		color: false,
	});
	const viewLabel =
		data.view.viewName !== undefined
			? `${data.view.viewName} (${data.view.source})`
			: data.view.source;
	return [`View: ${viewLabel}`, table].join("\n");
}

/** Execute `dashboard list`. */
function runList(path: string, options: ListOptions): void {
	const format = options.format as DashboardFormat;
	if (format !== "json" && format !== "term") {
		fail(`Unknown --format "${options.format}". Expected "term" or "json".`);
		return;
	}

	const targetDir = resolvePath(path);
	const selection = readSelection(targetDir);
	if (selection.kind === "error") {
		fail(selection.message);
		return;
	}

	const data = toListJson(selection.selection);
	if (format === "json") {
		process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
	} else {
		process.stdout.write(`${renderTerm(data)}\n`);
	}
	process.exitCode = 0;
}

/** Register the `dashboard` command group on the program. Wiring for cli.ts. */
export function registerDashboardCommand(program: Command): void {
	const dashboard = program
		.command("dashboard")
		.description(
			"Compose the report dashboard: list / set / add / remove artifacts",
		);

	dashboard
		.command("list")
		.description(
			"List the artifact catalog with an enabled marker for the resolved view",
		)
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: ListOptions) => {
			runList(path, options);
		});
}
