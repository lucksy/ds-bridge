// Config resolution: CLI flags > env (CLAUDE_PLUGIN_OPTION_*, FIGMA_TOKEN)
// > .ds-bridge.json > userConfig defaults (SPEC §8). resolveConfig is pure —
// all sources injected. writeProjectConfig (M1.1) is the one I/O edge here:
// the sanctioned, atomic, order-preserving writer for the project file.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ArtifactId, lookupArtifact } from "./engines/report/catalog.js";

export type ReportStyle = "html" | "terminal" | "both";

export type FigmaToken =
	| { kind: "present"; value: string }
	| { kind: "missing" };

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

	// Dashboard composer keys (SPEC-measure §3): mutually exclusive.
	if (
		obj.dashboard_view !== undefined &&
		obj.dashboard_artifacts !== undefined
	) {
		return {
			kind: "invalid",
			message:
				"dashboard_view and dashboard_artifacts are mutually exclusive — set one, not both",
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

	const config: ResolvedConfig = {
		figmaFileKey:
			flags.figmaFileKey ??
			env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY ??
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
		// is applied downstream by resolveView (M0.2), not here.
		dashboardView: project.dashboardView,
		dashboardArtifacts: project.dashboardArtifacts,
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
