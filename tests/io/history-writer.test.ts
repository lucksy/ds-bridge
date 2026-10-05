// H3 — the single history writer (SPEC-history-v2 §1.2, §4). Every append in the
// tree goes through appendHistoryRecord: v2 envelope, never-throwing metadata
// (git / tool version), and an advisory lock shared with compact/migrate.
import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { GitExec } from "../../src/io/git-log.js";
import {
	acquireHistoryLock,
	appendHistoryRecord,
	HISTORY_FILE,
	LOCK_FILE,
	readGitContext,
	resolveToolVersion,
	rewriteHistoryAtomic,
} from "../../src/io/history-writer.js";

const repoRoot = join(import.meta.dirname, "..", "..");
const tmpDirs: string[] = [];

function freshTmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "ds-bridge-writer-"));
	tmpDirs.push(dir);
	return dir;
}

afterAll(() => {
	for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function readLines(stateDir: string): Record<string, unknown>[] {
	return readFileSync(join(stateDir, HISTORY_FILE), "utf8")
		.split("\n")
		.filter((l) => l.trim() !== "")
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** A canned git: maps "arg arg" → result. Unknown args fail like a non-repo. */
function fakeGit(map: Record<string, string>): GitExec {
	return (args) => {
		const key = args.join(" ");
		const out = map[key];
		return out === undefined
			? { status: 128, stdout: "", stderr: "fatal: not a git repository" }
			: { status: 0, stdout: out, stderr: "" };
	};
}

const notARepo: GitExec = () => ({
	status: 128,
	stdout: "",
	stderr: "fatal: not a git repository",
});

describe("appendHistoryRecord", () => {
	it("creates the state dir and appends ONE v2 line", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		appendHistoryRecord(
			stateDir,
			{ at: "2026-10-04T00:00:00.000Z", kind: "lint", byKind: { exact: 1 } },
			{ env: {}, exec: notARepo, toolVersion: "9.9.9" },
		);
		const lines = readLines(stateDir);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toEqual({
			v: 2,
			at: "2026-10-04T00:00:00.000Z",
			kind: "lint",
			source: "local",
			git: null,
			tool: { version: "9.9.9" },
			byKind: { exact: 1 },
		});
	});

	it("honors DS_BRIDGE_SOURCE + DS_BRIDGE_RUN_ID, and a source flag beats env", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		const env = { DS_BRIDGE_SOURCE: "ci", DS_BRIDGE_RUN_ID: "run-1" };
		appendHistoryRecord(
			stateDir,
			{ kind: "a11y" },
			{ env, exec: notARepo, toolVersion: "1" },
		);
		appendHistoryRecord(
			stateDir,
			{ kind: "a11y" },
			{ env, exec: notARepo, toolVersion: "1", source: "hook" },
		);
		const [first, second] = readLines(stateDir);
		expect(first?.source).toBe("ci");
		expect(first?.runId).toBe("run-1");
		expect(second?.source).toBe("hook");
	});

	it("stamps `at` from the injected clock when the payload has none", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		appendHistoryRecord(
			stateDir,
			{ kind: "adoption" },
			{
				env: {},
				exec: notARepo,
				toolVersion: "1",
				now: () => "2026-01-02T03:04:05.000Z",
			},
		);
		expect(readLines(stateDir)[0]?.at).toBe("2026-01-02T03:04:05.000Z");
	});

	it("returns the written record", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		const written = appendHistoryRecord(
			stateDir,
			{ kind: "lint" },
			{ env: {}, exec: notARepo, toolVersion: "1" },
		);
		expect(readLines(stateDir)[0]).toEqual(written);
	});

	it("still appends (never loses a measurement) when the lock is held", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(join(stateDir, LOCK_FILE), "held", "utf8");
		appendHistoryRecord(
			stateDir,
			{ kind: "lint" },
			{ env: {}, exec: notARepo, toolVersion: "1", lockTimeoutMs: 30 },
		);
		expect(readLines(stateDir)).toHaveLength(1);
		// The foreign lock is NOT removed by a writer that never acquired it.
		expect(existsSync(join(stateDir, LOCK_FILE))).toBe(true);
	});

	it("releases its own lock after the write", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		appendHistoryRecord(
			stateDir,
			{ kind: "lint" },
			{ env: {}, exec: notARepo, toolVersion: "1" },
		);
		expect(existsSync(join(stateDir, LOCK_FILE))).toBe(false);
	});
});

describe("readGitContext", () => {
	it("is null outside a repo and never throws", () => {
		expect(readGitContext("/nowhere", notARepo, {})).toBeNull();
		const throwing: GitExec = () => {
			throw new Error("boom");
		};
		expect(readGitContext("/nowhere", throwing, {})).toBeNull();
	});

	it("reads sha, branch and dirty (ignoring .ds-bridge/ paths)", () => {
		const git = fakeGit({
			"rev-parse HEAD": "abc123\n",
			"rev-parse --abbrev-ref HEAD": "feature/x\n",
			"status --porcelain --untracked-files=no":
				" M .ds-bridge/history.jsonl\n M app/.ds-bridge/registry.json\n",
		});
		expect(readGitContext("/repo", git, {})).toEqual({
			sha: "abc123",
			branch: "feature/x",
			dirty: false,
		});
	});

	it("is dirty when a tracked file outside .ds-bridge/ changed", () => {
		const git = fakeGit({
			"rev-parse HEAD": "abc\n",
			"rev-parse --abbrev-ref HEAD": "main\n",
			"status --porcelain --untracked-files=no":
				" M src/button.css\n M .ds-bridge/history.jsonl\n",
		});
		expect(readGitContext("/repo", git, {})?.dirty).toBe(true);
	});

	it("maps a detached HEAD to the GitHub branch env, else null", () => {
		const git = fakeGit({
			"rev-parse HEAD": "abc\n",
			"rev-parse --abbrev-ref HEAD": "HEAD\n",
			"status --porcelain --untracked-files=no": "",
		});
		expect(readGitContext("/r", git, { GITHUB_HEAD_REF: "pr-branch" })).toEqual(
			{ sha: "abc", branch: "pr-branch", dirty: false },
		);
		expect(
			readGitContext("/r", git, {
				GITHUB_HEAD_REF: "",
				GITHUB_REF_NAME: "main",
			})?.branch,
		).toBe("main");
		expect(readGitContext("/r", git, {})?.branch).toBeNull();
	});

	it("reads a real repository through the default exec", () => {
		const dir = freshTmp();
		const git = (args: string[]) =>
			spawnSync("git", args, { cwd: dir, encoding: "utf8" });
		git(["init", "-q", "-b", "trunk"]);
		writeFileSync(join(dir, "a.txt"), "a", "utf8");
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
		const ctx = readGitContext(dir);
		expect(ctx?.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(ctx?.branch).toBe("trunk");
		expect(ctx?.dirty).toBe(false);
	});
});

describe("resolveToolVersion", () => {
	it("finds the ds-bridge package.json version", () => {
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };
		expect(resolveToolVersion()).toBe(pkg.version);
	});
});

describe("acquireHistoryLock", () => {
	it("acquires, blocks a second taker, and releases", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		mkdirSync(stateDir, { recursive: true });
		const release = acquireHistoryLock(stateDir, { timeoutMs: 0 });
		expect(release).toBeTypeOf("function");
		expect(acquireHistoryLock(stateDir, { timeoutMs: 20 })).toBeUndefined();
		release?.();
		expect(existsSync(join(stateDir, LOCK_FILE))).toBe(false);
		const again = acquireHistoryLock(stateDir, { timeoutMs: 0 });
		expect(again).toBeTypeOf("function");
		again?.();
	});

	it("takes over a stale lock", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		mkdirSync(stateDir, { recursive: true });
		const lockPath = join(stateDir, LOCK_FILE);
		writeFileSync(lockPath, "old", "utf8");
		const old = new Date(Date.now() - 60_000);
		utimesSync(lockPath, old, old);
		const release = acquireHistoryLock(stateDir, {
			timeoutMs: 0,
			staleMs: 10_000,
		});
		expect(release).toBeTypeOf("function");
		release?.();
	});

	it("release leaves a lock that was taken over by another owner", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		mkdirSync(stateDir, { recursive: true });
		const lockPath = join(stateDir, LOCK_FILE);
		const release = acquireHistoryLock(stateDir, { timeoutMs: 0 });
		// Our lock went stale and another process took it over.
		writeFileSync(lockPath, "4242:someone-else\n", "utf8");
		release?.();
		expect(readFileSync(lockPath, "utf8")).toBe("4242:someone-else\n");
	});
});

describe("rewriteHistoryAtomic", () => {
	it("replaces the file content and leaves no temp file behind", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(join(stateDir, HISTORY_FILE), "old\n", "utf8");
		rewriteHistoryAtomic(stateDir, "new\n");
		expect(readFileSync(join(stateDir, HISTORY_FILE), "utf8")).toBe("new\n");
		expect(readdirSync(stateDir)).toEqual([HISTORY_FILE]);
	});

	it("keeps a record appended after the rewrite read the file", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		mkdirSync(stateDir, { recursive: true });
		const file = join(stateDir, HISTORY_FILE);
		writeFileSync(file, "a\na\n", "utf8");
		const readBytes = readFileSync(file).length;
		// An append that gave up waiting for the lock lands mid-rewrite.
		appendFileSync(file, '{"kind":"lint","late":true}\n', "utf8");
		rewriteHistoryAtomic(stateDir, "a\n", readBytes);
		expect(readFileSync(file, "utf8")).toBe('a\n{"kind":"lint","late":true}\n');
		expect(readdirSync(stateDir)).toEqual([HISTORY_FILE]);
	});

	it("refuses to replace a file that shrank since it was read", () => {
		const stateDir = join(freshTmp(), ".ds-bridge");
		mkdirSync(stateDir, { recursive: true });
		const file = join(stateDir, HISTORY_FILE);
		writeFileSync(file, "x\n", "utf8");
		expect(() => rewriteHistoryAtomic(stateDir, "new\n", 100)).toThrow(
			/shrank/,
		);
		expect(readFileSync(file, "utf8")).toBe("x\n");
		expect(readdirSync(stateDir)).toEqual([HISTORY_FILE]);
	});
});

describe("one writer (SPEC-history-v2 §1.2)", () => {
	it("no command appends to history.jsonl on its own", () => {
		const dir = join(repoRoot, "src", "cli-commands");
		const offenders = readdirSync(dir)
			.filter((f) => f.endsWith(".ts"))
			.filter((f) => {
				const text = readFileSync(join(dir, f), "utf8");
				return /appendFileSync\(/.test(text) && /"history\.jsonl"/.test(text);
			});
		expect(offenders).toEqual([]);
	});
});
