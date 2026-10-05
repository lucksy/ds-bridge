// Vitest globalSetup — builds dist/cli.mjs exactly once per test run (T7.23).
// Integration tests spawn the built bundle; per-file `npm run build` calls used
// to race each other (tsup `clean: true` empties dist/ mid-run), which made any
// concurrently spawned CLI read a missing/partial bundle. One build, no race.
//
// H11 (SPEC-history-v2 §8.2): also snapshots the repository's own
// .ds-bridge/history.jsonl and fails the run in teardown when a test wrote to
// it (tests must use a temp cwd / project path or --no-history).
import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { historyChangeMessage, snapshotHistory } from "./history-guard.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const repoHistory = join(repoRoot, ".ds-bridge", "history.jsonl");

export default async function buildCliOnce(): Promise<() => void> {
	const before = snapshotHistory(repoHistory);
	await promisify(execFile)("npm", ["run", "build"], { cwd: repoRoot });
	return function assertRepoHistoryUntouched(): void {
		const message = historyChangeMessage(
			before,
			snapshotHistory(repoHistory),
			repoHistory,
		);
		if (message === undefined) return;
		// Vitest reports a teardown throw as "error during close" but keeps exit
		// 0, so set the exit code explicitly before throwing.
		process.exitCode = 1;
		throw new Error(message);
	};
}
