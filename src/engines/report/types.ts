// T3.2 — Typed data model for the self-contained HTML dashboard.
//
// `ReportData` is a pure value object assembled by the caller and handed to the
// renderer. The renderer NEVER reads the clock, the filesystem or the network:
// `generatedAt` is supplied verbatim so output is fully reproducible and
// testable. Every section is optional — an absent section is a first-class
// "empty state", not an error.

import type {
	DeprecatedUsageGroup,
	DetachedCandidate,
	LibraryHealthTotals,
	OverrideHotspot,
} from "../figma/library-health.js";

/** One day's drift counts, bucketed by change severity. */
export interface DriftTrendPoint {
	/** ISO date (e.g. "2026-06-05"); used as an x-axis category label. */
	date: string;
	breaking: number;
	additive: number;
	cosmetic: number;
}

/** Lint violations bucketed by match kind, plus the noisiest files. */
export interface LintSummary {
	byKind: {
		exact: number;
		near: number;
		offSystem: number;
	};
	topOffenders: {
		file: string;
		count: number;
	}[];
}

/** A single readiness-score deduction with a human-readable reason. */
export interface ReadinessDeduction {
	reason: string;
	points: number;
}

/** Machine-readability readiness for one Figma frame. */
export interface Readiness {
	/** 0–100; the renderer clamps before display. */
	score: number;
	frameName: string;
	deductions: ReadinessDeduction[];
}

/** Per-cell parity status between a code component and its Figma source. */
export type ParityStatus =
	| "ok"
	| "missing-in-code"
	| "missing-in-figma"
	| "prop-mismatch";

/** One component row in the parity matrix. */
export interface ParityRow {
	component: string;
	cells: { status: ParityStatus }[];
}

/** Component-vs-aspect parity matrix rendered as a heat grid. */
export interface Parity {
	columns: string[];
	rows: ParityRow[];
}

/** Contrast pass/fail tallies for one token mode (T7.22). */
export interface A11yModeSummary {
	mode: string;
	passed: number;
	failed: number;
}

/** Token-contrast audit summary across modes, from the latest a11y run. */
export interface A11ySummary {
	/** WCAG conformance level the run was evaluated against. */
	level: "AA" | "AAA";
	modes: A11yModeSummary[];
}

/** Library-change blast radius from the latest impact run (T7.22). */
export interface ImpactSummary {
	breaking: number;
	additive: number;
	cosmetic: number;
	/** Code usage sites touched by the changed components (0 = none/unknown). */
	touchedCallSites: number;
}

/** The weightable system-score components (mirrors score.ts ComponentKind). */
export type SystemScoreComponentKind =
	| "drift"
	| "lint"
	| "readiness"
	| "a11y"
	| "adoption"
	| "parity";

/** One present score component: its kind, 0–100 sub-score, configured weight. */
export interface SystemScoreComponent {
	kind: SystemScoreComponentKind;
	score: number;
	weight: number;
}

/** One trend point: a distinct dated state's composite score. */
export interface SystemScoreTrendPoint {
	date: string;
	score: number;
}

/**
 * The weighted 0–100 composite system score, replayed from history (S1). This
 * is the engine's ok-shape minus its `kind` discriminator — the value the
 * caller threads into {@link ReportData}.
 */
export interface SystemScore {
	/** The current weighted composite, 0–100, half-up rounded. */
	current: number;
	components: SystemScoreComponent[];
	trend: SystemScoreTrendPoint[];
}

/**
 * One adoption-trend point: a dated on-system percentage (B1). `pct` is the
 * css/scss-scoped ratio 100·refs/(refs+literals) from a dated adoption-bearing
 * lint line (SPEC-adoption §1 honest scope — css/scss only).
 */
export interface AdoptionTrendPoint {
	/** ISO date (YYYY-MM-DD); the x-axis category label. */
	date: string;
	/** On-system percentage, 0–100. */
	pct: number;
}

/**
 * Import-coverage summary: of every CODE component the registry knows, how many
 * the project actually imports (B1). Shape aligned with the A3a CoverageResult
 * so the assembly threads the engine output through verbatim. **Honest scope:**
 * mapUsage scans resolved `.tsx` imports only — the number is a floor.
 */
export interface ImportCoverage {
	/** CODE components with ≥1 resolved import site. */
	imported: number;
	/** Every CODE component in the registry. */
	total: number;
	/** Not-yet-imported names, alphabetical, capped at 20. */
	uncovered: string[];
	/** Full count of uncovered components, before the cap. */
	uncoveredTotal: number;
}

/** One leaderboard row: a directory's on-system refs vs off-system literals (B1). */
export interface LeaderboardRow {
	dir: string;
	refs: number;
	literals: number;
}

/**
 * Library-health hygiene signals from the latest `library-health` crawl (B5).
 * Mirrors the L1 engine's return shape verbatim (the engine types are imported,
 * not redeclared, to stay DRY) so the CLI threads `assessLibraryHealth`'s output
 * straight through. The renderer draws its bars from `totals`; the lists may be
 * empty when reconstructed from a counts-only history line (SPEC §3).
 */
export interface LibraryHealth {
	overrideHotspots: OverrideHotspot[];
	deprecatedUsage: DeprecatedUsageGroup[];
	detachedCandidates: DetachedCandidate[];
	totals: LibraryHealthTotals;
}

/**
 * One date-grouped breaking event (B6). A history line carrying a breaking
 * signal — token breakage (`tokens-check.stale > 0`) or library breakage
 * (`impact.breaking > 0`) — contributes one entry per signal; `source`
 * distinguishes them and `count` is the magnitude on that date.
 */
export interface BreakingCalendarEntry {
	/** ISO date (YYYY-MM-DD) the breaking event was recorded. */
	date: string;
	/** Which surface broke: built output vs source ("tokens") or Figma API ("figma"). */
	source: "tokens" | "figma";
	/** Magnitude of the breakage on this date (stale tokens / breaking changes). */
	count: number;
	/** Optional human-readable detail for the entry. */
	detail?: string;
}

/**
 * Date-grouped breaking events from history (B6): the consumer's "what do I
 * need to react to, and when," most-recent first. Empty → `{entries:[], total:0}`.
 */
export interface BreakingCalendar {
	entries: BreakingCalendarEntry[];
	/** Sum of every entry's count. */
	total: number;
}

/** One per-kind activity count for the change-frequency artifact (B6). */
export interface ChangeFrequencyBucket {
	/** The history record kind (drift, lint, handoff, a11y, impact, adoption, …). */
	kind: string;
	count: number;
}

/**
 * Per-kind event counts over the observed history window (B6): activity density
 * per surface, the consumer's "how actively is each surface churning." Zero-count
 * kinds are omitted. Empty → `{byKind:[]}`.
 */
export interface ChangeFrequency {
	byKind: ChangeFrequencyBucket[];
	/** Earliest dated record observed (ISO date), if any. */
	windowFirst?: string;
	/** Latest dated record observed (ISO date), if any. */
	windowLast?: string;
}

// ─── Persona-wave metric sections (C1–C13) ──────────────────────────────────
// Each is an optional ReportData section with a matching catalog artifact; the
// engines that populate them land in later milestones (M2/M3).

/** C1 — one target verdict: a measured scalar compared to a configured goal. */
export interface TargetVerdict {
	/** The metric key/label (e.g. "on-system", "drift", "parity"). */
	metric: string;
	/** Measured scalar, or undefined when the metric was never recorded. */
	measured: number | undefined;
	target: number;
	op: ">=" | "<=" | "==";
	band: "green" | "amber" | "red" | "unknown";
}

/** C3 — one parity-trend point: component parity pass-% on a dated state. */
export interface ParityTrendPoint {
	date: string;
	/** 0–100 parity pass percentage. */
	pct: number;
}

/** C5 — one component's joined health rollup (worst-first in the section). */
export interface ComponentHealthRow {
	component: string;
	/** 0–100 composite health for this component. */
	healthScore: number;
	/** Human-readable issues contributing to the score. */
	issues: string[];
}

/** C6 — one library-health-trend point: hygiene counts on a dated state. */
export interface LibraryHealthTrendPoint {
	date: string;
	overrides: number;
	deprecated: number;
	detached: number;
}

/** C7 — one migration call site: where a breaking change lands + the fix. */
export interface MigrationSite {
	file: string;
	line: number;
	/** The component or token that changed. */
	subject: string;
	from: string;
	to: string;
}

/** C7 — per-call-site migration checklist from the latest impact run. */
export interface MigrationChecklist {
	sites: MigrationSite[];
	/** True when more sites existed than the configured cap. */
	truncated: boolean;
}

/** C8 — windowed velocity of the composite score (motion, not snapshot). */
export interface ScoreVelocity {
	/** Signed delta over the window (now − window-start). */
	delta: number;
	windowDays: number;
	direction: "up" | "down" | "flat";
	/** Consecutive down-moves ending at the latest point. */
	regressionStreak: number;
}

/** C9 — one per-owner accountability row (ownership-mapped adoption). */
export interface OwnershipRow {
	owner: string;
	refs: number;
	literals: number;
	/** On-system percentage, 0–100. */
	pct: number;
}

/** C10 — one audience slice of the changelog (designers | developers). */
export interface AudienceChangelogSlice {
	audience: "designers" | "developers";
	breaking: number;
	additive: number;
	cosmetic: number;
	/** Most-recent entries (capped), breaking-first. */
	recent: string[];
}

/** C10 — audience-segmented changelog panel from the latest changelog line. */
export interface AudienceChangelog {
	slices: AudienceChangelogSlice[];
}

/** C11 — frame implementability: how on-system a Figma frame is. */
export interface FrameImplementability {
	/** 0–100 share of requirements that resolve to the system. */
	pct: number;
	resolved: number;
	total: number;
	/** Gap counts by reason (e.g. no-registry-match, near-token-only). */
	gaps: { reason: string; count: number }[];
}

/** C13 — one pre-publish release-readiness check. */
export interface ReleaseReadinessCheck {
	name: string;
	pass: boolean;
	detail?: string;
}

/** C13 — pre-publish go/no-go rollup composed from existing engines. */
export interface ReleaseReadiness {
	go: boolean;
	checks: ReleaseReadinessCheck[];
}

/** C4 — one check-kind's measurement freshness (trust gauge). */
export interface FreshnessRow {
	/** The history record kind (drift, lint, handoff, a11y, impact, …). */
	kind: string;
	/** ISO date of the most recent run, or undefined when never run. */
	lastRun?: string;
	/** Whole days since the last run, or undefined when never run. */
	ageDays?: number;
	band: "green" | "amber" | "red" | "unknown";
}

/**
 * The complete, self-contained input to {@link renderDashboard}. Sections are
 * independently optional so partial reports render gracefully.
 */
export interface ReportData {
	/** ISO timestamp supplied by the caller; rendered verbatim in the header. */
	generatedAt: string;
	project: string;
	systemScore?: SystemScore;
	driftTrend?: DriftTrendPoint[];
	lintSummary?: LintSummary;
	readiness?: Readiness;
	parity?: Parity;
	a11y?: A11ySummary;
	impact?: ImpactSummary;
	/** On-system % over time, from dated adoption-bearing lint lines (B1). */
	adoptionTrend?: AdoptionTrendPoint[];
	/** Registry import coverage, from the latest `adoption` history line (B1). */
	importCoverage?: ImportCoverage;
	/** On-system % by directory, worst-first, from the latest lint line (B1). */
	leaderboard?: LeaderboardRow[];
	/** Library hygiene signals from the latest `library-health` crawl (B5). */
	libraryHealth?: LibraryHealth;
	/** Date-grouped breaking events replayed from history (B6). */
	breakingCalendar?: BreakingCalendar;
	/** Per-kind activity density over the history window (B6). */
	changeFrequency?: ChangeFrequency;
	/** C1 — RAG verdicts for configured metric targets. */
	targets?: TargetVerdict[];
	/** C3 — component parity pass-% over time. */
	parityTrend?: ParityTrendPoint[];
	/** C5 — per-component health rollup, worst-first. */
	componentHealth?: ComponentHealthRow[];
	/** C6 — library hygiene counts over time. */
	libraryHealthTrend?: LibraryHealthTrendPoint[];
	/** C7 — per-call-site migration checklist from the latest impact run. */
	migrationChecklist?: MigrationChecklist;
	/** C8 — windowed velocity of the composite score. */
	scoreVelocity?: ScoreVelocity;
	/** C9 — per-owner accountability breakdown. */
	ownershipLeaderboard?: OwnershipRow[];
	/** C10 — audience-segmented changelog panel. */
	audienceChangelog?: AudienceChangelog;
	/** C11 — frame implementability from the latest frame-impl run. */
	frameImplementability?: FrameImplementability;
	/** C13 — pre-publish release-readiness rollup. */
	releaseReadiness?: ReleaseReadiness;
	/** C4 — measurement freshness per check-kind. */
	dataFreshness?: FreshnessRow[];
}
