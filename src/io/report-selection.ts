import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ComponentAliases,
	type ExceptionEntry,
	type FreshnessThresholds,
	type MetricTargets,
	type OwnershipMap,
	resolveConfig,
	type ScoreWeightsByView,
} from "../config.js";
import type { ArtifactId } from "../engines/report/catalog.js";
import { resolveView } from "../engines/report/presets.js";
import { validateWeights, type Weights } from "../engines/report/score.js";
import {
	type DashboardReportType,
	listDashboards,
	readDashboardFile,
} from "./dashboards.js";

/** A typed operational failure, translated to exit code 2 + stderr at the edge. */
export interface ReportError {
	kind: "error";
	message: string;
}

/** The resolved render selection: which artifacts, in order, plus a header label. */
export interface ResolvedSelection {
	artifacts: ArtifactId[];
	/** Header label to name the active view; absent for the no-config default. */
	viewLabel?: string;
	/**
	 * The active NAMED view (preset/persona name) when one is active (C2): the key
	 * the by-view weight override is looked up under. Absent for a custom artifact
	 * list or the no-config default (so no by-view profile can apply).
	 */
	viewName?: string;
	/** Validated system-score weights from config; undefined → engine defaults. */
	scoreWeights?: Weights;
	/** Per-view weight overrides (C2), each merged onto defaults; undefined when absent. */
	scoreWeightsByView?: ScoreWeightsByView;
	/** Migration-checklist site cap (C7); the config default (200) when no file. */
	migrationSitesCap: number;
	/** Validated `metric_targets` map (C1); undefined when no targets configured. */
	metricTargets?: MetricTargets;
	/** Score-velocity window in days (C8); the config default (30) when no file. */
	scoreVelocityWindow: number;
	/** Handoff readiness bar (`readiness_threshold`) — the manager report's per-frame pass line. */
	readinessThreshold: number;
	/** Per-kind `freshness_thresholds` map (C4); undefined → engine defaults. */
	freshnessThresholds?: FreshnessThresholds;
	/** Component-health join keys (`component_aliases`, C5); undefined when absent. */
	componentAliases?: ComponentAliases;
	/** CODEOWNERS-style `ownership` rules (C9); undefined when absent. */
	ownership?: OwnershipMap;
	/** Path to a CODEOWNERS file (`ownership_file`, C9); undefined when absent. */
	ownershipFile?: string;
	/** Logged recurring-deviation decisions (`exceptions`, X1); undefined when absent. */
	exceptions?: ExceptionEntry[];
	/**
	 * A saved dashboard's DEFAULT render target (`report_type`, §7, M9.3); only set
	 * when a `--dashboard`/`dashboard_default` selection is active. The `--format`
	 * flag always wins over it.
	 */
	reportType?: DashboardReportType;
}

/** Split a `--artifacts a,b,c` flag into trimmed, non-empty ids (undefined if unset). */
function parseArtifactsFlag(raw: string | undefined): string[] | undefined {
	if (raw === undefined) return undefined;
	return raw
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}

/**
 * Read <targetDir>/.ds-bridge.json (the project file whose config applies) and
 * resolve the active artifact selection from flags → project config → default
 * `everything`. Every domain failure (invalid project file, view/artifacts
 * conflict, unknown view, unknown artifact id) is a typed error translated to a
 * single exit-2 message with suggestions; never a thrown stack.
 *
 * The default `everything` source is given NO `viewLabel` so the no-config
 * output stays byte-identical to the v1.0.0 golden — only an explicitly chosen
 * view (preset or custom list) names itself in the header.
 */
/** The project-config-derived fields a dashboard render inherits (everything but selection). */
interface DashboardContext {
	migrationSitesCap: number;
	scoreVelocityWindow: number;
	readinessThreshold: number;
	scoreWeights: Weights | undefined;
	scoreWeightsByView: ScoreWeightsByView | undefined;
	metricTargets: MetricTargets | undefined;
	freshnessThresholds: FreshnessThresholds | undefined;
	componentAliases: ComponentAliases | undefined;
	ownership: OwnershipMap | undefined;
	ownershipFile: string | undefined;
	exceptions: ExceptionEntry[] | undefined;
}

/**
 * Resolve a saved dashboard (SPEC §7, M8.3) into a {@link ResolvedSelection}:
 * read `dashboards/<name>(.local).json`, resolve its view|artifacts through
 * resolveView, label the header with the dashboard NAME, and apply its
 * render-scoped `score_weights` override (the C2 dashboard layer — its own
 * weights win, dropping the by-view table). not-found → exit 2 + the
 * available-names list; invalid (bad schema / pinned id) → exit 2 + the reason.
 */
function resolveDashboardSelection(
	targetDir: string,
	name: string,
	ctx: DashboardContext,
): ResolvedSelection | ReportError {
	const read = readDashboardFile(targetDir, name);
	if (read.kind === "not-found") {
		const names = listDashboards(targetDir).map((e) => e.name);
		const available =
			names.length > 0
				? ` Available: ${names.join(", ")}.`
				: " No saved dashboards in dashboards/.";
		return {
			kind: "error",
			message: `Unknown dashboard "${name}".${available}`,
		};
	}
	if (read.kind === "invalid") {
		return {
			kind: "error",
			message: `Dashboard "${name}" is invalid: ${read.message}`,
		};
	}
	const sel = read.dashboard.selection;
	const outcome = resolveView(
		sel.kind === "view" ? { view: sel.view } : { artifacts: sel.artifacts },
		{},
	);
	if (outcome.kind === "unknown-view") {
		const hint =
			outcome.suggestions.length > 0
				? ` — did you mean ${outcome.suggestions.join(", ")}?`
				: "";
		return {
			kind: "error",
			message: `Dashboard "${name}" pins an unknown view "${outcome.view}"${hint}`,
		};
	}
	if (outcome.kind === "unknown-artifact") {
		return {
			kind: "error",
			message: `Dashboard "${name}" has an unknown artifact id "${outcome.id}".`,
		};
	}
	if (outcome.kind === "conflicting-selection") {
		return {
			kind: "error",
			message: `Dashboard "${name}" sets both view and artifacts.`,
		};
	}
	for (const notice of outcome.notices) process.stderr.write(`${notice}\n`);

	// C2 at the dashboard layer: the dashboard's own score_weights override wins
	// (render-scoped, merged onto defaults), and the by-view table is dropped. With
	// no per-dashboard weights, a view-pinned dashboard still inherits the persona's
	// by-view profile via viewName.
	const dashWeights = read.dashboard.scoreWeights;
	const validated =
		dashWeights !== undefined ? validateWeights(dashWeights) : undefined;
	const effectiveWeights =
		validated?.kind === "ok" ? validated.weights : ctx.scoreWeights;
	const effectiveByView =
		dashWeights !== undefined ? undefined : ctx.scoreWeightsByView;
	const viewName = sel.kind === "view" ? sel.view : undefined;

	return {
		artifacts: outcome.artifacts,
		migrationSitesCap: ctx.migrationSitesCap,
		scoreVelocityWindow: ctx.scoreVelocityWindow,
		readinessThreshold: ctx.readinessThreshold,
		viewLabel: read.dashboard.name,
		...(read.dashboard.reportType !== undefined
			? { reportType: read.dashboard.reportType }
			: {}),
		...(viewName !== undefined ? { viewName } : {}),
		...(effectiveWeights !== undefined
			? { scoreWeights: effectiveWeights }
			: {}),
		...(effectiveByView !== undefined
			? { scoreWeightsByView: effectiveByView }
			: {}),
		...(ctx.metricTargets !== undefined
			? { metricTargets: ctx.metricTargets }
			: {}),
		...(ctx.freshnessThresholds !== undefined
			? { freshnessThresholds: ctx.freshnessThresholds }
			: {}),
		...(ctx.componentAliases !== undefined
			? { componentAliases: ctx.componentAliases }
			: {}),
		...(ctx.ownership !== undefined ? { ownership: ctx.ownership } : {}),
		...(ctx.ownershipFile !== undefined
			? { ownershipFile: ctx.ownershipFile }
			: {}),
		...(ctx.exceptions !== undefined ? { exceptions: ctx.exceptions } : {}),
	};
}

/** The flags a selection reads; every other `report` flag is irrelevant here. */
export interface SelectionFlags {
	view?: string | undefined;
	artifacts?: string | undefined;
	dashboard?: string | undefined;
}

export function resolveSelection(
	targetDir: string,
	options: SelectionFlags,
): ResolvedSelection | ReportError {
	let dashboardView: string | undefined;
	let dashboardArtifacts: ArtifactId[] | undefined;
	let dashboardDefault: string | undefined;
	let scoreWeights: Weights | undefined;
	let scoreWeightsByView: ScoreWeightsByView | undefined;
	let metricTargets: MetricTargets | undefined;
	let freshnessThresholds: FreshnessThresholds | undefined;
	let componentAliases: ComponentAliases | undefined;
	let ownership: OwnershipMap | undefined;
	let ownershipFile: string | undefined;
	let exceptions: ExceptionEntry[] | undefined;
	// Default to the config's own defaults (200, C7 / 30, C8) when there is no file.
	const defaults = resolveConfig({});
	let migrationSitesCap =
		defaults.kind === "ok" ? defaults.config.migrationSitesCap : 200;
	let scoreVelocityWindow =
		defaults.kind === "ok" ? defaults.config.scoreVelocityWindow : 30;
	let readinessThreshold =
		defaults.kind === "ok" ? defaults.config.readinessThreshold : 80;

	const configPath = join(targetDir, ".ds-bridge.json");
	if (existsSync(configPath)) {
		let projectFileText: string;
		try {
			projectFileText = readFileSync(configPath, "utf8");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return {
				kind: "error",
				message: `Could not read ${configPath}: ${detail}`,
			};
		}
		const resolved = resolveConfig({ projectFileText });
		if (resolved.kind === "invalid-project-file") {
			return { kind: "error", message: resolved.message };
		}
		dashboardView = resolved.config.dashboardView;
		dashboardArtifacts = resolved.config.dashboardArtifacts;
		dashboardDefault = resolved.config.dashboardDefault;
		scoreWeights = resolved.config.scoreWeights;
		scoreWeightsByView = resolved.config.scoreWeightsByView;
		migrationSitesCap = resolved.config.migrationSitesCap;
		metricTargets = resolved.config.metricTargets;
		scoreVelocityWindow = resolved.config.scoreVelocityWindow;
		readinessThreshold = resolved.config.readinessThreshold;
		freshnessThresholds = resolved.config.freshnessThresholds;
		componentAliases = resolved.config.componentAliases;
		ownership = resolved.config.ownership;
		ownershipFile = resolved.config.ownershipFile;
		exceptions = resolved.config.exceptions;
	}

	const flagArtifacts = parseArtifactsFlag(options.artifacts);

	// Saved-dashboard layer (SPEC §7, M8.3): `--dashboard <name>` (flags) or
	// `dashboard_default` (project) loads a saved selection, resolves it through
	// resolveView, and labels the header with the dashboard NAME. The flag wins
	// over the config default; either is mutually exclusive with --view/--artifacts.
	const activeDashboard = options.dashboard ?? dashboardDefault;
	if (activeDashboard !== undefined) {
		if (
			options.dashboard !== undefined &&
			(options.view !== undefined || flagArtifacts !== undefined)
		) {
			return {
				kind: "error",
				message:
					"--dashboard is mutually exclusive with --view/--artifacts — pass one.",
			};
		}
		return resolveDashboardSelection(targetDir, activeDashboard, {
			migrationSitesCap,
			scoreVelocityWindow,
			readinessThreshold,
			scoreWeights,
			scoreWeightsByView,
			metricTargets,
			freshnessThresholds,
			componentAliases,
			ownership,
			ownershipFile,
			exceptions,
		});
	}

	const outcome = resolveView(
		{
			...(options.view !== undefined ? { view: options.view } : {}),
			...(flagArtifacts !== undefined ? { artifacts: flagArtifacts } : {}),
		},
		{
			...(dashboardView !== undefined ? { view: dashboardView } : {}),
			...(dashboardArtifacts !== undefined
				? { artifacts: dashboardArtifacts }
				: {}),
		},
	);

	switch (outcome.kind) {
		case "conflicting-selection":
			return {
				kind: "error",
				message:
					outcome.source === "flags"
						? "--view and --artifacts are mutually exclusive — pass one, not both."
						: "dashboard_view and dashboard_artifacts in .ds-bridge.json are mutually exclusive — set one, not both.",
			};
		case "unknown-view": {
			const hint =
				outcome.suggestions.length > 0
					? ` — did you mean ${outcome.suggestions.join(", ")}?`
					: "";
			return {
				kind: "error",
				message: `Unknown view "${outcome.view}"${hint}`,
			};
		}
		case "unknown-artifact": {
			const hint =
				outcome.suggestions.length > 0
					? ` — did you mean ${outcome.suggestions.join(", ")}?`
					: "";
			return {
				kind: "error",
				message: `Unknown artifact id "${outcome.id}"${hint}`,
			};
		}
		case "ok": {
			// Surface any dedup notices (custom list with duplicate ids).
			for (const notice of outcome.notices) {
				process.stderr.write(`${notice}\n`);
			}
			// Name the chosen view; the default `everything` stays label-less so the
			// no-config render is byte-identical to the golden.
			const viewLabel =
				outcome.source === "default"
					? undefined
					: (outcome.viewName ?? "custom");
			// The NAMED view (C2 by-view weight lookup key): the preset/persona name,
			// only when one is active (a custom list / the default carry no viewName,
			// so no by-view weight profile can apply — golden-neutral).
			const viewName =
				outcome.source === "default" ? undefined : outcome.viewName;
			return {
				artifacts: outcome.artifacts,
				migrationSitesCap,
				scoreVelocityWindow,
				readinessThreshold,
				...(viewLabel !== undefined ? { viewLabel } : {}),
				...(viewName !== undefined ? { viewName } : {}),
				...(scoreWeights !== undefined ? { scoreWeights } : {}),
				...(scoreWeightsByView !== undefined ? { scoreWeightsByView } : {}),
				...(metricTargets !== undefined ? { metricTargets } : {}),
				...(freshnessThresholds !== undefined ? { freshnessThresholds } : {}),
				...(componentAliases !== undefined ? { componentAliases } : {}),
				...(ownership !== undefined ? { ownership } : {}),
				...(ownershipFile !== undefined ? { ownershipFile } : {}),
				...(exceptions !== undefined ? { exceptions } : {}),
			};
		}
	}
}
