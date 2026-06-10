// M13.1 — C12 `/ds-bridge:library-health` slash wrapper. The command file is
// frontmatter + a `${CLAUDE_PLUGIN_ROOT}` CLI invocation (no code); it narrates
// `library-health --format=json` and MUST preserve the detached-candidate
// heuristic caveat verbatim. Plus a flag-surface smoke against the built CLI.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const commandPath = join(repoRoot, "commands", "library-health.md");

describe("commands/library-health.md (C12, M13.1)", () => {
	it("is a frontmatter + CLI-invocation wrapper, no inline code logic", async () => {
		const md = await readFile(commandPath, "utf8");
		// Frontmatter with a description + argument-hint.
		expect(md).toMatch(/^---\n[\s\S]*description:/);
		expect(md).toContain("argument-hint:");
		// Invokes the built CLI via the plugin root, in --format=json.
		expect(md).toContain("${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs library-health");
		expect(md).toContain("--format=json");
	});

	it("preserves the detached-candidate heuristic caveat verbatim", async () => {
		const md = await readFile(commandPath, "utf8");
		expect(md).toContain(
			"REST cannot truly detect detachment; expect false positives",
		);
	});

	it("narrates the JSON shape + points at the dashboard panels", async () => {
		const md = await readFile(commandPath, "utf8");
		expect(md).toContain("overrideHotspots");
		expect(md).toContain("deprecatedUsage");
		expect(md).toContain("detachedCandidates");
		expect(md.toLowerCase()).toContain("dashboard");
	});
});

interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

function isExecError(value: unknown): value is ExecResult {
	return typeof value === "object" && value !== null && "code" in value;
}

describe("ds-bridge library-health flag surface (built dist/cli.mjs)", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "ds-libhealth-cmd-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("accepts --format=json and exits 2 with guidance when no file key is set", async () => {
		// Hermetic env: strip every Figma file-key/token source so the no-key guard
		// fires deterministically regardless of the developer's shell.
		const env = { ...process.env };
		for (const k of [
			"FIGMA_FILE_KEY",
			"FIGMA_DESIGN_SYSTEM_FILE",
			"CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY",
			"FIGMA_TOKEN",
			"CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN",
		]) {
			delete env[k];
		}
		const result: ExecResult = await new Promise((resolveP) => {
			execFileAsync(
				process.execPath,
				[cliPath, "library-health", "--format=json", "--refresh"],
				{ cwd: dir, env },
			)
				.then(({ stdout, stderr }) => resolveP({ code: 0, stdout, stderr }))
				.catch((error: unknown) => {
					if (isExecError(error)) resolveP(error);
					else throw error;
				});
		});
		// No Figma file key / token → exit 2 with connect-Figma guidance (the flags
		// --format/--refresh parsed cleanly; the command is registered).
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("figma");
	});
});
