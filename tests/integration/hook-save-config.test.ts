// M1.4 — integration: the SessionStart token-persistence NUDGE hook
// (scripts/hook-save-config.mjs). The hook is a thin, dependency-free
// stdin/stdout adapter that NEVER writes a secret (or any file): it reads a
// SessionStart payload ({ cwd, ... }), and ONLY when a Figma token is present in
// process.env AND <cwd>/.ds-bridge.env does not already carry a non-empty
// FIGMA_TOKEN, it emits a hookSpecificOutput block nudging the user toward
// `ds-bridge config persist-token`. It ALWAYS exits 0 and stays silent on
// everything else (no token in env, file already persisted, non-JSON stdin,
// errors). Crucially: running it must leave the temp dir untouched.
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const hookScript = join(repoRoot, "scripts", "hook-save-config.mjs");

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

/**
 * The hook's environment with all Figma config stripped, so tests are hermetic
 * regardless of the runner's own env (the nudge keys off these vars). Pass
 * overrides to opt a specific test INTO a token-in-env state.
 */
function baseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.FIGMA_TOKEN;
	delete env.CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN;
	delete env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY;
	delete env.FIGMA_DESIGN_SYSTEM_FILE;
	return { ...env, ...overrides };
}

/** Run the hook with the given stdin payload (+ env); resolve with code + stdout. */
function runHook(
	stdin: string,
	env: NodeJS.ProcessEnv = baseEnv(),
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolvePromise, reject) => {
		const child = execFile(
			process.execPath,
			[hookScript],
			{ env },
			(error, stdout, stderr) => {
				if (error && typeof error.code !== "number") {
					reject(error);
					return;
				}
				const code = error && typeof error.code === "number" ? error.code : 0;
				resolvePromise({ code, stdout, stderr });
			},
		);
		child.stdin?.end(stdin);
	});
}

interface HookOutput {
	hookSpecificOutput: { hookEventName: string; additionalContext: string };
}

describe("ds-bridge SessionStart token-persistence nudge hook (scripts/hook-save-config.mjs)", () => {
	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("(a) token in env + no .ds-bridge.env → SessionStart JSON nudging persist-token", async () => {
		const dir = await freshTmp("ds-save-nudge-");
		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(
			payload,
			baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_test_token" }),
		);
		expect(code).toBe(0);

		const parsed = JSON.parse(stdout) as HookOutput;
		expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
		expect(parsed.hookSpecificOutput.additionalContext).toContain(
			"config persist-token",
		);
		expect(parsed.hookSpecificOutput.additionalContext).toContain("62442");
		// The nudge must NEVER leak the secret value into context.
		expect(parsed.hookSpecificOutput.additionalContext).not.toContain(
			"figd_test_token",
		);

		// CRITICAL: the hook wrote nothing — the dir is still empty.
		const entries = await readdir(dir);
		expect(entries).toEqual([]);
	});

	it("(b) token in env via FIGMA_TOKEN (no plugin option) → still nudges", async () => {
		const dir = await freshTmp("ds-save-plainenv-");
		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(
			payload,
			baseEnv({ FIGMA_TOKEN: "figd_plain" }),
		);
		expect(code).toBe(0);

		const parsed = JSON.parse(stdout) as HookOutput;
		expect(parsed.hookSpecificOutput.additionalContext).toContain(
			"config persist-token",
		);
		expect(await readdir(dir)).toEqual([]);
	});

	it("(c) .ds-bridge.env already has a FIGMA_TOKEN → silent (self-resolved)", async () => {
		const dir = await freshTmp("ds-save-persisted-");
		await writeFile(
			join(dir, ".ds-bridge.env"),
			"FIGMA_TOKEN=figd_already_saved\n",
			"utf8",
		);
		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(
			payload,
			baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_test_token" }),
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("");
	});

	it("(d) .ds-bridge.env exists but FIGMA_TOKEN is empty → nudges (still not persisted)", async () => {
		const dir = await freshTmp("ds-save-emptytoken-");
		await writeFile(
			join(dir, ".ds-bridge.env"),
			"FIGMA_TOKEN=\nFIGMA_DESIGN_SYSTEM_FILE=somekey\n",
			"utf8",
		);
		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(
			payload,
			baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_test_token" }),
		);
		expect(code).toBe(0);

		const parsed = JSON.parse(stdout) as HookOutput;
		expect(parsed.hookSpecificOutput.additionalContext).toContain(
			"config persist-token",
		);
	});

	it("(e) no token in env → silent (nothing to persist)", async () => {
		const dir = await freshTmp("ds-save-notoken-");
		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(payload, baseEnv());
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("");
		expect(await readdir(dir)).toEqual([]);
	});

	it("(f) malformed stdin → exit 0, empty stdout", async () => {
		const { code, stdout } = await runHook(
			"not json",
			baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_test_token" }),
		);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("");
	});

	it("(g) the hook NEVER creates .ds-bridge.env, even when it nudges", async () => {
		const dir = await freshTmp("ds-save-nowrite-");
		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(
			payload,
			baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_test_token" }),
		);
		expect(code).toBe(0);
		// It nudged…
		expect(stdout).toContain("config persist-token");
		// …but did not write the secret file (or anything else).
		const entries = await readdir(dir);
		expect(entries).toEqual([]);
	});
});
