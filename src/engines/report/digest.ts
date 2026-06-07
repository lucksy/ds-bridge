// D1 — digest model engine (SPEC-digest §1). Pure: history text + a resolved
// `sinceIso` instant in → a typed, deterministic movement+actions model out. No
// fs/clock/network — the CLI edge reads `now()` and the history text and injects
// both; `parseSince` is the ONE place relative windows are resolved (it takes a
// `nowIso` so it stays pure too).
//
// Movement (§1.1) = window-edge comparison per kind over a HALF-OPEN instant
// interval `[sinceIso, ∞)`: baseline = the latest record of each kind with
// `at < sinceIso`; current = the latest with `at >= sinceIso`. Comparison is a
// full-instant LEXICOGRAPHIC string compare (ISO sorts lexicographically) — never
// calendar-day truncation — mirroring changelog's inclusive lower bound
// (aggregate.ts:75). A kind seen only inside → "new" (no baseline); only before →
// omitted; neither → omitted. Zero in-window records across ALL kinds → a typed
// `quiet` outcome (honest, exit 0 — not an error).
//
// Audience (§1.3) reuses the imported `ChangelogAudience` verbatim; the
// `--audience` filter keeps section-audience-or-`both` (the render-md.ts:53
// membership rule). Actions (§1.4) fire in a FIXED priority order, capped at 3,
// each carrying its audience tag and filtered with the same membership rule;
// `readinessThreshold` is a PARAM (resolved at the edge via resolveConfig) so a
// project that raised its gate is honored rather than silently disagreed with.
import type { ChangelogAudience } from "../changelog/aggregate.js";
import { replayHistory } from "./history-lines.js";

/** parseSince outcome: a resolved instant, or a typed error listing the forms. */
export type ParseSinceResult =
	| { kind: "ok"; sinceIso: string }
	| { kind: "error"; message: string };

/** The accepted --since forms, named in the typed error (single source). */
const ACCEPTED_SINCE_FORMS =
	'Expected an ISO date "YYYY-MM-DD" or a relative window "<N>d" / "<N>w".';

/** Strict calendar-date matcher (further validated by round-trip below). */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Relative window: a positive integer count followed by `d` (days) or `w` (weeks). */
const RELATIVE = /^(\d+)([dw])$/;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolve a raw `--since` argument against `nowIso` to a millisecond-precision
 * ISO instant. `YYYY-MM-DD` → that date's `00:00:00.000Z`; `<N>d`/`<N>w` → N
 * days / N*7 days before `nowIso`; `undefined` → the `7d` default. Malformed
 * input (incl. impossible dates and non-positive counts) → a typed error.
 */
export function parseSince(
	raw: string | undefined,
	nowIso: string,
): ParseSinceResult {
	const value = raw ?? "7d";

	const isoMatch = ISO_DATE.exec(value);
	if (isoMatch !== null) {
		// Round-trip through Date to reject impossible calendar dates (2026-13-40).
		const ms = Date.parse(`${value}T00:00:00.000Z`);
		if (Number.isNaN(ms)) {
			return { kind: "error", message: ACCEPTED_SINCE_FORMS };
		}
		const roundTrip = new Date(ms).toISOString().slice(0, 10);
		if (roundTrip !== value) {
			return { kind: "error", message: ACCEPTED_SINCE_FORMS };
		}
		return { kind: "ok", sinceIso: `${value}T00:00:00.000Z` };
	}

	const relMatch = RELATIVE.exec(value);
	if (relMatch !== null) {
		const count = Number.parseInt(relMatch[1] ?? "", 10);
		const unit = relMatch[2];
		if (count <= 0) return { kind: "error", message: ACCEPTED_SINCE_FORMS };
		const days = unit === "w" ? count * 7 : count;
		const nowMs = Date.parse(nowIso);
		if (Number.isNaN(nowMs)) {
			return { kind: "error", message: ACCEPTED_SINCE_FORMS };
		}
		return {
			kind: "ok",
			sinceIso: new Date(nowMs - days * MS_PER_DAY).toISOString(),
		};
	}

	return { kind: "error", message: ACCEPTED_SINCE_FORMS };
}

/** The movement-row kinds, in fixed render order (the only ordering source). */
export type MovementKind =
	| "drift"
	| "lint"
	| "on-system"
	| "coverage"
	| "readiness"
	| "a11y";

/** Direction of a movement: `up` (rose), `down` (fell), `flat` (unchanged/new). */
export type MovementDirection = "up" | "down" | "flat";

/**
 * One per-kind movement row. `current` is the in-window latest metric; `baseline`
 * is the pre-window latest (absent → `isNew`). `direction` compares current to
 * baseline (a new row is `flat`). `audience` is the kind's §1.3 tag.
 */
export interface MovementRow {
	kind: MovementKind;
	audience: ChangelogAudience;
	baseline?: number;
	current: number;
	isNew: boolean;
	direction: MovementDirection;
}

/** One recommended action: a command to run, plus its audience tag. */
export interface DigestAction {
	command: string;
	audience: ChangelogAudience;
}

/** The digest model: the movement+actions report, or a typed quiet outcome. */
export type DigestModel =
	| {
			kind: "ok";
			sinceIso: string;
			audience: ChangelogAudience;
			movements: MovementRow[];
			actions: DigestAction[];
	  }
	| { kind: "quiet"; sinceIso: string; audience: ChangelogAudience };

/** The §1.3 audience tag per movement kind (the only tagging source). */
const KIND_AUDIENCE: Record<MovementKind, ChangelogAudience> = {
	drift: "both",
	lint: "developer",
	"on-system": "both",
	coverage: "both",
	readiness: "designer",
	a11y: "designer",
};

/** Fixed §1.1 render order for the movement rows. */
const MOVEMENT_ORDER: readonly MovementKind[] = [
	"drift",
	"lint",
	"on-system",
	"coverage",
	"readiness",
	"a11y",
];

/** Coerce an unknown to a finite number, else 0 (mirrors the scorecard/score parse). */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** A non-null object record, or undefined. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

/** Half-up percentage 100·part/whole, or undefined when the denominator is 0. */
function pct(part: number, whole: number): number | undefined {
	if (whole <= 0) return undefined;
	return Math.round((100 * part) / whole);
}

/** The membership rule: section-audience or `both` (render-md.ts:53). */
function inAudience(
	tag: ChangelogAudience,
	wanted: ChangelogAudience,
): boolean {
	if (wanted === "both") return true;
	return tag === wanted || tag === "both";
}

/** A side's latest-of-each-metric records (parallel adoption slot per §1.2). */
interface Side {
	tokensCheck?: Record<string, unknown>;
	lint?: Record<string, unknown>;
	adoption?: Record<string, unknown>; // adoption-bearing lint line (on-system)
	adoptionLine?: Record<string, unknown>; // kind:"adoption" coverage line
	handoff?: Record<string, unknown>;
	a11y?: Record<string, unknown>;
}

/** Fold a record into a side's last-wins slots (the adoption parallel last-wins). */
function absorb(
	side: Side,
	kind: string,
	record: Record<string, unknown>,
): void {
	switch (kind) {
		case "tokens-check":
			side.tokensCheck = record;
			break;
		case "lint":
			side.lint = record;
			if (asRecord(record.adoption) !== undefined) side.adoption = record;
			break;
		case "adoption":
			side.adoptionLine = record;
			break;
		case "handoff":
			side.handoff = record;
			break;
		case "a11y":
			side.a11y = record;
			break;
		default:
			break; // unknown kind — skip (forward compat)
	}
}

// --- per-kind metric extractors (one comparable number per movement row) ---

/** Drift metric: the stale count (breaking drift). */
function driftMetric(
	r: Record<string, unknown> | undefined,
): number | undefined {
	return r === undefined ? undefined : asNumber(r.stale);
}

/** Lint metric: summed byKind violations (exact + near + offSystem). */
function lintMetric(
	r: Record<string, unknown> | undefined,
): number | undefined {
	if (r === undefined) return undefined;
	const byKind = asRecord(r.byKind) ?? {};
	return (
		asNumber(byKind.exact) + asNumber(byKind.near) + asNumber(byKind.offSystem)
	);
}

/** On-system metric: refs / (refs+literals) pct from an adoption-bearing lint line. */
function onSystemMetric(
	r: Record<string, unknown> | undefined,
): number | undefined {
	const adoption = r === undefined ? undefined : asRecord(r.adoption);
	if (adoption === undefined) return undefined;
	return pct(
		asNumber(adoption.refs),
		asNumber(adoption.refs) + asNumber(adoption.literals),
	);
}

/** Coverage metric: imported / total pct from an adoption-kind line. */
function coverageMetric(
	r: Record<string, unknown> | undefined,
): number | undefined {
	if (r === undefined) return undefined;
	return pct(asNumber(r.imported), asNumber(r.total));
}

/** Readiness metric: the handoff score. */
function readinessMetric(
	r: Record<string, unknown> | undefined,
): number | undefined {
	return r === undefined ? undefined : asNumber(r.score);
}

/** a11y metric: Σpassed / (Σpassed+Σfailed) pct across all modes. */
function a11yMetric(
	r: Record<string, unknown> | undefined,
): number | undefined {
	if (r === undefined) return undefined;
	const modes = Array.isArray(r.modes) ? r.modes : [];
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

/** The metric extractor + the side slot it reads, per movement kind. */
const METRICS: Record<
	MovementKind,
	{
		slot: keyof Side;
		read: (r: Record<string, unknown> | undefined) => number | undefined;
	}
> = {
	drift: { slot: "tokensCheck", read: driftMetric },
	lint: { slot: "lint", read: lintMetric },
	"on-system": { slot: "adoption", read: onSystemMetric },
	coverage: { slot: "adoptionLine", read: coverageMetric },
	readiness: { slot: "handoff", read: readinessMetric },
	a11y: { slot: "a11y", read: a11yMetric },
};

/** The direction of current vs baseline (a new row, with no baseline, is flat). */
function directionOf(
	baseline: number | undefined,
	current: number,
): MovementDirection {
	if (baseline === undefined) return "flat";
	if (current > baseline) return "up";
	if (current < baseline) return "down";
	return "flat";
}

/**
 * Build the typed digest model (SPEC-digest §1). `sinceIso` is the resolved
 * instant (from `parseSince` at the edge); `audience` filters both movement rows
 * and actions with the membership rule; `readinessThreshold` is the configured
 * handoff gate. Deterministic.
 */
export function buildDigest(
	text: string,
	sinceIso: string,
	audience: ChangelogAudience,
	readinessThreshold: number,
): DigestModel {
	const records = replayHistory(text);

	const before: Side = {};
	const inWindow: Side = {};
	let anyInWindow = false;
	for (const { kind, at, record } of records) {
		// Half-open instant window: `at >= sinceIso` (lexicographic ISO) in-window.
		// A record without a string `at` cannot be placed — it never anchors the
		// window (consistent with score.ts: dateless records feed last-wins but not
		// the timeline). We drop it from both sides for movement purposes.
		if (at === undefined) continue;
		if (at >= sinceIso) {
			absorb(inWindow, kind, record);
			anyInWindow = true;
		} else {
			absorb(before, kind, record);
		}
	}

	if (!anyInWindow) {
		return { kind: "quiet", sinceIso, audience };
	}

	// --- movement rows: a row exists only when the kind has an in-window record ---
	const movements: MovementRow[] = [];
	for (const kind of MOVEMENT_ORDER) {
		const tag = KIND_AUDIENCE[kind];
		if (!inAudience(tag, audience)) continue;

		const { slot, read } = METRICS[kind];
		const current = read(inWindow[slot]);
		if (current === undefined) continue; // no in-window movement to report

		const baseline = read(before[slot]);
		movements.push({
			kind,
			audience: tag,
			...(baseline !== undefined ? { baseline } : {}),
			current,
			isNew: baseline === undefined,
			direction: directionOf(baseline, current),
		});
	}

	// --- actions: fixed §1.4 priority order, audience-filtered, capped at 3 ---
	const candidates: DigestAction[] = [];

	const driftStale = driftMetric(inWindow.tokensCheck);
	if (driftStale !== undefined && driftStale > 0) {
		candidates.push({ command: "/ds-bridge:token-check", audience: "both" });
	}

	const offSystem =
		inWindow.lint === undefined
			? undefined
			: asNumber(asRecord(inWindow.lint.byKind)?.offSystem);
	if (offSystem !== undefined && offSystem > 0) {
		candidates.push({
			command: "/ds-bridge:ds-lint --fix",
			audience: "developer",
		});
	}

	const readiness = readinessMetric(inWindow.handoff);
	if (readiness !== undefined && readiness < readinessThreshold) {
		candidates.push({ command: "/ds-bridge:handoff-qa", audience: "designer" });
	}

	const a11yFailing = (() => {
		if (inWindow.a11y === undefined) return false;
		const modes = Array.isArray(inWindow.a11y.modes) ? inWindow.a11y.modes : [];
		return modes.some((m) => asNumber(asRecord(m)?.failed) > 0);
	})();
	if (a11yFailing) {
		candidates.push({ command: "/ds-bridge:a11y-check", audience: "designer" });
	}

	const coverage = coverageMetric(inWindow.adoptionLine);
	if (coverage !== undefined && coverage < 100) {
		candidates.push({ command: "ds-bridge adoption", audience: "both" });
	}

	const actions = candidates
		.filter((a) => inAudience(a.audience, audience))
		.slice(0, 3);

	return { kind: "ok", sinceIso, audience, movements, actions };
}
