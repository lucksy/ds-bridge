// S1 — System-score engine. Pure: a raw `history.jsonl` text string in, a
// weighted 0–100 composite outcome out (SPEC-score §2). No fs/network/process —
// callers read the file and inject the text.
//
// Parsing tolerance mirrors `aggregateHistory` (src/cli-commands/report.ts)
// EXACTLY — but score.ts owns its parse: per-line `JSON.parse` with skip-on-
// corrupt, unknown `kind` skipped silently, last-record-of-each-kind wins, and
// `asNumber` coercion of count fields. We re-parse rather than reuse
// `aggregateHistory` because its output is lossy (fields renamed into drift
// buckets, timestamps dropped) and reverse-mapping would be fragile.
// H2: the per-line parse now runs through the shared `replayHistory` iterator
// (identical tolerance); v1 and v2-enveloped lines score identically.
import { frameAverager } from "./frame-average.js";
import { replayHistory } from "./history-lines.js";

/** The weightable sub-score components (adoption joined in A4; parity in C3). */
export type ComponentKind =
	| "drift"
	| "lint"
	| "readiness"
	| "a11y"
	| "adoption"
	| "parity";

/** The composite's weights table — one positive finite number per component. */
export interface Weights {
	drift: number;
	lint: number;
	readiness: number;
	a11y: number;
	adoption: number;
	parity: number;
}

/**
 * The documented default weights (SPEC-adoption §3 rebalance + C3 parity). The
 * existing five raw weights are UNCHANGED — parity joins additively (C3, M2.1).
 * Because the composite renormalizes over PRESENT components only, a history with
 * no `parity` line scores byte-identically to before parity existed (the golden-
 * neutrality constraint): the parity weight only participates when a parity line
 * is present. Tunable via the existing `score_weights`.
 */
export const DEFAULT_WEIGHTS: Weights = {
	drift: 25,
	lint: 25,
	readiness: 15,
	a11y: 15,
	adoption: 20,
	parity: 20,
};

/** Validated weights, or a typed configuration error (no throws on bad input). */
export type WeightsOutcome =
	| { kind: "ok"; weights: Weights }
	| { kind: "unknown-key"; key: string }
	| { kind: "non-positive"; key: ComponentKind }
	| { kind: "non-finite"; key: ComponentKind };

/**
 * Which layer of the C2 weight-precedence chain produced the effective table:
 * - `view`    — a per-view override matched the active view name (a named profile)
 * - `project` — the global `score_weights` (no matching by-view override)
 * - `default` — neither configured; {@link DEFAULT_WEIGHTS} verbatim
 */
export type WeightProfileSource = "view" | "project" | "default";

/**
 * The resolved effective weights for a render PLUS the profile metadata the
 * dashboard captions. `name` is set only when `source === "view"` (the active
 * view name); `project`/`default` carry no name (the caption stays silent).
 */
export interface WeightProfile {
	weights: Weights;
	source: WeightProfileSource;
	name?: string;
}

/**
 * Resolve the effective system-score weights for a render (C2), render-scoped —
 * NEVER written back to global config. Precedence (highest first):
 *   1. `scoreWeightsByView[viewName]` when `viewName` is set AND that key exists
 *      → source `view`, named with `viewName`
 *   2. the global `scoreWeights` (already merged onto defaults) → source `project`
 *   3. {@link DEFAULT_WEIGHTS} → source `default`
 *
 * Each by-view/global table has ALREADY been merged onto the defaults by config's
 * `validateWeights`, so this is pure selection — no further merge. A custom
 * artifact list (no `viewName`) can never resolve a by-view profile.
 */
export function resolveWeightProfile(
	viewName: string | undefined,
	scoreWeights: Weights | undefined,
	scoreWeightsByView: Record<string, Weights> | undefined,
): WeightProfile {
	if (viewName !== undefined && scoreWeightsByView !== undefined) {
		const byView = scoreWeightsByView[viewName];
		if (byView !== undefined) {
			return { weights: byView, source: "view", name: viewName };
		}
	}
	if (scoreWeights !== undefined) {
		return { weights: scoreWeights, source: "project" };
	}
	return { weights: { ...DEFAULT_WEIGHTS }, source: "default" };
}

/** One present component: its kind, its 0–100 sub-score, its configured weight. */
export interface ScoreComponent {
	kind: ComponentKind;
	score: number;
	weight: number;
}

/** One trend point: a distinct dated state's composite score. */
export interface TrendPoint {
	date: string;
	score: number;
}

/** The score engine's outcome: an ok composite, or a typed no-data signal. */
export type ScoreOutcome =
	| {
			kind: "ok";
			current: number;
			components: ScoreComponent[];
			trend: TrendPoint[];
	  }
	| { kind: "no-data" };

/** The component kinds, in canonical (catalog) order. */
const COMPONENT_ORDER: readonly ComponentKind[] = [
	"drift",
	"lint",
	"readiness",
	"a11y",
	"adoption",
	"parity",
];

/**
 * Coerce an unknown to a finite number, else 0 — mirrors `aggregateHistory`'s
 * `asNumber` so the score and the rendered aggregates agree on tolerance.
 */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Clamp to the 0–100 display range. */
function clamp01(value: number): number {
	return Math.min(100, Math.max(0, value));
}

/** Half-up rounding to an integer (scores are non-negative, so `Math.round` is half-up). */
function roundHalfUp(value: number): number {
	return Math.round(value);
}

/**
 * Validate + merge a partial weights override onto the defaults. Unknown keys,
 * non-positive values, and non-finite (incl. non-number) values are typed
 * errors (existing config-error style). `undefined`/`{}` → defaults verbatim.
 */
export function validateWeights(raw: unknown): WeightsOutcome {
	if (raw === undefined || raw === null) {
		return { kind: "ok", weights: { ...DEFAULT_WEIGHTS } };
	}
	if (typeof raw !== "object") {
		// Not an object → no valid keys to merge; treat as defaults.
		return { kind: "ok", weights: { ...DEFAULT_WEIGHTS } };
	}

	const obj = raw as Record<string, unknown>;
	const weights: Weights = { ...DEFAULT_WEIGHTS };

	for (const key of Object.keys(obj)) {
		if (!COMPONENT_ORDER.includes(key as ComponentKind)) {
			return { kind: "unknown-key", key };
		}
		const typedKey = key as ComponentKind;
		const value = obj[key];
		if (typeof value !== "number" || !Number.isFinite(value)) {
			return { kind: "non-finite", key: typedKey };
		}
		if (value <= 0) {
			return { kind: "non-positive", key: typedKey };
		}
		weights[typedKey] = value;
	}

	return { kind: "ok", weights };
}

/**
 * Per-item penalties count per 100 measured values: a system measured on more
 * than 100 values (tokens compared, style values scanned) has its penalty
 * scaled down by size, so 12 drift entries among 678 tokens are not scored like
 * 12 among 20. At or under 100 values the penalty applies as is.
 */
function perHundred(penalty: number, measured: number): number {
	return measured > 100 ? (penalty * 100) / measured : penalty;
}

/**
 * Drift sub-score: 100 − 25·stale − 10·missing − 5·orphan, per 100 compared
 * tokens when the in-sync count is recorded (1.20.1+), clamped at 0.
 */
function driftScore(r: Record<string, unknown>): number {
	const stale = asNumber(r.stale);
	const missing = asNumber(r.missing);
	const orphan = asNumber(r.orphan);
	const penalty = 25 * stale + 10 * missing + 5 * orphan;
	const measured =
		typeof r.inSyncCount === "number" && Number.isFinite(r.inSyncCount)
			? r.inSyncCount + stale + missing + orphan
			: 0;
	return Math.max(0, 100 - perHundred(penalty, measured));
}

/**
 * Lint sub-score: 100 − 10·offSystem − 5·near − 2·exact, per 100 style values
 * measured (token references + literals, from the line's adoption block),
 * clamped at 0.
 */
function lintScore(r: Record<string, unknown>): number {
	const byKind =
		typeof r.byKind === "object" && r.byKind !== null
			? (r.byKind as Record<string, unknown>)
			: {};
	const penalty =
		10 * asNumber(byKind.offSystem) +
		5 * asNumber(byKind.near) +
		2 * asNumber(byKind.exact);
	const adoption =
		typeof r.adoption === "object" && r.adoption !== null
			? (r.adoption as Record<string, unknown>)
			: undefined;
	const measured =
		adoption === undefined
			? 0
			: asNumber(adoption.refs) + asNumber(adoption.literals);
	return Math.max(0, 100 - perHundred(penalty, measured));
}

/** Readiness sub-score: the recorded score verbatim, clamped to 0–100. */
function readinessScore(r: Record<string, unknown>): number {
	return clamp01(asNumber(r.score));
}

/**
 * a11y sub-score: 100 · Σpassed / (Σpassed + Σfailed) over ALL modes.
 * No pass/fail pairs (no modes, or every total zero) → `undefined`: the
 * component is absent, never a misleading 0 (SPEC-score §2).
 */
function a11yScore(r: Record<string, unknown>): number | undefined {
	const modes = Array.isArray(r.modes) ? r.modes : [];
	let passed = 0;
	let failed = 0;
	for (const m of modes) {
		if (typeof m === "object" && m !== null) {
			const mm = m as Record<string, unknown>;
			passed += asNumber(mm.passed);
			failed += asNumber(mm.failed);
		}
	}
	const total = passed + failed;
	if (total <= 0) return undefined;
	return (100 * passed) / total;
}

/**
 * adoption sub-score: 100 · refs / (refs + literals) from a lint line's
 * `adoption` block (SPEC-adoption §3). No block, or a zero denominator → the
 * component is absent (`undefined`), never a misleading 0 — mirroring a11y.
 */
function adoptionScore(record: Record<string, unknown>): number | undefined {
	const adoption =
		typeof record.adoption === "object" && record.adoption !== null
			? (record.adoption as Record<string, unknown>)
			: undefined;
	if (adoption === undefined) return undefined;
	const refs = asNumber(adoption.refs);
	const literals = asNumber(adoption.literals);
	const total = refs + literals;
	if (total <= 0) return undefined;
	return (100 * refs) / total;
}

/**
 * parity sub-score (C3): the recorded pass percentage from a `parity` history
 * line (the persisted `score` = 100·ok/total, written at the registry-build io
 * edge). When `score` is absent it is derived from `ok`/`total`. A `total` of 0
 * (no matchable components) → the component is absent (`undefined`), never a
 * misleading 0 — mirroring a11y/adoption (SPEC-personas §5 C3, absent-not-zero).
 */
function parityScore(record: Record<string, unknown>): number | undefined {
	const total = asNumber(record.total);
	if (total <= 0) return undefined;
	if (typeof record.score === "number" && Number.isFinite(record.score)) {
		return clamp01(record.score);
	}
	const ok = asNumber(record.ok);
	return clamp01((100 * ok) / total);
}

/**
 * The latest-of-each-kind raw records, as accumulated during a replay. The
 * `adoption` slot is a PARALLEL last-wins keyed on field presence (the last
 * lint line that CARRIES an `adoption` block), tracked independently of the
 * plain-`lint` last-wins — so adoption survives a later plain lint line.
 */
interface LatestRecords {
	drift?: Record<string, unknown>;
	lint?: Record<string, unknown>;
	readiness?: Record<string, unknown>;
	a11y?: Record<string, unknown>;
	adoption?: Record<string, unknown>;
	parity?: Record<string, unknown>;
}

/** Map a history `kind` to a component kind, or undefined if not score-relevant. */
function componentKindFor(historyKind: unknown): ComponentKind | undefined {
	switch (historyKind) {
		case "tokens-check":
			return "drift";
		case "lint":
			return "lint";
		case "handoff":
			return "readiness";
		case "a11y":
			return "a11y";
		case "parity":
			return "parity";
		default:
			return undefined;
	}
}

/** Compute one sub-score for a component from its raw record, or undefined if absent. */
function subScore(
	kind: ComponentKind,
	record: Record<string, unknown>,
): number | undefined {
	switch (kind) {
		case "drift":
			return driftScore(record);
		case "lint":
			return lintScore(record);
		case "readiness":
			return readinessScore(record);
		case "a11y":
			return a11yScore(record);
		case "adoption":
			return adoptionScore(record);
		case "parity":
			return parityScore(record);
	}
}

/**
 * Combine the latest-of-each-kind records into present components + a composite.
 * Weighted mean over PRESENT components only, weights renormalized; one half-up
 * rounding at the very end. Zero present components → undefined (no-data).
 */
function combine(
	latest: LatestRecords,
	weights: Weights,
): { current: number; components: ScoreComponent[] } | undefined {
	const components: ScoreComponent[] = [];
	for (const kind of COMPONENT_ORDER) {
		const record = latest[kind];
		if (record === undefined) continue;
		const score = subScore(kind, record);
		if (score === undefined) continue;
		components.push({ kind, score, weight: weights[kind] });
	}

	if (components.length === 0) return undefined;

	const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
	const weightedSum = components.reduce(
		(sum, c) => sum + c.score * c.weight,
		0,
	);
	// Composite from the RAW sub-scores; THEN round each component's score for
	// DISPLAY (the legend/scorecard showed e.g. 92.04545454545455). The composite
	// is unchanged — it is computed from raw above, before this map.
	const current = roundHalfUp(weightedSum / totalWeight);
	const display = components.map((c) => ({
		...c,
		score: roundHalfUp(c.score),
	}));
	return { current, components: display };
}

/** Compute just the composite (rounded) for a snapshot — used for trend points. */
function combineScore(
	latest: LatestRecords,
	weights: Weights,
): number | undefined {
	const combined = combine(latest, weights);
	return combined === undefined ? undefined : combined.current;
}

/**
 * Replay `history.jsonl` text into a 0–100 composite system score plus a derived
 * trend. Pure: text in → outcome out.
 *
 * - Each line is `JSON.parse`d independently; corrupt lines are skipped.
 * - Unknown `kind` values (and lines without a recognized kind) are skipped.
 * - Last record of each kind wins for the CURRENT score — including records
 *   without a string `at` (they cannot anchor a trend point, but they are the
 *   most recent state, so they participate in last-wins).
 * - Trend: one point per distinct `at` date (YYYY-MM-DD), ascending; each point
 *   combines the latest-of-each-kind records dated on/before that date.
 * - No score-relevant record at all → `{ kind: "no-data" }`.
 */
export function scoreFromHistory(
	text: string,
	weights?: Weights,
): ScoreOutcome {
	const effectiveWeights = weights ?? DEFAULT_WEIGHTS;

	// Parse every line into (componentKind, date, record), preserving order.
	interface Entry {
		component: ComponentKind;
		date: string | undefined;
		record: Record<string, unknown>;
	}
	const entries: Entry[] = [];
	// Readiness is per frame: each tracked frame's latest score, averaged — not
	// whichever frame happened to be recorded last.
	const averageFrames = frameAverager();

	// H2: the shared tolerant iterator (history-lines.ts) does the per-line parse
	// with the IDENTICAL tolerance this loop used to own (corrupt / non-object /
	// kindless lines skipped); unknown kinds are skipped below.
	for (const { record } of replayHistory(text)) {
		const component = componentKindFor(record.kind);
		if (component === undefined) continue; // unknown kind → skip silently

		const date =
			typeof record.at === "string" ? record.at.slice(0, 10) : undefined;
		if (component === "readiness") {
			entries.push({ component, date, record: averageFrames(record) });
			continue;
		}
		entries.push({ component, date, record });

		// A `lint` line that CARRIES an `adoption` block ALSO contributes a parallel
		// `adoption` entry (keyed on field presence), tracked independently of the
		// plain-lint last-wins. A lint line without the block contributes none — so
		// adoption survives a later plain lint line (SPEC-adoption §3).
		if (
			component === "lint" &&
			typeof record.adoption === "object" &&
			record.adoption !== null
		) {
			entries.push({ component: "adoption", date, record });
		}
	}

	// CURRENT: last-wins per kind over ALL score-relevant entries (dated or not).
	const latestCurrent: LatestRecords = {};
	for (const entry of entries) {
		latestCurrent[entry.component] = entry.record;
	}
	const combined = combine(latestCurrent, effectiveWeights);
	if (combined === undefined) {
		return { kind: "no-data" };
	}

	// TREND: replay over distinct dates ascending. A record anchors a trend point
	// only if it has a string `at`; dateless records feed CURRENT but not trends.
	const datedEntries = entries.filter((e) => e.date !== undefined);
	const distinctDates = Array.from(
		new Set(datedEntries.map((e) => e.date as string)),
	).sort();

	const trend: TrendPoint[] = [];
	for (const date of distinctDates) {
		const snapshot: LatestRecords = {};
		for (const entry of datedEntries) {
			// Latest-of-each-kind on/before this date (entries preserve file order,
			// so a later same-or-earlier-dated line overwrites → last-of-day wins).
			if ((entry.date as string) <= date) {
				snapshot[entry.component] = entry.record;
			}
		}
		const score = combineScore(snapshot, effectiveWeights);
		if (score !== undefined) {
			trend.push({ date, score });
		}
	}

	return {
		kind: "ok",
		current: combined.current,
		components: combined.components,
		trend,
	};
}
