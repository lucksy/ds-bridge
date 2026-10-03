#!/usr/bin/env node
// Runs the insights mod's tests (mod-tests/) under `claude plugin test`.
//
// `claude plugin test <dir>` loads every *.test.ts under <dir> in the mod sandbox,
// which would include this repo's vitest suite (tests/, e2e/), and those files can't
// load there. So this stages the mod, the manifest and the sources it imports into a
// temporary folder, validates it, and runs the mod's tests there. `npm test` stays
// the vitest suite.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// What the mod is made of: never .ds-bridge.env, .mcp.json or settings files.
const PARTS = [
	".claude-plugin/plugin.json",
	"hooks",
	"types",
	"src",
	"mod-tests",
];

const stage = mkdtempSync(join(tmpdir(), "ds-bridge-mod-"));
let status = 1;
try {
	for (const part of PARTS)
		cpSync(join(root, part), join(stage, part), { recursive: true });
	for (const args of [
		["plugin", "validate", join(stage, ".claude-plugin", "plugin.json")],
		["plugin", "test", stage],
	]) {
		const run = spawnSync("claude", args, { stdio: "inherit" });
		status = run.status ?? 1;
		if (run.error) console.error(`could not run claude: ${run.error.message}`);
		if (status !== 0) break;
	}
} finally {
	rmSync(stage, { recursive: true, force: true });
}
process.exit(status);
