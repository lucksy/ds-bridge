// N1 — consumer artifact engines (SPEC-consumer §2). Two PURE, deterministic
// VIEWS over the wave-5 shared `replayHistory` output (`{kind, at?, record}[]`) —
// NO new parser, no I/O. For the people building *with* the design system:
// "what broke and when" (breaking-calendar) and "how churny is each surface"
// (change-frequency). Neither writes history; neither touches Figma.
//
// The breaking signals are read straight off the recorded shapes the writers
// already append:
//   - tokens-check (tokens.ts:177-184): `{stale, missing, orphan, inSync}` —
//     a STALE output is built-output-diverged-from-source, i.e. token breakage;
//   - impact (impact.ts:220-227): `{breaking, additive, cosmetic, ...}` —
//     `breaking` is Figma component-API breakage.
// A line carrying BOTH a tokens-stale and an impact-breaking signal contributes
// ONE entry per signal (SPEC §2) — the per-signal loop below honors this even
// though no single recorded kind owns both today.
//
// THE DATELESS ASYMMETRY (locked red-first, mirroring score.ts/digest.ts):
//   - the CALENDAR EXCLUDES a dateless record (it has no date to place it on —
//     exactly digest.ts:327 `if (at === undefined) continue`);
//   - the FREQUENCY COUNTS a dateless record (a per-kind count is date-agnostic —
//     exactly score.ts, where dateless records still feed the current last-wins);
//     only `windowFirst`/`windowLast` are derived from the DATED records.

import type { HistoryRecord } from "./history-lines.js";

// ---------- breaking-calendar ----------

/** A breaking event's source: `tokens` (build drift) or `figma` (library API). */
export type BreakingSource = "tokens" | "figma";

/** One date-placed breaking event (a row in the date-grouped calendar list). */
export interface BreakingCalendarEntry {
	/** The `at` instant truncated to YYYY-MM-DD (the calendar day). */
	date: string;
	/** Which subsystem the breakage came from (drives the rendered badge). */
	source: BreakingSource;
	/** The breaking count for this signal on this day (stale, or impact.breaking). */
	count: number;
	/** A short human description of the breakage (deterministic). */
	detail: string;
}

/** The breaking-calendar view: date-desc entries plus a summed total. */
export interface BreakingCalendar {
	entries: BreakingCalendarEntry[];
	total: number;
}

/** Source sort rank for same-date ties: tokens before figma (SPEC §2). */
const SOURCE_RANK: Record<BreakingSource, number> = { tokens: 0, figma: 1 };

/** Coerce an unknown to a finite number, else undefined (mirrors the engines' `asNumber`). */
function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

/** The token-breakage detail line for a `stale` count. */
function tokensDetail(count: number): string {
	return `${count} stale output${count === 1 ? "" : "s"}`;
}

/** The Figma-breakage detail line for a `breaking` count. */
function figmaDetail(count: number): string {
	return `${count} breaking component change${count === 1 ? "" : "s"}`;
}

/**
 * Build the breaking-calendar view from `replayHistory` records. Each DATED
 * record contributes one entry PER breaking signal it carries:
 *   - `tokens-check` with `stale > 0`   → `{source:"tokens", count: stale}`;
 *   - `impact`       with `breaking > 0` → `{source:"figma",  count: breaking}`.
 * DATELESS records are EXCLUDED (no date to place). Sorted date-DESC, ties broken
 * deterministically by source (tokens<figma) then detail. `total` = Σ counts.
 * Empty (or all-excluded) input → `{entries: [], total: 0}`. Pure.
 */
export function buildBreakingCalendar(
	records: readonly HistoryRecord[],
): BreakingCalendar {
	const entries: BreakingCalendarEntry[] = [];

	for (const { kind, at, record } of records) {
		// Dateless cannot be placed on the calendar (the asymmetry vs frequency).
		if (at === undefined) continue;
		const date = at.slice(0, 10);

		// One entry PER breaking signal carried by this line (SPEC §2).
		if (kind === "tokens-check") {
			const stale = finiteNumber(record.stale);
			if (stale !== undefined && stale > 0) {
				entries.push({
					date,
					source: "tokens",
					count: stale,
					detail: tokensDetail(stale),
				});
			}
		}
		if (kind === "impact") {
			const breaking = finiteNumber(record.breaking);
			if (breaking !== undefined && breaking > 0) {
				entries.push({
					date,
					source: "figma",
					count: breaking,
					detail: figmaDetail(breaking),
				});
			}
		}
	}

	entries.sort((a, b) => {
		if (a.date !== b.date) return a.date < b.date ? 1 : -1; // date DESC
		const bySource = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
		if (bySource !== 0) return bySource;
		return a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0;
	});

	const total = entries.reduce((sum, e) => sum + e.count, 0);
	return { entries, total };
}

// ---------- change-frequency ----------

/** The history kinds tallied by the frequency view, in fixed catalog-ish order. */
export type FrequencyKind =
	| "tokens-check"
	| "lint"
	| "handoff"
	| "a11y"
	| "impact"
	| "adoption"
	| "library-health";

/** One per-kind activity count (a bar in the rendered bar chart). */
export interface FrequencyBucket {
	kind: FrequencyKind;
	count: number;
}

/** The change-frequency view: per-kind counts plus the dated activity window. */
export interface ChangeFrequency {
	byKind: FrequencyBucket[];
	/** Earliest DATED `at` (full instant), omitted when no dated records exist. */
	windowFirst?: string;
	/** Latest DATED `at` (full instant), omitted when no dated records exist. */
	windowLast?: string;
}

/** Bookkeeping fields every history line carries: not part of what it measured. */
const BOOKKEEPING = new Set([
	"v",
	"at",
	"kind",
	"source",
	"git",
	"tool",
	"runId",
]);

/** What a history line measured, as a comparable string (bookkeeping dropped). */
function measuredState(record: Record<string, unknown>): string {
	const measured: Record<string, unknown> = {};
	for (const key of Object.keys(record).sort()) {
		if (!BOOKKEEPING.has(key)) measured[key] = record[key];
	}
	return JSON.stringify(measured);
}

/** The tallied kinds, in fixed render order (the only ordering source). */
const FREQUENCY_ORDER: readonly FrequencyKind[] = [
	"tokens-check",
	"lint",
	"handoff",
	"a11y",
	"impact",
	"adoption",
	"library-health",
];

const FREQUENCY_KINDS = new Set<string>(FREQUENCY_ORDER);

/**
 * Build the change-frequency view from `replayHistory` records: per known
 * history kind, how many distinct measured states it went through (its first
 * state, then each change — an identical re-run is not counted) (fixed order, zero-count kinds OMITTED, unknown kinds
 * ignored), plus the min/max DATED `at`. DATELESS records ARE COUNTED (the
 * asymmetry vs the calendar) but never bound the window. Empty → `{byKind: []}`.
 * Pure, deterministic (independent of source order for the window bounds).
 */
export function buildChangeFrequency(
	records: readonly HistoryRecord[],
): ChangeFrequency {
	const counts = new Map<FrequencyKind, number>();
	let windowFirst: string | undefined;
	let windowLast: string | undefined;

	// A re-run that measured the same thing is not churn: count a surface's
	// first state and then each CHANGE of it (per frame for frame-level kinds),
	// so `record` run five times on unchanged code reads 1, not 5.
	const lastState = new Map<string, string>();
	for (const { kind, at, record } of records) {
		if (FREQUENCY_KINDS.has(kind)) {
			const k = kind as FrequencyKind;
			const subject = `${kind}\u0000${String(record.fileKey ?? "")}\u0000${String(record.nodeId ?? "")}`;
			const state = measuredState(record);
			if (lastState.get(subject) !== state) {
				lastState.set(subject, state);
				counts.set(k, (counts.get(k) ?? 0) + 1); // dateless COUNTED here
			}
		}
		if (at !== undefined) {
			if (windowFirst === undefined || at < windowFirst) windowFirst = at;
			if (windowLast === undefined || at > windowLast) windowLast = at;
		}
	}

	const byKind: FrequencyBucket[] = [];
	for (const kind of FREQUENCY_ORDER) {
		const count = counts.get(kind) ?? 0;
		if (count > 0) byKind.push({ kind, count });
	}

	const result: ChangeFrequency = { byKind };
	if (windowFirst !== undefined) result.windowFirst = windowFirst;
	if (windowLast !== undefined) result.windowLast = windowLast;
	return result;
}
