// R3 (SPEC-rollup §2) — the rollup source loader: dir / file / dir@ref, never throws.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnGitExec } from "../../src/io/git-log.js";
import { loadRollupSource } from "../../src/io/rollup-sources.js";

let root: string;
let repo: string;
const COMMITTED = '{"at":"2026-10-01T00:00:00Z","kind":"handoff","score":70}\n';
const WORKTREE = '{"at":"2026-10-02T00:00:00Z","kind":"handoff","score":90}\n';

function git(args: string[], cwd: string): void {
	execFileSync("git", args, { cwd, stdio: "ignore" });
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "ds-rollup-io-"));
	repo = join(root, "web");
	mkdirSync(join(repo, ".ds-bridge"), { recursive: true });
	writeFileSync(join(repo, ".ds-bridge", "history.jsonl"), COMMITTED);
	git(["init", "-q", "-b", "main"], repo);
	git(["add", "."], repo);
	git(
		[
			"-c",
			"user.email=t@example.com",
			"-c",
			"user.name=t",
			"commit",
			"-q",
			"-m",
			"seed",
		],
		repo,
	);
	writeFileSync(join(repo, ".ds-bridge", "history.jsonl"), WORKTREE);
	mkdirSync(join(root, "empty"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("loadRollupSource", () => {
	it("reads <dir>/.ds-bridge/history.jsonl from the working tree", () => {
		expect(loadRollupSource({ path: repo }, spawnGitExec)).toEqual({
			kind: "ok",
			text: WORKTREE,
		});
	});

	it("reads a history file path directly", () => {
		const file = join(repo, ".ds-bridge", "history.jsonl");
		expect(loadRollupSource({ path: file }, spawnGitExec)).toEqual({
			kind: "ok",
			text: WORKTREE,
		});
	});

	it("reads the history committed at <dir>@<ref>", () => {
		expect(loadRollupSource({ path: repo, ref: "main" }, spawnGitExec)).toEqual(
			{ kind: "ok", text: COMMITTED },
		);
	});

	it("a directory without history is missing (with a record hint)", () => {
		const out = loadRollupSource({ path: join(root, "empty") }, spawnGitExec);
		expect(out.kind).toBe("missing");
		if (out.kind === "missing") expect(out.message).toMatch(/ds-bridge record/);
	});

	it("a nonexistent path is missing, never a throw", () => {
		const out = loadRollupSource({ path: join(root, "nope") }, spawnGitExec);
		expect(out.kind).toBe("missing");
	});

	it("a bad ref is an error; a ref on a non-repo is an error", () => {
		const bad = loadRollupSource(
			{ path: repo, ref: "no-such-branch" },
			spawnGitExec,
		);
		expect(bad.kind).toBe("error");
		const nonRepo = loadRollupSource(
			{ path: join(root, "empty"), ref: "main" },
			spawnGitExec,
		);
		expect(nonRepo.kind).toBe("error");
	});

	it("a ref where the history was never committed is missing", () => {
		const other = join(root, "bare-repo");
		mkdirSync(other);
		writeFileSync(join(other, "README"), "x");
		git(["init", "-q", "-b", "main"], other);
		git(["add", "."], other);
		git(
			[
				"-c",
				"user.email=t@example.com",
				"-c",
				"user.name=t",
				"commit",
				"-q",
				"-m",
				"x",
			],
			other,
		);
		expect(
			loadRollupSource({ path: other, ref: "main" }, spawnGitExec).kind,
		).toBe("missing");
	});

	it("reads a committed history larger than 1 MiB at <dir>@<ref>", () => {
		const big = join(root, "big");
		mkdirSync(join(big, ".ds-bridge"), { recursive: true });
		const line =
			'{"v":2,"at":"2026-10-01T00:00:00Z","kind":"handoff","score":70,"source":"ci","git":{"sha":"0123456789abcdef0123456789abcdef01234567","branch":"main","dirty":false}}\n';
		const text = line.repeat(Math.ceil((1.5 * 1024 * 1024) / line.length));
		writeFileSync(join(big, ".ds-bridge", "history.jsonl"), text);
		git(["init", "-q", "-b", "main"], big);
		git(["add", "."], big);
		git(
			[
				"-c",
				"user.email=t@example.com",
				"-c",
				"user.name=t",
				"commit",
				"-q",
				"-m",
				"big",
			],
			big,
		);
		const out = loadRollupSource({ path: big, ref: "main" }, spawnGitExec);
		expect(out.kind).toBe("ok");
		if (out.kind === "ok") expect(out.text.length).toBe(text.length);
	});

	it("names the source by its label, never the absolute path", () => {
		const missingDir = loadRollupSource(
			{ path: join(root, "empty"), label: "../empty" },
			spawnGitExec,
		);
		const nope = loadRollupSource(
			{ path: join(root, "nope"), label: "nope" },
			spawnGitExec,
		);
		const atRef = loadRollupSource(
			{ path: repo, ref: "no-such-branch", label: "../web" },
			spawnGitExec,
		);
		const notRepo = loadRollupSource(
			{ path: join(root, "nope"), ref: "main", label: "nope" },
			spawnGitExec,
		);
		for (const out of [missingDir, nope, atRef, notRepo]) {
			expect(out.kind).not.toBe("ok");
			if (out.kind !== "ok") expect(out.message).not.toContain(root);
		}
		if (missingDir.kind !== "ok") {
			expect(missingDir.message).toBe(
				"No history in ../empty — run ds-bridge record there to start one.",
			);
		}
		if (nope.kind !== "ok") expect(nope.message).toBe("nope does not exist.");
		if (atRef.kind !== "ok") {
			expect(atRef.message).toMatch(
				/^Could not read no-such-branch in \.\.\/web: /,
			);
			expect(atRef.message).toContain("git fetch");
		}
	});

	it("an absent git surfaces as an error, not a throw", () => {
		const out = loadRollupSource({ path: repo, ref: "main" }, () => ({
			status: -1,
			stdout: "",
			stderr: "",
			error: "spawn git ENOENT",
		}));
		expect(out).toEqual({
			kind: "error",
			message: expect.stringContaining("ENOENT"),
		});
	});
});
