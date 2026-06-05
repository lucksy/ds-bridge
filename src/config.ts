// Config resolution: CLI flags > env (CLAUDE_PLUGIN_OPTION_*, FIGMA_TOKEN)
// > .ds-bridge.json > userConfig defaults (SPEC §8). Pure — all sources injected.

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
	};

	return { kind: "ok", config, warnings };
}
