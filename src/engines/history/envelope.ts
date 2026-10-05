// H1 — the v2 history envelope (SPEC-history-v2 §2). PURE: no fs/network/
// process access; the io edge (src/io/history-writer.ts) resolves the metadata
// (clock, git, tool version, env) and hands it in.
//
// The envelope is ADDITIVE and FLAT: `at` and `kind` stay top-level exactly
// where v1 put them, and the new keys sit beside them. Every reader in the tree
// reads payload fields by name, so a v2 line is a v1 line plus extra keys —
// readers need no version switch. `v` absent ⇒ v1.

/** Where a record was produced. */
export type HistorySource = "local" | "ci" | "hook";

/** The git context of the project at write time, or null outside a repo. */
export interface GitContext {
	sha: string;
	/** The current branch, or null when detached with no CI hint. */
	branch: string | null;
	/** Tracked changes outside `.ds-bridge/` at write time. */
	dirty: boolean;
}

/** The writing tool, or null when unknown (migrated v1 lines). */
export interface ToolInfo {
	version: string;
}

/** Metadata the io edge resolves for one append. */
export interface EnvelopeMeta {
	/** ISO instant used when the payload carries no string `at`. */
	now: string;
	source: HistorySource;
	git: GitContext | null;
	tool: ToolInfo | null;
	runId?: string;
}

/** The envelope fields of a v2 record (the payload follows them). */
export interface EnvelopeFields {
	v: 2;
	at: string;
	kind: string;
	source: HistorySource;
	git: GitContext | null;
	tool: ToolInfo | null;
	runId?: string;
}

/** Envelope keys a payload may not set (the envelope wins). */
export const RESERVED_ENVELOPE_KEYS: ReadonlySet<string> = new Set([
	"v",
	"at",
	"kind",
	"source",
	"git",
	"tool",
	"runId",
]);

/** The current history schema version. */
export const HISTORY_SCHEMA_VERSION = 2;

/** A history payload: the kind discriminator plus its own fields. */
export type HistoryPayload = { kind: string; at?: string } & Record<
	string,
	unknown
>;

/**
 * Wrap one kind payload in the v2 envelope: `{v, at, kind, source, git, tool,
 * runId?, ...payload}`. The payload's own `at` (its io-edge clock read) wins over
 * `meta.now`; reserved envelope keys inside the payload are dropped.
 */
export function buildEnvelope(
	payload: HistoryPayload,
	meta: EnvelopeMeta,
): EnvelopeFields & Record<string, unknown> {
	const at = typeof payload.at === "string" ? payload.at : meta.now;
	const record: EnvelopeFields & Record<string, unknown> = {
		v: 2,
		at,
		kind: payload.kind,
		source: meta.source,
		git: meta.git,
		tool: meta.tool,
	};
	if (meta.runId !== undefined) record.runId = meta.runId;
	Object.assign(record, payloadOf(payload));
	return record;
}

/**
 * A record's payload: every key except the envelope's ({@link
 * RESERVED_ENVELOPE_KEYS}), in source order. THE one way to strip an envelope.
 */
export function payloadOf(
	record: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	const payload: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (!RESERVED_ENVELOPE_KEYS.has(key)) payload[key] = value;
	}
	return payload;
}

/** Parse a raw source string, or undefined when it is not one of the three. */
export function parseSource(
	raw: string | undefined,
): HistorySource | undefined {
	return raw === "local" || raw === "ci" || raw === "hook" ? raw : undefined;
}

/**
 * Resolve the record source: an (already validated) flag > `DS_BRIDGE_SOURCE` >
 * `"local"`. An invalid env value falls back to local — envelope metadata must
 * never fail a write.
 */
export function resolveSource(
	flag: HistorySource | undefined,
	env: Record<string, string | undefined>,
): HistorySource {
	return flag ?? parseSource(env.DS_BRIDGE_SOURCE) ?? "local";
}

/** Longest accepted run id (keeps a hostile env from bloating every line). */
const MAX_RUN_ID_LENGTH = 128;

/** The batch run id from `DS_BRIDGE_RUN_ID`, or undefined when absent/invalid. */
export function resolveRunId(
	env: Record<string, string | undefined>,
): string | undefined {
	const raw = env.DS_BRIDGE_RUN_ID;
	if (raw === undefined) return undefined;
	const trimmed = raw.trim();
	if (trimmed === "" || trimmed.length > MAX_RUN_ID_LENGTH) return undefined;
	return trimmed;
}

/** The tolerant envelope view of a parsed v2 record (payload excluded). */
export interface RecordEnvelope {
	v: number;
	source?: HistorySource;
	runId?: string;
	git?: GitContext | null;
	tool?: ToolInfo | null;
}

function parseGit(value: unknown): GitContext | null {
	if (typeof value !== "object" || value === null) return null;
	const g = value as Record<string, unknown>;
	if (typeof g.sha !== "string") return null;
	return {
		sha: g.sha,
		branch: typeof g.branch === "string" ? g.branch : null,
		dirty: g.dirty === true,
	};
}

function parseTool(value: unknown): ToolInfo | null {
	if (typeof value !== "object" || value === null) return null;
	const t = value as Record<string, unknown>;
	return typeof t.version === "string" ? { version: t.version } : null;
}

/**
 * The envelope of a parsed record when it is v2+ (a numeric `v ≥ 2`), else
 * undefined (v1). Malformed fields are dropped (`source`/`runId`) or nulled
 * (`git`/`tool`) — never thrown.
 */
export function envelopeOf(
	record: Record<string, unknown>,
): RecordEnvelope | undefined {
	const v = record.v;
	if (typeof v !== "number" || !Number.isFinite(v) || v < 2) return undefined;
	const env: RecordEnvelope = { v };
	const source = parseSource(
		typeof record.source === "string" ? record.source : undefined,
	);
	if (source !== undefined) env.source = source;
	if (typeof record.runId === "string" && record.runId !== "") {
		env.runId = record.runId;
	}
	if ("git" in record) env.git = parseGit(record.git);
	if ("tool" in record) env.tool = parseTool(record.tool);
	return env;
}
