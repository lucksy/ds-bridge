// `config show | set-library | add-product | list` — the first-class library/
// product-file management surface. Integration: drive the BUILT dist/cli.mjs via
// execFile (so the commander wiring + writeProjectConfig round-trip are exercised
// end-to-end), with a hermetic env — every inherited FIGMA_*/CLAUDE_PLUGIN_OPTION_*
// is stripped, and cwd is the temp dir so the .ds-bridge.env autoload can't leak the
// dev repo's own secret into a test.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ds-config-manage-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

/** A hermetic env: drop inherited Figma/plugin vars, then layer `extra` on top. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
	const base: NodeJS.ProcessEnv = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (k.startsWith("FIGMA_") || k.startsWith("CLAUDE_PLUGIN_OPTION_"))
			continue;
		if (v !== undefined) base[k] = v;
	}
	return { ...base, ...extra };
}

/** Run the built CLI in `dir` with a clean env; returns {code, stdout, stderr}. */
async function run(
	args: string[],
	extraEnv: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{
				cwd: dir,
				env: cleanEnv(extraEnv),
			},
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code?: number; stdout?: string; stderr?: string };
		return {
			code: e.code ?? 1,
			stdout: e.stdout ?? "",
			stderr: e.stderr ?? "",
		};
	}
}

const projectJson = async (): Promise<Record<string, unknown>> =>
	JSON.parse(await readFile(join(dir, ".ds-bridge.json"), "utf8"));

describe("config set-library", () => {
	it("normalizes a pasted URL to the bare key in committed .ds-bridge.json", async () => {
		const { code, stdout } = await run([
			"config",
			"set-library",
			"https://www.figma.com/design/xfXJSaAWt65rlq486RKvJB/Sahasra?m=auto",
			".",
		]);
		expect(code).toBe(0);
		expect(stdout).toContain("xfXJSaAWt65rlq486RKvJB");
		const json = await projectJson();
		expect(json.figma_file_key).toBe("xfXJSaAWt65rlq486RKvJB");
	});

	// Real-user finding: `config connect` writes the library key into
	// .ds-bridge.env, which outranks .ds-bridge.json — so set-library used to
	// report success while every command kept reading the old library.
	it("updates a stale library key that .ds-bridge.env holds, keeping the token", async () => {
		await writeFile(
			join(dir, ".ds-bridge.env"),
			"FIGMA_TOKEN=figd_test\nFIGMA_DESIGN_SYSTEM_FILE=OldLib0000000000000000\n",
		);
		const { code, stdout } = await run([
			"config",
			"set-library",
			"NewLib0000000000000000",
			".",
		]);
		expect(code).toBe(0);
		expect(stdout).toContain(".ds-bridge.env");
		expect(await readFile(join(dir, ".ds-bridge.env"), "utf8")).toBe(
			"FIGMA_TOKEN=figd_test\nFIGMA_DESIGN_SYSTEM_FILE=NewLib0000000000000000\n",
		);
		const show = await run(["config", "show", "."]);
		expect(show.stdout).toContain("NewLib0000000000000000");
	});

	it("warns when an environment variable still overrides the new key", async () => {
		const { code, stdout } = await run(
			["config", "set-library", "NewLib0000000000000000", "."],
			{ CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "PluginLib000000000000000" },
		);
		expect(code).toBe(0);
		expect(stdout).toContain("warning");
		expect(stdout).toContain("CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY");
	});
});

describe("config add-product", () => {
	it("merges multiple aliases and preserves figma_file_key", async () => {
		await run(["config", "set-library", "LibKey000000000000000000", "."]);
		await run([
			"config",
			"add-product",
			"web",
			"Web1product00000000000000",
			".",
		]);
		const { stdout } = await run([
			"config",
			"add-product",
			"mobile",
			"https://www.figma.com/design/Mob2product00000000000000/M",
			".",
		]);
		expect(stdout).toContain("mobile");

		const json = await projectJson();
		expect(json.figma_file_key).toBe("LibKey000000000000000000");
		expect(json.product_file_keys).toEqual({
			web: "Web1product00000000000000",
			mobile: "Mob2product00000000000000",
		});
	});

	it("updates an existing alias in place (no duplicate)", async () => {
		await run([
			"config",
			"add-product",
			"web",
			"Old1product00000000000000",
			".",
		]);
		const { stdout } = await run([
			"config",
			"add-product",
			"web",
			"New1product00000000000000",
			".",
		]);
		expect(stdout).toContain("Updated");
		const json = await projectJson();
		expect(json.product_file_keys).toEqual({
			web: "New1product00000000000000",
		});
	});
});

describe("config list", () => {
	it("lists the library default and product aliases", async () => {
		await run(["config", "set-library", "LibKey000000000000000000", "."]);
		await run([
			"config",
			"add-product",
			"web",
			"Web1product00000000000000",
			".",
		]);
		const { code, stdout } = await run(["config", "list", "."]);
		expect(code).toBe(0);
		expect(stdout).toContain("Library (default):");
		expect(stdout).toContain("LibKey000000000000000000");
		expect(stdout).toContain("web");
		expect(stdout).toContain("Web1product00000000000000");
	});
});

describe("config show", () => {
	it("masks the token and attributes each value to its winning source", async () => {
		await run(["config", "set-library", "LibKey000000000000000000", "."]);
		const { code, stdout } = await run(["config", "show", "."], {
			CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "figd_secret_value_9999",
			FIGMA_PRODUCT_FILE_ADMIN: "Adm3product00000000000000",
		});
		expect(code).toBe(0);
		// Token is masked — the raw secret never appears.
		expect(stdout).not.toContain("figd_secret_value_9999");
		expect(stdout).toContain("figd_…9999");
		expect(stdout).toContain("plugin dialog");
		// Library came from the committed file.
		expect(stdout).toContain("LibKey000000000000000000");
		expect(stdout).toContain(".ds-bridge.json (figma_file_key)");
		// The env-only product alias is attributed to the environment.
		expect(stdout).toContain("admin");
		expect(stdout).toContain("FIGMA_PRODUCT_FILE_ADMIN");
	});

	it("labels a .ds-bridge.env-backed token as coming from the file", async () => {
		await writeFile(
			join(dir, ".ds-bridge.env"),
			"FIGMA_TOKEN=figd_filebacked_token_1234\n",
			{ mode: 0o600 },
		);
		// No token in the env → the autoload hydrates it from the file.
		const { code, stdout } = await run(["config", "show", "."]);
		expect(code).toBe(0);
		expect(stdout).toContain("figd_…1234");
		expect(stdout).toContain(".ds-bridge.env");
	});

	it("exits 2 with a message on an invalid .ds-bridge.json", async () => {
		await writeFile(join(dir, ".ds-bridge.json"), "{ not valid json", "utf8");
		const { code, stderr } = await run(["config", "show", "."]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("json");
	});
});

describe("config connect --verify (non-TTY guard)", () => {
	it("still refuses without a TTY and writes nothing", async () => {
		const { code, stderr } = await run(["config", "connect", "--verify", "."]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("terminal");
		await expect(stat(join(dir, ".ds-bridge.env"))).rejects.toThrow();
	});
});
