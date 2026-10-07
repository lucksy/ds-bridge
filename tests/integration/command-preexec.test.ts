// Every slash command's `!` pre-exec line must survive real user input and
// real findings. Claude Code substitutes `$ARGUMENTS` as raw text into the
// shell line and aborts the whole command (no model turn) when that line
// exits non-zero. Two real-user failures drove this suite:
//   1. the CLI exits 1 on findings (lint violations, drift, failing contrast),
//      so an unguarded line kills /ds-lint exactly when there is something to say;
//   2. a pasted Figma URL carries `?node-id=…&t=…`, which zsh globs ("no
//      matches found") and every shell backgrounds at `&` when unquoted.
// The fix is scripts/run-cli.mjs: it receives the raw arguments as ONE
// single-quoted string, splits it itself, merges stderr and always exits 0.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const commandsDir = join(repoRoot, "commands");
const runCli = join(repoRoot, "scripts", "run-cli.mjs");

/** All `!` pre-exec lines (inline backtick form) in a command markdown. */
function preExecLines(md: string): string[] {
	return [...md.matchAll(/^!`(.+)`$/gm)].map((m) => m[1] as string);
}

/** Substitute `$ARGUMENTS` the way Claude Code does: raw text, no escaping. */
function substitute(line: string, args: string): string {
	return (
		line
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin-root placeholder in the command markdown
			.replaceAll("${CLAUDE_PLUGIN_ROOT}", repoRoot)
			.replaceAll("$ARGUMENTS", args)
	);
}

async function commandFiles(): Promise<{ name: string; md: string }[]> {
	const names = (await readdir(commandsDir)).filter((n) => n.endsWith(".md"));
	return Promise.all(
		names.map(async (name) => ({
			name,
			md: await readFile(join(commandsDir, name), "utf8"),
		})),
	);
}

const FIGMA_URL =
	"https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv/File?node-id=1-2&t=xyz";

describe("command pre-exec lines", () => {
	it("pass $ARGUMENTS only single-quoted, through scripts/run-cli.mjs", async () => {
		for (const { name, md } of await commandFiles()) {
			for (const line of preExecLines(md)) {
				if (!line.includes("$ARGUMENTS")) continue;
				expect(line, name).toMatch(
					/^node \$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/run-cli\.mjs (?:[a-z0-9-]+|"[a-z0-9-]+ [a-z0-9-]+") '\$ARGUMENTS'/,
				);
				expect(line.replaceAll("'$ARGUMENTS'", ""), name).not.toContain(
					"$ARGUMENTS",
				);
			}
		}
	});

	it("can never fail: wrapped by run-cli.mjs or guarded with || true", async () => {
		for (const { name, md } of await commandFiles()) {
			for (const line of preExecLines(md)) {
				const safe =
					line.includes("/scripts/run-cli.mjs ") || /\|\| true$/.test(line);
				expect(safe, `${name}: ${line}`).toBe(true);
			}
		}
	});
});

describe("scripts/run-cli.mjs", () => {
	it("splits one raw argument string and forwards the fixed flags after it", async () => {
		const { stdout } = await execFileAsync(
			"node",
			[
				runCli,
				"--echo-argv",
				"tokens check",
				`${FIGMA_URL}  --threshold 85`,
				"--format=json",
			],
			{ encoding: "utf8" },
		);
		expect(JSON.parse(stdout)).toEqual([
			"tokens",
			"check",
			FIGMA_URL,
			"--threshold",
			"85",
			"--format=json",
		]);
	});

	it("keeps double- or single-quoted segments together", async () => {
		const { stdout } = await execFileAsync(
			"node",
			[
				runCli,
				"--echo-argv",
				"changelog",
				`--since "2026-10-01" --audience 'designers'`,
			],
			{ encoding: "utf8" },
		);
		expect(JSON.parse(stdout)).toEqual([
			"changelog",
			"--since",
			"2026-10-01",
			"--audience",
			"designers",
		]);
	});

	it("passes no user arguments when $ARGUMENTS was empty", async () => {
		const { stdout } = await execFileAsync(
			"node",
			[runCli, "--echo-argv", "lint", "", "--format=json"],
			{ encoding: "utf8" },
		);
		expect(JSON.parse(stdout)).toEqual(["lint", "--format=json"]);
	});

	it("exits 0 with the CLI's stdout and stderr when the CLI reports findings or errors", async () => {
		// `handoff` with a URL but no token is a usage error (exit 2) in the CLI.
		const env = { ...process.env };
		for (const k of ["FIGMA_TOKEN", "CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN"]) {
			delete env[k];
		}
		const { stdout } = await execFileAsync(
			"node",
			[runCli, "handoff", FIGMA_URL, "--format=json"],
			{ encoding: "utf8", env, cwd: join(repoRoot, "tests", "fixtures") },
		);
		expect(stdout).toMatch(/token/i);
	});

	for (const shell of ["sh", "zsh"]) {
		it.skipIf(!existsSync(`/bin/${shell}`))(
			`a Figma URL with ? and & reaches the CLI intact under ${shell}`,
			async () => {
				const md = await readFile(join(commandsDir, "handoff-qa.md"), "utf8");
				const line = preExecLines(md)[0] as string;
				const env = { ...process.env };
				for (const k of ["FIGMA_TOKEN", "CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN"]) {
					delete env[k];
				}
				const { stdout, stderr } = await execFileAsync(
					`/bin/${shell}`,
					["-c", substitute(line, FIGMA_URL)],
					{ encoding: "utf8", env, cwd: join(repoRoot, "tests", "fixtures") },
				);
				expect(stderr).not.toMatch(/no matches found/);
				// The CLI ran and got as far as the token check (no shell error).
				expect(stdout).toMatch(/token/i);
			},
		);
	}
});
