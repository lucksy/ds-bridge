// Config resolution: CLI flags > env (CLAUDE_PLUGIN_OPTION_*, FIGMA_TOKEN)
// > .ds-bridge.json > userConfig defaults (SPEC §8). resolveConfig is pure —
// all sources injected. writeProjectConfig (M1.1) is the one I/O edge here:
// the sanctioned, atomic, order-preserving writer for the project file.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ArtifactId, lookupArtifact } from "./engines/report/catalog.js";
import { validateWeights, type Weights } from "./engines/report/score.js";

export type ReportStyle = "html" | "terminal" | "both";

export type FigmaToken =
	| { kind: "present"; value: string }
	| { kind: "missing" };

/** Comparison operators a metric target may use (SPEC-personas §6.5, C1). */
export type TargetOp = ">=" | "<=" | "==";

/** One metric target: an op, a target value, and an optional amber-band warn. */
export interface MetricTarget {
	op: TargetOp;
	value: number;
	warn?: number;
}

/**
 * The known target metrics a `metric_targets` map may key on (C1). An unknown
 * key is a typed config error carrying a nearest-match suggestion.
 */
export const TARGET_METRICS = [
	"on-system",
	"drift",
	"parity",
	"contrast",
	"readiness",
	"system-score",
] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

/** A validated `metric_targets` map: known metric → target (SPEC-personas C1). */
export type MetricTargets = Partial<Record<TargetMetric, MetricTarget>>;

/** Per-view (persona/dashboard) partial weight overrides, merged onto defaults (C2). */
export type ScoreWeightsByView = Record<string, Weights>;

/** Data-freshness aging/stale day bands (C4). amberDays ≤ redDays. */
export interface FreshnessThresholds {
	amberDays: number;
	redDays: number;
}

/** Default migration-checklist site cap (C7). */
const DEFAULT_MIGRATION_SITES_CAP = 200;
/** Default score-velocity window in days (C8). */
const DEFAULT_SCORE_VELOCITY_WINDOW = 30;
/** The valid comparison operators, for membership checks. */
const TARGET_OPS: readonly TargetOp[] = [">=", "<=", "=="];

/** Levenshtein edit distance — small, sufficient for the fixed metric-key set. */
function editDistance(a: string, b: string): number {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const dist: number[] = Array.from({ length: rows * cols }, () => 0);
	for (let i = 0; i < rows; i++) {
		dist[i * cols] = i;
	}
	for (let j = 0; j < cols; j++) {
		dist[j] = j;
	}
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
			dist[i * cols + j] = Math.min(
				(dist[(i - 1) * cols + j] ?? 0) + 1,
				(dist[i * cols + j - 1] ?? 0) + 1,
				(dist[(i - 1) * cols + j - 1] ?? 0) + substitution,
			);
		}
	}
	return dist[rows * cols - 1] ?? 0;
}

/**
 * Nearest known target metrics for a user-supplied key: ascending edit distance,
 * declaration order breaking ties. Nothing within distance 4 → no suggestions.
 * Mirrors the catalog's `suggestArtifactIds` pattern (single nearest-match house style).
 */
function suggestTargetMetrics(input: string, limit = 3): TargetMetric[] {
	const needle = input.toLowerCase();
	const MAX_DISTANCE = 4;
	return TARGET_METRICS.map((metric, index) => ({
		metric,
		index,
		prefix: metric.startsWith(needle),
		distance: editDistance(needle, metric),
	}))
		.filter((c) => c.prefix || c.distance <= MAX_DISTANCE)
		.sort(
			(a, b) =>
				Number(b.prefix) - Number(a.prefix) ||
				a.distance - b.distance ||
				a.index - b.index,
		)
		.slice(0, limit)
		.map((c) => c.metric);
}

/** True for a plain (non-array, non-null) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ResolvedConfig {
	figmaFileKey: string | undefined;
	figmaToken: FigmaToken;
	tokenSource: string | undefined;
	reportStyle: ReportStyle;
	readinessThreshold: number;
	/**
	 * Dashboard composer selection (SPEC-measure §3). At most one is set —
	 * the project file rejects both. `dashboardView` is validated syntactically
	 * here (any string); preset-name semantics live in resolveView (M0.2).
	 * `dashboardArtifacts` is validated semantically here (every id real).
	 */
	dashboardView: string | undefined;
	dashboardArtifacts: ArtifactId[] | undefined;
	/**
	 * A saved-dashboard name — the THIRD mutually-exclusive dashboard key
	 * alongside `dashboard_view`/`dashboard_artifacts` (SPEC-personas §7).
	 * Syntactic-only validation here (any non-empty string); existence is
	 * resolved at the io edge. `undefined` when absent.
	 */
	dashboardDefault: string | undefined;
	/**
	 * The merged, validated system-score weights from `.ds-bridge.json`'s
	 * `score_weights` key (a partial override merged onto the engine defaults),
	 * or `undefined` when the key is absent. Validation is delegated to the
	 * engine's `validateWeights` — single source of truth (SPEC-score §2).
	 */
	scoreWeights: Weights | undefined;
	/**
	 * Named product Figma file keys (`product_file_keys` MAP, SPEC-personas §6.4),
	 * merged with `FIGMA_PRODUCT_FILE_<NAME>` env vars (env wins per §11.5).
	 * Always present; defaults to `{}` when no source provides one.
	 */
	productFileKeys: Record<string, string>;
	/** Validated `metric_targets` map (C1), or `undefined` when absent. */
	metricTargets: MetricTargets | undefined;
	/**
	 * Per-view (persona/dashboard) system-score weight overrides (C2), each
	 * merged onto the engine defaults; `undefined` when absent. Render-scoped —
	 * never written back to global config.
	 */
	scoreWeightsByView: ScoreWeightsByView | undefined;
	/** Data-freshness aging/stale day bands (C4), or `undefined` when absent. */
	freshnessThresholds: FreshnessThresholds | undefined;
	/** Ownership map (path/dir → owner, C9), or `undefined` when absent. */
	ownership: Record<string, string> | undefined;
	/** Path to a CODEOWNERS-style ownership file (C9), or `undefined` when absent. */
	ownershipFile: string | undefined;
	/** Component alias map (alias → canonical name, C5), or `undefined` when absent. */
	componentAliases: Record<string, string> | undefined;
	/** Migration-checklist site cap (C7). Defaults to 200 when absent. */
	migrationSitesCap: number;
	/** Score-velocity window in days (C8). Defaults to 30 when absent. */
	scoreVelocityWindow: number;
}

export interface ConfigFlags {
	figmaFileKey?: string;
	figmaToken?: string;
	tokenSource?: string;
	reportStyle?: ReportStyle;
	readinessThreshold?: number;
}

export interface ResolveInputs {
	flags?: ConfigFlags;
	env?: Record<string, string | undefined>;
	/** Raw text of .ds-bridge.json, if the project has one. */
	projectFileText?: string;
}

export type ResolveOutcome =
	| { kind: "ok"; config: ResolvedConfig; warnings: string[] }
	| { kind: "invalid-project-file"; message: string };

const REPORT_STYLES: readonly ReportStyle[] = ["html", "terminal", "both"];

const DEFAULTS = {
	reportStyle: "both" as ReportStyle,
	readinessThreshold: 80,
};

interface ProjectFileValues {
	figmaFileKey?: string;
	tokenSource?: string;
	reportStyle?: ReportStyle;
	readinessThreshold?: number;
	dashboardView?: string;
	dashboardArtifacts?: ArtifactId[];
	dashboardDefault?: string;
	scoreWeights?: Weights;
	productFileKeys?: Record<string, string>;
	metricTargets?: MetricTargets;
	scoreWeightsByView?: ScoreWeightsByView;
	freshnessThresholds?: FreshnessThresholds;
	ownership?: Record<string, string>;
	ownershipFile?: string;
	componentAliases?: Record<string, string>;
	migrationSitesCap?: number;
	scoreVelocityWindow?: number;
	hadFigmaToken: boolean;
}

type ProjectFileOutcome =
	| { kind: "ok"; values: ProjectFileValues }
	| { kind: "invalid"; message: string };

function parseProjectFile(text: string): ProjectFileOutcome {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "invalid",
			message: `.ds-bridge.json is not valid JSON: ${detail}`,
		};
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return {
			kind: "invalid",
			message: ".ds-bridge.json must be a JSON object",
		};
	}

	const obj = raw as Record<string, unknown>;
	const values: ProjectFileValues = { hadFigmaToken: "figma_token" in obj };

	if (obj.figma_file_key !== undefined) {
		if (typeof obj.figma_file_key !== "string") {
			return { kind: "invalid", message: "figma_file_key must be a string" };
		}
		values.figmaFileKey = obj.figma_file_key;
	}
	if (obj.token_source !== undefined) {
		if (typeof obj.token_source !== "string") {
			return { kind: "invalid", message: "token_source must be a string" };
		}
		values.tokenSource = obj.token_source;
	}
	if (obj.report_style !== undefined) {
		if (!REPORT_STYLES.includes(obj.report_style as ReportStyle)) {
			return {
				kind: "invalid",
				message: `report_style must be one of ${REPORT_STYLES.join(" | ")}, got ${JSON.stringify(obj.report_style)}`,
			};
		}
		values.reportStyle = obj.report_style as ReportStyle;
	}
	if (obj.readiness_threshold !== undefined) {
		const n = obj.readiness_threshold;
		if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) {
			return {
				kind: "invalid",
				message: `readiness_threshold must be a number between 0 and 100, got ${JSON.stringify(n)}`,
			};
		}
		values.readinessThreshold = n;
	}

	// Dashboard selection keys (SPEC-measure §3, SPEC-personas §7): the three
	// are MUTUALLY EXCLUSIVE — setting any two is invalid. The message names the
	// two (or more) offending keys so the user knows exactly which to drop.
	const dashboardKeysPresent = (
		["dashboard_view", "dashboard_artifacts", "dashboard_default"] as const
	).filter((k) => obj[k] !== undefined);
	if (dashboardKeysPresent.length > 1) {
		return {
			kind: "invalid",
			message: `${dashboardKeysPresent.join(", ")} are mutually exclusive — set exactly one, not ${dashboardKeysPresent.length}`,
		};
	}
	if (obj.dashboard_view !== undefined) {
		// Syntactic check only — preset-name validation lives in resolveView (M0.2).
		if (typeof obj.dashboard_view !== "string") {
			return { kind: "invalid", message: "dashboard_view must be a string" };
		}
		values.dashboardView = obj.dashboard_view;
	}
	if (obj.dashboard_artifacts !== undefined) {
		if (!Array.isArray(obj.dashboard_artifacts)) {
			return {
				kind: "invalid",
				message: "dashboard_artifacts must be an array of artifact ids",
			};
		}
		const artifacts: ArtifactId[] = [];
		for (const entry of obj.dashboard_artifacts) {
			if (typeof entry !== "string") {
				return {
					kind: "invalid",
					message: `dashboard_artifacts must contain only strings, got ${JSON.stringify(entry)}`,
				};
			}
			// Semantic check HERE: every id must resolve in the frozen catalog.
			const lookup = lookupArtifact(entry);
			if (lookup.kind === "unknown") {
				const hint =
					lookup.suggestions.length > 0
						? ` — did you mean ${lookup.suggestions.join(", ")}?`
						: "";
				return {
					kind: "invalid",
					message: `dashboard_artifacts has an unknown artifact id ${JSON.stringify(entry)}${hint}`,
				};
			}
			artifacts.push(lookup.artifact.id);
		}
		values.dashboardArtifacts = artifacts;
	}
	if (obj.dashboard_default !== undefined) {
		// Syntactic check only (SPEC-personas §7): any NON-EMPTY string is a valid
		// saved-dashboard name; existence is resolved later at the io edge.
		if (
			typeof obj.dashboard_default !== "string" ||
			obj.dashboard_default === ""
		) {
			return {
				kind: "invalid",
				message:
					"dashboard_default must be a non-empty string (a saved-dashboard name)",
			};
		}
		values.dashboardDefault = obj.dashboard_default;
	}

	// System-score weights (SPEC-score §2). Validation is delegated entirely to
	// the engine's validateWeights (single source of truth); its typed outcomes
	// are translated into this file's existing config-error style.
	if (obj.score_weights !== undefined) {
		// The engine tolerates non-objects (treats them as defaults); the config
		// surface is stricter — score_weights must be a plain object of overrides.
		if (
			typeof obj.score_weights !== "object" ||
			obj.score_weights === null ||
			Array.isArray(obj.score_weights)
		) {
			return {
				kind: "invalid",
				message: "score_weights must be an object of component → weight",
			};
		}
		const weights = validateWeights(obj.score_weights);
		switch (weights.kind) {
			case "unknown-key":
				return {
					kind: "invalid",
					message: `score_weights has an unknown key ${JSON.stringify(weights.key)} — expected drift, lint, readiness or a11y`,
				};
			case "non-positive":
				return {
					kind: "invalid",
					message: `score_weights.${weights.key} must be a positive number`,
				};
			case "non-finite":
				return {
					kind: "invalid",
					message: `score_weights.${weights.key} must be a finite number`,
				};
			case "ok":
				values.scoreWeights = weights.weights;
				break;
		}
	}

	// product_file_keys: a MAP { alias → file key } (SPEC-personas §6.4). Every
	// alias and value must be a non-empty string; the env tier merges later.
	if (obj.product_file_keys !== undefined) {
		if (!isPlainObject(obj.product_file_keys)) {
			return {
				kind: "invalid",
				message:
					"product_file_keys must be an object of alias → Figma file key",
			};
		}
		const map: Record<string, string> = {};
		for (const [alias, key] of Object.entries(obj.product_file_keys)) {
			if (alias === "") {
				return {
					kind: "invalid",
					message:
						"product_file_keys has an empty alias — every alias must be a non-empty string",
				};
			}
			if (typeof key !== "string" || key === "") {
				return {
					kind: "invalid",
					message: `product_file_keys.${alias} must be a non-empty string (a Figma file key)`,
				};
			}
			map[alias] = key;
		}
		values.productFileKeys = map;
	}

	// metric_targets: { metric → { op, value, warn? } } (C1). Each metric key must
	// be a known target metric (unknown → nearest-match suggestion); op enumerated;
	// value and optional warn finite numbers.
	if (obj.metric_targets !== undefined) {
		if (!isPlainObject(obj.metric_targets)) {
			return {
				kind: "invalid",
				message:
					"metric_targets must be an object of metric → { op, value, warn? }",
			};
		}
		const targets: MetricTargets = {};
		for (const [metric, target] of Object.entries(obj.metric_targets)) {
			if (!TARGET_METRICS.includes(metric as TargetMetric)) {
				const suggestions = suggestTargetMetrics(metric);
				const hint =
					suggestions.length > 0
						? ` — did you mean ${suggestions.join(", ")}?`
						: "";
				return {
					kind: "invalid",
					message: `metric_targets has an unknown metric ${JSON.stringify(metric)}${hint}`,
				};
			}
			if (!isPlainObject(target)) {
				return {
					kind: "invalid",
					message: `metric_targets.${metric} must be an object { op, value, warn? }`,
				};
			}
			if (!TARGET_OPS.includes(target.op as TargetOp)) {
				return {
					kind: "invalid",
					message: `metric_targets.${metric}.op must be one of ${TARGET_OPS.join(" | ")}, got ${JSON.stringify(target.op)}`,
				};
			}
			if (typeof target.value !== "number" || !Number.isFinite(target.value)) {
				return {
					kind: "invalid",
					message: `metric_targets.${metric}.value must be a finite number`,
				};
			}
			const parsed: MetricTarget = {
				op: target.op as TargetOp,
				value: target.value,
			};
			if (target.warn !== undefined) {
				if (typeof target.warn !== "number" || !Number.isFinite(target.warn)) {
					return {
						kind: "invalid",
						message: `metric_targets.${metric}.warn must be a finite number`,
					};
				}
				parsed.warn = target.warn;
			}
			targets[metric as TargetMetric] = parsed;
		}
		values.metricTargets = targets;
	}

	// score_weights_by_view: { view → partial weights } (C2). Each value runs
	// through the engine's validateWeights (single source of truth); the typed
	// failure is translated into a message that NAMES the offending view.
	if (obj.score_weights_by_view !== undefined) {
		if (!isPlainObject(obj.score_weights_by_view)) {
			return {
				kind: "invalid",
				message:
					"score_weights_by_view must be an object of view → weight overrides",
			};
		}
		const byView: ScoreWeightsByView = {};
		for (const [view, override] of Object.entries(obj.score_weights_by_view)) {
			if (!isPlainObject(override)) {
				return {
					kind: "invalid",
					message: `score_weights_by_view.${view} must be an object of component → weight`,
				};
			}
			const weights = validateWeights(override);
			switch (weights.kind) {
				case "unknown-key":
					return {
						kind: "invalid",
						message: `score_weights_by_view.${view} has an unknown key ${JSON.stringify(weights.key)} — expected drift, lint, readiness, a11y or adoption`,
					};
				case "non-positive":
					return {
						kind: "invalid",
						message: `score_weights_by_view.${view}.${weights.key} must be a positive number`,
					};
				case "non-finite":
					return {
						kind: "invalid",
						message: `score_weights_by_view.${view}.${weights.key} must be a finite number`,
					};
				case "ok":
					byView[view] = weights.weights;
					break;
			}
		}
		values.scoreWeightsByView = byView;
	}

	// freshness_thresholds: { amberDays, redDays } (C4). Both positive finite;
	// amberDays ≤ redDays (the amber band precedes the red band).
	if (obj.freshness_thresholds !== undefined) {
		if (!isPlainObject(obj.freshness_thresholds)) {
			return {
				kind: "invalid",
				message:
					"freshness_thresholds must be an object { amberDays, redDays }",
			};
		}
		const { amberDays, redDays } = obj.freshness_thresholds;
		for (const [name, value] of [
			["amberDays", amberDays],
			["redDays", redDays],
		] as const) {
			if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
				return {
					kind: "invalid",
					message: `freshness_thresholds.${name} must be a positive finite number`,
				};
			}
		}
		if ((amberDays as number) > (redDays as number)) {
			return {
				kind: "invalid",
				message: "freshness_thresholds.amberDays must be ≤ redDays",
			};
		}
		values.freshnessThresholds = {
			amberDays: amberDays as number,
			redDays: redDays as number,
		};
	}

	// ownership: { path/dir → owner } and ownership_file: a path (C9). Both
	// optional and NOT mutually exclusive.
	if (obj.ownership !== undefined) {
		if (!isPlainObject(obj.ownership)) {
			return {
				kind: "invalid",
				message: "ownership must be an object of path → owner",
			};
		}
		const map: Record<string, string> = {};
		for (const [path, owner] of Object.entries(obj.ownership)) {
			if (typeof owner !== "string" || owner === "") {
				return {
					kind: "invalid",
					message: `ownership.${path} must be a non-empty string (an owner)`,
				};
			}
			map[path] = owner;
		}
		values.ownership = map;
	}
	if (obj.ownership_file !== undefined) {
		if (typeof obj.ownership_file !== "string" || obj.ownership_file === "") {
			return {
				kind: "invalid",
				message: "ownership_file must be a non-empty string (a path)",
			};
		}
		values.ownershipFile = obj.ownership_file;
	}

	// component_aliases: { alias → canonical component name } (C5).
	if (obj.component_aliases !== undefined) {
		if (!isPlainObject(obj.component_aliases)) {
			return {
				kind: "invalid",
				message:
					"component_aliases must be an object of alias → component name",
			};
		}
		const map: Record<string, string> = {};
		for (const [alias, name] of Object.entries(obj.component_aliases)) {
			if (typeof name !== "string" || name === "") {
				return {
					kind: "invalid",
					message: `component_aliases.${alias} must be a non-empty string (a component name)`,
				};
			}
			map[alias] = name;
		}
		values.componentAliases = map;
	}

	// migration_sites_cap: a positive integer (C7, default 200).
	if (obj.migration_sites_cap !== undefined) {
		const n = obj.migration_sites_cap;
		if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
			return {
				kind: "invalid",
				message: `migration_sites_cap must be a positive integer, got ${JSON.stringify(n)}`,
			};
		}
		values.migrationSitesCap = n;
	}

	// score_velocity_window: a positive integer of days (C8, default 30).
	if (obj.score_velocity_window !== undefined) {
		const n = obj.score_velocity_window;
		if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
			return {
				kind: "invalid",
				message: `score_velocity_window must be a positive integer number of days, got ${JSON.stringify(n)}`,
			};
		}
		values.scoreVelocityWindow = n;
	}

	return { kind: "ok", values };
}

/** Resolve effective config from injected sources. Never throws on bad input. */
export function resolveConfig(inputs: ResolveInputs): ResolveOutcome {
	const { flags = {}, env = {} } = inputs;
	const warnings: string[] = [];

	let project: ProjectFileValues = { hadFigmaToken: false };
	if (inputs.projectFileText !== undefined) {
		const parsed = parseProjectFile(inputs.projectFileText);
		if (parsed.kind === "invalid") {
			return { kind: "invalid-project-file", message: parsed.message };
		}
		project = parsed.values;
	}
	if (project.hadFigmaToken) {
		warnings.push(
			"figma_token in .ds-bridge.json is ignored — set it via the plugin config dialog or the FIGMA_TOKEN env var, never in a committed file",
		);
	}

	let envThreshold: number | undefined;
	const rawEnvThreshold = env.CLAUDE_PLUGIN_OPTION_READINESS_THRESHOLD;
	if (rawEnvThreshold !== undefined) {
		const n = Number(rawEnvThreshold);
		if (Number.isFinite(n) && n >= 0 && n <= 100) {
			envThreshold = n;
		} else {
			warnings.push(
				`CLAUDE_PLUGIN_OPTION_READINESS_THRESHOLD is not a number between 0 and 100 (got ${JSON.stringify(rawEnvThreshold)}) — ignoring`,
			);
		}
	}

	let envReportStyle: ReportStyle | undefined;
	const rawEnvReportStyle = env.CLAUDE_PLUGIN_OPTION_REPORT_STYLE;
	if (rawEnvReportStyle !== undefined) {
		if (REPORT_STYLES.includes(rawEnvReportStyle as ReportStyle)) {
			envReportStyle = rawEnvReportStyle as ReportStyle;
		} else {
			warnings.push(
				`CLAUDE_PLUGIN_OPTION_REPORT_STYLE must be one of ${REPORT_STYLES.join(" | ")} (got ${JSON.stringify(rawEnvReportStyle)}) — ignoring`,
			);
		}
	}

	const tokenValue =
		flags.figmaToken ?? env.CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN ?? env.FIGMA_TOKEN;

	// Named product file keys (SPEC-personas §6.4, §11.5): the project-file map is
	// the base; `FIGMA_PRODUCT_FILE_<NAME>` env vars are layered ON TOP (env wins
	// for the same alias). Enumerating injected-env keys keeps resolveConfig pure —
	// it reads only its `env` argument. The alias is the suffix, lower-cased.
	const productFileKeys: Record<string, string> = {
		...(project.productFileKeys ?? {}),
	};
	const PRODUCT_FILE_ENV_PREFIX = "FIGMA_PRODUCT_FILE_";
	for (const envKey of Object.keys(env)) {
		if (!envKey.startsWith(PRODUCT_FILE_ENV_PREFIX)) continue;
		const value = env[envKey];
		if (value === undefined || value === "") continue;
		const alias = envKey.slice(PRODUCT_FILE_ENV_PREFIX.length).toLowerCase();
		if (alias === "") continue;
		productFileKeys[alias] = value;
	}

	const config: ResolvedConfig = {
		figmaFileKey:
			flags.figmaFileKey ??
			env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY ??
			env.FIGMA_DESIGN_SYSTEM_FILE ??
			project.figmaFileKey,
		figmaToken:
			tokenValue !== undefined && tokenValue !== ""
				? { kind: "present", value: tokenValue }
				: { kind: "missing" },
		tokenSource:
			flags.tokenSource ??
			env.CLAUDE_PLUGIN_OPTION_TOKEN_SOURCE ??
			project.tokenSource,
		reportStyle:
			flags.reportStyle ??
			envReportStyle ??
			project.reportStyle ??
			DEFAULTS.reportStyle,
		readinessThreshold:
			flags.readinessThreshold ??
			envThreshold ??
			project.readinessThreshold ??
			DEFAULTS.readinessThreshold,
		// Dashboard selection comes only from the project file (SPEC-measure §3:
		// no env vars, no userConfig). The flags > config > `everything` default
		// is applied downstream by resolveView (M0.2), not here. The three keys
		// are mutually exclusive at parse time, so at most one is set.
		dashboardView: project.dashboardView,
		dashboardArtifacts: project.dashboardArtifacts,
		dashboardDefault: project.dashboardDefault,
		// The merged/validated weights, or undefined when score_weights is absent
		// (callers fall back to the engine defaults in that case).
		scoreWeights: project.scoreWeights,
		// Project-file map merged with the FIGMA_PRODUCT_FILE_<NAME> env family
		// (env wins). Always an object — defaults to {} when no source provides one.
		productFileKeys,
		// Persona-wave project-file-only keys (SPEC-personas §6.5). Each is
		// undefined when absent (the caller falls back to its own defaults), except
		// the capped/windowed numbers which carry hard defaults.
		metricTargets: project.metricTargets,
		scoreWeightsByView: project.scoreWeightsByView,
		freshnessThresholds: project.freshnessThresholds,
		ownership: project.ownership,
		ownershipFile: project.ownershipFile,
		componentAliases: project.componentAliases,
		migrationSitesCap: project.migrationSitesCap ?? DEFAULT_MIGRATION_SITES_CAP,
		scoreVelocityWindow:
			project.scoreVelocityWindow ?? DEFAULT_SCORE_VELOCITY_WINDOW,
	};

	return { kind: "ok", config, warnings };
}

/** Name of the project config file, beside which the temp file is written. */
const PROJECT_FILE_NAME = ".ds-bridge.json";

/** A JSON value a patch may set on the project file. */
export type JsonPatchValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonPatchValue[]
	| { readonly [key: string]: JsonPatchValue };

/**
 * Atomic, order-preserving writer for `.ds-bridge.json` (SPEC-measure §3 write
 * contract). The sanctioned writer (wizard + `dashboard set`); `parseProjectFile`
 * is NOT a round-trip path (it extracts only known keys), so preservation lives
 * entirely here.
 *
 * Behavior:
 * - Reads the existing file if present and parses it as a plain JSON object,
 *   preserving its keys AND their insertion order (parse → spread → apply patch).
 * - Each patch entry overwrites or adds a key; a value of `undefined` DELETES the
 *   key — needed when `set --view` replaces an artifacts list and vice versa.
 * - Genuinely-new keys are appended last (JS object insertion order).
 * - Output is `JSON.stringify(obj, null, 2) + "\n"` (the repo's seeding convention).
 * - Writes to a temp file in the SAME directory, then renames over the target so a
 *   reader never sees a partially-written file; creates the file when absent.
 */
export function writeProjectConfig(
	dir: string,
	patch: Record<string, JsonPatchValue | undefined>,
): void {
	const filePath = join(dir, PROJECT_FILE_NAME);

	let existing: Record<string, unknown> = {};
	if (existsSync(filePath)) {
		const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
		if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
			existing = raw as Record<string, unknown>;
		}
	}

	// Spread preserves existing key order; patch keys overwrite in place,
	// new keys land at the end, `undefined` deletes.
	const merged: Record<string, unknown> = { ...existing };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) {
			delete merged[key];
		} else {
			merged[key] = value;
		}
	}

	const text = `${JSON.stringify(merged, null, 2)}\n`;

	// Atomic: write a same-dir temp file, then rename over the target. A unique
	// name avoids collisions between concurrent writers; rename is the swap.
	const tempPath = join(dir, `${PROJECT_FILE_NAME}.${process.pid}.tmp`);
	writeFileSync(tempPath, text, "utf8");
	renameSync(tempPath, filePath);
}
