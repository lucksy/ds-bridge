// T2.6 — integration: the PostToolUse lint hook adapter (scripts/hook-lint.mjs).
// The hook is a thin stdin/stdout adapter over the built `lint` command: it reads
// a PostToolUse payload, spawns dist/cli.mjs lint <file> --format=json with the
// payload's cwd (so token discovery works), and on findings emits a
// hookSpecificOutput block. It ALWAYS exits 0 and stays silent on anything it
// cannot handle (non-JSON, missing/ignored file, no tokens, errors, timeouts).
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const hookScript = join(repoRoot, "scripts", "hook-lint.mjs");
const sampleProject = join(repoRoot, "tests", "fixtures", "sample-project");

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

/** Run the hook with the given stdin payload; resolve with code + stdout. */
function runHook(
	stdin: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolvePromise, reject) => {
		const child = execFile(
			process.execPath,
			[hookScript],
			(error, stdout, stderr) => {
				// execFile reports a non-zero exit via `error`; the hook should always
				// exit 0, but resolve with whatever code surfaced so we can assert it.
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

describe("ds-bridge PostToolUse lint hook (scripts/hook-lint.mjs)", () => {
	beforeAll(async () => {
		await execFileAsync("npm", ["run", "build"], { cwd: repoRoot });
	}, 120_000);

	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("(a) Write to a .css file with findings → exit 0, hookSpecificOutput JSON", async () => {
		const buttonCss = join(sampleProject, "src", "button.css");
		const payload = JSON.stringify({
			tool_name: "Write",
			tool_input: { file_path: buttonCss },
			cwd: sampleProject,
		});
		const { code, stdout } = await runHook(payload);
		expect(code).toBe(0);

		const parsed = JSON.parse(stdout) as {
			hookSpecificOutput: {
				hookEventName: string;
				additionalContext: string;
			};
		};
		expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
		expect(parsed.hookSpecificOutput.additionalContext).toContain("#3b82f6");
	});

	it("(b) a non-lintable extension (.md) → exit 0, empty stdout", async () => {
		const payload = JSON.stringify({
			tool_name: "Edit",
			tool_input: { file_path: join(sampleProject, "README.md") },
			cwd: sampleProject,
		});
		const { code, stdout } = await runHook(payload);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("");
	});

	it("(c) a real .css file but cwd has no token source → exit 0, empty stdout", async () => {
		const dir = await freshTmp("ds-hook-notoken-");
		const cssPath = join(dir, "a.css");
		await writeFile(cssPath, ".x { color: #3b82f6; }\n", "utf8");
		const payload = JSON.stringify({
			tool_name: "Write",
			tool_input: { file_path: cssPath },
			cwd: dir,
		});
		const { code, stdout } = await runHook(payload);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("");
	});

	it("(d) non-JSON stdin → exit 0, empty stdout", async () => {
		const { code, stdout } = await runHook("not json");
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("");
	});
});
