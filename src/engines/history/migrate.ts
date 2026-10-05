// H6 — `history migrate` (SPEC-history-v2 §4). PURE: history text in → v2 text
// + counts out; the CLI owns the lock and the atomic rewrite.
//
// A v1 record (an object with a string `kind`, a string `at` and no numeric
// `v ≥ 2`) becomes `{v:2, at, kind, source:"local", git:null, tool:null,
// ...payload}` — the payload is verbatim. v2 lines, corrupt lines, kindless
// objects and v1 lines without a string `at` are left untouched: the v2 schema
// requires `at`, so a line that cannot satisfy it must not claim to be v2.
// Blank lines are dropped.
// Idempotent: a migrated file migrates to itself.
import { envelopeOf, RESERVED_ENVELOPE_KEYS } from "./envelope.js";

export interface MigrateResult {
	text: string;
	/** v1 records rewritten as v2. */
	migrated: number;
	/** Non-blank lines left as they were. */
	unchanged: number;
}

/** The v2 form of a v1 record, or undefined when the line is not a v1 record. */
function migrateLine(raw: string): string | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return undefined;
	}
	const record = parsed as Record<string, unknown>;
	if (typeof record.kind !== "string") return undefined;
	if (typeof record.at !== "string") return undefined; // v2 requires `at`
	if (envelopeOf(record) !== undefined) return undefined; // already v2+

	const out: Record<string, unknown> = { v: 2 };
	out.at = record.at;
	out.kind = record.kind;
	out.source = "local";
	out.git = null;
	out.tool = null;
	for (const [key, value] of Object.entries(record)) {
		if (!RESERVED_ENVELOPE_KEYS.has(key)) out[key] = value;
	}
	return JSON.stringify(out);
}

/** Migrate every v1 line of a history text to the v2 envelope. */
export function migrateHistory(text: string): MigrateResult {
	const out: string[] = [];
	let migrated = 0;
	let unchanged = 0;
	for (const line of text.split("\n")) {
		const raw = line.trim();
		if (raw === "") continue;
		const next = migrateLine(raw);
		if (next === undefined) {
			out.push(raw);
			unchanged += 1;
		} else {
			out.push(next);
			migrated += 1;
		}
	}
	return {
		text: out.length > 0 ? `${out.join("\n")}\n` : "",
		migrated,
		unchanged,
	};
}
