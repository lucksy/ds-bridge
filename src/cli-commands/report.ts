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
import {
	type ComponentAliases,
	type FreshnessThresholds,
	type MetricTargets,
	type OwnershipMap,
	resolveConfig,
	type ScoreWeightsByView,
} from "../config.js";
import { buildParity, toParitySection } from "../engines/registry/parity.js";
import type { RegistryFile } from "../engines/registry/persist.js";
import { buildAudienceChangelog } from "../engines/report/audience-changelog.js";
import type { ArtifactId } from "../engines/report/catalog.js";
import { buildComponentHealth } from "../engines/report/component-health.js";
import {
	buildBreakingCalendar,
	buildChangeFrequency,
} from "../engines/report/consumer.js";
import { buildFrameImplementability } from "../engines/report/frame-implementability.js";
import { buildFreshness } from "../engines/report/freshness.js";
import { replayHistory } from "../engines/report/history-lines.js";
import { buildLibraryHealthTrend } from "../engines/report/library-health-trend.js";
import { buildMigrationChecklist } from "../engines/report/migration-checklist.js";
import {
	type DirectoryAdoption,
	parseCodeowners,
	rollupByOwner,
} from "../engines/report/ownership.js";
import { buildParityTrend } from "../engines/report/parity-trend.js";
import { resolveView } from "../engines/report/presets.js";
import {
	evaluateReleaseReadiness,
	extractReleaseSignals,
} from "../engines/report/release-readiness.js";
import {
	resolveWeightProfile,
	scoreFromHistory,
	type Weights,
} from "../engines/report/score.js";
import { buildScorecard } from "../engines/report/scorecard.js";
import { renderScorecardMarkdown } from "../engines/report/scorecard-md.js";
import {
	evaluateTargets,
	type LatestScalars,
} from "../engines/report/targets.js";
import type {
	A11ySummary,
	AdoptionTrendPoint,
	AudienceChangelog,
	BreakingCalendar,
	ChangeFrequency,
	ComponentHealthRow,
	DriftTrendPoint,
	FrameImplementability,
	FreshnessRow,
	ImpactSummary,
	ImportCoverage,
	LeaderboardRow,
	LibraryHealth,
	LibraryHealthTrendPoint,
	LintSummary,
	MigrationChecklist,
	OwnershipRow,
	Parity,
	ParityTrendPoint,
	Readiness,
	ReleaseReadiness,
	ScoreVelocity,
	SystemScore,
	SystemScoreTrendPoint,
	TargetVerdict,
} from "../engines/report/types.js";
import { computeVelocity } from "../engines/report/velocity.js";
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
 * Replay <stateDir>/history.jsonl into the library-health-trend series (C6, M3.4)
 * via the shared `replayHistory` iterator + the pure `buildLibraryHealthTrend`
 * engine — the dated `library-health` lines folded into a hygiene-count series.
 * Empty when no dated library-health line exists (the caller only spreads a
 * NON-empty series into ReportData, so an absent library-health history keeps the
 * section in its empty state rather than the populated stub).
 */
function computeLibraryHealthTrend(
	stateDir: string,
): LibraryHealthTrendPoint[] {
	return buildLibraryHealthTrend(replayHistory(readHistoryText(stateDir)));
}

/** The `--velocity-window` grammar: a positive integer count, then `d` or `w`. */
const VELOCITY_WINDOW = /^(\d+)([dw])$/;

/**
 * Parse a `--velocity-window <N>d|<N>w` flag into a positive day count (C8),
 * mirroring `parseSince`'s relative-window grammar (`w` = 7 days). `undefined`
 * input → undefined (the caller falls back to config / the 30-day default); a
 * malformed value → a typed error translated to exit 2 at the edge.
 */
function parseVelocityWindow(
	raw: string | undefined,
):
	| { kind: "ok"; days: number | undefined }
	| { kind: "error"; message: string } {
	if (raw === undefined) return { kind: "ok", days: undefined };
	const match = VELOCITY_WINDOW.exec(raw);
	if (match === null) {
		return {
			kind: "error",
			message: `Invalid --velocity-window "${raw}". Expected a relative window "<N>d" or "<N>w".`,
		};
	}
	const count = Number.parseInt(match[1] ?? "", 10);
	if (count <= 0) {
		return {
			kind: "error",
			message: `Invalid --velocity-window "${raw}". The count must be a positive integer.`,
		};
	}
	return { kind: "ok", days: match[2] === "w" ? count * 7 : count };
}

/**
 * Compute the windowed score velocity (C8, M3.5) from the system-score trend via
 * the pure `computeVelocity` engine. `now` is the injected render instant so the
 * result is reproducible. Fewer than two trend points → undefined (the caller
 * leaves the section in its empty state). Pure derivation — writes no history.
 */
function computeScoreVelocity(
	trend: readonly SystemScoreTrendPoint[],
	nowIso: string,
	windowDays: number,
): ScoreVelocity | undefined {
	return computeVelocity(trend, nowIso, windowDays);
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
 * Reconstruct the frame-implementability rollup (C11, M2.4) from the LATEST
 * `frame-impl` history record via the shared `replayHistory` iterator + the pure
 * `buildFrameImplementability` engine. Last-wins over the frame-impl lines. An
 * absent frame-impl history → the empty rollup (total 0); the caller only spreads
 * a rollup with measured requirements into ReportData so an absent frame-impl
 * history keeps the section's empty state (and the no-config render byte-identical).
 */
function computeFrameImplementability(stateDir: string): FrameImplementability {
	const records = replayHistory(readHistoryText(stateDir));
	let latestFrameImpl: Record<string, unknown> | undefined;
	for (const entry of records) {
		if (entry.kind === "frame-impl") latestFrameImpl = entry.record;
	}
	return buildFrameImplementability(latestFrameImpl);
}

/**
 * Resolve the effective CODEOWNERS-style ownership rules (C9, M3.6) for the
 * leaderboard: the config `ownership` ARRAY takes precedence; otherwise, when an
 * `ownership_file` path is configured, read + parse it at this io edge (relative
 * to `targetDir`) into the SAME `{ owner, paths }` rule shape. An unreadable file
 * degrades to no rules (the section stays empty). Returns `undefined` when no
 * ownership source is configured at all.
 */
function resolveOwnership(
	targetDir: string,
	ownership: OwnershipMap | undefined,
	ownershipFile: string | undefined,
): OwnershipMap | undefined {
	if (ownership !== undefined) return ownership;
	if (ownershipFile === undefined) return undefined;
	let text: string;
	try {
		text = readFileSync(resolve(targetDir, ownershipFile), "utf8");
	} catch {
		return undefined; // unreadable CODEOWNERS → no rules (empty section)
	}
	return parseCodeowners(text);
}

/**
 * Build the ownership-leaderboard rows (C9, M3.6) by re-folding the LATEST
 * adoption-bearing lint line's `byDirectory` onto named owners via the pure
 * `rollupByOwner` engine. The owners come from the config `ownership` array OR a
 * parsed `ownership_file` (resolved by `resolveOwnership`). No ownership source,
 * no adoption-bearing lint line, OR no joinable directories → []; the caller only
 * spreads a NON-empty leaderboard into ReportData so an unconfigured project keeps
 * the section's empty state (and the no-config golden byte-identical). Pure
 * derivation over history — writes no history.
 */
function computeOwnershipLeaderboard(
	stateDir: string,
	ownership: OwnershipMap | undefined,
): OwnershipRow[] {
	if (ownership === undefined) return [];
	const records = replayHistory(readHistoryText(stateDir));
	let byDirectory: DirectoryAdoption[] = [];
	for (const { kind, record } of records) {
		if (kind !== "lint") continue;
		const adoption = asRecord(record.adoption);
		if (adoption === undefined) continue; // plain lint line never clears prior
		const raw = Array.isArray(adoption.byDirectory) ? adoption.byDirectory : [];
		byDirectory = raw.map((entry) => {
			const dirRec = asRecord(entry) ?? {};
			return {
				dir: typeof dirRec.dir === "string" ? dirRec.dir : "",
				refs: asNumber(dirRec.refs),
				literals: asNumber(dirRec.literals),
			};
		});
	}
	return rollupByOwner(byDirectory, ownership);
}

/**
 * Compose the pre-publish release-readiness rollup (C13, M3.7) from the latest
 * persisted release signals via the pure `evaluateReleaseReadiness` engine — the
 * impact (breaking) / drift (tokens-check stale+missing) / parity
 * (missing-in-code/figma) gates. Reads the SAME `history.jsonl` replay; missing
 * signals become insufficient-data gates (never a false "go"). When NO release
 * signal was ever recorded (no impact / tokens-check / parity line) the section
 * stays in its empty state — an all-insufficient "preview" on a project with zero
 * relevant history would be misleading — so this returns an empty-checks rollup
 * there. The standalone `release-check` command, by contrast, always evaluates
 * (its CI gate must report no-go even on an empty history). The caller spreads
 * this into ReportData only when it HAS checks (i.e. at least one signal present).
 */
function computeReleaseReadiness(stateDir: string): ReleaseReadiness {
	const signals = extractReleaseSignals(
		replayHistory(readHistoryText(stateDir)),
	);
	// No release signal at all → keep the section's empty state (golden-neutral on
	// a project with no impact/drift/parity history).
	if (
		signals.impact === undefined &&
		signals.drift === undefined &&
		signals.parity === undefined
	) {
		return { go: false, checks: [] };
	}
	return evaluateReleaseReadiness(signals);
}

/**
 * Build the data-freshness rows (C4, M3.2) from the SAME `history.jsonl` replay
 * via the shared `replayHistory` iterator + the pure `buildFreshness` engine: one
 * row per tracked check-kind (most-recent run, whole-day age, RAG band). `nowIso`
 * is the injected render instant (`generatedAt`) so the ages are reproducible;
 * `thresholds` is the resolved per-kind `freshness_thresholds` (or undefined →
 * the engine's per-kind defaults). buildFreshness ALWAYS returns one row per
 * tracked kind (never-run kinds become `unknown`-band rows), so the section
 * populates for any project that has run at least one tracked check — the caller
 * spreads it only when NON-empty, which on a tracked-kind list means "always
 * present" (the empty array only arises if the tracked list itself were empty).
 */
function computeDataFreshness(
	stateDir: string,
	nowIso: string,
	thresholds: FreshnessThresholds | undefined,
): FreshnessRow[] {
	return buildFreshness(
		replayHistory(readHistoryText(stateDir)),
		nowIso,
		thresholds,
	);
}

/**
 * Read <stateDir>/registry.json and project it into the raw parity rows (C5,
 * M3.3) — the per-component match/gap statuses the component-health join folds.
 * Absent/unreadable/non-JSON registry → [] (the join simply has no parity signal).
 * Mirrors `readParity`'s tolerant read but returns `buildParity().rows` rather than
 * the heat-grid section.
 */
function readParityRows(
	stateDir: string,
): ReturnType<typeof buildParity>["rows"] {
	const registryPath = join(stateDir, "registry.json");
	let text: string;
	try {
		text = readFileSync(registryPath, "utf8");
	} catch {
		return [];
	}
	let registry: RegistryFile;
	try {
		registry = JSON.parse(text) as RegistryFile;
	} catch {
		return [];
	}
	return buildParity(registry).rows;
}

/**
 * Build the component-health rollup (C5, M3.3) — a cross-engine JOIN over the
 * already-aggregated signals via the pure `buildComponentHealth` engine: the
 * registry parity rows ⋈ the latest readiness/a11y (name-heuristic, raised to an
 * EXACT join by `component_aliases`). The latest library-health history line is
 * counts-only (no per-component lists), so the override/deprecated/detached arm of
 * the join degrades to empty here — the engine handles that gracefully. Returns []
 * when there are no joinable signals; the caller spreads it only when NON-empty so
 * an unconfigured project keeps the section's empty state (golden-neutral).
 */
function computeComponentHealth(
	stateDir: string,
	readiness: Readiness | undefined,
	a11y: A11ySummary | undefined,
	aliases: ComponentAliases | undefined,
): ComponentHealthRow[] {
	return buildComponentHealth({
		parityRows: readParityRows(stateDir),
		...(readiness !== undefined
			? {
					readiness: {
						frameName: readiness.frameName,
						score: readiness.score,
					},
				}
			: {}),
		...(a11y !== undefined ? { a11y: { modes: a11y.modes } } : {}),
		...(aliases !== undefined ? { aliases } : {}),
	});
}

/** A non-null object record, or undefined. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

/** Half-up percentage 100·part/whole, or undefined when the denominator is 0. */
function safePct(part: number, whole: number): number | undefined {
	if (whole <= 0) return undefined;
	return Math.round((100 * part) / whole);
}

/**
 * Extract the latest measured scalars the C1 targets engine compares against
 * (C1, M3.1), one per eligible target metric, from the SAME `history.jsonl`
 * replay the scorecard/score read. Last-wins per kind. Each scalar mirrors a
 * scorecard row's source so a user's target is checked against the number they
 * already see:
 *   - `on-system` — 100·refs/(refs+literals) from the latest adoption-bearing lint line
 *   - `drift`     — the latest tokens-check's total drift = stale + missing + orphan
 *   - `parity`    — the latest `parity` line's pass-% (persisted `score`, else 100·ok/total)
 *   - `contrast`  — 100·Σpassed/(Σpassed+Σfailed) over the latest a11y line's modes
 *   - `readiness` — the latest handoff `score` verbatim
 *   - `system-score` — the composite, threaded from `computeSystemScore` (so the
 *     gate honors the same per-view-weighted composite the dashboard shows).
 * A metric with no source line stays `undefined` → the engine bands it `unknown`,
 * never a misleading red.
 */
function latestTargetScalars(
	stateDir: string,
	systemScore: number | undefined,
): LatestScalars {
	const records = replayHistory(readHistoryText(stateDir));
	let adoptionLint: Record<string, unknown> | undefined;
	let tokensCheck: Record<string, unknown> | undefined;
	let parity: Record<string, unknown> | undefined;
	let a11y: Record<string, unknown> | undefined;
	let handoff: Record<string, unknown> | undefined;
	for (const { kind, record } of records) {
		switch (kind) {
			case "lint":
				// Parallel last-wins keyed on field presence: a plain lint line never
				// clears a prior adoption-bearing one (score.ts:333 precedent).
				if (asRecord(record.adoption) !== undefined) adoptionLint = record;
				break;
			case "tokens-check":
				tokensCheck = record;
				break;
			case "parity":
				parity = record;
				break;
			case "a11y":
				a11y = record;
				break;
			case "handoff":
				handoff = record;
				break;
			default:
				break; // unknown kind — skip (forward compat)
		}
	}

	const scalars: LatestScalars = {};

	const adoption = adoptionLint && asRecord(adoptionLint.adoption);
	if (adoption !== undefined) {
		const refs = asNumber(adoption.refs);
		const literals = asNumber(adoption.literals);
		const pct = safePct(refs, refs + literals);
		if (pct !== undefined) scalars["on-system"] = pct;
	}

	if (tokensCheck !== undefined) {
		scalars.drift =
			asNumber(tokensCheck.stale) +
			asNumber(tokensCheck.missing) +
			asNumber(tokensCheck.orphan);
	}

	if (parity !== undefined) {
		const total = asNumber(parity.total);
		if (typeof parity.score === "number" && Number.isFinite(parity.score)) {
			scalars.parity = parity.score;
		} else if (total > 0) {
			scalars.parity = Math.round((100 * asNumber(parity.ok)) / total);
		}
	}

	if (a11y !== undefined) {
		const modes = Array.isArray(a11y.modes) ? a11y.modes : [];
		let passed = 0;
		let failed = 0;
		for (const m of modes) {
			const mm = asRecord(m);
			if (mm === undefined) continue;
			passed += asNumber(mm.passed);
			failed += asNumber(mm.failed);
		}
		const pct = safePct(passed, passed + failed);
		if (pct !== undefined) scalars.contrast = pct;
	}

	if (handoff !== undefined) scalars.readiness = asNumber(handoff.score);

	if (systemScore !== undefined) scalars["system-score"] = systemScore;

	return scalars;
}

/**
 * Evaluate the configured metric targets (C1, M3.1) against the latest measured
 * scalars. No targets configured → []; the caller spreads the result into
 * ReportData only when NON-empty (so an unconfigured project keeps the targets
 * section's empty state, and the no-config golden byte-identical). Pure derivation
 * over history — writes nothing.
 */
function computeTargets(
	stateDir: string,
	targets: MetricTargets | undefined,
	systemScore: number | undefined,
): TargetVerdict[] {
	if (targets === undefined) return [];
	return evaluateTargets(latestTargetScalars(stateDir, systemScore), targets);
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
	/** `--gate`: a red metric-target verdict exits 1 (md only; html → exit 2). */
	gate: boolean;
	/** `--velocity-window <N>d|<N>w`: C8 score-velocity look-back (flag > config > 30d). */
	velocityWindow: string | undefined;
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
	/** Per-kind `freshness_thresholds` map (C4); undefined → engine defaults. */
	freshnessThresholds?: FreshnessThresholds;
	/** Component-health join keys (`component_aliases`, C5); undefined when absent. */
	componentAliases?: ComponentAliases;
	/** CODEOWNERS-style `ownership` rules (C9); undefined when absent. */
	ownership?: OwnershipMap;
	/** Path to a CODEOWNERS file (`ownership_file`, C9); undefined when absent. */
	ownershipFile?: string;
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
	let scoreWeightsByView: ScoreWeightsByView | undefined;
	let metricTargets: MetricTargets | undefined;
	let freshnessThresholds: FreshnessThresholds | undefined;
	let componentAliases: ComponentAliases | undefined;
	let ownership: OwnershipMap | undefined;
	let ownershipFile: string | undefined;
	// Default to the config's own defaults (200, C7 / 30, C8) when there is no file.
	const defaults = resolveConfig({});
	let migrationSitesCap =
		defaults.kind === "ok" ? defaults.config.migrationSitesCap : 200;
	let scoreVelocityWindow =
		defaults.kind === "ok" ? defaults.config.scoreVelocityWindow : 30;

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
		scoreWeightsByView = resolved.config.scoreWeightsByView;
		migrationSitesCap = resolved.config.migrationSitesCap;
		metricTargets = resolved.config.metricTargets;
		scoreVelocityWindow = resolved.config.scoreVelocityWindow;
		freshnessThresholds = resolved.config.freshnessThresholds;
		componentAliases = resolved.config.componentAliases;
		ownership = resolved.config.ownership;
		ownershipFile = resolved.config.ownershipFile;
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
			// The NAMED view (C2 by-view weight lookup key): the preset/persona name,
			// only when one is active (a custom list / the default carry no viewName,
			// so no by-view weight profile can apply — golden-neutral).
			const viewName =
				outcome.source === "default" ? undefined : outcome.viewName;
			return {
				artifacts: outcome.artifacts,
				migrationSitesCap,
				scoreVelocityWindow,
				...(viewLabel !== undefined ? { viewLabel } : {}),
				...(viewName !== undefined ? { viewName } : {}),
				...(scoreWeights !== undefined ? { scoreWeights } : {}),
				...(scoreWeightsByView !== undefined ? { scoreWeightsByView } : {}),
				...(metricTargets !== undefined ? { metricTargets } : {}),
				...(freshnessThresholds !== undefined ? { freshnessThresholds } : {}),
				...(componentAliases !== undefined ? { componentAliases } : {}),
				...(ownership !== undefined ? { ownership } : {}),
				...(ownershipFile !== undefined ? { ownershipFile } : {}),
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
	selection: ResolvedSelection,
): void {
	// Resolve the effective weights for THIS render via the SAME C2 precedence the
	// html score + the badge use (active view's by-view override > global
	// score_weights > defaults), so the scorecard score row shows the SAME number
	// the dashboard does. Render-scoped — never written back. §1.5: BOTH scorecard
	// sides score with this one table.
	const weightProfile = resolveWeightProfile(
		selection.viewName,
		selection.scoreWeights,
		selection.scoreWeightsByView,
	);
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

	const effectiveWeights = weightProfile.weights;
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

	// CI gate (C1, M3.1): with --gate set, a RED metric-target verdict exits 1 —
	// the scorecard still rendered above (the gate is an exit-code concern, not a
	// mute). Without --gate, or with no red verdict, the md path stays exit 0. The
	// targets are banded against the CURRENT-side scalars (and its composite score).
	if (options.gate) {
		const score = scoreFromHistory(currentText, effectiveWeights);
		const verdicts = computeTargets(
			stateDir,
			selection.metricTargets,
			score.kind === "ok" ? score.current : undefined,
		);
		if (verdicts.some((v) => v.band === "red")) {
			process.exitCode = 1;
			return;
		}
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
	// --gate is a CI/text concern (C1): it acts on the md scorecard. With a non-md
	// (html) output there is nothing to gate on → exit 2 rather than silently pass.
	if (options.gate && options.format !== "md") {
		failReport(
			"--gate requires --format md (the gate acts on the text scorecard, not the HTML dashboard).",
		);
		return;
	}
	// --velocity-window (C8): parse the flag grammar up front so a malformed value
	// exits 2 before any I/O. `ok.days` undefined → fall back to config / the default.
	const velocityWindowFlag = parseVelocityWindow(options.velocityWindow);
	if (velocityWindowFlag.kind === "error") {
		failReport(velocityWindowFlag.message);
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
		runMarkdownReport(targetDir, options, selection);
		return;
	}

	const stateDir = join(targetDir, ".ds-bridge");
	const warn = (message: string): void => {
		process.stderr.write(`${message}\n`);
	};
	const aggregation = aggregateHistory(stateDir, warn);
	const parity = readParity(stateDir, warn);
	// Resolve the effective system-score weights for THIS render (C2): the active
	// view's by-view override > the global score_weights > the engine defaults
	// (render-scoped, never written back). The SAME table drives the html score,
	// the scorecard score row, and the badge so all three show ONE number. The
	// profile source captions a by-view weight set in the system-score section.
	const weightProfile = resolveWeightProfile(
		selection.viewName,
		selection.scoreWeights,
		selection.scoreWeightsByView,
	);
	// Replay the SAME history.jsonl into the weighted system score (S4b). The
	// engine owns its parse (tolerance-mirrored); the resolved C2 weights drive
	// it. no-data → leave systemScore undefined (empty state).
	const systemScore = computeSystemScore(stateDir, weightProfile.weights);
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
	// Frame implementability (C11, M2.4): the latest frame-impl line's on-system %
	// + gaps-by-reason. Only spread in when it measured requirements (total > 0) so
	// an absent frame-impl line keeps the section's empty state (golden-neutral).
	const frameImplementability = computeFrameImplementability(stateDir);
	// Targets RAG (C1, M3.1): the configured metric_targets banded against the
	// latest measured scalars (incl. the composite system score). Only spread in
	// when NON-empty so an unconfigured project keeps the section's empty state
	// (and the no-config golden byte-identical).
	const targets = computeTargets(
		stateDir,
		selection.metricTargets,
		systemScore?.current,
	);
	// Library-health trend (C6, M3.4): the dated `library-health` lines folded into
	// a hygiene-count series. Only spread in when NON-empty so an absent (or only
	// dateless) library-health history keeps the section's empty state.
	const libraryHealthTrend = computeLibraryHealthTrend(stateDir);

	// The single io-edge clock read — the renderer is otherwise pure.
	// Optional sections are only spread in when present so
	// `exactOptionalPropertyTypes` keeps an absent section a genuine "not
	// provided" rather than an explicit `undefined`.
	const generatedAt = new Date().toISOString();
	// Score velocity (C8, M3.5): the windowed delta of the composite over the
	// system-score trend, evaluated at `generatedAt` (injected → reproducible).
	// Window precedence: --velocity-window flag > score_velocity_window config > 30.
	// Only spread in when DEFINED (<2 trend points → undefined → empty state).
	const velocityWindowDays =
		velocityWindowFlag.days ?? selection.scoreVelocityWindow;
	const scoreVelocity =
		systemScore !== undefined
			? computeScoreVelocity(systemScore.trend, generatedAt, velocityWindowDays)
			: undefined;
	// Data freshness (C4, M3.2): one row per tracked check-kind (most-recent run,
	// whole-day age, RAG band), aged from the injected `generatedAt` (reproducible)
	// against the resolved per-kind `freshness_thresholds` (or the engine defaults).
	// buildFreshness returns the full tracked-kind list (never-run kinds banded
	// `unknown`), so the section populates whenever the tracked list is non-empty.
	const dataFreshness = computeDataFreshness(
		stateDir,
		generatedAt,
		selection.freshnessThresholds,
	);
	// Component health (C5, M3.3): the cross-engine join of registry parity ⋈
	// latest readiness/a11y (name-heuristic, exact via component_aliases). Only
	// spread in when NON-empty so a project with no joinable signals keeps the
	// section's empty state (and the no-config golden byte-identical).
	const componentHealth = computeComponentHealth(
		stateDir,
		aggregation.readiness,
		aggregation.a11y,
		selection.componentAliases,
	);
	// Ownership leaderboard (C9, M3.6): the latest adoption-bearing lint line's
	// byDirectory re-folded onto named owners (config `ownership` array, or a
	// parsed `ownership_file`). Only spread in when NON-empty so an unconfigured
	// project keeps the section's empty state (and the no-config golden
	// byte-identical — the golden seed has byDirectory but no ownership config).
	const ownershipLeaderboard = computeOwnershipLeaderboard(
		stateDir,
		resolveOwnership(targetDir, selection.ownership, selection.ownershipFile),
	);
	// Release readiness (C13, M3.7): the impact/drift/parity gates composed into a
	// go/no-go rollup over the latest persisted signals. Only spread in when it has
	// checks (the engine returns three for any history; an empty/absent history
	// still yields three insufficient-data checks → no-go), so any project with a
	// history populates the section (flipping it out of its empty state).
	const releaseReadiness = computeReleaseReadiness(stateDir);
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
			...(frameImplementability.total > 0 ? { frameImplementability } : {}),
			...(targets.length > 0 ? { targets } : {}),
			...(libraryHealthTrend.length > 0 ? { libraryHealthTrend } : {}),
			...(scoreVelocity !== undefined ? { scoreVelocity } : {}),
			...(dataFreshness.length > 0 ? { dataFreshness } : {}),
			...(componentHealth.length > 0 ? { componentHealth } : {}),
			...(ownershipLeaderboard.length > 0 ? { ownershipLeaderboard } : {}),
			...(releaseReadiness.checks.length > 0 ? { releaseReadiness } : {}),
		},
		selection.artifacts,
		{
			...(selection.viewLabel !== undefined
				? { viewLabel: selection.viewLabel }
				: {}),
			// Caption the system-score section ONLY for a `view`-source profile; the
			// renderer renders nothing for project/default (golden-neutral).
			weightProfile: {
				source: weightProfile.source,
				...(weightProfile.name !== undefined
					? { name: weightProfile.name }
					: {}),
			},
		},
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
			"--gate",
			"exit 1 when a metric_targets verdict is red (requires --format md; CI gate, C1)",
			false,
		)
		.option(
			"--velocity-window <window>",
			"score-velocity look-back window as <N>d|<N>w (C8; overrides score_velocity_window, default 30d)",
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
