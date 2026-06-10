// C7 / M2.2 — migration-checklist engine. PURE: the LATEST impact history record
// (or undefined) + a site cap in → a MigrationChecklist {sites, truncated} out.
// No fs/network/process; deterministic; never throws.
//
// The `impact` line carries an OPTIONAL `sites[]` (each {file, line, subject,
// from, to}), built at the impact io edge by joining the changed components'
// diff rows (old→new) with their code call sites (the usage map), capped at
// `migration_sites_cap` with a `sitesTruncated` flag when more existed. An
// older/baseline impact line has counts but NO `sites[]` — that reconstructs to
// an empty, not-truncated checklist (count-only is graceful, never an error).
//
// This module re-caps defensively (a forward-version line could carry more than
// the current cap) AND honors a persisted `sitesTruncated` flag (the writer
// already truncated and recorded that more existed), so truncation surfaces in
// either case.
import type { MigrationChecklist, MigrationSite } from "./types.js";

/** A non-null object record, or undefined. */
function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

/** Coerce an unknown to a finite number, else 0. */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Coerce an unknown to a string, else "". */
function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** Project one raw site entry into a typed MigrationSite (coercing fields). */
function toSite(raw: Record<string, unknown>): MigrationSite {
	return {
		file: asString(raw.file),
		line: asNumber(raw.line),
		subject: asString(raw.subject),
		from: asString(raw.from),
		to: asString(raw.to),
	};
}

/**
 * Reconstruct the per-call-site migration checklist from the latest impact
 * record's `sites[]`, capped at `cap`. Absent record / absent sites → empty,
 * not-truncated. Truncated is true when the raw site count exceeds `cap` OR the
 * line recorded `sitesTruncated: true`.
 */
export function buildMigrationChecklist(
	latestImpact: Record<string, unknown> | undefined,
	cap: number,
): MigrationChecklist {
	if (latestImpact === undefined) {
		return { sites: [], truncated: false };
	}

	const rawSites = Array.isArray(latestImpact.sites) ? latestImpact.sites : [];
	const recordedTruncated = latestImpact.sitesTruncated === true;

	const sites: MigrationSite[] = [];
	for (const entry of rawSites) {
		const obj = asObject(entry);
		if (obj === undefined) continue; // drop malformed (non-object) entries
		sites.push(toSite(obj));
	}

	const limit = Number.isFinite(cap) && cap > 0 ? cap : sites.length;
	const overCap = sites.length > limit;
	const capped = overCap ? sites.slice(0, limit) : sites;

	return {
		sites: capped,
		truncated: overCap || recordedTruncated,
	};
}
