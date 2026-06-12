// AN3 — executive rollup engine. PURE: no fs/network/process; deterministic;
// NEVER throws. The ONLY place the three leadership headlines live together — it
// COMPOSES the already-computed engine outputs (S1 systemScore · B1 import
// coverage · AN1 consistency · AN2 debt) into one rollup; it MEASURES nothing
// new (SPEC-analytics §4). Each headline is independently optional: an absent /
// no-data / zero-denominator source simply OMITS its headline (absent-not-zero),
// never a misleading 0. The single derived number — adoption % — is half-up
// rounded once, like its sibling engines; the rest are pass-throughs of values
// their source engines already rounded.

import type { ConsistencyOutcome } from "./consistency.js";
import type { DebtRollup } from "./debt.js";
import type {
	ImportCoverage,
	SystemScore,
	SystemScoreTrendPoint,
} from "./types.js";

/** The already-computed engine outputs the rollup composes (any subset present). */
export interface ExecutiveInput {
	/** S1 system-score ok-shape: supplies `health` (current) + `trend`. */
	systemScore?: SystemScore;
	/** B1 import coverage: supplies `adoption` = 100·imported/total. */
	coverage?: ImportCoverage;
	/** AN1 consistency outcome: supplies `consistency` (its score, when ok). */
	consistency?: ConsistencyOutcome;
	/** AN2 debt rollup: supplies `debt` (its pct; 0 is a real no-debt headline). */
	debt?: DebtRollup;
}

/**
 * The leadership rollup: the three vision headlines (health · consistency ·
 * debt) plus adoption and the score trend. Every field is optional — present
 * only when its source signal is present (and, for the adoption ratio, has a
 * usable denominator). There is no all-or-nothing no-data state: the rollup is
 * an ASSEMBLER, so an empty input yields an empty rollup.
 */
export interface ExecutiveRollup {
	/** System health = systemScore.current (0–100). */
	health?: number;
	/** Adoption = 100·imported/total (0–100), absent when total ≤ 0. */
	adoption?: number;
	/** Consistency score (0–100) from an ok AN1 outcome. */
	consistency?: number;
	/** Design-debt percentage (0–100) from the AN2 rollup (0 is a real headline). */
	debt?: number;
	/** The system-score trend, threaded through verbatim. */
	trend?: SystemScoreTrendPoint[];
}

/** Coerce an unknown to a finite number, else 0 (mirrors the sibling engines). */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Clamp to the 0–100 display range. */
function clamp01(value: number): number {
	return Math.min(100, Math.max(0, value));
}

/** Half-up rounding to an integer (non-negative → Math.round is half-up). */
function roundHalfUp(value: number): number {
	return Math.round(value);
}

/**
 * The import-coverage adoption %: 100·imported/total, clamped + half-up rounded,
 * or undefined when coverage is absent OR the denominator is ≤ 0 (absent-not-
 * zero — an empty registry has no adoption number, not a 0% one).
 */
function adoptionPct(coverage: ImportCoverage | undefined): number | undefined {
	if (coverage === undefined) return undefined;
	const total = asNumber(coverage.total);
	if (total <= 0) return undefined;
	const imported = asNumber(coverage.imported);
	return roundHalfUp(clamp01((100 * imported) / total));
}

/**
 * Assemble the executive rollup. Pure; never throws. Each headline is composed
 * independently from its source engine output and omitted when that source is
 * absent (or no-data / zero-denominator); the keys are assigned only when
 * present (`exactOptionalPropertyTypes`), so an empty input deep-equals `{}`.
 */
export function buildExecutive(input: ExecutiveInput): ExecutiveRollup {
	const rollup: ExecutiveRollup = {};

	if (input.systemScore !== undefined) {
		rollup.health = asNumber(input.systemScore.current);
		rollup.trend = Array.isArray(input.systemScore.trend)
			? input.systemScore.trend
			: [];
	}

	const adoption = adoptionPct(input.coverage);
	if (adoption !== undefined) {
		rollup.adoption = adoption;
	}

	if (input.consistency !== undefined && input.consistency.kind === "ok") {
		rollup.consistency = asNumber(input.consistency.score);
	}

	if (input.debt !== undefined) {
		rollup.debt = asNumber(input.debt.pct);
	}

	return rollup;
}
