// H6 — `history compact` (SPEC-history-v2 §1.5, §4, gap G4). PURE: history text in
// → compacted text + counts out; the CLI owns the lock and the atomic rewrite.
//
// Records are grouped by SUBJECT: kind + `frameKeyOf` (fileKey:nodeId > fileKey
// > frame name), so one `record --figma` run's per-frame handoff lines, or
// library-health lines for two files, are separate series and never collapse
// into each other. Kinds without a frame/file (lint, tokens…) have one subject.
//
// Dedupe: a run of IDENTICAL consecutive records of the same subject (other
// subjects in between do not break it) keeps its FIRST and LAST member and
// drops the copies in between. "Identical" compares the payload only: the
// envelope keys (`v`, `at`, `source`, `git`, `tool`, `runId`) are ignored and
// key order does not matter. Keeping the last leaves every last-wins reader and
// data freshness unchanged; keeping the first keeps where a plateau began, so a
// metric that stayed flat for 30 days still has a point 30 days back for
// "since" and window readers (velocity, digest --since, export --since).
//
// `keepPerDay` then keeps the last surviving record per subject per UTC day (dated
// records only). Corrupt, kindless and dateless lines are never dropped — data
// the tool cannot read is not the tool's to delete.
import { payloadOf } from "./envelope.js";
import { frameKeyOf } from "./readiness-frames.js";

export interface CompactOptions {
	/** Keep at most one record per subject per UTC day (the last of the day). */
	keepPerDay?: boolean;
}

export interface CompactResult {
	/** The compacted history (newline-terminated when non-empty). */
	text: string;
	/** Non-blank lines before. */
	before: number;
	/** Lines kept. */
	after: number;
	/** Lines dropped. */
	removed: number;
}

/** Canonical JSON: object keys sorted recursively (order-insensitive equality). */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (typeof value === "object" && value !== null) {
		const obj = value as Record<string, unknown>;
		return `{${Object.keys(obj)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

/** The payload identity of a record: canonical JSON minus the envelope keys. */
function payloadIdentity(record: Record<string, unknown>): string {
	return canonical(payloadOf(record));
}

interface Entry {
	raw: string;
	/** `kind` + NUL + frame/file subject; absent for unreadable lines. */
	subject?: string;
	at?: string;
	identity?: string;
}

function parseEntry(raw: string): Entry {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { raw };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { raw };
	}
	const record = parsed as Record<string, unknown>;
	if (typeof record.kind !== "string") return { raw };
	return {
		raw,
		subject: `${record.kind}\u0000${frameKeyOf(record)}`,
		...(typeof record.at === "string" ? { at: record.at } : {}),
		identity: payloadIdentity(record),
	};
}

/** Compact a history text. See the module header for the exact rules. */
export function compactHistory(
	text: string,
	options: CompactOptions = {},
): CompactResult {
	const entries = text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l !== "")
		.map(parseEntry);
	const keep = entries.map(() => true);

	// 1) Dedupe identical consecutive same-subject records → keep the first and
	//    the last of each run; drop the ones in between.
	const runBySubject = new Map<string, { first: number; last: number }>();
	entries.forEach((entry, index) => {
		if (entry.subject === undefined) return;
		const run = runBySubject.get(entry.subject);
		if (run !== undefined && entries[run.last]?.identity === entry.identity) {
			// The run grows: its previous last is now a middle copy.
			if (run.last !== run.first) keep[run.last] = false;
			run.last = index;
			return;
		}
		runBySubject.set(entry.subject, { first: index, last: index });
	});

	// 2) Optionally keep the last surviving record per subject per UTC day.
	if (options.keepPerDay === true) {
		const lastByDay = new Map<string, number>();
		entries.forEach((entry, index) => {
			if (
				!keep[index] ||
				entry.subject === undefined ||
				entry.at === undefined
			) {
				return;
			}
			const key = `${entry.subject}\u0000${entry.at.slice(0, 10)}`;
			const prev = lastByDay.get(key);
			if (prev !== undefined) keep[prev] = false;
			lastByDay.set(key, index);
		});
	}

	const kept = entries.filter((_, i) => keep[i]).map((e) => e.raw);
	return {
		text: kept.length > 0 ? `${kept.join("\n")}\n` : "",
		before: entries.length,
		after: kept.length,
		removed: entries.length - kept.length,
	};
}
