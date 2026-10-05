// H3 — THE single history writer (SPEC-history-v2 §1.2). Every record appended
// to `.ds-bridge/history.jsonl` goes through `appendHistoryRecord`, which wraps
// the kind payload in the v2 envelope (src/engines/history/envelope.ts) and
// writes ONE line under an advisory lock shared with `history compact|migrate`.
//
// Impure io edge, but deliberately forgiving: envelope METADATA never fails a
// write — git absent / not a repo → `git: null`, an unreadable package.json →
// `tool: null`, a held lock → append anyway after a short wait (a single
// O_APPEND line write; losing a measurement is worse than a rare interleave).
// Only the append itself (mkdir / write) can throw, exactly as the per-command
// `appendFileSync` calls it replaces did.
import {
	appendFileSync,
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	buildEnvelope,
	type GitContext,
	type HistoryPayload,
	type HistorySource,
	resolveRunId,
	resolveSource,
} from "../engines/history/envelope.js";
import { type GitExec, spawnGitExec } from "./git-log.js";

/** The history file name inside the state dir. */
export const HISTORY_FILE = "history.jsonl";
/** The advisory lock file name inside the state dir. */
export const LOCK_FILE = "history.jsonl.lock";

/** Default wait for the lock before an append proceeds anyway. */
const DEFAULT_LOCK_TIMEOUT_MS = 2000;
/** A lock older than this is considered abandoned (crashed writer). */
const DEFAULT_LOCK_STALE_MS = 10_000;
/** Poll interval while waiting for the lock. */
const LOCK_POLL_MS = 25;

type Env = Record<string, string | undefined>;

/** Injectable seams for one append (all default to the real process). */
export interface HistoryWriteOptions {
	/** Environment for DS_BRIDGE_SOURCE / DS_BRIDGE_RUN_ID / GitHub hints. */
	env?: Env;
	/** Git runner (default: real git via spawnSync). */
	exec?: GitExec;
	/** Tool version override; `null` records an unknown tool. */
	toolVersion?: string | null;
	/** Clock for records whose payload carries no `at`. */
	now?: () => string;
	/** A validated source flag (record --source) — beats the env. */
	source?: HistorySource;
	/** How long to wait for the lock before appending anyway. */
	lockTimeoutMs?: number;
}

/** Absolute path of the history file for a state dir. */
export function historyFilePath(stateDir: string): string {
	return join(stateDir, HISTORY_FILE);
}

/** Block the thread for `ms` (sync writers have no event loop to yield to). */
function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let cachedToolVersion: string | null | undefined;

/**
 * The ds-bridge package version, found by walking up from this module to the
 * first `package.json` named `ds-bridge` (works from `src/io/` under tsx and from
 * the bundled `dist/` chunks alike). `null` when none is found. Cached.
 */
export function resolveToolVersion(): string | null {
	if (cachedToolVersion !== undefined) return cachedToolVersion;
	cachedToolVersion = null;
	try {
		let dir = dirname(fileURLToPath(import.meta.url));
		for (let depth = 0; depth < 6; depth += 1) {
			const candidate = join(dir, "package.json");
			if (existsSync(candidate)) {
				const pkg = JSON.parse(readFileSync(candidate, "utf8")) as {
					name?: unknown;
					version?: unknown;
				};
				if (pkg.name === "ds-bridge" && typeof pkg.version === "string") {
					cachedToolVersion = pkg.version;
					break;
				}
			}
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	} catch {
		cachedToolVersion = null;
	}
	return cachedToolVersion;
}

/** True when a porcelain status line names a path outside any `.ds-bridge/`. */
function countsAsDirty(line: string): boolean {
	if (line.trim() === "") return false;
	const path = line.slice(3);
	return !path.split(" -> ").every((p) => p.includes(".ds-bridge/"));
}

/**
 * The project's git context, or null outside a repo. Never throws. `dirty`
 * ignores `.ds-bridge/` paths — the history file itself is usually uncommitted,
 * and must not mark every local run dirty. A detached HEAD (CI checkouts) falls
 * back to `GITHUB_HEAD_REF` / `GITHUB_REF_NAME`, else null.
 */
export function readGitContext(
	projectDir: string,
	exec: GitExec = spawnGitExec,
	env: Env = process.env,
): GitContext | null {
	try {
		const head = exec(["rev-parse", "HEAD"], projectDir);
		if (head.error !== undefined || head.status !== 0) return null;
		const sha = head.stdout.trim();
		if (sha === "") return null;

		const ref = exec(["rev-parse", "--abbrev-ref", "HEAD"], projectDir);
		let branch: string | null =
			ref.status === 0 && ref.error === undefined ? ref.stdout.trim() : null;
		if (branch === "HEAD" || branch === "") {
			branch =
				(env.GITHUB_HEAD_REF !== undefined && env.GITHUB_HEAD_REF !== ""
					? env.GITHUB_HEAD_REF
					: undefined) ??
				(env.GITHUB_REF_NAME !== undefined && env.GITHUB_REF_NAME !== ""
					? env.GITHUB_REF_NAME
					: undefined) ??
				null;
		}

		const status = exec(
			["status", "--porcelain", "--untracked-files=no"],
			projectDir,
		);
		const dirty =
			status.status === 0 && status.error === undefined
				? status.stdout.split("\n").some(countsAsDirty)
				: false;
		return { sha, branch, dirty };
	} catch {
		return null;
	}
}

/**
 * Take the advisory history lock (`O_EXCL` create of history.jsonl.lock). A lock
 * older than `staleMs` is taken over. Returns a release function, or undefined
 * when the lock stayed held for `timeoutMs`.
 */
export function acquireHistoryLock(
	stateDir: string,
	options: { timeoutMs?: number; staleMs?: number } = {},
): (() => void) | undefined {
	const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
	const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
	const lockPath = join(stateDir, LOCK_FILE);
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			const fd = openSync(lockPath, "wx");
			writeFileSync(fd, `${process.pid}\n`);
			closeSync(fd);
			return () => {
				try {
					unlinkSync(lockPath);
				} catch {
					// Already gone — nothing to release.
				}
			};
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EEXIST") return undefined;
		}
		// Held: take over a stale lock, else wait (bounded).
		try {
			if (Date.now() - statSync(lockPath).mtimeMs > staleMs) {
				unlinkSync(lockPath);
				continue;
			}
		} catch {
			continue; // vanished between open and stat — retry immediately
		}
		if (Date.now() >= deadline) return undefined;
		sleepSync(LOCK_POLL_MS);
	}
}

/**
 * Append ONE v2-enveloped record to `<stateDir>/history.jsonl` (creating the
 * dir). The payload's own `at` wins; envelope metadata is resolved here and
 * never throws. Returns the record exactly as written.
 */
export function appendHistoryRecord<T extends { kind: string; at?: string }>(
	stateDir: string,
	payload: T,
	options: HistoryWriteOptions = {},
): Record<string, unknown> {
	const env = options.env ?? process.env;
	const runId = resolveRunId(env);
	const record = buildEnvelope(payload as unknown as HistoryPayload, {
		now: options.now !== undefined ? options.now() : new Date().toISOString(),
		source: resolveSource(options.source, env),
		git: readGitContext(dirname(stateDir), options.exec, env),
		tool: (() => {
			const version =
				options.toolVersion !== undefined
					? options.toolVersion
					: resolveToolVersion();
			return version === null ? null : { version };
		})(),
		...(runId !== undefined ? { runId } : {}),
	});

	mkdirSync(stateDir, { recursive: true });
	const release = acquireHistoryLock(stateDir, {
		timeoutMs: options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS,
	});
	try {
		appendFileSync(
			historyFilePath(stateDir),
			`${JSON.stringify(record)}\n`,
			"utf8",
		);
	} finally {
		release?.();
	}
	return record;
}

/**
 * Replace the whole history file atomically (temp file in the same dir +
 * rename). The CALLER holds the lock (compact/migrate).
 */
export function rewriteHistoryAtomic(stateDir: string, text: string): void {
	const target = historyFilePath(stateDir);
	const temp = join(stateDir, `.${HISTORY_FILE}.tmp-${process.pid}`);
	try {
		writeFileSync(temp, text, "utf8");
		renameSync(temp, target);
	} catch (error) {
		try {
			unlinkSync(temp);
		} catch {
			// best effort
		}
		throw error;
	}
}
