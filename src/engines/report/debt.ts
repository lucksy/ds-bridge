// AN2 — design-debt rollup engine. PURE: no fs/network/process; deterministic;
// NEVER throws (malformed entries are skipped, not fatal). Unifies the four
// scattered debt signals into ONE itemized model + a normalized 0–100 debt % +
// DIRECTED recommendations — the vision doc's `Debt: 18%` headline and §10
// "LegacyButton found → Replace with DS Button" (SPEC-analytics §3).
//
// The four signals, each → debt items with a documented-opinion weight:
//   - deprecated (library-health.deprecatedUsage): magnitude = usage count,  w=8
//   - detached   (library-health.detachedCandidates, HEURISTIC):  1 each,    w=5
//   - off-system (lint byKind.offSystem): one aggregate item, magnitude=count, w=2
//   - duplicate  (duplicate-cluster engine, AN9): magnitude = implementations−1, w=6
//
// debt % = min(100, round(Σ weight · magnitude)) — a documented-opinion
// saturation, clamped at 100, in the same penalty style score.ts uses for
// drift/lint (counts without a denominator). Empty input → a REAL no-debt state
// `{pct:0, level:"low", items:[]}` (NOT no-data — zero debt is meaningful).

import type {
	DeprecatedUsageGroup,
	DetachedCandidate,
} from "../figma/library-health.js";

/** The debt-signal kinds. */
export type DebtKind = "deprecated" | "detached" | "off-system" | "duplicate";

/** Banded debt severity (cutoffs in SPEC-analytics §3). */
export type DebtLevel = "low" | "medium" | "high";

/**
 * One near-duplicate cluster from the AN9 registry post-pass: a logical
 * component implemented N times in code. `implementations` ≥ 2 to be a duplicate.
 */
export interface DuplicateCluster {
	name: string;
	implementations: number;
}

/** One debt item: a directed, evidence-backed unit of design debt. */
export interface DebtItem {
	kind: DebtKind;
	/** The component name (or "off-system values" for the aggregate lint item). */
	subject: string;
	/** Human-facing magnitude the recommendation references. */
	count: number;
	/** The documented-opinion weight for this kind. */
	weight: number;
	/** A directed, actionable recommendation. */
	recommendation: string;
}

/** The already-extracted inputs (any subset present). All optional. */
export interface DebtInput {
	deprecatedUsage?: DeprecatedUsageGroup[];
	detachedCandidates?: DetachedCandidate[];
	/** Off-system literal count from the latest lint line (byKind.offSystem). */
	offSystem?: number;
	duplicates?: DuplicateCluster[];
	/**
	 * Aggregate fallback (SPEC-exec-report §3): a counts-only `library-health`
	 * line's deprecated-usage total. Used ONLY when `deprecatedUsage` yields no
	 * items — the itemized list always wins (no double count).
	 */
	deprecatedCount?: number;
	/** Aggregate fallback: detached-candidate total, used only without a list. */
	detachedCount?: number;
}

/** The rollup: a normalized debt %, a banded level, and the itemized list. */
export interface DebtRollup {
	/** 0–100 normalized debt, min(100, round(Σ weight·magnitude)). */
	pct: number;
	level: DebtLevel;
	/** Items, worst-first (weight·magnitude desc, ties by subject asc). */
	items: DebtItem[];
}

const WEIGHT: Record<DebtKind, number> = {
	deprecated: 8,
	detached: 5,
	"off-system": 2,
	duplicate: 6,
};

/** Level band cutoffs: <25 low, 25–59 medium, ≥60 high. */
const MEDIUM_AT = 25;
const HIGH_AT = 60;

/** Coerce an unknown to a finite number, else 0 (mirrors score.ts asNumber). */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** A non-empty string, or undefined. */
function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

/** Band a debt index (0–100) into its severity level (E8 — shared by labels). */
export function debtLevel(pct: number): DebtLevel {
	return bandLevel(pct);
}

/** Band a debt % into its severity level. */
function bandLevel(pct: number): DebtLevel {
	if (pct >= HIGH_AT) return "high";
	if (pct >= MEDIUM_AT) return "medium";
	return "low";
}

/**
 * Build the design-debt rollup. See the module header for the signal→item map
 * and the debt-% formula. Pure; never throws; items worst-first. Each item
 * carries its own debt magnitude internally for both the % sum and the sort;
 * `count` is the human-facing magnitude the recommendation names.
 */
export function buildDebt(input: DebtInput): DebtRollup {
	// Internal: pair each item with its debt magnitude (which can differ from the
	// display `count`, e.g. a duplicate cluster of 4 contributes magnitude 3).
	const rows: { item: DebtItem; magnitude: number }[] = [];

	// ── Deprecated usage (one item per group) ──
	for (const group of input.deprecatedUsage ?? []) {
		if (group === null || typeof group !== "object") continue;
		const subject = nonEmptyString(group.componentName);
		if (subject === undefined) continue;
		const count = asNumber(group.count);
		rows.push({
			magnitude: count,
			item: {
				kind: "deprecated",
				subject,
				count,
				weight: WEIGHT.deprecated,
				recommendation: `Replace deprecated "${subject}" with its supported DS component`,
			},
		});
	}

	// ── Deprecated aggregate fallback (counts-only library-health line) ──
	const deprecatedCount = asNumber(input.deprecatedCount);
	if (deprecatedCount > 0 && !rows.some((r) => r.item.kind === "deprecated")) {
		rows.push({
			magnitude: deprecatedCount,
			item: {
				kind: "deprecated",
				subject: "deprecated components",
				count: deprecatedCount,
				weight: WEIGHT.deprecated,
				recommendation: `Replace ${deprecatedCount} ${deprecatedCount === 1 ? "usage" : "usages"} of deprecated components (run ds-bridge library-health for the list)`,
			},
		});
	}

	// ── Detached candidates (one item each, HEURISTIC) ──
	for (const candidate of input.detachedCandidates ?? []) {
		if (candidate === null || typeof candidate !== "object") continue;
		const subject = nonEmptyString(candidate.name);
		if (subject === undefined) continue;
		rows.push({
			magnitude: 1,
			item: {
				kind: "detached",
				subject,
				count: 1,
				weight: WEIGHT.detached,
				recommendation: `Re-attach detached "${subject}" to its DS component (heuristic — verify)`,
			},
		});
	}

	// ── Detached aggregate fallback (counts-only library-health line) ──
	const detachedCount = asNumber(input.detachedCount);
	if (detachedCount > 0 && !rows.some((r) => r.item.kind === "detached")) {
		rows.push({
			magnitude: detachedCount,
			item: {
				kind: "detached",
				subject: "detached instances",
				count: detachedCount,
				weight: WEIGHT.detached,
				recommendation: `Re-attach ${detachedCount} detached ${detachedCount === 1 ? "instance to its DS component" : "instances to their DS components"} (heuristic — verify)`,
			},
		});
	}

	// ── Off-system literals (one aggregate item) ──
	const offSystem = asNumber(input.offSystem);
	if (offSystem > 0) {
		rows.push({
			magnitude: offSystem,
			item: {
				kind: "off-system",
				subject: "off-system values",
				count: offSystem,
				weight: WEIGHT["off-system"],
				recommendation: `Snap ${offSystem} off-system ${offSystem === 1 ? "value" : "values"} to an existing token, or add the missing ${offSystem === 1 ? "token" : "tokens"} (run ds-bridge lint to list them)`,
			},
		});
	}

	// ── Duplicate clusters (one item per cluster with ≥2 implementations) ──
	for (const cluster of input.duplicates ?? []) {
		if (cluster === null || typeof cluster !== "object") continue;
		const subject = nonEmptyString(cluster.name);
		if (subject === undefined) continue;
		const implementations = asNumber(cluster.implementations);
		if (implementations < 2) continue; // a single implementation is not a duplicate
		rows.push({
			magnitude: implementations - 1,
			item: {
				kind: "duplicate",
				subject,
				count: implementations,
				weight: WEIGHT.duplicate,
				recommendation: `Merge ${implementations} implementations of "${subject}" into one DS component`,
			},
		});
	}

	// Debt %: documented-opinion saturation, clamped at 100.
	const raw = rows.reduce((sum, r) => sum + r.item.weight * r.magnitude, 0);
	const pct = Math.min(100, Math.round(raw));

	// Worst-first: weight·magnitude desc, ties broken by subject ascending.
	const items = rows
		.sort((a, b) => {
			const wa = a.item.weight * a.magnitude;
			const wb = b.item.weight * b.magnitude;
			if (wa !== wb) return wb - wa;
			return a.item.subject < b.item.subject
				? -1
				: a.item.subject > b.item.subject
					? 1
					: 0;
		})
		.map((r) => r.item);

	return { pct, level: bandLevel(pct), items };
}
