// C10 / M2.3 — audience-changelog engine. PURE: the LATEST `changelog` history
// record (or undefined) in → an AudienceChangelog {slices} out. No fs/network/
// process; deterministic; never throws.
//
// The `changelog` line (written by `ds-bridge changelog` at its io edge) carries
// a `recent[]` of `{audience, severity, source, title}` entries — the breaking-
// first sample of the aggregated changelog. This engine folds them into two
// audience slices (designers | developers), honoring the SAME membership rule the
// changelog aggregation uses: an entry whose audience is "both" counts into BOTH
// slices. Each slice tallies its entries by severity (breaking / additive=notable
// / cosmetic=minor) and keeps a capped, breaking-first `recent[]` of titles.
//
// An absent record, an empty `recent[]`, or a `recent[]` whose entries all miss a
// known audience yields no slices (the section degrades to its empty state, which
// keeps the no-config golden byte-identical when no changelog line exists).
import type { AudienceChangelog, AudienceChangelogSlice } from "./types.js";

/** How many titles each slice's `recent[]` keeps (breaking-first survive). */
const RECENT_CAP = 12;

/** The line-level severities and the slice fields they map onto. */
type RecentSeverity = "breaking" | "notable" | "minor";

/**
 * Breaking-first ordering rank: breaking floats to the front, every other
 * severity keeps its source order behind it (a stable binary partition — NOT a
 * full severity sort). Mirrors the changelog's "breaking-first" surfacing.
 */
function breakingRank(severity: RecentSeverity): number {
	return severity === "breaking" ? 0 : 1;
}

/** The slice key each line-level severity contributes its count to. */
const SEVERITY_FIELD: Record<
	RecentSeverity,
	"breaking" | "additive" | "cosmetic"
> = {
	breaking: "breaking",
	notable: "additive",
	minor: "cosmetic",
};

/** One normalized recent entry the engine reasons about. */
interface RecentEntry {
	audience: "designer" | "developer" | "both";
	severity: RecentSeverity;
	title: string;
	/** Source index — the stable tiebreak that preserves file order within a rank. */
	order: number;
}

/** A non-null object record, or undefined. */
function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

/** Narrow an unknown to a known line-level audience, or undefined. */
function asAudience(
	value: unknown,
): "designer" | "developer" | "both" | undefined {
	return value === "designer" || value === "developer" || value === "both"
		? value
		: undefined;
}

/** Narrow an unknown to a known line-level severity, or undefined. */
function asSeverity(value: unknown): RecentSeverity | undefined {
	return value === "breaking" || value === "notable" || value === "minor"
		? value
		: undefined;
}

/** Project one raw recent entry into a typed entry, or drop it (returns undefined). */
function toEntry(raw: unknown, order: number): RecentEntry | undefined {
	const obj = asObject(raw);
	if (obj === undefined) return undefined;
	const audience = asAudience(obj.audience);
	const severity = asSeverity(obj.severity);
	if (audience === undefined || severity === undefined) return undefined;
	const title = typeof obj.title === "string" ? obj.title : "";
	return { audience, severity, title, order };
}

/** Whether an entry is in scope for a slice audience (both is always in scope). */
function inAudience(
	entry: RecentEntry,
	audience: "designer" | "developer",
): boolean {
	return entry.audience === audience || entry.audience === "both";
}

/** Build one slice from the entries in scope for its audience. */
function buildSlice(
	label: "designers" | "developers",
	audience: "designer" | "developer",
	entries: RecentEntry[],
): AudienceChangelogSlice | undefined {
	const scoped = entries.filter((e) => inAudience(e, audience));
	if (scoped.length === 0) return undefined;

	const counts = { breaking: 0, additive: 0, cosmetic: 0 };
	for (const entry of scoped) {
		counts[SEVERITY_FIELD[entry.severity]] += 1;
	}

	// Breaking-first, then source order (stable) — then cap the titles.
	const recent = scoped
		.slice()
		.sort(
			(a, b) =>
				breakingRank(a.severity) - breakingRank(b.severity) ||
				a.order - b.order,
		)
		.slice(0, RECENT_CAP)
		.map((e) => e.title);

	return { audience: label, ...counts, recent };
}

/**
 * Fold the latest `changelog` record's `recent[]` into an audience-segmented
 * panel. Designers slice is emitted before developers (stable section order). A
 * record without sliceable entries yields `{slices: []}`.
 */
export function buildAudienceChangelog(
	latest: Record<string, unknown> | undefined,
): AudienceChangelog {
	if (latest === undefined) return { slices: [] };

	const rawRecent = Array.isArray(latest.recent) ? latest.recent : [];
	const entries: RecentEntry[] = [];
	for (let i = 0; i < rawRecent.length; i += 1) {
		const entry = toEntry(rawRecent[i], i);
		if (entry !== undefined) entries.push(entry);
	}

	const slices: AudienceChangelogSlice[] = [];
	const designers = buildSlice("designers", "designer", entries);
	if (designers !== undefined) slices.push(designers);
	const developers = buildSlice("developers", "developer", entries);
	if (developers !== undefined) slices.push(developers);

	return { slices };
}
