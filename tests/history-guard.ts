// H11 — test-isolation guard helpers (SPEC-history-v2 §8.2). Pure-ish (one
// read): the vitest globalSetup snapshots the repository's own
// .ds-bridge/history.jsonl before the run and fails teardown when a test
// appended to / created / rewrote it. Never modifies the file.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** A point-in-time fingerprint of one history file. */
export interface HistorySnapshot {
	exists: boolean;
	size: number;
	sha256: string;
}

/** Fingerprint `path` (absent → `{exists:false,size:0,sha256:""}`). */
export function snapshotHistory(path: string): HistorySnapshot {
	let bytes: Buffer;
	try {
		bytes = readFileSync(path);
	} catch {
		return { exists: false, size: 0, sha256: "" };
	}
	return {
		exists: true,
		size: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

/** undefined when unchanged; else a message naming the file and the change. */
export function historyChangeMessage(
	before: HistorySnapshot,
	after: HistorySnapshot,
	path: string,
): string | undefined {
	if (before.exists === after.exists && before.sha256 === after.sha256) {
		return undefined;
	}
	const prefix = `A test wrote to the repository's own history file ${path}`;
	const hint =
		"Run history-writing CLIs with a temp cwd / project path, or pass --no-history (or another process wrote it during the run — rerun in isolation).";
	if (!before.exists) {
		return `${prefix} (created, ${after.size} bytes). ${hint}`;
	}
	if (!after.exists) return `${prefix} (deleted). ${hint}`;
	const delta = after.size - before.size;
	if (delta === 0) return `${prefix} (rewritten, same size). ${hint}`;
	const sign = delta > 0 ? "+" : "";
	return `${prefix} (${sign}${delta} bytes). ${hint}`;
}
