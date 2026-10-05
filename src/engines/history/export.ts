// E1 — tidy history export (SPEC-analytics-export §4). PURE: history text in →
// rows out → CSV / JSONL text. The io edge (src/cli-commands/history.ts) reads
// the file, resolves the clock and writes the result.
//
// One row per FINITE NUMERIC leaf of a record's payload (nested objects
// flattened with "."; arrays of objects carrying an identity key flattened as
// "<path>.<id>.<leaf>"); other arrays, strings, booleans, null and the v2
// envelope keys are never metrics. Generic on purpose: a new kind exports on
// day one.
import { parseSince } from "../report/digest.js";
import { replayHistory } from "../report/history-lines.js";
import { RESERVED_ENVELOPE_KEYS } from "./envelope.js";

/** The fixed column order (CSV header and JSONL key order). */
export const EXPORT_COLUMNS = [
	"at",
	"date",
	"runId",
	"sha",
	"branch",
	"source",
	"kind",
	"subject",
	"metric",
	"value",
] as const;

/** One tidy row: a metric's value on one record. */
export interface ExportRow {
	at: string;
	/** UTC day of `at` (`YYYY-MM-DD`) — pastes as a date in Sheets/Excel. */
	date: string;
	runId: string | null;
	sha: string | null;
	branch: string | null;
	source: string | null;
	kind: string;
	/** Per-frame records: `frameName` plus ` (nodeId)` when known; else null. */
	subject: string | null;
	metric: string;
	value: number;
}

/** Keys that identify an array element, tried in this order. */
const IDENTITY_KEYS = ["mode", "dir", "componentName", "name"] as const;

export interface ExportFilter {
	/** Keep only these kinds (absent → every kind). */
	kinds?: readonly string[];
	/** Inclusive lower bound (ms since epoch). */
	sinceMs?: number;
	/** Upper bound (ms since epoch); exclusive when `untilExclusive`. */
	untilMs?: number;
	untilExclusive?: boolean;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function str(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

/** An array element's identity: its first string among IDENTITY_KEYS. */
function identityOf(element: Record<string, unknown>): string | undefined {
	for (const key of IDENTITY_KEYS) {
		const id = element[key];
		if (typeof id === "string") return id;
	}
	return undefined;
}

/**
 * Collect [path, number] for every finite numeric leaf. Arrays: each object
 * element with an identity flattens under `<path>.<id>`; anything else skipped.
 */
function numericLeaves(
	obj: Record<string, unknown>,
	prefix: string,
	out: [string, number][],
): void {
	for (const [key, value] of Object.entries(obj)) {
		const path = prefix === "" ? key : `${prefix}.${key}`;
		if (typeof value === "number") {
			if (Number.isFinite(value)) out.push([path, value]);
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				const element = asObject(item);
				if (element === undefined) continue;
				const id = identityOf(element);
				if (id !== undefined) numericLeaves(element, `${path}.${id}`, out);
			}
			continue;
		}
		const nested = asObject(value);
		if (nested !== undefined) numericLeaves(nested, path, out);
	}
}

/** Per-frame subject: `frameName` (+ ` (nodeId)`), else null. */
function subjectOf(record: Record<string, unknown>): string | null {
	const frameName = str(record.frameName);
	if (frameName === null) return null;
	const nodeId = str(record.nodeId);
	return nodeId === null ? frameName : `${frameName} (${nodeId})`;
}

/** Replay `text` into tidy rows, filtered. Never throws. */
export function exportRows(text: string, filter: ExportFilter): ExportRow[] {
	const kinds = filter.kinds !== undefined ? new Set(filter.kinds) : undefined;
	const rows: ExportRow[] = [];
	for (const entry of replayHistory(text)) {
		if (entry.at === undefined) continue;
		if (kinds !== undefined && !kinds.has(entry.kind)) continue;
		const atMs = Date.parse(entry.at);
		if (filter.sinceMs !== undefined || filter.untilMs !== undefined) {
			if (Number.isNaN(atMs)) continue;
			if (filter.sinceMs !== undefined && atMs < filter.sinceMs) continue;
			if (filter.untilMs !== undefined) {
				if (filter.untilExclusive === true && atMs >= filter.untilMs) continue;
				if (filter.untilExclusive !== true && atMs > filter.untilMs) continue;
			}
		}
		const record = entry.record;
		const v2 = entry.envelope !== undefined;
		const git = v2 ? asObject(record.git) : undefined;
		const payload: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(record)) {
			if (!RESERVED_ENVELOPE_KEYS.has(key)) payload[key] = value;
		}
		const subject = subjectOf(record);
		const leaves: [string, number][] = [];
		numericLeaves(payload, "", leaves);
		leaves.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
		for (const [metric, value] of leaves) {
			rows.push({
				at: entry.at,
				date: entry.at.slice(0, 10),
				runId: v2 ? str(record.runId) : null,
				sha: git !== undefined ? str(git.sha) : null,
				branch: git !== undefined ? str(git.branch) : null,
				source: v2 ? str(record.source) : null,
				kind: entry.kind,
				subject,
				metric,
				value,
			});
		}
	}
	return rows;
}

export type ResolveUntilResult =
	| { kind: "ok"; untilMs: number; exclusive: boolean }
	| { kind: "error"; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolve `--until` with the `digest` grammar: a `YYYY-MM-DD` date covers that
 * whole UTC day (exclusive next-day bound); `<N>d`/`<N>w` is an inclusive instant.
 */
export function resolveUntil(raw: string, nowIso: string): ResolveUntilResult {
	const parsed = parseSince(raw, nowIso);
	if (parsed.kind !== "ok") return parsed;
	const ms = Date.parse(parsed.sinceIso);
	if (ISO_DATE.test(raw)) {
		return { kind: "ok", untilMs: ms + MS_PER_DAY, exclusive: true };
	}
	return { kind: "ok", untilMs: ms, exclusive: false };
}

/** Text cells that a spreadsheet would evaluate as a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function csvText(value: string | null): string {
	if (value === null) return "";
	const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(guarded)
		? `"${guarded.replaceAll('"', '""')}"`
		: guarded;
}

/** RFC 4180 CSV with a header row; text cells are formula-guarded. */
export function toCsv(rows: readonly ExportRow[]): string {
	const lines = [EXPORT_COLUMNS.join(",")];
	for (const row of rows) {
		lines.push(
			[
				csvText(row.at),
				csvText(row.date),
				csvText(row.runId),
				csvText(row.sha),
				csvText(row.branch),
				csvText(row.source),
				csvText(row.kind),
				csvText(row.subject),
				csvText(row.metric),
				String(row.value),
			].join(","),
		);
	}
	return `${lines.join("\n")}\n`;
}

/** One JSON object per row, keys in column order. Zero rows → "". */
export function toJsonl(rows: readonly ExportRow[]): string {
	return rows
		.map(
			(row) =>
				`${JSON.stringify({
					at: row.at,
					date: row.date,
					runId: row.runId,
					sha: row.sha,
					branch: row.branch,
					source: row.source,
					kind: row.kind,
					subject: row.subject,
					metric: row.metric,
					value: row.value,
				})}\n`,
		)
		.join("");
}
