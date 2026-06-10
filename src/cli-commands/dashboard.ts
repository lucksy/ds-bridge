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
import { appendFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import type { Command } from "commander";
import { resolveConfig, writeProjectConfig } from "../config.js";
import {
	type ArtifactId,
	CATALOG,
	lookupArtifact,
} from "../engines/report/catalog.js";
import { matchPhrase } from "../engines/report/nl-match.js";
import {
	PRESET_DESCRIPTIONS,
	PRESET_NAMES,
	PRESETS,
	resolveView,
} from "../engines/report/presets.js";
import {
	type DashboardMeta,
	listDashboards,
	readDashboardFile,
	writeDashboardFile,
} from "../io/dashboards.js";
import { renderTable } from "../render/terminal/index.js";
import { runSetupWizard } from "./dashboard-wizard.js";

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

/** One preset summary for the persona wizard (M7.1): name + lens + members. */
interface ListPreset {
	name: string;
	description: string;
	artifacts: string[];
}

interface ListJson {
	artifacts: ListArtifact[];
	presets: ListPreset[];
	view: { source: string; viewName?: string };
}

/** The seven presets with descriptions + member ids, in PRESET_NAMES order. */
function listPresets(): ListPreset[] {
	return PRESET_NAMES.map((name) => ({
		name,
		description: PRESET_DESCRIPTIONS[name],
		artifacts: [...PRESETS[name]],
	}));
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
	return { artifacts, presets: listPresets(), view };
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
/**
 * Edit a SAVED dashboard's artifact list (M8.4): read it, materialize its
 * selection to an ordered list, add/remove the id, and write the explicit list
 * back — to the file that backs it (shared unless only a `.local` exists),
 * preserving advisory meta. Idempotent no-ops succeed; unknown name → exit 2.
 */
function runEditDashboard(
	targetDir: string,
	name: string,
	id: ArtifactId,
	mode: "add" | "remove",
): void {
	const read = readDashboardFile(targetDir, name);
	if (read.kind === "not-found") {
		failUnknownDashboard(targetDir, name);
		return;
	}
	if (read.kind === "invalid") {
		fail(`Dashboard "${name}" is invalid: ${read.message}`);
		return;
	}
	const sel = read.dashboard.selection;
	const resolved = resolveView(
		sel.kind === "view" ? { view: sel.view } : { artifacts: sel.artifacts },
		{},
	);
	if (resolved.kind !== "ok") {
		fail(`Dashboard "${name}" has an unresolvable selection.`);
		return;
	}
	const before = resolved.artifacts;
	const present = before.includes(id);
	if (mode === "add" && present) {
		process.stdout.write(`"${id}" is already in "${name}" — no change.\n`);
		process.exitCode = 0;
		return;
	}
	if (mode === "remove" && !present) {
		process.stdout.write(`"${id}" is not in "${name}" — no change.\n`);
		process.exitCode = 0;
		return;
	}
	const next =
		mode === "add"
			? [...before, id]
			: before.filter((existing) => existing !== id);
	// Write back to the file that backs the dashboard: shared if it exists,
	// otherwise the local file (listDashboards markers tell us which).
	const entry = listDashboards(targetDir).find((e) => e.name === name);
	const local = entry !== undefined && !entry.hasShared && entry.hasLocal;
	writeDashboardFile(
		targetDir,
		name,
		{ artifacts: next },
		{ local, meta: metaFrom(read.dashboard) },
	);
	const verb = mode === "add" ? "Added" : "Removed";
	process.stdout.write(
		`${verb} "${id}" in "${name}". View: ${next.join(", ")}.\n`,
	);
	process.exitCode = 0;
}

function runEdit(
	path: string,
	rawId: string,
	mode: "add" | "remove",
	dashboardName?: string,
): void {
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

	// --dashboard <name> (M8.4): edit a SAVED dashboard's artifact list (materialize
	// its selection, apply, write back), rather than the project config.
	if (dashboardName !== undefined) {
		runEditDashboard(targetDir, dashboardName, id, mode);
		return;
	}
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

/** Fail with an `Unknown dashboard "<name>"` + available-names message (M8.4). */
function failUnknownDashboard(targetDir: string, name: string): void {
	const names = listDashboards(targetDir).map((e) => e.name);
	const available =
		names.length > 0
			? ` Available: ${names.join(", ")}.`
			: " No saved dashboards in dashboards/.";
	fail(`Unknown dashboard "${name}".${available}`);
}

/** Reconstruct the advisory meta from a read dashboard (for edit/write-back). */
function metaFrom(dashboard: {
	persona?: string;
	reportType?: DashboardMeta["report_type"];
	audience?: string;
	scoreWeights?: DashboardMeta["score_weights"];
}): DashboardMeta {
	const meta: DashboardMeta = {};
	if (dashboard.persona !== undefined) meta.persona = dashboard.persona;
	if (dashboard.reportType !== undefined)
		meta.report_type = dashboard.reportType;
	if (dashboard.audience !== undefined) meta.audience = dashboard.audience;
	if (dashboard.scoreWeights !== undefined) {
		meta.score_weights = dashboard.scoreWeights;
	}
	return meta;
}

/** Options for `dashboard save`. */
interface SaveOptions {
	fromCurrent?: boolean;
	view?: string;
	artifacts?: string;
	freeze?: boolean;
	local?: boolean;
}

/**
 * Append `dashboards/*.local.json` to `.gitignore` on the first `--local` save
 * (idempotent — never duplicates the line). Personal dashboards stay out of git;
 * the shared `dashboards/*.json` are committed.
 */
function ensureLocalGitignore(targetDir: string): void {
	const gitignorePath = join(targetDir, ".gitignore");
	const line = "dashboards/*.local.json";
	let existing = "";
	if (existsSync(gitignorePath)) {
		existing = readFileSync(gitignorePath, "utf8");
		if (existing.split(/\r?\n/).some((l) => l.trim() === line)) return;
	}
	const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
	appendFileSync(gitignorePath, `${prefix}${line}\n`, "utf8");
}

/**
 * Execute `dashboard save <name>`: persist a named selection to dashboards/. A
 * preset stays LIVE by default (stores the `view` name → auto-gains enrichment);
 * `--freeze` materializes the resolved artifact list. Source precedence:
 * `--view`/`--artifacts` flags, else the project's current selection
 * (`--from-current`, the default). `--local` writes a `.local.json` + gitignores.
 */
function runSave(name: string, path: string, options: SaveOptions): void {
	const targetDir = resolvePath(path);
	if (options.view !== undefined && options.artifacts !== undefined) {
		fail("--view and --artifacts are mutually exclusive — set one, not both.");
		return;
	}

	let selection: { view: string } | { artifacts: ArtifactId[] };
	if (options.view !== undefined) {
		const resolved = resolveView({ view: options.view }, {});
		if (resolved.kind !== "ok") {
			const hint =
				resolved.kind === "unknown-view" && resolved.suggestions.length > 0
					? ` — did you mean ${resolved.suggestions.join(", ")}?`
					: "";
			fail(`Unknown view "${options.view}"${hint}`);
			return;
		}
		selection = options.freeze
			? { artifacts: resolved.artifacts }
			: { view: options.view };
	} else if (options.artifacts !== undefined) {
		const parsed = parseArtifacts(options.artifacts);
		if (parsed.kind === "error") {
			fail(parsed.message);
			return;
		}
		selection = { artifacts: parsed.ids };
	} else {
		// --from-current (the default): save the project's resolved selection. A live
		// preset is saved as its view name; a custom list (or --freeze) materializes.
		const current = readSelection(targetDir);
		if (current.kind === "error") {
			fail(current.message);
			return;
		}
		selection =
			current.selection.viewName !== undefined && !options.freeze
				? { view: current.selection.viewName }
				: { artifacts: current.selection.artifacts };
	}

	const local = options.local ?? false;
	writeDashboardFile(targetDir, name, selection, { local });
	if (local) ensureLocalGitignore(targetDir);
	const where = `dashboards/${name}${local ? ".local" : ""}.json`;
	const kind =
		"view" in selection ? `live preset "${selection.view}"` : "frozen list";
	process.stdout.write(`Saved dashboard "${name}" (${kind}) to ${where}.\n`);
	process.exitCode = 0;
}

/**
 * Execute `dashboard load <name>`: point `dashboard_default` at a saved dashboard,
 * clearing `dashboard_view`/`dashboard_artifacts` (mutual exclusion at write time).
 * Unknown name → exit 2 + the available-names list.
 */
function runLoad(name: string, path: string): void {
	const targetDir = resolvePath(path);
	const read = readDashboardFile(targetDir, name);
	if (read.kind === "not-found") {
		failUnknownDashboard(targetDir, name);
		return;
	}
	if (read.kind === "invalid") {
		fail(`Dashboard "${name}" is invalid: ${read.message}`);
		return;
	}
	writeProjectConfig(targetDir, {
		dashboard_default: name,
		dashboard_view: undefined,
		dashboard_artifacts: undefined,
	});
	process.stdout.write(`Default dashboard set to "${name}".\n`);
	process.exitCode = 0;
}

/** Execute `dashboard ls`: list saved dashboards with shared/personal markers. */
function runLs(path: string): void {
	const targetDir = resolvePath(path);
	const entries = listDashboards(targetDir);
	if (entries.length === 0) {
		process.stdout.write("No saved dashboards in dashboards/.\n");
		process.exitCode = 0;
		return;
	}
	for (const e of entries) {
		const marker =
			e.hasShared && e.hasLocal
				? "shared + personal"
				: e.hasShared
					? "shared (committed)"
					: "personal (local)";
		process.stdout.write(`${e.name}  (${marker})\n`);
	}
	process.exitCode = 0;
}

/** Options for `dashboard rm`. */
interface RmOptions {
	local?: boolean;
}

/** Execute `dashboard rm <name>`: delete a saved dashboard file. */
function runRm(name: string, path: string, options: RmOptions): void {
	const targetDir = resolvePath(path);
	const file = join(
		targetDir,
		"dashboards",
		`${name}${options.local ? ".local" : ""}.json`,
	);
	if (!existsSync(file)) {
		failUnknownDashboard(targetDir, name);
		return;
	}
	unlinkSync(file);
	process.stdout.write(`Removed dashboard "${name}".\n`);
	process.exitCode = 0;
}

/**
 * Execute `dashboard suggest "<phrase>"` (M9.2): offline NL→artifact matching for
 * the conversational builder. Prints the ranked matches + a ready-to-paste
 * `dashboard save … --artifacts` line. Pure match (no I/O); the actual save
 * re-validates every id, so this is a suggestion surface, never the guardrail.
 */
function runSuggest(phrase: string): void {
	const matches = matchPhrase(phrase);
	if (matches.length === 0) {
		process.stdout.write(`No artifacts matched "${phrase}".\n`);
		process.exitCode = 0;
		return;
	}
	for (const m of matches) {
		process.stdout.write(`${m.id}\t${m.title}\n`);
	}
	const ids = matches.map((m) => m.id).join(",");
	process.stdout.write(
		`\nSave with: dashboard save <name> --artifacts ${ids}\n`,
	);
	process.exitCode = 0;
}

/**
 * Execute `dashboard setup`: detect TTY, then drive the injected-stream wizard
 * over the real process streams. Non-TTY is short-circuited to stderr + exit 2
 * (pointing at `dashboard set`) so a piped/CI invocation gets the actionable
 * message on the conventional error stream; the wizard's own non-TTY guard
 * stays as the unit-tested fallback.
 */
async function runSetup(path: string): Promise<void> {
	const isTTY = Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
	if (!isTTY) {
		fail(
			"The setup wizard needs an interactive terminal. " +
				"Use `ds-bridge dashboard set --view <preset>` (or --artifacts) instead.",
		);
		return;
	}
	const targetDir = resolvePath(path);
	const outcome = await runSetupWizard({
		input: process.stdin,
		output: process.stdout,
		cwd: targetDir,
		isTTY,
	});
	process.exitCode = outcome.exitCode;
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
		.option(
			"--dashboard <name>",
			"edit a saved dashboard instead of the project view",
		)
		.action(
			(artifact: string, path: string, options: { dashboard?: string }) => {
				runEdit(path, artifact, "add", options.dashboard);
			},
		);

	dashboard
		.command("remove")
		.description(
			"Remove an artifact from the view (materializes the current preset first)",
		)
		.argument("<artifact>", "artifact id to remove")
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.option(
			"--dashboard <name>",
			"edit a saved dashboard instead of the project view",
		)
		.action(
			(artifact: string, path: string, options: { dashboard?: string }) => {
				runEdit(path, artifact, "remove", options.dashboard);
			},
		);

	dashboard
		.command("save")
		.description(
			"Save a named dashboard (live preset by default; --freeze materializes)",
		)
		.argument("<name>", "dashboard name")
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.option("--from-current", "save the project's current selection (default)")
		.option("--view <preset>", "save a persona preset by name (kept live)")
		.option(
			"--artifacts <ids>",
			"save an explicit comma-separated artifact list",
		)
		.option(
			"--freeze",
			"materialize the resolved artifact list (not a live preset)",
		)
		.option(
			"--local",
			"write a personal dashboards/<name>.local.json (gitignored)",
		)
		.action((name: string, path: string, options: SaveOptions) => {
			runSave(name, path, options);
		});

	dashboard
		.command("load")
		.description(
			"Set a saved dashboard as the project default (dashboard_default)",
		)
		.argument("<name>", "saved dashboard name")
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.action((name: string, path: string) => {
			runLoad(name, path);
		});

	dashboard
		.command("ls")
		.description("List saved dashboards with shared/personal markers")
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.action((path: string) => {
			runLs(path);
		});

	dashboard
		.command("rm")
		.description("Delete a saved dashboard")
		.argument("<name>", "saved dashboard name")
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.option(
			"--local",
			"delete the personal .local.json instead of the shared file",
		)
		.action((name: string, path: string, options: RmOptions) => {
			runRm(name, path, options);
		});

	dashboard
		.command("suggest")
		.description(
			"Suggest artifact ids for a free-text phrase (offline NL match, no LLM)",
		)
		.argument("<phrase>", "free-text description of the dashboard you want")
		.action((phrase: string) => {
			runSuggest(phrase);
		});

	dashboard
		.command("setup")
		.description("Interactive wizard to compose and persist a dashboard view")
		.argument("[path]", "project directory holding .ds-bridge.json", ".")
		.action((path: string) => {
			void runSetup(path);
		});
}
