// M2.1/M2.2 — `ds-bridge dashboard` command group (the composer). `list` prints
// the catalog with an enabled marker; `set` / `add` / `remove` edit the
// persisted view in `.ds-bridge.json`. The setup wizard lives in
// dashboard-wizard.ts (M2.3, split mandated).
//
// All three editors read `.ds-bridge.json` at [path] (via src/config.ts),
// resolve the active selection (via the pure resolveView), and persist through
// the sanctioned writeProjectConfig. Pure judgement is delegated to the
// catalog/presets engines; bad input becomes an exit code + actionable stderr,
// never a thrown stack.
//
// Exit codes (composer convention, SPEC-measure §3):
//   0  success
//   2  usage/config error (bad --format/preset/id, conflicting flags,
//      invalid .ds-bridge.json)
import { existsSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import type { Command } from "commander";
import { resolveConfig, writeProjectConfig } from "../config.js";
import {
	type ArtifactId,
	CATALOG,
	lookupArtifact,
} from "../engines/report/catalog.js";
import { resolveView } from "../engines/report/presets.js";
import { renderTable } from "../render/terminal/index.js";

type DashboardFormat = "json" | "term";

interface ListOptions {
	format: string;
}

interface SetOptions {
	view?: string;
	artifacts?: string;
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
	/** The ordered selection, as resolveView produced it. */
	artifacts: ArtifactId[];
	enabled: Set<ArtifactId>;
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
			artifacts: view.artifacts,
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

/**
 * Validate + parse a comma-separated `--artifacts` value into ordered ids, or a
 * typed error carrying nearest-match suggestions for the first unknown id.
 * Empty entries are ignored; an all-empty value is a usage error.
 */
function parseArtifacts(
	raw: string,
): { kind: "ok"; ids: ArtifactId[] } | { kind: "error"; message: string } {
	const requested = raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (requested.length === 0) {
		return {
			kind: "error",
			message: "--artifacts needs at least one artifact id (comma-separated).",
		};
	}
	const seen = new Set<ArtifactId>();
	const ids: ArtifactId[] = [];
	for (const entry of requested) {
		const outcome = lookupArtifact(entry);
		if (outcome.kind === "unknown") {
			const hint =
				outcome.suggestions.length > 0
					? ` — did you mean ${outcome.suggestions.join(", ")}?`
					: "";
			return {
				kind: "error",
				message: `Unknown artifact id "${entry}"${hint}`,
			};
		}
		if (!seen.has(outcome.artifact.id)) {
			seen.add(outcome.artifact.id);
			ids.push(outcome.artifact.id);
		}
	}
	return { kind: "ok", ids };
}

/** Execute `dashboard set --view <preset>` XOR `--artifacts <a,b>`. */
function runSet(path: string, options: SetOptions): void {
	const hasView = options.view !== undefined;
	const hasArtifacts = options.artifacts !== undefined;
	if (hasView && hasArtifacts) {
		fail("--view and --artifacts are mutually exclusive — set one, not both.");
		return;
	}
	if (!hasView && !hasArtifacts) {
		fail(
			"Specify a view or an artifact list: --view <preset> | --artifacts <a,b,…>.",
		);
		return;
	}

	const targetDir = resolvePath(path);

	if (hasView) {
		// Validate the preset name by resolving it as a flags-level view; an
		// unknown name surfaces resolveView's typed unknown-view with suggestions.
		const view = options.view as string;
		const resolved = resolveView({ view }, {});
		if (resolved.kind === "unknown-view") {
			const hint =
				resolved.suggestions.length > 0
					? ` — did you mean ${resolved.suggestions.join(", ")}?`
					: "";
			fail(`Unknown view "${view}"${hint}`);
			return;
		}
		// set --view writes dashboard_view AND deletes dashboard_artifacts
		// (undefined-patch) so the two keys never coexist (SPEC-measure §3).
		writeProjectConfig(targetDir, {
			dashboard_view: view,
			dashboard_artifacts: undefined,
		});
		process.stdout.write(`View set to "${view}".\n`);
		process.exitCode = 0;
		return;
	}

	const parsed = parseArtifacts(options.artifacts as string);
	if (parsed.kind === "error") {
		fail(parsed.message);
		return;
	}
	// set --artifacts writes the explicit list AND deletes dashboard_view.
	writeProjectConfig(targetDir, {
		dashboard_artifacts: parsed.ids,
		dashboard_view: undefined,
	});
	process.stdout.write(`Artifacts set to ${parsed.ids.join(", ")}.\n`);
	process.exitCode = 0;
}

/** The one-line notice printed when an edit materializes a preset/default. */
const MATERIALIZE_NOTICE =
	"Your view is now an explicit list and will not auto-gain future preset artifacts.";

/**
 * Shared edit path for `add`/`remove`: resolve the current selection,
 * MATERIALIZE it to an explicit ordered list (printing the §3 notice unless it
 * was already an explicit list), apply `edit`, then persist. A no-op edit
 * succeeds with a notice and does not rewrite the file's selection meaning.
 */
function runEdit(path: string, rawId: string, mode: "add" | "remove"): void {
	const outcome = lookupArtifact(rawId);
	if (outcome.kind === "unknown") {
		const hint =
			outcome.suggestions.length > 0
				? ` — did you mean ${outcome.suggestions.join(", ")}?`
				: "";
		fail(`Unknown artifact id "${rawId}"${hint}`);
		return;
	}
	const id = outcome.artifact.id;

	const targetDir = resolvePath(path);
	const current = readSelection(targetDir);
	if (current.kind === "error") {
		fail(current.message);
		return;
	}

	const wasExplicitList =
		current.selection.source === "project" &&
		current.selection.viewName === undefined;
	const before = current.selection.artifacts;
	const present = current.selection.enabled.has(id);

	// Idempotent no-ops: adding a present id or removing an absent one.
	if (mode === "add" && present) {
		process.stdout.write(`"${id}" is already in your view — no change.\n`);
		process.exitCode = 0;
		return;
	}
	if (mode === "remove" && !present) {
		process.stdout.write(`"${id}" is not in your view — no change.\n`);
		process.exitCode = 0;
		return;
	}

	const next =
		mode === "add"
			? [...before, id]
			: before.filter((existing) => existing !== id);

	// Materialize: an explicit list always replaces whatever was there. Print the
	// §3 notice unless the view was ALREADY an explicit list (no opt-out happens).
	writeProjectConfig(targetDir, {
		dashboard_artifacts: next,
		dashboard_view: undefined,
	});
	if (!wasExplicitList) {
		process.stdout.write(`${MATERIALIZE_NOTICE}\n`);
	}
	const verb = mode === "add" ? "Added" : "Removed";
	process.stdout.write(`${verb} "${id}". View: ${next.join(", ")}.\n`);
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

	dashboard
		.command("set")
		.description(
			"Persist the dashboard view: --view <preset> XOR --artifacts <a,b,…>",
		)
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.option("--view <preset>", "persona preset name")
		.option("--artifacts <ids>", "comma-separated explicit artifact ids")
		.action((path: string, options: SetOptions) => {
			runSet(path, options);
		});

	dashboard
		.command("add")
		.description(
			"Add an artifact to the view (materializes the current preset first)",
		)
		.argument("<artifact>", "artifact id to add")
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.action((artifact: string, path: string) => {
			runEdit(path, artifact, "add");
		});

	dashboard
		.command("remove")
		.description(
			"Remove an artifact from the view (materializes the current preset first)",
		)
		.argument("<artifact>", "artifact id to remove")
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.action((artifact: string, path: string) => {
			runEdit(path, artifact, "remove");
		});
}
