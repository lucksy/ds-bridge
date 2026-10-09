// X2 — exceptions-review engine (SPEC-exceptions §3). PURE: the F3 hotspot
// trend + the configured `exceptions` entries + today in → a triage queue out.
// No fs/network/clock; deterministic; never throws.
//
// A deviation that keeps coming back (count > 0 on ≥ 2 recorded runs, not back
// to zero) is a conversation to have, not a failure to hide: without a logged
// entry it is `needs-owner`; with one it carries the owner + decision. Entries
// NEVER change a count or a score — they record why a deviation exists. An
// entry matching nothing is listed as `not-seen`, never silently dropped.
import type { ExceptionDecision, ExceptionEntry } from "../../config.js";
import type {
	HotspotRow,
	HotspotSignal,
	LibraryHotspotsTrend,
} from "./library-hotspots-trend.js";

export type ExceptionState =
	| "needs-owner"
	| "overdue"
	| ExceptionDecision
	| "resolved"
	| "not-seen";

/** One row of the triage queue. */
export interface ExceptionRow {
	signal: HotspotSignal;
	name: string;
	/** Trend dates on which the component had a count > 0. */
	runs: number;
	/** Latest count; null when unknown (below the stored top-N) or not seen. */
	latest: number | null;
	state: ExceptionState;
	owner?: string;
	decision?: ExceptionDecision;
	note?: string;
	reviewBy?: string;
}

/** The `exceptions-review` section. */
export interface ExceptionsReview {
	dates: string[];
	rows: ExceptionRow[];
	totals: {
		needsOwner: number;
		overdue: number;
		inReview: number;
		decided: number;
		resolved: number;
		notSeen: number;
	};
}

const STATE_ORDER: readonly ExceptionState[] = [
	"needs-owner",
	"overdue",
	"investigating",
	"fix-implementation",
	"evolve-component",
	"resolved",
	"not-seen",
];

const SIGNAL_ORDER: readonly HotspotSignal[] = [
	"overrides",
	"deprecated",
	"detached",
];

const norm = (name: string): string => name.trim().toLowerCase();

function matches(entry: ExceptionEntry, row: HotspotRow): boolean {
	return (
		norm(entry.component) === norm(row.name) &&
		(entry.signal === undefined || entry.signal === row.signal)
	);
}

function entryFields(entry: ExceptionEntry): Partial<ExceptionRow> {
	return {
		owner: entry.owner,
		decision: entry.decision,
		...(entry.note !== undefined ? { note: entry.note } : {}),
		...(entry.reviewBy !== undefined ? { reviewBy: entry.reviewBy } : {}),
	};
}

function stateFor(
	row: HotspotRow,
	entry: ExceptionEntry | undefined,
	today: string,
): ExceptionState {
	if (entry === undefined) return "needs-owner";
	if (row.latest === 0) return "resolved";
	if (entry.reviewBy !== undefined && entry.reviewBy < today) return "overdue";
	return entry.decision;
}

function compareNames(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Fold the hotspot trend + logged entries into the triage queue. */
export function buildExceptionsReview(
	trend: LibraryHotspotsTrend | undefined,
	exceptions: readonly ExceptionEntry[] | undefined,
	today: string,
): ExceptionsReview | undefined {
	const entries = exceptions ?? [];
	const trendRows = trend?.rows ?? [];
	const rows: ExceptionRow[] = [];
	const used = new Set<ExceptionEntry>();

	for (const hotspot of trendRows) {
		const runs = hotspot.points.filter(
			(p) => p.count !== null && p.count > 0,
		).length;
		const entry = entries.find((e) => matches(e, hotspot));
		if (entry !== undefined) used.add(entry);
		const recurring = runs >= 2 && hotspot.latest !== 0;
		if (!recurring && entry === undefined) continue;
		rows.push({
			signal: hotspot.signal,
			name: hotspot.name,
			runs,
			latest: hotspot.latest,
			state: stateFor(hotspot, entry, today),
			...(entry !== undefined ? entryFields(entry) : {}),
		});
	}
	for (const entry of entries) {
		if (used.has(entry)) continue;
		rows.push({
			signal: entry.signal ?? "overrides",
			name: entry.component.trim(),
			runs: 0,
			latest: null,
			state: "not-seen",
			...entryFields(entry),
		});
	}
	if (rows.length === 0) return undefined;

	rows.sort(
		(a, b) =>
			STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
			(b.latest ?? -1) - (a.latest ?? -1) ||
			SIGNAL_ORDER.indexOf(a.signal) - SIGNAL_ORDER.indexOf(b.signal) ||
			compareNames(a.name, b.name),
	);
	const count = (...states: ExceptionState[]) =>
		rows.filter((r) => states.includes(r.state)).length;
	return {
		dates: trend?.dates ?? [],
		rows,
		totals: {
			needsOwner: count("needs-owner"),
			overdue: count("overdue"),
			inReview: count("investigating"),
			decided: count("fix-implementation", "evolve-component"),
			resolved: count("resolved"),
			notSeen: count("not-seen"),
		},
	};
}
