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
import { buildAudienceChangelog } from "../engines/report/audience-changelog.js";
import type { ArtifactId } from "../engines/report/catalog.js";
import {
	buildBreakingCalendar,
	buildChangeFrequency,
} from "../engines/report/consumer.js";
import { replayHistory } from "../engines/report/history-lines.js";
import { buildMigrationChecklist } from "../engines/report/migration-checklist.js";
import { buildParityTrend } from "../engines/report/parity-trend.js";
import { resolveView } from "../engines/report/presets.js";
import {
	DEFAULT_WEIGHTS,
	scoreFromHistory,
	type Weights,
} from "../engines/report/score.js";
import { buildScorecard } from "../engines/report/scorecard.js";
import { renderScorecardMarkdown } from "../engines/report/scorecard-md.js";
import type {
	A11ySummary,
	AdoptionTrendPoint,
	AudienceChangelog,
	BreakingCalendar,
	ChangeFrequency,
	DriftTrendPoint,
	ImpactSummary,
	ImportCoverage,
	LeaderboardRow,
	LibraryHealth,
	LintSummary,
	MigrationChecklist,
	Parity,
	ParityTrendPoint,
	Readiness,
	SystemScore,
} from "../engines/report/types.js";
import { readFileAtRef, spawnGitExec } from "../io/git-log.js";
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

/** One leaderboard directory bucket on a lint line's adoption block (A2). */
interface LintAdoptionDirectory {
	dir: string;
	refs: number;
	literals: number;
}

/** The css/scss-scoped adoption block on a directory lint line (A2). */
interface LintAdoptionBlock {
	refs: number;
	literals: number;
	byDirectory: LintAdoptionDirectory[];
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
	/** NEW (A2): css/scss adoption counts; absent on old/single-file runs. */
	adoption?: LintAdoptionBlock;
}

/** One `adoption` history record carrying the import-coverage census (A3b). */
interface AdoptionRecord {
	at: string;
	kind: "adoption";
	imported: number;
	total: number;
	uncovered: string[];
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
 * One `library-health` history record carrying the three hygiene-signal counts
 * (B5). The line is lean (SPEC §3): only the totals are persisted, so the
 * dashboard section reconstructs a minimal {@link LibraryHealth} with empty
 * lists — its bars come from the totals.
 */
interface LibraryHealthRecord {
	at: string;
	kind: "library-health";
	overrideHotspots: number;
	deprecatedUsage: number;
	detachedCandidates: number;
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
	/** On-system % over time, one point per dated adoption-bearing lint line (B3). */
	adoptionTrend: AdoptionTrendPoint[];
	/** On-system % by directory, from the LATEST adoption-bearing lint line (B3). */
	leaderboard: LeaderboardRow[] | undefined;
	/** Registry import coverage, last `adoption` kind line wins (B3). */
	importCoverage: ImportCoverage | undefined;
	/** Library hygiene signals, last `library-health` kind line wins (B5). */
	libraryHealth: LibraryHealth | undefined;
}

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** On-system percentage (refs / (refs + literals)), half-up rounded; 0 if empty. */
function onSystemPct(refs: number, literals: number): number {
	const total = refs + literals;
	return total === 0 ? 0 : Math.round((refs / total) * 100);
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
			adoptionTrend: [],
			leaderboard: undefined,
			importCoverage: undefined,
			libraryHealth: undefined,
		};
	}

	const driftTrend: DriftTrendPoint[] = [];
	let lint: LintSummary | undefined;
	let readiness: Readiness | undefined;
	let a11y: A11ySummary | undefined;
	let impact: ImpactSummary | undefined;
	// Adoption: a trend point per dated adoption-bearing lint line; the LATEST
	// such line's byDirectory becomes the leaderboard (B3). Tracked in parallel
	// to the plain-lint last-wins so a later plain lint line never clears them.
	const adoptionTrend: AdoptionTrendPoint[] = [];
	let leaderboard: LeaderboardRow[] | undefined;
	// Import coverage: last `adoption` kind line wins (B3).
	let importCoverage: ImportCoverage | undefined;
	// Library health: last `library-health` kind line wins (B5).
	let libraryHealth: LibraryHealth | undefined;

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
			// A lint line that CARRIES an adoption block contributes a dated trend
			// point and refreshes the leaderboard (B3). A plain lint line touches
			// neither — so adoption survives a later plain run (parallel last-wins).
			const adoption =
				typeof r.adoption === "object" && r.adoption !== null
					? r.adoption
					: undefined;
			if (adoption !== undefined) {
				const refs = asNumber(adoption.refs);
				const literals = asNumber(adoption.literals);
				if (typeof r.at === "string") {
					adoptionTrend.push({
						date: r.at.slice(0, 10),
						pct: onSystemPct(refs, literals),
					});
				}
				const byDirectory = Array.isArray(adoption.byDirectory)
					? adoption.byDirectory
					: [];
				// Latest adoption-bearing line wins for the leaderboard (the renderer
				// trusts the worst-first ordering the lint engine already produced).
				leaderboard = byDirectory.map((d) => ({
					dir: typeof d.dir === "string" ? d.dir : "",
					refs: asNumber(d.refs),
					literals: asNumber(d.literals),
				}));
			}
			continue;
		}

		if (record.kind === "adoption") {
			const r = record as Partial<AdoptionRecord>;
			const imported = asNumber(r.imported);
			const total = asNumber(r.total);
			const uncovered = Array.isArray(r.uncovered)
				? r.uncovered.filter((n): n is string => typeof n === "string")
				: [];
			// Last adoption record wins. uncoveredTotal is reconstructed from the
			// census (total − imported) — the history line caps the NAMES at 20 but
			// the true gap count is the population minus what's imported (A3b shape).
			importCoverage = {
				imported,
				total,
				uncovered,
				uncoveredTotal: Math.max(0, total - imported),
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
			continue;
		}

		if (record.kind === "library-health") {
			const r = record as Partial<LibraryHealthRecord>;
			// Last library-health line wins — it reflects the most recent crawl.
			// The line carries COUNTS only (SPEC §3), so reconstruct a minimal
			// LibraryHealth: the totals drive the section's bars; the three lists
			// are left empty (the renderer's hotspot list simply renders nothing).
			libraryHealth = {
				overrideHotspots: [],
				deprecatedUsage: [],
				detachedCandidates: [],
				totals: {
					overrideHotspots: asNumber(r.overrideHotspots),
					deprecatedUsage: asNumber(r.deprecatedUsage),
					detachedCandidates: asNumber(r.detachedCandidates),
				},
			};
		}

		// Unknown kinds (including missing kind) are skipped silently.
	}

	return {
		driftTrend,
		lintSummary: lint,
		readiness,
		a11y,
		impact,
		adoptionTrend,
		leaderboard,
		importCoverage,
		libraryHealth,
	};
}

/**
 * Replay <stateDir>/history.jsonl into the weighted system score (S4b). Reads
 * the SAME file aggregateHistory reads, then hands the raw text to the pure
 * engine (`scoreFromHistory`), which owns its tolerant parse. `weights` from
 * config; absent → the engine defaults. Missing/empty file or a `no-data`
 * outcome → undefined, so the section degrades to its empty state.
 */
function computeSystemScore(
	stateDir: string,
	weights: Weights | undefined,
): SystemScore | undefined {
	const historyPath = join(stateDir, "history.jsonl");
	let text: string;
	try {
		text = readFileSync(historyPath, "utf8");
	} catch {
		return undefined;
	}
	const outcome = scoreFromHistory(text, weights);
	if (outcome.kind === "no-data") return undefined;
	return {
		current: outcome.current,
		components: outcome.components,
		trend: outcome.trend,
	};
}

/**
 * Replay <stateDir>/history.jsonl into the two consumer VIEWS (B6): the
 * breaking-calendar (date-grouped breaking events) and the change-frequency
 * (per-kind activity density). Reuses the SAME `replayHistory` iterator path the
 * score/digest sections read — the engines are pure functions over its ordered
 * `{kind, at?, record}` records, no new parser. A missing/empty history yields
 * the engines' empty shapes (`{entries:[],total:0}` / `{byKind:[]}`), which the
 * renderer degrades to empty states. Threaded through selection like every
 * other artifact.
 */
function computeConsumerArtifacts(stateDir: string): {
	breakingCalendar: BreakingCalendar;
	changeFrequency: ChangeFrequency;
} {
	const records = replayHistory(readHistoryText(stateDir));
	return {
		breakingCalendar: buildBreakingCalendar(records),
		changeFrequency: buildChangeFrequency(records),
	};
}

/**
 * Replay <stateDir>/history.jsonl into the parity-trend series (C3, M2.1) via the
 * shared `replayHistory` iterator + the pure `buildParityTrend` engine — the
 * dated `parity` lines `registry build` appends. Empty when no parity line exists
 * (which keeps the no-config render byte-identical: the caller only spreads a
 * NON-empty series into ReportData, so an absent parity history leaves the section
 * in its empty state rather than the populated stub).
 */
function computeParityTrend(stateDir: string): ParityTrendPoint[] {
	return buildParityTrend(replayHistory(readHistoryText(stateDir)));
}

/**
 * Reconstruct the per-call-site migration checklist (C7, M2.2) from the LATEST
 * `impact` history record's optional `sites[]`, capped at `cap`, via the pure
 * `buildMigrationChecklist` engine. Last-wins over the impact lines. An impact
 * line WITHOUT `sites` (older/baseline) → an empty checklist; the caller only
 * spreads a NON-empty one into ReportData so an absent/sites-less impact history
 * keeps the section's empty state (and the no-config render byte-identical).
 */
function computeMigrationChecklist(
	stateDir: string,
	cap: number,
): MigrationChecklist {
	const records = replayHistory(readHistoryText(stateDir));
	let latestImpact: Record<string, unknown> | undefined;
	for (const entry of records) {
		if (entry.kind === "impact") latestImpact = entry.record;
	}
	return buildMigrationChecklist(latestImpact, cap);
}

/**
 * Reconstruct the audience-segmented changelog panel (C10, M2.3) from the LATEST
 * `changelog` history record via the shared `replayHistory` iterator + the pure
 * `buildAudienceChangelog` engine. Last-wins over the changelog lines. A line
 * with no sliceable `recent[]` (empty, or only unknown audiences) → no slices;
 * the caller only spreads a NON-empty panel into ReportData so an absent/empty
 * changelog history keeps the section's empty state (and the no-config render
 * byte-identical).
 */
function computeAudienceChangelog(stateDir: string): AudienceChangelog {
	const records = replayHistory(readHistoryText(stateDir));
	let latestChangelog: Record<string, unknown> | undefined;
	for (const entry of records) {
		if (entry.kind === "changelog") latestChangelog = entry.record;
	}
	return buildAudienceChangelog(latestChangelog);
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
	/** Output format: "html" (default) | "md". Unknown → exit 2 listing both. */
	format: string;
	/** `--delta <ref>`: compare against the base ref's committed history (md only). */
	delta: string | undefined;
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
	/** Validated system-score weights from config; undefined → engine defaults. */
	scoreWeights?: Weights;
	/** Migration-checklist site cap (C7); the config default (200) when no file. */
	migrationSitesCap: number;
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
	let scoreWeights: Weights | undefined;
	// Default to the config's own default (200, C7) when there is no project file.
	const defaults = resolveConfig({});
	let migrationSitesCap =
		defaults.kind === "ok" ? defaults.config.migrationSitesCap : 200;

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
		scoreWeights = resolved.config.scoreWeights;
		migrationSitesCap = resolved.config.migrationSitesCap;
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
				migrationSitesCap,
				...(viewLabel !== undefined ? { viewLabel } : {}),
				...(scoreWeights !== undefined ? { scoreWeights } : {}),
			};
		}
	}
}

/** Read <stateDir>/history.jsonl, or "" when the file is absent/unreadable. */
function readHistoryText(stateDir: string): string {
	try {
		return readFileSync(join(stateDir, "history.jsonl"), "utf8");
	} catch {
		return "";
	}
}

/**
 * Render the markdown scorecard (the `--format md` path, C4). Compares the
 * current `.ds-bridge/history.jsonl` against the base ref's COMMITTED history
 * when `--delta <ref>` is given, and emits the scorecard to stdout (CI-pipeable)
 * or — with `--out` — writes it to a file and prints that path.
 *
 * Base resolution (per SPEC §1.1, via the injectable GitExec seam, cwd =
 * targetDir): `missing` → render current-only + a no-baseline note (exit 0);
 * `git-error` → exit 2 with the message; `ok` → diff against the committed text.
 * Both sides score with the CURRENT weights (§1.5). An absent/empty current
 * history surfaces as `no-data` → exit 2 with run-a-check guidance.
 */
function runMarkdownReport(
	targetDir: string,
	options: ReportOptions,
	weights: Weights | undefined,
): void {
	const stateDir = join(targetDir, ".ds-bridge");
	const currentText = readHistoryText(stateDir);

	// Optional base: read the ref's committed history through git (cwd = the
	// resolved targetDir, not process.cwd()). The render options carry the labels.
	let baseText: string | undefined;
	let noBaseline = false;
	const baseLabel = options.delta;
	if (options.delta !== undefined) {
		const outcome = readFileAtRef({
			ref: options.delta,
			path: join(".ds-bridge", "history.jsonl"),
			cwd: targetDir,
			exec: spawnGitExec,
		});
		if (outcome.kind === "git-error") {
			failReport(`Could not read "${options.delta}": ${outcome.message}`);
			return;
		}
		if (outcome.kind === "missing") {
			// The realistic case: the committed .ds-bridge/ has no history at the ref.
			// Render current-only plus a no-baseline note (exit 0).
			noBaseline = true;
		} else {
			baseText = outcome.text;
		}
	}

	const effectiveWeights = weights ?? DEFAULT_WEIGHTS;
	const model = buildScorecard(currentText, baseText, effectiveWeights);
	if (model.kind === "no-data") {
		failReport(
			"No design-system history yet — run a check (e.g. ds-bridge tokens-check) to populate the scorecard.",
		);
		return;
	}

	const markdown = renderScorecardMarkdown(model, {
		...(baseLabel !== undefined ? { baseLabel } : {}),
		...(noBaseline ? { noBaseline: true } : {}),
	});

	// --out redirects to a file (and prints the path); otherwise the markdown goes
	// to stdout with NO trailing path line (pipe-cleanliness for CI / step summary).
	if (options.out !== undefined) {
		const outPath = resolve(options.out);
		const written = writeDashboard(outPath, markdown);
		if (written.kind === "error") {
			failReport(written.message);
			return;
		}
		process.stdout.write(`${outPath}\n`);
	} else {
		process.stdout.write(markdown);
	}

	process.exitCode = 0;
}

/** Execute the `report` command. Exit codes: 0 success · 2 operational error. */
function runReport(path: string, options: ReportOptions): void {
	// Validate flag combos first (a usage error should exit 2 before any I/O):
	// --format is two-valued (html | md); --delta requires md; --open is invalid
	// with md (no file to open). Per the C4 branch-order paragraph.
	if (options.format !== "html" && options.format !== "md") {
		failReport(
			`Unknown --format "${options.format}". Expected "html" or "md".`,
		);
		return;
	}
	if (options.delta !== undefined && options.format !== "md") {
		failReport("--delta requires --format md.");
		return;
	}
	if (options.open && options.format === "md") {
		failReport(
			"--open is not valid with --format md (there is no file to open).",
		);
		return;
	}

	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		failReport(`Path "${targetDir}" is not a directory.`);
		return;
	}

	// Resolve which artifacts to render (flags > .ds-bridge.json > everything)
	// before any history/registry work — a usage/config error should exit 2 fast.
	// (Also resolves the CURRENT-side score weights, applied to BOTH md sides.)
	const selection = resolveSelection(targetDir, options);
	if ("kind" in selection) {
		failReport(selection.message);
		return;
	}

	// The md path emits a markdown scorecard and RETURNS before the html tail.
	if (options.format === "md") {
		runMarkdownReport(targetDir, options, selection.scoreWeights);
		return;
	}

	const stateDir = join(targetDir, ".ds-bridge");
	const warn = (message: string): void => {
		process.stderr.write(`${message}\n`);
	};
	const aggregation = aggregateHistory(stateDir, warn);
	const parity = readParity(stateDir, warn);
	// Replay the SAME history.jsonl into the weighted system score (S4b). The
	// engine owns its parse (tolerance-mirrored); weights come from config, else
	// the engine defaults. no-data → leave systemScore undefined (empty state).
	const systemScore = computeSystemScore(stateDir, selection.scoreWeights);
	// Replay the SAME history into the two consumer VIEWS (B6) via the shared
	// `replayHistory` iterator — pure functions, no new parser. Always present
	// (their empty shapes degrade to the renderer's empty state).
	const consumer = computeConsumerArtifacts(stateDir);
	// Parity-trend (C3, M2.1): the dated `parity` lines as a pass-% series. Only
	// spread in when NON-empty so an absent parity history keeps the section's
	// empty state (and the no-config golden byte-identical).
	const parityTrend = computeParityTrend(stateDir);
	// Migration checklist (C7, M2.2): the latest impact line's per-call-site
	// sites[], capped. Only spread in when NON-empty so an impact line without
	// sites (or no impact line) keeps the section's empty state (golden-neutral).
	const migrationChecklist = computeMigrationChecklist(
		stateDir,
		selection.migrationSitesCap,
	);
	// Audience changelog (C10, M2.3): the latest changelog line's recent[] folded
	// into designer/developer slices. Only spread in when NON-empty so a line
	// without sliceable entries (or no changelog line) keeps the section's empty
	// state (golden-neutral).
	const audienceChangelog = computeAudienceChangelog(stateDir);

	// The single io-edge clock read — the renderer is otherwise pure.
	// Optional sections are only spread in when present so
	// `exactOptionalPropertyTypes` keeps an absent section a genuine "not
	// provided" rather than an explicit `undefined`.
	const generatedAt = new Date().toISOString();
	const html = renderDashboard(
		{
			generatedAt,
			project: basename(targetDir),
			...(systemScore !== undefined ? { systemScore } : {}),
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
			adoptionTrend: aggregation.adoptionTrend,
			...(aggregation.leaderboard !== undefined
				? { leaderboard: aggregation.leaderboard }
				: {}),
			...(aggregation.importCoverage !== undefined
				? { importCoverage: aggregation.importCoverage }
				: {}),
			...(aggregation.libraryHealth !== undefined
				? { libraryHealth: aggregation.libraryHealth }
				: {}),
			breakingCalendar: consumer.breakingCalendar,
			changeFrequency: consumer.changeFrequency,
			...(parityTrend.length > 0 ? { parityTrend } : {}),
			...(migrationChecklist.sites.length > 0 ? { migrationChecklist } : {}),
			...(audienceChangelog.slices.length > 0 ? { audienceChangelog } : {}),
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
			"--format <format>",
			"output format: html (default, the offline dashboard) | md (a markdown scorecard for PR comments / $GITHUB_STEP_SUMMARY)",
			"html",
		)
		.option(
			"--delta <ref>",
			"compare against the base ref's committed history (requires --format md)",
		)
		.option(
			"--out <file>",
			"output file (default <path>/.ds-bridge/reports/dashboard.html; with --format md, redirects the scorecard to a file instead of stdout)",
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
