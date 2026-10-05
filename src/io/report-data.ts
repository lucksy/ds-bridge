import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type {
	ComponentAliases,
	FreshnessThresholds,
	MetricTargets,
	OwnershipMap,
} from "../config.js";
import {
	buildParity,
	type ParityReport,
	toParitySection,
} from "../engines/registry/parity.js";
import type { RegistryFile } from "../engines/registry/persist.js";
import { buildAudienceChangelog } from "../engines/report/audience-changelog.js";
import { buildComponentHealth } from "../engines/report/component-health.js";
import { buildConsistency } from "../engines/report/consistency.js";
import {
	buildBreakingCalendar,
	buildChangeFrequency,
} from "../engines/report/consumer.js";
import { buildDebt } from "../engines/report/debt.js";
import { buildExecutive } from "../engines/report/executive.js";
import { executiveInputs } from "../engines/report/executive-inputs.js";
import { buildFrameImplementability } from "../engines/report/frame-implementability.js";
import { buildFrameReadinessTrend } from "../engines/report/frame-readiness-trend.js";
import { buildFreshness } from "../engines/report/freshness.js";
import { buildHandoffPassRate } from "../engines/report/handoff-pass-rate.js";
import {
	type HistoryRecord,
	replayHistory,
} from "../engines/report/history-lines.js";
import { buildLibraryHealthTrend } from "../engines/report/library-health-trend.js";
import { buildLibraryHotspotsTrend } from "../engines/report/library-hotspots-trend.js";
import { buildMigrationChecklist } from "../engines/report/migration-checklist.js";
import {
	type DirectoryAdoption,
	parseCodeowners,
	rollupByOwner,
} from "../engines/report/ownership.js";
import { buildParityTrend } from "../engines/report/parity-trend.js";
import {
	evaluateReleaseReadiness,
	extractReleaseSignals,
} from "../engines/report/release-readiness.js";
import {
	resolveWeightProfile,
	scoreFromHistory,
	type Weights,
} from "../engines/report/score.js";
import {
	evaluateTargets,
	type LatestScalars,
} from "../engines/report/targets.js";
import { historyAsOf, timelineDays } from "../engines/report/timeline.js";
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
	ReportData,
	ScoreVelocity,
	SystemScore,
	SystemScoreTrendPoint,
	TargetVerdict,
} from "../engines/report/types.js";
import { computeVelocity } from "../engines/report/velocity.js";
import type { DashboardPastState } from "../render/html/dashboard.js";
import {
	type ResolvedSelection,
	resolveSelection,
} from "./report-selection.js";

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

/**
 * The render instant every age and velocity window is measured from: the
 * `SOURCE_DATE_EPOCH` env var (whole seconds since the epoch, the
 * reproducible-builds convention) when it holds one, else now. Pinning it makes a
 * report built from fixed history byte-identical on any day; the golden tests do.
 */
export function renderInstant(env: NodeJS.ProcessEnv = process.env): string {
	const epoch = env.SOURCE_DATE_EPOCH?.trim();
	if (epoch !== undefined && /^\d+$/.test(epoch)) {
		return new Date(Number(epoch) * 1000).toISOString();
	}
	return new Date().toISOString();
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
	text: string,
	historyPath: string,
	onWarning: (message: string) => void,
): Aggregation {
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
export function computeSystemScore(
	text: string,
	weights: Weights | undefined,
): SystemScore | undefined {
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
function computeConsumerArtifacts(records: HistoryRecord[]): {
	breakingCalendar: BreakingCalendar;
	changeFrequency: ChangeFrequency;
} {
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
function computeParityTrend(records: HistoryRecord[]): ParityTrendPoint[] {
	return buildParityTrend(records);
}

/**
 * Replay <stateDir>/history.jsonl into the three Figma/frame trend sections
 * (F6): library hotspots (F3), per-frame readiness (F4) and the handoff pass
 * rate (F4). Each key is present only when its engine found source lines.
 */
function computeFigmaTrends(
	records: HistoryRecord[],
	readinessThreshold: number,
): Pick<
	ReportData,
	"libraryHotspotsTrend" | "frameReadinessTrend" | "handoffPassRate"
> {
	const libraryHotspotsTrend = buildLibraryHotspotsTrend(records);
	const frameReadinessTrend = buildFrameReadinessTrend(
		records,
		readinessThreshold,
	);
	const handoffPassRate = buildHandoffPassRate(records, readinessThreshold);
	return {
		...(libraryHotspotsTrend !== undefined ? { libraryHotspotsTrend } : {}),
		...(frameReadinessTrend !== undefined ? { frameReadinessTrend } : {}),
		...(handoffPassRate !== undefined ? { handoffPassRate } : {}),
	};
}

/**
 * Replay <stateDir>/history.jsonl into the library-health-trend series (C6, M3.4)
 * via the shared `replayHistory` iterator + the pure `buildLibraryHealthTrend`
 * engine — the dated `library-health` lines folded into a hygiene-count series.
 * Empty when no dated library-health line exists (the caller only spreads a
 * NON-empty series into ReportData, so an absent library-health history keeps the
 * section in its empty state rather than the populated stub).
 */
export function computeLibraryHealthTrend(
	records: HistoryRecord[],
): LibraryHealthTrendPoint[] {
	return buildLibraryHealthTrend(records);
}

/** The `--velocity-window` grammar: a positive integer count, then `d` or `w`. */
const VELOCITY_WINDOW = /^(\d+)([dw])$/;

/**
 * Parse a `--velocity-window <N>d|<N>w` flag into a positive day count (C8),
 * mirroring `parseSince`'s relative-window grammar (`w` = 7 days). `undefined`
 * input → undefined (the caller falls back to config / the 30-day default); a
 * malformed value → a typed error translated to exit 2 at the edge.
 */
export function parseVelocityWindow(
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
export function computeScoreVelocity(
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
export function computeMigrationChecklist(
	records: HistoryRecord[],
	cap: number,
): MigrationChecklist {
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
export function computeAudienceChangelog(
	records: HistoryRecord[],
): AudienceChangelog {
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
function computeFrameImplementability(
	records: HistoryRecord[],
): FrameImplementability {
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
export function resolveOwnership(
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
/**
 * Re-fold the LATEST adoption-bearing lint line's `byDirectory` from a replayed
 * history into the `{dir, refs, literals}` buckets the ownership rollup maps onto
 * owners. Parallel last-wins on field presence (a plain lint line never clears a
 * prior adoption-bearing one — score.ts:333). Shared by the current-side (stateDir)
 * and the `--delta` base-side (committed text) ownership computations.
 */
export function byDirectoryFromRecords(
	records: ReturnType<typeof replayHistory>,
): DirectoryAdoption[] {
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
	return byDirectory;
}

export function computeOwnershipLeaderboard(
	records: HistoryRecord[],
	ownership: OwnershipMap | undefined,
): OwnershipRow[] {
	if (ownership === undefined) return [];
	return rollupByOwner(byDirectoryFromRecords(records), ownership);
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
function computeReleaseReadiness(records: HistoryRecord[]): ReleaseReadiness {
	const signals = extractReleaseSignals(records);
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
export function computeDataFreshness(
	records: HistoryRecord[],
	nowIso: string,
	thresholds: FreshnessThresholds | undefined,
): FreshnessRow[] {
	return buildFreshness(records, nowIso, thresholds);
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
	parityRows: ParityReport["rows"],
	readiness: Readiness | undefined,
	a11y: A11ySummary | undefined,
	aliases: ComponentAliases | undefined,
): ComponentHealthRow[] {
	return buildComponentHealth({
		parityRows,
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
	records: HistoryRecord[],
	systemScore: number | undefined,
): LatestScalars {
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
export function computeTargets(
	records: HistoryRecord[],
	targets: MetricTargets | undefined,
	systemScore: number | undefined,
): TargetVerdict[] {
	if (targets === undefined) return [];
	return evaluateTargets(latestTargetScalars(records, systemScore), targets);
}

/**
 * The dashboard's Parity section from the parity report (absent registry or
 * no rows → undefined, the renderer's empty state). buildParity /
 * toParitySection never throw on a malformed registry; they degrade.
 */
function paritySection(report: ParityReport | undefined): Parity | undefined {
	if (report === undefined) return undefined;
	const section = toParitySection(report);
	return section.rows.length > 0 ? section : undefined;
}

/**
 * Read + parse <stateDir>/registry.json ONCE per render. Absent → undefined
 * (empty states); unreadable / non-JSON → undefined with one stderr warning (a
 * corrupt registry never crashes the report).
 */
function loadRegistry(
	stateDir: string,
	onWarning: (message: string) => void,
): RegistryFile | undefined {
	const registryPath = join(stateDir, "registry.json");
	let text: string;
	try {
		text = readFileSync(registryPath, "utf8");
	} catch {
		return undefined;
	}
	try {
		return JSON.parse(text) as RegistryFile;
	} catch {
		onWarning(`warning: skipping unreadable registry ${registryPath}`);
		return undefined;
	}
}

/**
 * The executive layer (AN5, SPEC-exec-report §3): replay the SAME history +
 * registry into the AN1 consistency input and the AN2 debt input, then compose
 * the AN3 rollup over the already-computed score + import coverage. Each
 * section is returned only when present (absent-not-zero): consistency when
 * AN1 is ok, debt when a lint / library-health line exists, executive when it
 * carries ≥ 1 headline.
 */
function computeExecutiveLayer(
	registry: RegistryFile | undefined,
	records: HistoryRecord[],
	systemScore: SystemScore | undefined,
	importCoverage: ImportCoverage | undefined,
): Partial<Pick<ReportData, "consistency" | "debt" | "executive">> {
	const inputs = executiveInputs(records, registry);
	const outcome = buildConsistency(inputs.consistency);
	const debt = inputs.debt !== undefined ? buildDebt(inputs.debt) : undefined;
	const executive = buildExecutive({
		...(systemScore !== undefined ? { systemScore } : {}),
		...(importCoverage !== undefined ? { coverage: importCoverage } : {}),
		consistency: outcome,
		...(debt !== undefined ? { debt } : {}),
	});
	return {
		...(outcome.kind === "ok"
			? {
					consistency: {
						score: outcome.score,
						components: outcome.components,
					},
				}
			: {}),
		...(debt !== undefined ? { debt } : {}),
		...(Object.keys(executive).length > 0 ? { executive } : {}),
	};
}

/** Read <stateDir>/history.jsonl, or "" when the file is absent/unreadable. */
export function readHistoryText(stateDir: string): string {
	try {
		return readFileSync(join(stateDir, "history.jsonl"), "utf8");
	} catch {
		return "";
	}
}

/** The assembled report: the ReportData plus what the renderers also need. */
interface AssembledReport {
	data: ReportData;
	stateDir: string;
	generatedAt: string;
	velocityWindowDays: number;
	weightProfile: ReturnType<typeof resolveWeightProfile>;
}

/**
 * Assemble the full ReportData for `targetDir` under a resolved selection — the
 * ONE assembly every render target (html/md-free targets, exec, json) and the
 * `analytics` command share (SPEC-analytics-export §1.1). Extracted verbatim
 * from runReport; warnings go to stderr.
 */
/**
 * Assemble a past state instead of the current one (the dashboard timeline):
 * the history as it stood then, and the instant it is "as of". Warnings are
 * not repeated for past states — the current render already reported them.
 */
interface AsOfState {
	historyText: string;
	generatedAt: string;
}

export function assembleReportData(
	targetDir: string,
	selection: ResolvedSelection,
	velocityWindowFlagDays: number | undefined,
	asOf?: AsOfState,
): AssembledReport {
	const stateDir = join(targetDir, ".ds-bridge");
	const warn = (message: string): void => {
		if (asOf === undefined) process.stderr.write(`${message}\n`);
	};
	// ONE read + replay of history.jsonl feeds every section below.
	const historyText = asOf?.historyText ?? readHistoryText(stateDir);
	const records = replayHistory(historyText);
	const aggregation = aggregateHistory(
		historyText,
		join(stateDir, "history.jsonl"),
		warn,
	);
	// ONE read + parse of registry.json, ONE parity report, for parity, component
	// health and the executive layer.
	const registry = loadRegistry(stateDir, warn);
	const parityReport =
		registry !== undefined ? buildParity(registry) : undefined;
	const parity = paritySection(parityReport);
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
	const systemScore = computeSystemScore(historyText, weightProfile.weights);
	// Replay the SAME history into the two consumer VIEWS (B6) via the shared
	// `replayHistory` iterator — pure functions, no new parser. Always present
	// (their empty shapes degrade to the renderer's empty state).
	const consumer = computeConsumerArtifacts(records);
	// Parity-trend (C3, M2.1): the dated `parity` lines as a pass-% series. Only
	// spread in when NON-empty so an absent parity history keeps the section's
	// empty state (and the no-config golden byte-identical).
	const parityTrend = computeParityTrend(records);
	// Migration checklist (C7, M2.2): the latest impact line's per-call-site
	// sites[], capped. Only spread in when NON-empty so an impact line without
	// sites (or no impact line) keeps the section's empty state (golden-neutral).
	const migrationChecklist = computeMigrationChecklist(
		records,
		selection.migrationSitesCap,
	);
	// Audience changelog (C10, M2.3): the latest changelog line's recent[] folded
	// into designer/developer slices. Only spread in when NON-empty so a line
	// without sliceable entries (or no changelog line) keeps the section's empty
	// state (golden-neutral).
	const audienceChangelog = computeAudienceChangelog(records);
	// Frame implementability (C11, M2.4): the latest frame-impl line's on-system %
	// + gaps-by-reason. Only spread in when it measured requirements (total > 0) so
	// an absent frame-impl line keeps the section's empty state (golden-neutral).
	const frameImplementability = computeFrameImplementability(records);
	// Targets RAG (C1, M3.1): the configured metric_targets banded against the
	// latest measured scalars (incl. the composite system score). Only spread in
	// when NON-empty so an unconfigured project keeps the section's empty state
	// (and the no-config golden byte-identical).
	const targets = computeTargets(
		records,
		selection.metricTargets,
		systemScore?.current,
	);
	// Library-health trend (C6, M3.4): the dated `library-health` lines folded into
	// a hygiene-count series. Only spread in when NON-empty so an absent (or only
	// dateless) library-health history keeps the section's empty state.
	const libraryHealthTrend = computeLibraryHealthTrend(records);
	// Figma + per-frame trends (F6, SPEC-figma-trends §3): the stored top-N
	// lists as per-component series, and per-frame readiness + the handoff pass
	// rate against the CONFIGURED gate. Each is undefined without its source
	// lines, so a history without them keeps the empty states (golden-neutral).
	const figmaTrends = computeFigmaTrends(records, selection.readinessThreshold);

	// The single io-edge clock read — the renderer is otherwise pure.
	// Optional sections are only spread in when present so
	// `exactOptionalPropertyTypes` keeps an absent section a genuine "not
	// provided" rather than an explicit `undefined`.
	const generatedAt = asOf?.generatedAt ?? renderInstant();
	// Score velocity (C8, M3.5): the windowed delta of the composite over the
	// system-score trend, evaluated at `generatedAt` (injected → reproducible).
	// Window precedence: --velocity-window flag > score_velocity_window config > 30.
	// Only spread in when DEFINED (<2 trend points → undefined → empty state).
	const velocityWindowDays =
		velocityWindowFlagDays ?? selection.scoreVelocityWindow;
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
		records,
		generatedAt,
		selection.freshnessThresholds,
	);
	// Component health (C5, M3.3): the cross-engine join of registry parity ⋈
	// latest readiness/a11y (name-heuristic, exact via component_aliases). Only
	// spread in when NON-empty so a project with no joinable signals keeps the
	// section's empty state (and the no-config golden byte-identical).
	const componentHealth = computeComponentHealth(
		parityReport?.rows ?? [],
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
		records,
		resolveOwnership(targetDir, selection.ownership, selection.ownershipFile),
	);
	// Release readiness (C13, M3.7): the impact/drift/parity gates composed into a
	// go/no-go rollup over the latest persisted signals. Only spread in when it has
	// checks (the engine returns three for any history; an empty/absent history
	// still yields three insufficient-data checks → no-go), so any project with a
	// history populates the section (flipping it out of its empty state).
	const releaseReadiness = computeReleaseReadiness(records);
	// Executive layer (AN5, SPEC-exec-report §3): consistency (AN1), debt (AN2)
	// and the rollup (AN3), each spread in only when present (absent-not-zero).
	const executiveLayer = computeExecutiveLayer(
		registry,
		records,
		systemScore,
		aggregation.importCoverage,
	);
	const data: ReportData = {
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
		...(aggregation.impact !== undefined ? { impact: aggregation.impact } : {}),
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
		...executiveLayer,
		...figmaTrends,
	};
	return { data, stateDir, generatedAt, velocityWindowDays, weightProfile };
}

/**
 * The dashboard timeline's earlier states (html/site): one per earlier UTC day
 * with records, newest 11, each assembled from the history as it stood at the
 * end of that day and "as of" that instant. Empty when history covers < 2 days.
 */
export function assemblePastStates(
	targetDir: string,
	selection: ResolvedSelection,
	velocityWindowFlagDays: number | undefined,
): DashboardPastState[] {
	const text = readHistoryText(join(targetDir, ".ds-bridge"));
	return timelineDays(text).map(({ day, endOfDay }) => ({
		day,
		data: assembleReportData(targetDir, selection, velocityWindowFlagDays, {
			historyText: historyAsOf(text, endOfDay),
			generatedAt: endOfDay,
		}).data,
	}));
}

/**
 * The shared assembly for non-`report` callers (the `analytics` command, E5):
 * resolve the project's selection/config with no flags, then assemble the full
 * ReportData. A usage/config error is returned, never thrown or printed.
 */
export function loadReportData(
	targetDir: string,
): { kind: "ok"; data: ReportData } | { kind: "error"; message: string } {
	// No flags: the project config / default view decides.
	const selection = resolveSelection(targetDir, {});
	if ("kind" in selection) {
		return { kind: "error", message: selection.message };
	}
	return {
		kind: "ok",
		data: assembleReportData(targetDir, selection, undefined).data,
	};
}
