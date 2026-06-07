// T3.2 — Typed data model for the self-contained HTML dashboard.
//
// `ReportData` is a pure value object assembled by the caller and handed to the
// renderer. The renderer NEVER reads the clock, the filesystem or the network:
// `generatedAt` is supplied verbatim so output is fully reproducible and
// testable. Every section is optional — an absent section is a first-class
// "empty state", not an error.

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

/** The five weightable system-score components (mirrors score.ts ComponentKind). */
export type SystemScoreComponentKind =
	| "drift"
	| "lint"
	| "readiness"
	| "a11y"
	| "adoption";

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
}
