// L2 — figma response cache helper. Impure io edge: the raw `getFile` response
// is cached on disk so the library-health CLI re-crawls only when stale or
// forced. Every effect (fs ops, clock, env, cwd) is INJECTED so the
// path-resolution + TTL logic is unit-tested against a fake fs and fixed `now`
// numbers — never the real Date or disk.
//
// The only precedent is the inline impact.ts cursor helpers (impact.ts:136-166):
// CLAUDE_PLUGIN_DATA when set, else <cwd>/.ds-bridge/cache/. There is no shared
// cache module, so this is the first member of that pattern made injectable.
//
// Discipline: this helper NEVER throws. A read failure (absent / unparseable /
// fs error) is a miss; a write failure (mkdir or write) is swallowed silently —
// a cache miss on the next crawl is an acceptable outcome.
import { dirname, join } from "node:path";

/**
 * The minimal fs surface the cache needs, injected so unit tests use an
 * in-memory fake. The CLI passes a thin wrapper over node:fs.
 */
export interface CacheFs {
	exists: (path: string) => boolean;
	read: (path: string) => string;
	mkdir: (path: string) => void;
	write: (path: string, content: string) => void;
}

/** The subset of process.env this helper reads. */
export interface CacheEnv {
	CLAUDE_PLUGIN_DATA?: string;
}

/** The on-disk envelope: the raw data plus the clock stamp at write time. */
interface CacheEnvelope {
	stampedAtMs: number;
	data: unknown;
}

/** The outcome of a cache read, discriminated by `kind`. */
export type ReadCacheResult =
	| { kind: "hit"; data: unknown; ageMs: number }
	| { kind: "miss" }
	| { kind: "stale"; ageMs: number };

/**
 * Resolve the cache file path: CLAUDE_PLUGIN_DATA/figma/library-<key>.json when
 * that env is set (and non-empty), else <cwd>/.ds-bridge/cache/library-<key>.json
 * — mirrors the impact.ts cursor fallback.
 */
export function cachePath(args: {
	key: string;
	env: CacheEnv;
	cwd: string;
}): string {
	const fileName = `library-${args.key}.json`;
	const dataDir = args.env.CLAUDE_PLUGIN_DATA;
	if (dataDir !== undefined && dataDir !== "") {
		return join(dataDir, "figma", fileName);
	}
	return join(args.cwd, ".ds-bridge", "cache", fileName);
}

/** Type guard: a parsed value is a usable envelope (numeric stamp present). */
function isEnvelope(value: unknown): value is CacheEnvelope {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { stampedAtMs?: unknown }).stampedAtMs === "number"
	);
}

/**
 * Read + classify the cache: hit (fresh) | stale (past TTL) | miss (absent /
 * unparseable / unreadable). Age is `now - stampedAtMs`; the boundary
 * `age === ttlMs` counts as a hit. Never throws.
 */
export function readCache(args: {
	key: string;
	env: CacheEnv;
	cwd: string;
	fs: CacheFs;
	now: number;
	ttlMs: number;
}): ReadCacheResult {
	const path = cachePath({ key: args.key, env: args.env, cwd: args.cwd });
	if (!args.fs.exists(path)) return { kind: "miss" };
	let envelope: CacheEnvelope;
	try {
		const parsed: unknown = JSON.parse(args.fs.read(path));
		if (!isEnvelope(parsed)) return { kind: "miss" };
		envelope = parsed;
	} catch {
		return { kind: "miss" };
	}
	const ageMs = args.now - envelope.stampedAtMs;
	if (ageMs > args.ttlMs) return { kind: "stale", ageMs };
	return { kind: "hit", data: envelope.data, ageMs };
}

/**
 * Write the stamped envelope, creating parent dirs first. Both the mkdir and
 * the write are best-effort: any failure is swallowed (a later cache miss is
 * acceptable). Never throws.
 */
export function writeCache(args: {
	key: string;
	env: CacheEnv;
	cwd: string;
	fs: CacheFs;
	now: number;
	data: unknown;
}): void {
	const path = cachePath({ key: args.key, env: args.env, cwd: args.cwd });
	const envelope: CacheEnvelope = { stampedAtMs: args.now, data: args.data };
	try {
		args.fs.mkdir(dirname(path));
		args.fs.write(path, `${JSON.stringify(envelope, null, 2)}\n`);
	} catch {
		// Swallow: a cache miss on the next crawl is an acceptable outcome.
	}
}
