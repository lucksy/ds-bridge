// H3 — integration: a spawned command writes a v2-enveloped history line through
// the single writer, honoring DS_BRIDGE_SOURCE / DS_BRIDGE_RUN_ID, with git:null
// outside a repo and the real git context inside one.
import { execFile, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const sampleProject = join(repoRoot, "tests", "fixtures", "sample-project");
const pkg = JSON.parse(
	await readFile(join(repoRoot, "package.json"), "utf8"),
) as { version: string };

const tmpDirs: string[] = [];
async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}
afterAll(async () => {
	for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
});

async function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<number> {
	try {
		await execFileAsync(process.execPath, [cliPath, ...args], {
			encoding: "utf8",
			env,
		});
		return 0;
	} catch (error) {
		return (error as { code: number }).code;
	}
}

async function readRecords(dir: string): Promise<Record<string, unknown>[]> {
	const text = await readFile(join(dir, ".ds-bridge", "history.jsonl"), "utf8");
	return text
		.split("\n")
		.filter((l) => l.trim() !== "")
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.DS_BRIDGE_SOURCE;
	delete env.DS_BRIDGE_RUN_ID;
	return { ...env, ...extra };
}

describe("history v2 envelope via the CLI (H3)", () => {
	it("a directory lint writes a v2 line: source/runId from env, git null outside a repo", async () => {
		const dir = await freshTmp("ds-env-lint-");
		await cp(sampleProject, dir, { recursive: true });
		const code = await runCli(
			["lint", dir, "--tokens", join(dir, "tokens.json")],
			cleanEnv({ DS_BRIDGE_SOURCE: "ci", DS_BRIDGE_RUN_ID: "run-abc" }),
		);
		expect(code).toBe(1);
		const [record] = await readRecords(dir);
		expect(record?.v).toBe(2);
		expect(record?.kind).toBe("lint");
		expect(record?.source).toBe("ci");
		expect(record?.runId).toBe("run-abc");
		expect(record?.git).toBeNull();
		expect(record?.tool).toEqual({ version: pkg.version });
		// The payload is unchanged.
		expect(record?.byKind).toEqual({ exact: 3, near: 3, offSystem: 1 });
	});

	it("defaults to source local, no runId, and records the git context in a repo", async () => {
		const dir = await freshTmp("ds-env-git-");
		await cp(sampleProject, dir, { recursive: true });
		const git = (args: string[]) =>
			spawnSync("git", args, { cwd: dir, encoding: "utf8" });
		git(["init", "-q", "-b", "main"]);
		git(["add", "."]);
		git([
			"-c",
			"user.name=t",
			"-c",
			"user.email=t@t",
			"commit",
			"-q",
			"-m",
			"init",
		]);
		const sha = git(["rev-parse", "HEAD"]).stdout.trim();

		await runCli(
			["lint", dir, "--tokens", join(dir, "tokens.json")],
			cleanEnv(),
		);
		const [record] = await readRecords(dir);
		expect(record?.source).toBe("local");
		expect(record).not.toHaveProperty("runId");
		// The (uncommitted) history file itself does not make the run dirty.
		expect(record?.git).toEqual({ sha, branch: "main", dirty: false });
	});
});
