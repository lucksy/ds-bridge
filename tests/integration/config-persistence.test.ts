// M1.4 — integration: the built CLI's `config persist-token` command (the
// explicit, opt-in secret write for #62442). Claude Code does NOT persist a
// plugin's `sensitive` userConfig (the Figma PAT) across restarts — it lives only
// in the session's process.env (CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN). This command
// is the ONLY place the secret is written to disk, and ONLY when the user runs it.
//
// Contract under test:
//   • token in env → <path|cwd>/.ds-bridge.env gets FIGMA_TOKEN (+ file key when
//     present), mode 0600, stdout masks the token (full value never printed).
//   • MERGE, not clobber: a pre-existing unrelated key survives.
//   • no token in env → exit 2 with an actionable message, no file written.
//   • round-trip: after persist, the M1.1 dotenv loader hydrates process.env and
//     resolveConfig sees the token; a real-env value WINS over the file.
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/config.js";
import { loadDotenvInto, parseDotenv } from "../../src/io/dotenv.js";

// The CLI reads <cwd>/.ds-bridge.env and resolves "." against cwd, so run it from
// an empty dir: a checkout's own gitignored state (a real token, a registry) must
// not leak into what these tests assert.
const neutralCwd = mkdtempSync(join(tmpdir(), "ds-cli-cwd-"));

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

function isExecError(value: unknown): value is ExecResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		"stderr" in value
	);
}

/** Strip the runner's own Figma env so each test controls token presence. */
function baseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.FIGMA_TOKEN;
	delete env.CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN;
	delete env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY;
	delete env.FIGMA_DESIGN_SYSTEM_FILE;
	return { ...env, ...overrides };
}

/** Run the CLI with an explicit env; resolve with exit code + streams. */
async function run(
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<ExecResult> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ env, cwd: neutralCwd },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (isExecError(error)) return error;
		throw error;
	}
}

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ds-config-persist-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const envPath = (): string => join(dir, ".ds-bridge.env");

describe("ds-bridge config persist-token (built dist/cli.mjs)", () => {
	it("token in env → writes .ds-bridge.env with FIGMA_TOKEN, mode 0600, masked stdout", async () => {
		const token = "figd_secret_abcd1234";
		const result = await run(
			["config", "persist-token", dir],
			baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: token }),
		);
		expect(result.code).toBe(0);

		// The full secret is NEVER printed; a masked form is.
		expect(result.stdout).not.toContain(token);
		expect(result.stdout).toContain("1234"); // last 4 acceptable in the mask

		const text = await readFile(envPath(), "utf8");
		expect(parseDotenv(text).FIGMA_TOKEN).toBe(token);

		// 0600 — owner read/write only.
		const mode = (await stat(envPath())).mode & 0o777;
		expect(mode).toBe(0o600);
	});

	it("adds .ds-bridge.env to the project's .gitignore (idempotent) so the secret cannot be committed", async () => {
		await writeFile(join(dir, ".gitignore"), "node_modules\n");
		for (let i = 0; i < 2; i += 1) {
			const result = await run(
				["config", "persist-token", dir],
				baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_secret_1" }),
			);
			expect(result.code).toBe(0);
		}
		const lines = (await readFile(join(dir, ".gitignore"), "utf8")).split("\n");
		expect(lines).toContain("node_modules");
		expect(lines.filter((line) => line === ".ds-bridge.env")).toHaveLength(1);
	});

	it("file key present → also writes FIGMA_DESIGN_SYSTEM_FILE", async () => {
		const result = await run(
			["config", "persist-token", dir],
			baseEnv({
				CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_xyz",
				CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "filekey123",
			}),
		);
		expect(result.code).toBe(0);
		const parsed = parseDotenv(await readFile(envPath(), "utf8"));
		expect(parsed.FIGMA_TOKEN).toBe("figd_xyz");
		expect(parsed.FIGMA_DESIGN_SYSTEM_FILE).toBe("filekey123");
	});

	it("MERGE preserves a pre-existing unrelated key (no clobber)", async () => {
		await writeFile(
			envPath(),
			"UNRELATED_KEY=keepme\nFIGMA_TOKEN=old_should_be_replaced\n",
			"utf8",
		);
		const result = await run(
			["config", "persist-token", dir],
			baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_new" }),
		);
		expect(result.code).toBe(0);
		const parsed = parseDotenv(await readFile(envPath(), "utf8"));
		expect(parsed.UNRELATED_KEY).toBe("keepme");
		expect(parsed.FIGMA_TOKEN).toBe("figd_new");
	});

	it("is re-runnable (idempotent merge) and keeps mode 0600", async () => {
		const env = baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_rerun" });
		await run(["config", "persist-token", dir], env);
		const second = await run(["config", "persist-token", dir], env);
		expect(second.code).toBe(0);
		const parsed = parseDotenv(await readFile(envPath(), "utf8"));
		expect(parsed.FIGMA_TOKEN).toBe("figd_rerun");
		const mode = (await stat(envPath())).mode & 0o777;
		expect(mode).toBe(0o600);
	});

	it("no token in env → exit 2 with an actionable message, no file written", async () => {
		const result = await run(["config", "persist-token", dir], baseEnv());
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("/plugin configure");
		expect(result.stderr.toLowerCase()).toContain("no figma token");
		// Nothing was written.
		await expect(stat(envPath())).rejects.toThrow();
	});

	it("round-trip: persist → M1.1 loader hydrates → resolveConfig sees the token", async () => {
		const token = "figd_roundtrip_9876";
		await run(
			["config", "persist-token", dir],
			baseEnv({
				CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: token,
				CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "rtkey",
			}),
		);

		// Simulate a fresh, restarted session: no Figma values in env, then the
		// M1.1 loader hydrates from the file the command just wrote.
		const env: NodeJS.ProcessEnv = {};
		loadDotenvInto(envPath(), env);

		const resolved = resolveConfig({ env: env as Record<string, string> });
		expect(resolved.kind).toBe("ok");
		if (resolved.kind !== "ok") return;
		expect(resolved.config.figmaToken).toEqual({
			kind: "present",
			value: token,
		});
		expect(resolved.config.figmaFileKey).toBe("rtkey");
	});

	it("round-trip: a real-env token WINS over the persisted file (loader fills only unset)", async () => {
		const fileToken = "figd_from_file";
		await run(
			["config", "persist-token", dir],
			baseEnv({ CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: fileToken }),
		);

		// A live session already has a token in env; the loader must NOT overwrite it.
		const env: NodeJS.ProcessEnv = { FIGMA_TOKEN: "figd_live_env_wins" };
		loadDotenvInto(envPath(), env);
		expect(env.FIGMA_TOKEN).toBe("figd_live_env_wins");

		const resolved = resolveConfig({ env: env as Record<string, string> });
		expect(resolved.kind).toBe("ok");
		if (resolved.kind !== "ok") return;
		expect(resolved.config.figmaToken).toEqual({
			kind: "present",
			value: "figd_live_env_wins",
		});
	});
});
