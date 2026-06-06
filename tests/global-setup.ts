// Vitest globalSetup — builds dist/cli.mjs exactly once per test run (T7.23).
// Integration tests spawn the built bundle; per-file `npm run build` calls used
// to race each other (tsup `clean: true` empties dist/ mid-run), which made any
// concurrently spawned CLI read a missing/partial bundle. One build, no race.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default async function buildCliOnce(): Promise<void> {
	await promisify(execFile)("npm", ["run", "build"], { cwd: repoRoot });
}
