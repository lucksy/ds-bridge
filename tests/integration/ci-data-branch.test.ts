// H8 — integration: scripts/ci-data-branch.mjs against a LOCAL bare remote (no
// network). seed pulls the CI series from the data branch into the working
// tree; publish commits it back with plumbing (working tree + default branch
// untouched), merges append-only on a concurrent push, and refuses to ever
// write the default branch.
import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const script = join(repoRoot, "scripts", "ci-data-branch.mjs");
const tmpDirs: string[] = [];

afterAll(() => {
	for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

const IDENTITY = {
	GIT_AUTHOR_NAME: "t",
	GIT_AUTHOR_EMAIL: "t@t",
	GIT_COMMITTER_NAME: "t",
	GIT_COMMITTER_EMAIL: "t@t",
};

function git(cwd: string, args: string[]): string {
	const run = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, ...IDENTITY },
	});
	if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
	return run.stdout.trim();
}

/** A bare remote with one commit on main (a project with an app/ subdir). */
function makeRemote(): string {
	const remote = join(tmp("ds-data-remote-"), "remote.git");
	git(tmpdir(), ["init", "-q", "--bare", "-b", "main", remote]);
	const seedClone = tmp("ds-data-seed-");
	git(seedClone, ["clone", "-q", remote, "."]);
	mkdirSync(join(seedClone, "app"), { recursive: true });
	writeFileSync(join(seedClone, "app", "index.css"), ".x{}\n", "utf8");
	git(seedClone, ["add", "."]);
	git(seedClone, ["commit", "-q", "-m", "init"]);
	git(seedClone, ["push", "-q", "origin", "main"]);
	return remote;
}

function clone(remote: string): string {
	const dir = tmp("ds-data-work-");
	git(dir, ["clone", "-q", remote, "."]);
	return dir;
}

function run(
	cwd: string,
	args: string[],
	state: string,
): { code: number; stdout: string; stderr: string } {
	const r = spawnSync(process.execPath, [script, ...args, "--state", state], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, ...IDENTITY },
	});
	return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

const FILE = "app/.ds-bridge/history.jsonl";

function remoteFile(remote: string, branch: string): string {
	return git(remote, ["show", `${branch}:${FILE}`]);
}

describe("ci-data-branch.mjs (H8)", () => {
	it("first run: no branch yet → publish creates it; main is untouched", () => {
		const remote = makeRemote();
		const mainBefore = git(remote, ["rev-parse", "main"]);
		const work = clone(remote);
		const state = join(tmp("ds-data-state-"), "s.json");

		const seeded = run(
			work,
			["seed", "--branch", "ds-bridge-data", "--file", FILE],
			state,
		);
		expect(seeded.code).toBe(0);
		expect(seeded.stdout).toMatch(/no history/);

		mkdirSync(join(work, "app", ".ds-bridge"), { recursive: true });
		writeFileSync(join(work, FILE), '{"kind":"lint","n":1}\n', "utf8");
		const published = run(
			work,
			[
				"publish",
				"--branch",
				"ds-bridge-data",
				"--file",
				FILE,
				"--default-branch",
				"main",
			],
			state,
		);
		expect(published.code).toBe(0);
		expect(remoteFile(remote, "ds-bridge-data")).toBe('{"kind":"lint","n":1}');
		expect(git(remote, ["rev-parse", "main"])).toBe(mainBefore);
		// The local checkout's HEAD/branch is untouched.
		expect(git(work, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
		expect(git(remote, ["log", "-1", "--format=%s", "ds-bridge-data"])).toMatch(
			/\[skip ci\]/,
		);
	});

	it("seed pulls the series; publish appends on top (one commit per run)", () => {
		const remote = makeRemote();
		const first = clone(remote);
		const s1 = join(tmp("ds-data-state-"), "s.json");
		run(first, ["seed", "--branch", "ds-bridge-data", "--file", FILE], s1);
		mkdirSync(join(first, "app", ".ds-bridge"), { recursive: true });
		writeFileSync(join(first, FILE), "A\n", "utf8");
		run(first, ["publish", "--branch", "ds-bridge-data", "--file", FILE], s1);

		const second = clone(remote);
		const s2 = join(tmp("ds-data-state-"), "s.json");
		const seeded = run(
			second,
			["seed", "--branch", "ds-bridge-data", "--file", FILE],
			s2,
		);
		expect(seeded.stdout).toMatch(/seeded/);
		expect(readFileSync(join(second, FILE), "utf8")).toBe("A\n");
		appendFileSync(join(second, FILE), "B\n", "utf8");
		expect(
			run(second, ["publish", "--branch", "ds-bridge-data", "--file", FILE], s2)
				.code,
		).toBe(0);
		expect(remoteFile(remote, "ds-bridge-data")).toBe("A\nB");
		expect(git(remote, ["rev-list", "--count", "ds-bridge-data"])).toBe("2");
	});

	it("a concurrent recorder's push is merged append-only (no lost lines)", () => {
		const remote = makeRemote();
		const a = clone(remote);
		const b = clone(remote);
		const sa = join(tmp("ds-data-state-"), "a.json");
		const sb = join(tmp("ds-data-state-"), "b.json");
		run(a, ["seed", "--branch", "ds-bridge-data", "--file", FILE], sa);
		run(b, ["seed", "--branch", "ds-bridge-data", "--file", FILE], sb);
		for (const [dir, line] of [
			[a, "from-a\n"],
			[b, "from-b\n"],
		] as const) {
			mkdirSync(join(dir, "app", ".ds-bridge"), { recursive: true });
			writeFileSync(join(dir, FILE), line, "utf8");
		}
		expect(
			run(b, ["publish", "--branch", "ds-bridge-data", "--file", FILE], sb)
				.code,
		).toBe(0);
		const late = run(
			a,
			["publish", "--branch", "ds-bridge-data", "--file", FILE],
			sa,
		);
		expect(late.code).toBe(0);
		expect(remoteFile(remote, "ds-bridge-data")).toBe("from-b\nfrom-a");
	});

	it("keeps other files already on the data branch", () => {
		const remote = makeRemote();
		const work = clone(remote);
		git(work, ["checkout", "-q", "--orphan", "ds-bridge-data"]);
		git(work, ["rm", "-rq", "--cached", "."]);
		writeFileSync(join(work, "README.md"), "data branch\n", "utf8");
		git(work, ["add", "README.md"]);
		git(work, ["commit", "-q", "-m", "readme"]);
		git(work, ["push", "-q", "origin", "ds-bridge-data"]);

		const fresh = clone(remote);
		const state = join(tmp("ds-data-state-"), "s.json");
		run(fresh, ["seed", "--branch", "ds-bridge-data", "--file", FILE], state);
		mkdirSync(join(fresh, "app", ".ds-bridge"), { recursive: true });
		writeFileSync(join(fresh, FILE), "X\n", "utf8");
		run(
			fresh,
			["publish", "--branch", "ds-bridge-data", "--file", FILE],
			state,
		);
		expect(git(remote, ["show", "ds-bridge-data:README.md"])).toBe(
			"data branch",
		);
		expect(remoteFile(remote, "ds-bridge-data")).toBe("X");
	});

	it("refuses main, master and the declared default branch (exit 1, nothing pushed)", () => {
		const remote = makeRemote();
		const mainBefore = git(remote, ["rev-parse", "main"]);
		const work = clone(remote);
		const state = join(tmp("ds-data-state-"), "s.json");
		mkdirSync(join(work, "app", ".ds-bridge"), { recursive: true });
		writeFileSync(join(work, FILE), "X\n", "utf8");
		for (const args of [
			["--branch", "main"],
			["--branch", "master"],
			["--branch", "trunk", "--default-branch", "trunk"],
			["--branch", "--oops"],
		]) {
			const r = run(work, ["publish", ...args, "--file", FILE], state);
			expect(r.code).toBe(1);
			expect(r.stderr).toMatch(/refusing|not a valid|required/);
		}
		expect(git(remote, ["rev-parse", "main"])).toBe(mainBefore);
	});

	it("publish with no history file is a no-op (exit 0)", () => {
		const remote = makeRemote();
		const work = clone(remote);
		const state = join(tmp("ds-data-state-"), "s.json");
		const r = run(
			work,
			["publish", "--branch", "ds-bridge-data", "--file", FILE],
			state,
		);
		expect(r.code).toBe(0);
		expect(r.stdout).toMatch(/nothing to publish/);
	});
});
