// T3.6 — `ds-bridge report [path]` command builder.
// Impure edge: reads <path>/.ds-bridge/history.jsonl, aggregates it into the
// pure ReportData model, drives the pure HTML dashboard renderer, then writes
// the result and (optionally) spawns a platform opener. The renderer never
// touches the clock/fs/network; the single fresh `generatedAt` ISO timestamp is
// read here, at the io edge, so the rendered document is otherwise reproducible.
//
// Missing/empty history is NOT an error — it renders an empty-state dashboard
// and exits 0. Corrupted JSONL lines are skipped with one stderr warning each
// and never fatal. Unknown record kinds are skipped silently (forward compat).
//
// Exit codes: 0 success (even with no data) · 2 operational error (path not a
// directory, unwritable --out).
import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { platform } from "node:process";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import { buildParity, toParitySection } from "../engines/registry/parity.js";
import type { RegistryFile } from "../engines/registry/persist.js";
import type { ArtifactId } from "../engines/report/catalog.js";
import { resolveView } from "../engines/report/presets.js";
import type {
	A11ySummary,
	DriftTrendPoint,
	ImpactSummary,
	LintSummary,
	Parity,
	Readiness,
} from "../engines/report/types.js";
import { renderDashboard } from "../render/html/dashboard.js";

/** A typed operational failure, translated to exit code 2 + stderr at the edge. */
interface ReportError {
	kind: "error";
	message: string;
}

/**
 * One `tokens-check` history record (the T3.5 line shape). Read defensively as
 * a partial because the file is user/forward-version writable.
 */
interface TokensCheckRecord {
	at: string;
	kind: "tokens-check";
	stale: number;
	missing: number;
	orphan: number;
	inSync: boolean;
}

/** One `lint` history record carrying the by-kind violation counts. */
interface LintRecord {
	at: string;
	kind: "lint";
	byKind: {
		exact: number;
		near: number;
		offSystem: number;
	};
}

/** One `handoff` history record carrying the readiness score + top deductions. */
interface HandoffRecord {
	at: string;
	kind: "handoff";
	score: number;
	frameName: string;
	deductions: { rule: string; points: number }[];
}

/** One `a11y` history record carrying per-mode contrast tallies (T7.22). */
interface A11yRecord {
	at: string;
	kind: "a11y";
	level: "AA" | "AAA";
	modes: { mode: string; passed: number; failed: number }[];
}

/** One `impact` history record carrying the blast-radius counts (T7.22). */
interface ImpactRecord {
	at: string;
	kind: "impact";
	breaking: number;
	additive: number;
	cosmetic: number;
	touchedCallSites: number;
}

/**
 * Human-readable reason per deduction rule (the readiness gauge shows reasons,
 * not raw rule ids). Mirrors the labels handoff.ts uses for its term report.
 */
const RULE_REASON: Record<string, string> = {
	"var-binding": "Variable binding",
	"auto-layout": "Auto layout",
	component: "Component usage",
	naming: "Naming",
};

/** Aggregated, render-ready sections derived from the history log. */
interface Aggregation {
	driftTrend: DriftTrendPoint[];
	lintSummary: LintSummary | undefined;
	readiness: Readiness | undefined;
	a11y: A11ySummary | undefined;
	impact: ImpactSummary | undefined;
}

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Read + aggregate <stateDir>/history.jsonl into render-ready sections.
 *
 * Missing/empty file → empty aggregation (caller still renders an empty state).
 * Each corrupted (non-JSON) line is skipped and reported via `onWarning`.
 * Unknown `kind` values are skipped silently for forward compatibility.
 */
function aggregateHistory(
	stateDir: string,
	onWarning: (message: string) => void,
): Aggregation {
	const historyPath = join(stateDir, "history.jsonl");
	let text: string;
	try {
		text = readFileSync(historyPath, "utf8");
	} catch {
		return {
			driftTrend: [],
			lintSummary: undefined,
			readiness: undefined,
			a11y: undefined,
			impact: undefined,
		};
	}

	const driftTrend: DriftTrendPoint[] = [];
	let lint: LintSummary | undefined;
	let readiness: Readiness | undefined;
	let a11y: A11ySummary | undefined;
	let impact: ImpactSummary | undefined;

	const lines = text.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const trimmed = (lines[index] ?? "").trim();
		if (trimmed === "") continue;

		let record: { kind?: unknown; at?: unknown } & Record<string, unknown>;
		try {
			record = JSON.parse(trimmed) as typeof record;
		} catch {
			onWarning(
				`warning: skipping corrupted history line ${index + 1} in ${historyPath}`,
			);
			continue;
		}

		if (record.kind === "tokens-check") {
			const r = record as Partial<TokensCheckRecord>;
			const date = typeof r.at === "string" ? r.at.slice(0, 10) : "";
			driftTrend.push({
				date,
				breaking: asNumber(r.stale),
				additive: asNumber(r.missing),
				cosmetic: asNumber(r.orphan),
			});
			continue;
		}

		if (record.kind === "lint") {
			const r = record as Partial<LintRecord>;
			const byKind = r.byKind ?? { exact: 0, near: 0, offSystem: 0 };
			// Last lint record wins — it reflects the most recent run.
			lint = {
				byKind: {
					exact: asNumber(byKind.exact),
					near: asNumber(byKind.near),
					offSystem: asNumber(byKind.offSystem),
				},
				topOffenders: [],
			};
			continue;
		}

		if (record.kind === "handoff") {
			const r = record as Partial<HandoffRecord>;
			const deductions = Array.isArray(r.deductions) ? r.deductions : [];
			// Last handoff record wins — it reflects the most recent QA run. The
			// rule id is mapped to a human-readable reason for the gauge.
			readiness = {
				score: asNumber(r.score),
				frameName: typeof r.frameName === "string" ? r.frameName : "",
				deductions: deductions.map((d) => ({
					reason: RULE_REASON[d.rule] ?? d.rule,
					points: asNumber(d.points),
				})),
			};
			continue;
		}

		if (record.kind === "a11y") {
			const r = record as Partial<A11yRecord>;
			const modes = Array.isArray(r.modes) ? r.modes : [];
			// Last a11y record wins — it reflects the most recent audit.
			a11y = {
				level: r.level === "AAA" ? "AAA" : "AA",
				modes: modes.map((m) => ({
					mode: typeof m.mode === "string" ? m.mode : "",
					passed: asNumber(m.passed),
					failed: asNumber(m.failed),
				})),
			};
			continue;
		}

		if (record.kind === "impact") {
			const r = record as Partial<ImpactRecord>;
			// Last impact record wins — it reflects the most recent poll.
			impact = {
				breaking: asNumber(r.breaking),
				additive: asNumber(r.additive),
				cosmetic: asNumber(r.cosmetic),
				touchedCallSites: asNumber(r.touchedCallSites),
			};
		}

		// Unknown kinds (including missing kind) are skipped silently.
	}

	return { driftTrend, lintSummary: lint, readiness, a11y, impact };
}

/**
 * Read <stateDir>/registry.json and project it into the dashboard's Parity
 * section. Absent file → undefined (the renderer shows the empty state).
 * Unreadable / non-JSON registry → undefined with one stderr warning (a
 * corrupt registry never crashes the report).
 */
function readParity(
	stateDir: string,
	onWarning: (message: string) => void,
): Parity | undefined {
	const registryPath = join(stateDir, "registry.json");
	let text: string;
	try {
		text = readFileSync(registryPath, "utf8");
	} catch {
		return undefined; // absent registry → empty-state, as before
	}
	let registry: RegistryFile;
	try {
		registry = JSON.parse(text) as RegistryFile;
	} catch {
		onWarning(`warning: skipping unreadable registry ${registryPath}`);
		return undefined;
	}
	// buildParity/toParitySection are pure and never throw on a malformed
	// registry; they degrade to empty buckets.
	const section = toParitySection(buildParity(registry));
	if (section.rows.length === 0) return undefined;
	return section;
}

/** Render the dashboard and write it to `outPath`, or fail with exit code 2. */
function writeDashboard(
	outPath: string,
	html: string,
): { kind: "ok" } | ReportError {
	try {
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, html, "utf8");
		return { kind: "ok" };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Could not write report to "${outPath}": ${detail}`,
		};
	}
}

/** The opener command: DS_BRIDGE_OPEN_CMD override, else the platform default. */
function openerCommand(env: NodeJS.ProcessEnv): string {
	const override = env.DS_BRIDGE_OPEN_CMD;
	if (override !== undefined && override.trim() !== "") return override;
	return platform === "darwin" ? "open" : "xdg-open";
}

/**
 * Spawn the opener for `filePath`. Failure is non-fatal: the report already
 * exists on disk, so a missing opener only earns a stderr warning.
 */
function openReport(filePath: string, env: NodeJS.ProcessEnv): void {
	const command = openerCommand(env);
	try {
		const child = spawn(command, [filePath], {
			stdio: "ignore",
			detached: false,
		});
		child.on("error", (error) => {
			process.stderr.write(
				`warning: could not open report with "${command}": ${error.message}\n`,
			);
		});
		child.unref();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`warning: could not open report with "${command}": ${detail}\n`,
		);
	}
}

interface ReportOptions {
	open: boolean;
	out: string | undefined;
	view: string | undefined;
	artifacts: string | undefined;
}

function failReport(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** The resolved render selection: which artifacts, in order, plus a header label. */
interface ResolvedSelection {
	artifacts: ArtifactId[];
	/** Header label to name the active view; absent for the no-config default. */
	viewLabel?: string;
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
function resolveSelection(
	targetDir: string,
	options: ReportOptions,
): ResolvedSelection | ReportError {
	let dashboardView: string | undefined;
	let dashboardArtifacts: ArtifactId[] | undefined;

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
	}

	const flagArtifacts = parseArtifactsFlag(options.artifacts);
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
			return {
				artifacts: outcome.artifacts,
				...(viewLabel !== undefined ? { viewLabel } : {}),
			};
		}
	}
}

/** Execute the `report` command. Exit codes: 0 success · 2 operational error. */
function runReport(path: string, options: ReportOptions): void {
	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		failReport(`Path "${targetDir}" is not a directory.`);
		return;
	}

	// Resolve which artifacts to render (flags > .ds-bridge.json > everything)
	// before any history/registry work — a usage/config error should exit 2 fast.
	const selection = resolveSelection(targetDir, options);
	if ("kind" in selection) {
		failReport(selection.message);
		return;
	}

	const stateDir = join(targetDir, ".ds-bridge");
	const warn = (message: string): void => {
		process.stderr.write(`${message}\n`);
	};
	const aggregation = aggregateHistory(stateDir, warn);
	const parity = readParity(stateDir, warn);

	// The single io-edge clock read — the renderer is otherwise pure.
	// Optional sections are only spread in when present so
	// `exactOptionalPropertyTypes` keeps an absent section a genuine "not
	// provided" rather than an explicit `undefined`.
	const generatedAt = new Date().toISOString();
	const html = renderDashboard(
		{
			generatedAt,
			project: basename(targetDir),
			driftTrend: aggregation.driftTrend,
			...(aggregation.lintSummary !== undefined
				? { lintSummary: aggregation.lintSummary }
				: {}),
			...(aggregation.readiness !== undefined
				? { readiness: aggregation.readiness }
				: {}),
			...(parity !== undefined ? { parity } : {}),
			...(aggregation.a11y !== undefined ? { a11y: aggregation.a11y } : {}),
			...(aggregation.impact !== undefined
				? { impact: aggregation.impact }
				: {}),
		},
		selection.artifacts,
		selection.viewLabel !== undefined ? { viewLabel: selection.viewLabel } : {},
	);

	const outPath =
		options.out !== undefined
			? resolve(options.out)
			: join(stateDir, "reports", "dashboard.html");

	const written = writeDashboard(outPath, html);
	if (written.kind === "error") {
		failReport(written.message);
		return;
	}

	process.stdout.write(`${outPath}\n`);

	if (options.open) {
		openReport(outPath, process.env);
	}

	process.exitCode = 0;
}

/** Register the `report` command on the program. Wiring entry for cli.ts. */
export function registerReportCommand(program: Command): void {
	program
		.command("report")
		.description("Render an offline HTML dashboard from the project history")
		.argument("[path]", "project directory to report on", ".")
		.option(
			"--view <preset>",
			"render a persona preset: owner | engineering | design | consumer | everything",
		)
		.option(
			"--artifacts <ids>",
			"render a custom comma-separated artifact list (mutually exclusive with --view)",
		)
		.option(
			"--out <file>",
			"output file (default <path>/.ds-bridge/reports/dashboard.html)",
		)
		.option(
			"--open",
			'open the report after writing (override the opener with the DS_BRIDGE_OPEN_CMD env var; defaults to "open" on macOS, "xdg-open" elsewhere)',
			false,
		)
		.action((path: string, options: ReportOptions) => {
			runReport(path, options);
		});
}
