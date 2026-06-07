// D0 — THE shared tolerant history-line iterator (SPEC-digest §1.2). One faithful
// replay of a `history.jsonl` text into an ORDERED list of records, each carrying
// `{ kind, at?, record }`. This is the generalization the digest needs: scorecard
// folds it into a last-wins map (no `at`), the digest needs per-record `at` to
// place each record on the half-open window — so the iterator emits the ORDERED
// shape and each consumer reduces it however it likes.
//
// Existence proof: score.ts:304-344 already builds exactly this ordered
// `(kind, date, record)` form (incl. the adoption-bearing-lint parallel entry).
// This module lifts the tolerance contract into one place; scorecard.ts now
// REBUILDS its last-wins map from this list (its suite is the refactor net).
// score.ts and report.ts keep their own parsers this wave — their suites pin
// behavior and consolidation is a later cleanup (see BACKLOG process notes).
//
// Tolerance contract (the blessed wave-2 shape):
//   - lines are split on "\n"; blank / whitespace-only lines are skipped;
//   - each line is JSON.parse'd independently; a corrupt (non-JSON) line is
//     skipped, never fatal;
//   - a parsed value must be a NON-NULL object with a STRING `kind` to be
//     emitted (a bare number/string/null/array, or a `kind`-less object, is
//     skipped);
//   - `at` is carried ONLY when it is a string (a numeric/absent `at` yields a
//     record with no `at` property — it cannot anchor a window, but it is still
//     the latest state, so it participates in a consumer's last-wins);
//   - UNKNOWN kinds are EMITTED unchanged — forward compatibility lives at the
//     consumer, which skips the kinds it does not recognize.
// No coercion happens here: the raw record is carried verbatim so each consumer
// owns its own `asNumber`/field reads and the iterator stays a single replay.

/** One tolerant history record in source order. */
export interface HistoryRecord {
	/** The record's `kind` discriminator (guaranteed a string when emitted). */
	kind: string;
	/** The record's `at` instant, present ONLY when the source carried a string. */
	at?: string;
	/** The full parsed object, verbatim (consumers coerce on read). */
	record: Record<string, unknown>;
}

/** A non-null object record, or undefined. */
function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

/**
 * Replay one `history.jsonl` text into an ordered, tolerant record list. See the
 * module header for the exact tolerance contract. Pure: text in → records out.
 */
export function replayHistory(text: string): HistoryRecord[] {
	const records: HistoryRecord[] = [];
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const trimmed = (lines[i] ?? "").trim();
		if (trimmed === "") continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			continue; // corrupt line — skip
		}

		const record = asObject(parsed);
		if (record === undefined) continue; // not a non-null object — skip
		if (typeof record.kind !== "string") continue; // no string kind — skip

		const entry: HistoryRecord = { kind: record.kind, record };
		if (typeof record.at === "string") entry.at = record.at;
		records.push(entry);
	}
	return records;
}
