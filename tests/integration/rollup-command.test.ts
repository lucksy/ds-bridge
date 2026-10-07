// S1 (SPEC-analytics-surfaces §2) — `/ds-bridge:rollup`: an inline wrapper whose
// pre-exec line prints the local org rollup as paste-ready Markdown. Temp dirs
// only; nothing is written into any source repo.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const commandPath = join(repoRoot, "commands", "rollup.md");
const ENV = { SOURCE_DATE_EPOCH: "1791201600" }; // 2026-10-05T12:00:00Z

const tmpDirs: string[] = [];
afterAll(async () => {
	await Promise.all(
		tmpDirs.map((d) => rm(d, { recursive: true, force: true })),
	);
});

/** The `!` pre-exec line of the command markdown. */
function preExecLine(md: string): string {
	const match = md.match(/^!`(.+)`$/m);
	if (match === null) throw new Error("no pre-exec line");
	return match[1] as string;
}

async function seedRepo(root: string, name: string, score: number) {
	const dir = join(root, name);
	await mkdir(join(dir, ".ds-bridge"), { recursive: true });
	const line = JSON.stringify({
		at: "2026-10-01T00:00:00Z",
		kind: "handoff",
		score,
		frameName: "F",
	});
	await writeFile(join(dir, ".ds-bridge", "history.jsonl"), `${line}\n`);
	return dir;
}

describe("commands/rollup.md (S1)", () => {
	it("is a frontmatter wrapper that pre-executes the md rollup via the plugin root", async () => {
		const md = await readFile(commandPath, "utf8");
		expect(md).toMatch(/^---\n[\s\S]*description:/);
		expect(md).toContain("argument-hint:");
		expect(preExecLine(md)).toBe(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin-root placeholder in the command markdown
			"node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs rollup '$ARGUMENTS' --format md",
		);
	});

	it("explains the config, the fetch-first rule and stays local-only", async () => {
		const md = await readFile(commandPath, "utf8");
		expect(md).toContain(".ds-bridge/rollup.json");
		expect(md).toContain("git fetch");
		expect(md).toContain("--view org");
		expect(md).toContain("## Rules");
		expect(md).toMatch(/never (?:fetch|write)/i);
		expect(md.toLowerCase()).not.toContain("hosted dashboard");
	});

	it("the exact pre-exec line ranks the repos from a rollup config", async () => {
		const md = await readFile(commandPath, "utf8");
		const root = await mkdtemp(join(tmpdir(), "ds-rollup-cmd-"));
		tmpDirs.push(root);
		await seedRepo(root, "web", 90);
		await seedRepo(root, "ios", 60);
		const hub = join(root, "hub");
		await mkdir(join(hub, ".ds-bridge"), { recursive: true });
		await writeFile(
			join(hub, ".ds-bridge", "rollup.json"),
			JSON.stringify([
				{ name: "web", source: "../web" },
				{ name: "ios", source: "../ios", team: "Mobile" },
			]),
		);
		const env = { ...process.env, ...ENV, CLAUDE_PLUGIN_ROOT: repoRoot };
		const { stdout } = await execFileAsync(
			"sh",
			["-c", preExecLine(md).replace("$ARGUMENTS", "")],
			{
				cwd: hub,
				env,
				encoding: "utf8",
			},
		);
		expect(stdout).toContain("## Design-system org rollup");
		const web = stdout.indexOf("| 1 | web |");
		const ios = stdout.indexOf("| 2 | ios · Mobile |");
		expect(web).toBeGreaterThan(-1);
		expect(ios).toBeGreaterThan(web);
	});
});
