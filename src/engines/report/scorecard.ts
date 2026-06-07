// C1 — Scorecard model engine. Pure: raw `history.jsonl` text(s) in, a typed
// comparison MODEL out (SPEC-scorecard §2). No fs/network/process — the CLI edge
// reads the current text and the base ref's committed text and injects both.
//
// `buildScorecard(currentText, baseText?, weights)` replays each side and emits
// the seven §2 rows tagged by id, each carrying `{ now, base?, delta? }` typed
// for its kind. The score row delegates to `scoreFromHistory`; SPEC §1.5 — the
// SAME `weights` table is applied to BOTH sides (the base ref's committed
// `score_weights` are deliberately ignored) so the delta is a like-for-like
// comparison of one metric, not two differently-weighted composites.
//
// The other six rows RE-PARSE the raw text rather than reusing `aggregateHistory`
// — the blessed wave-2 precedent (see score.ts:5-10): aggregateHistory's output
// is lossy (fields renamed into drift buckets, the adoption pct already rounded
// per directory) and score.ts deliberately owns its own parse. To avoid a FOURTH
// tolerance re-implementation, this module runs ONE shared internal line-iterator
// (`extractLatest`) with the identical tolerance contract: per-line JSON.parse
// skip-on-corrupt, unknown-kind skip, `asNumber` coercion, last-wins per kind,
// and the adoption PARALLEL last-wins keyed on field presence (a plain lint line
// never clears a prior adoption-bearing line — SPEC-adoption §3 / score.ts:333).
//
// Omission rules (§2): a row absent on BOTH sides is omitted entirely (a PR
// comment must not list seven "n/a"s); `delta` renders only when BOTH sides have
// a comparable scalar; zero rows on both sides → `{ kind: "no-data" }`. A model
// built with `baseText === undefined` is flagged `currentOnly`. Deterministic.
import { scoreFromHistory, type Weights } from "./score.js";

/** The seven scorecard row ids, in the fixed §2 render order. */
export type ScorecardRowId =
	| "score"
	| "on-system"
	| "lint-violations"
	| "drift"
	| "import-coverage"
	| "contrast"
	| "readiness";

/** One present system-score component (mirrors score.ts ScoreComponent shape). */
export interface ScorecardScoreComponent {
	kind: "drift" | "lint" | "readiness" | "a11y" | "adoption";
	score: number;
	weight: number;
}

/** Drift counts carried verbatim (breaking == stale, called out by the renderer). */
export interface DriftCounts {
	stale: number;
	missing: number;
	orphan: number;
}

/** Import-coverage counts (imported of total CODE components). */
export interface CoverageCounts {
	imported: number;
	total: number;
}

/** Readiness: the recorded score and the frame it was measured against. */
export interface ReadinessValue {
	score: number;
	frame: string;
}

/**
 * The composite system-score row. `now`/`base` are 0–100 composites computed
 * with the CURRENT weights on both sides (§1.5). `components` are the now-side
 * sub-scores (the renderer's component sub-table). `delta` only when both sides
 * scored. Present whenever EITHER side scored.
 */
export interface ScoreRow {
	id: "score";
	now?: number;
	base?: number;
	delta?: number;
	components: ScorecardScoreComponent[];
}

/** A simple percentage row (on-system, contrast): now/base/signed delta. */
export interface PercentRow {
	id: "on-system" | "contrast";
	now?: number;
	base?: number;
	delta?: number;
}

/** The lint-violations count row: summed byKind totals, signed delta. */
export interface ViolationsRow {
	id: "lint-violations";
	now?: number;
	base?: number;
	delta?: number;
}

/** The drift row: multi-count, no scalar delta (the renderer diffs per count). */
export interface DriftRow {
	id: "drift";
	now?: DriftCounts;
	base?: DriftCounts;
}

/** The import-coverage row: multi-count, no scalar delta. */
export interface CoverageRow {
	id: "import-coverage";
	now?: CoverageCounts;
	base?: CoverageCounts;
}

/** The readiness row: a score (with signed delta) plus the frame name. */
export interface ReadinessRow {
	id: "readiness";
	now?: ReadinessValue;
	base?: ReadinessValue;
	delta?: number;
}

/** One scorecard row, discriminated by `id`. */
export type ScorecardRow =
	| ScoreRow
	| PercentRow
	| ViolationsRow
	| DriftRow
	| CoverageRow
	| ReadinessRow;

/** The scorecard model: an ordered row list, or a typed no-data signal. */
export type ScorecardModel =
	| { kind: "ok"; currentOnly: boolean; rows: ScorecardRow[] }
	| { kind: "no-data" };

/** The fixed §2 render order — the ONLY place row ordering is defined. */
const ROW_ORDER: readonly ScorecardRowId[] = [
	"score",
	"on-system",
	"lint-violations",
	"drift",
	"import-coverage",
	"contrast",
	"readiness",
];

/**
 * Coerce an unknown to a finite number, else 0 — mirrors aggregateHistory /
 * score.ts `asNumber` so every parse path agrees on tolerance.
 */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Half-up percentage 100·part/whole, or undefined when the denominator is 0. */
function pct(part: number, whole: number): number | undefined {
	if (whole <= 0) return undefined;
	return Math.round((100 * part) / whole);
}

/** A non-null object record, or undefined. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

/**
 * The latest-of-each-kind raw records for one side, accumulated by the shared
 * line-iterator. `adoption` is the PARALLEL last-wins: the last lint line that
 * CARRIES an `adoption` block, tracked independently of the plain-lint slot so a
 * later plain lint line never clears it (score.ts:333 precedent).
 */
interface LatestRecords {
	tokensCheck?: Record<string, unknown>;
	lint?: Record<string, unknown>;
	adoption?: Record<string, unknown>; // adoption-bearing lint line (on-system)
	adoptionLine?: Record<string, unknown>; // `kind:"adoption"` import-coverage line
	handoff?: Record<string, unknown>;
	a11y?: Record<string, unknown>;
}

/**
 * THE shared line-iterator. Replays one history text into the latest record of
 * each relevant kind, with the blessed tolerance: blank-skip, per-line
 * JSON.parse skip-on-corrupt, unknown-kind skip, last-wins, and the adoption
 * parallel last-wins keyed on field presence. No coercion happens here — the row
 * extractors coerce on read so the iterator stays a single faithful replay.
 */
function extractLatest(text: string): LatestRecords {
	const latest: LatestRecords = {};
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const trimmed = (lines[i] ?? "").trim();
		if (trimmed === "") continue;

		let record: Record<string, unknown>;
		try {
			record = JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			continue; // corrupt line — skip
		}
		if (typeof record !== "object" || record === null) continue;

		switch (record.kind) {
			case "tokens-check":
				latest.tokensCheck = record;
				break;
			case "lint": {
				latest.lint = record;
				// A lint line that CARRIES an adoption block ALSO refreshes the parallel
				// adoption slot; a plain lint line touches neither it nor adoptionLine.
				if (asRecord(record.adoption) !== undefined) {
					latest.adoption = record;
				}
				break;
			}
			case "adoption":
				latest.adoptionLine = record;
				break;
			case "handoff":
				latest.handoff = record;
				break;
			case "a11y":
				latest.a11y = record;
				break;
			default:
				break; // unknown kind — skip silently (forward compat)
		}
	}
	return latest;
}

/** The score composite (or undefined) for one side, via the pure score engine. */
function scoreFor(
	text: string,
	weights: Weights,
): { current: number; components: ScorecardScoreComponent[] } | undefined {
	const outcome = scoreFromHistory(text, weights);
	if (outcome.kind === "no-data") return undefined;
	return {
		current: outcome.current,
		components: outcome.components.map((c) => ({
			kind: c.kind,
			score: c.score,
			weight: c.weight,
		})),
	};
}

/** On-system pct from an adoption-bearing lint line's block, or undefined. */
function onSystemPct(
	record: Record<string, unknown> | undefined,
): number | undefined {
	const adoption = record === undefined ? undefined : asRecord(record.adoption);
	if (adoption === undefined) return undefined;
	const refs = asNumber(adoption.refs);
	const literals = asNumber(adoption.literals);
	return pct(refs, refs + literals);
}

/** Summed byKind violations from a lint line, or undefined when absent. */
function violations(
	record: Record<string, unknown> | undefined,
): number | undefined {
	if (record === undefined) return undefined;
	const byKind = asRecord(record.byKind) ?? {};
	return (
		asNumber(byKind.exact) + asNumber(byKind.near) + asNumber(byKind.offSystem)
	);
}

/** Drift counts from a tokens-check line, or undefined when absent. */
function driftCounts(
	record: Record<string, unknown> | undefined,
): DriftCounts | undefined {
	if (record === undefined) return undefined;
	return {
		stale: asNumber(record.stale),
		missing: asNumber(record.missing),
		orphan: asNumber(record.orphan),
	};
}

/** Coverage counts from an adoption-kind line, or undefined when absent. */
function coverageCounts(
	record: Record<string, unknown> | undefined,
): CoverageCounts | undefined {
	if (record === undefined) return undefined;
	return { imported: asNumber(record.imported), total: asNumber(record.total) };
}

/** Contrast pass-pct over ALL modes of an a11y line, or undefined when absent. */
function contrastPct(
	record: Record<string, unknown> | undefined,
): number | undefined {
	if (record === undefined) return undefined;
	const modes = Array.isArray(record.modes) ? record.modes : [];
	let passed = 0;
	let failed = 0;
	for (const m of modes) {
		const mm = asRecord(m);
		if (mm === undefined) continue;
		passed += asNumber(mm.passed);
		failed += asNumber(mm.failed);
	}
	return pct(passed, passed + failed);
}

/** Readiness value from a handoff line, or undefined when absent. */
function readinessValue(
	record: Record<string, unknown> | undefined,
): ReadinessValue | undefined {
	if (record === undefined) return undefined;
	return {
		score: asNumber(record.score),
		frame: typeof record.frameName === "string" ? record.frameName : "",
	};
}

/**
 * Assemble a scalar row (now/base/signed-delta). Present when EITHER side has a
 * value; `delta = now − base` only when BOTH sides have one (§2 omission rules).
 */
function scalarRow<T extends "on-system" | "contrast" | "lint-violations">(
	id: T,
	now: number | undefined,
	base: number | undefined,
): (PercentRow | ViolationsRow) | undefined {
	if (now === undefined && base === undefined) return undefined;
	const row = { id } as PercentRow | ViolationsRow;
	if (now !== undefined) row.now = now;
	if (base !== undefined) row.base = base;
	if (now !== undefined && base !== undefined) row.delta = now - base;
	return row;
}

/**
 * Build the typed scorecard comparison model (SPEC-scorecard §2).
 *
 * @param currentText the current-tip history.jsonl text
 * @param baseText    the base ref's committed history text, or `undefined` for a
 *                    current-only scorecard (no comparison columns)
 * @param weights     the CURRENT weights — applied to BOTH sides per §1.5
 */
export function buildScorecard(
	currentText: string,
	baseText: string | undefined,
	weights: Weights,
): ScorecardModel {
	const currentOnly = baseText === undefined;
	const cur = extractLatest(currentText);
	const bas = baseText === undefined ? undefined : extractLatest(baseText);

	const rows: ScorecardRow[] = [];

	// --- score (both sides, CURRENT weights — §1.5) ---
	const nowScore = scoreFor(currentText, weights);
	const baseScore =
		baseText === undefined ? undefined : scoreFor(baseText, weights);
	if (nowScore !== undefined || baseScore !== undefined) {
		const row: ScoreRow = {
			id: "score",
			components: nowScore?.components ?? [],
		};
		if (nowScore !== undefined) row.now = nowScore.current;
		if (baseScore !== undefined) row.base = baseScore.current;
		if (nowScore !== undefined && baseScore !== undefined) {
			row.delta = nowScore.current - baseScore.current;
		}
		rows.push(row);
	}

	// --- on-system (adoption parallel last-wins pct) ---
	const onSystem = scalarRow(
		"on-system",
		onSystemPct(cur.adoption),
		bas === undefined ? undefined : onSystemPct(bas.adoption),
	);
	if (onSystem !== undefined) rows.push(onSystem);

	// --- lint-violations (summed byKind) ---
	const lintViolations = scalarRow(
		"lint-violations",
		violations(cur.lint),
		bas === undefined ? undefined : violations(bas.lint),
	);
	if (lintViolations !== undefined) rows.push(lintViolations);

	// --- drift (multi-count, no scalar delta) ---
	const nowDrift = driftCounts(cur.tokensCheck);
	const baseDrift =
		bas === undefined ? undefined : driftCounts(bas.tokensCheck);
	if (nowDrift !== undefined || baseDrift !== undefined) {
		const row: DriftRow = { id: "drift" };
		if (nowDrift !== undefined) row.now = nowDrift;
		if (baseDrift !== undefined) row.base = baseDrift;
		rows.push(row);
	}

	// --- import-coverage (multi-count, no scalar delta) ---
	const nowCov = coverageCounts(cur.adoptionLine);
	const baseCov =
		bas === undefined ? undefined : coverageCounts(bas.adoptionLine);
	if (nowCov !== undefined || baseCov !== undefined) {
		const row: CoverageRow = { id: "import-coverage" };
		if (nowCov !== undefined) row.now = nowCov;
		if (baseCov !== undefined) row.base = baseCov;
		rows.push(row);
	}

	// --- contrast (Σpassed pct) ---
	const contrast = scalarRow(
		"contrast",
		contrastPct(cur.a11y),
		bas === undefined ? undefined : contrastPct(bas.a11y),
	);
	if (contrast !== undefined) rows.push(contrast);

	// --- readiness (score + frame, signed score delta) ---
	const nowReady = readinessValue(cur.handoff);
	const baseReady = bas === undefined ? undefined : readinessValue(bas.handoff);
	if (nowReady !== undefined || baseReady !== undefined) {
		const row: ReadinessRow = { id: "readiness" };
		if (nowReady !== undefined) row.now = nowReady;
		if (baseReady !== undefined) row.base = baseReady;
		if (nowReady !== undefined && baseReady !== undefined) {
			row.delta = nowReady.score - baseReady.score;
		}
		rows.push(row);
	}

	if (rows.length === 0) return { kind: "no-data" };

	// Sort into the fixed §2 order (the only place ordering is defined).
	rows.sort((a, b) => ROW_ORDER.indexOf(a.id) - ROW_ORDER.indexOf(b.id));

	return { kind: "ok", currentOnly, rows };
}
