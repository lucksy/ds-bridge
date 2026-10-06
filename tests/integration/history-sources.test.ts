// H16 (SPEC-history-v2 §9.3) — which writers emit which `source`. `local` is the
// default for every hand-run check; `ci` comes only from the composite action
// (`record --source ci`); `hook` is RESERVED — no shipped hook records history
// (the PostToolUse hook lints single files, which never record; the
// SessionStart hooks never spawn the CLI). A scan pins that so a future hook
// that starts recording has to update the spec first.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const SCAN_ROOTS = ["scripts", "hooks", ".github", "examples"];
const SKIP = new Set(["node_modules", "vendor"]);

function files(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		if (SKIP.has(name)) continue;
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...files(full));
		else out.push(full);
	}
	return out;
}

const HOOK_SOURCE =
	/DS_BRIDGE_SOURCE\s*[=:]\s*["']?hook\b|--source[= ]["']?hook\b|source:\s*["']hook["']/;

describe("history source writers (H16)", () => {
	it("no shipped script, hook, workflow or example writes source: hook", () => {
		const offenders: string[] = [];
		for (const root of SCAN_ROOTS) {
			for (const file of files(join(repoRoot, root))) {
				const text = readFileSync(file, "utf8");
				if (HOOK_SOURCE.test(text)) offenders.push(relative(repoRoot, file));
			}
		}
		expect(offenders).toEqual([]);
	});

	it("the CI action records with --source ci", () => {
		const yml = readFileSync(
			join(repoRoot, ".github", "actions", "ds-bridge-record", "action.yml"),
			"utf8",
		);
		expect(yml).toMatch(/record "\$PROJECT" --source ci/);
	});
});
