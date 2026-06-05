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

/**
 * The complete, self-contained input to {@link renderDashboard}. Sections are
 * independently optional so partial reports render gracefully.
 */
export interface ReportData {
	/** ISO timestamp supplied by the caller; rendered verbatim in the header. */
	generatedAt: string;
	project: string;
	driftTrend?: DriftTrendPoint[];
	lintSummary?: LintSummary;
	readiness?: Readiness;
	parity?: Parity;
}
