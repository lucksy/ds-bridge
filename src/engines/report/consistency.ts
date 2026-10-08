// AN1 — consistency engine. PURE: no fs/network/process; deterministic; NEVER
// throws. A weighted 0–100 blend of three on-system sub-signals answering "how
// on-system is this product?" — the vision doc's `Consistency: 91%`
// (SPEC-analytics §2). Structurally a sibling of score.ts: present sub-signals
// only, weights renormalized, one half-up rounding at the end, absent-not-zero.
//
// The three sub-signals (each 0–100), from already-extracted inputs:
//   - tokens:     100·refs/(refs+literals)            — a true on-system ratio
//   - components: 100·matched/(matched+custom)        — a true match ratio
//   - overrides:  max(0, 100 − 8·hotspots), per 100 placed instances when more
//                 were checked                       — a DOCUMENTED-OPINION penalty
// `library-health` carries override COUNTS without a denominator, so the override
// sub-signal is a documented opinion, not a ratio — the same honesty caveat
// score.ts states for drift/lint. A sub-signal whose input is absent OR whose
// denominator is zero is ABSENT (never a misleading 0); zero present → no-data.

/** The weightable consistency sub-signals, in canonical (render) order. */
export type ConsistencySubKind = "tokens" | "components" | "overrides";

/** One present sub-signal: its kind, its 0–100 score (display-rounded), its weight. */
export interface ConsistencySub {
	kind: ConsistencySubKind;
	score: number;
	weight: number;
}

/** The sub-signal weights table — one positive number per sub-signal. */
export interface ConsistencyWeights {
	tokens: number;
	components: number;
	overrides: number;
}

/** The documented default weights (SPEC-analytics §2): two true ratios dominate. */
export const DEFAULT_CONSISTENCY_WEIGHTS: ConsistencyWeights = {
	tokens: 40,
	components: 40,
	overrides: 20,
};

/** The already-extracted inputs (any subset present). All optional. */
export interface ConsistencyInput {
	/** On-system token usage: `var(--…)` refs vs off-system literals (css/scss). */
	tokens?: { refs: number; literals: number };
	/** Component match: registry matches (`matched`) vs unmatched-code (`custom`). */
	components?: { matched: number; custom: number };
	/** Library override hotspots count (documented-opinion penalty input). */
	/** `instances`: placed instances checked (1.20.1+); scales the penalty. */
	overrides?: { hotspots: number; instances?: number };
	/** Optional weights override (merged onto defaults is not needed — full table). */
	weights?: ConsistencyWeights;
}

/** The engine outcome: an ok composite, or a typed no-data signal. */
export type ConsistencyOutcome =
	| { kind: "ok"; score: number; components: ConsistencySub[] }
	| { kind: "no-data" };

/** Penalty per override hotspot for the documented-opinion sub-signal. */
const OVERRIDE_PENALTY_PER_HOTSPOT = 8;

/** Sub-signals in canonical order (matches DEFAULT_CONSISTENCY_WEIGHTS keys). */
const SUB_ORDER: readonly ConsistencySubKind[] = [
	"tokens",
	"components",
	"overrides",
];

/**
 * Coerce an unknown to a finite number, else 0 — mirrors score.ts `asNumber` so
 * malformed inputs degrade identically across the report engines.
 */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Clamp to the 0–100 display range. */
function clamp01(value: number): number {
	return Math.min(100, Math.max(0, value));
}

/** Half-up rounding to an integer (scores are non-negative → Math.round is half-up). */
function roundHalfUp(value: number): number {
	return Math.round(value);
}

/** A true on-system ratio, or undefined when the denominator is zero (absent-not-zero). */
function ratioScore(
	numerator: number,
	denominator: number,
): number | undefined {
	if (denominator <= 0) return undefined;
	return clamp01((100 * numerator) / denominator);
}

/** Compute one sub-signal's raw 0–100 score, or undefined when absent. */
function subScore(
	kind: ConsistencySubKind,
	input: ConsistencyInput,
): number | undefined {
	switch (kind) {
		case "tokens": {
			if (input.tokens === undefined) return undefined;
			const refs = asNumber(input.tokens.refs);
			const literals = asNumber(input.tokens.literals);
			return ratioScore(refs, refs + literals);
		}
		case "components": {
			if (input.components === undefined) return undefined;
			const matched = asNumber(input.components.matched);
			const custom = asNumber(input.components.custom);
			return ratioScore(matched, matched + custom);
		}
		case "overrides": {
			if (input.overrides === undefined) return undefined;
			const hotspots = asNumber(input.overrides.hotspots);
			// Per 100 placed instances once more than 100 were checked: 35
			// hotspots in a whole library are not 35 in one screen.
			const instances = asNumber(input.overrides.instances);
			const scale = instances > 100 ? 100 / instances : 1;
			return clamp01(100 - OVERRIDE_PENALTY_PER_HOTSPOT * hotspots * scale);
		}
	}
}

/**
 * Blend the present sub-signals into a 0–100 consistency score. Weighted mean
 * over PRESENT sub-signals only, weights renormalized; the composite is computed
 * from RAW sub-scores, then each component's score is half-up rounded for
 * DISPLAY. Zero present sub-signals → `{ kind: "no-data" }`. Pure; never throws.
 */
export function buildConsistency(input: ConsistencyInput): ConsistencyOutcome {
	const weights = input.weights ?? DEFAULT_CONSISTENCY_WEIGHTS;

	const present: { kind: ConsistencySubKind; score: number; weight: number }[] =
		[];
	for (const kind of SUB_ORDER) {
		const score = subScore(kind, input);
		if (score === undefined) continue;
		present.push({ kind, score, weight: weights[kind] });
	}

	if (present.length === 0) return { kind: "no-data" };

	const totalWeight = present.reduce((sum, c) => sum + c.weight, 0);
	const weightedSum = present.reduce((sum, c) => sum + c.score * c.weight, 0);
	const score = roundHalfUp(weightedSum / totalWeight);

	const components: ConsistencySub[] = present.map((c) => ({
		kind: c.kind,
		score: roundHalfUp(c.score),
		weight: c.weight,
	}));

	return { kind: "ok", score, components };
}
