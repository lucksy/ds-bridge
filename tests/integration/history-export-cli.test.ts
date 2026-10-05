// E2 — integration: `ds-bridge history export` (SPEC-analytics-export §4).
// Spawns dist/cli.mjs against throwaway project dirs; SOURCE_DATE_EPOCH pins the
// instant relative windows resolve against.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

/** 2026-10-05T12:00:00Z. */
const ENV = { SOURCE_DATE_EPOCH: "1791201600" };

const tmpDirs: string[] = [];
async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}
afterAll(async () => {
	for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
});

async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8", env: { ...process.env, ...ENV } },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

const j = (r: Record<string, unknown>) => JSON.stringify(r);

const LINES = [
	j({
		at: "2026-09-01T10:00:00.000Z",
		kind: "handoff",
		score: 70,
		frameName: "A",
	}),
	j({
		v: 2,
		at: "2026-10-04T10:00:00.000Z",
		kind: "lint",
		source: "ci",
		git: { sha: "abc", branch: "main", dirty: false },
		tool: { version: "1.11.0" },
		runId: "r1",
		byKind: { exact: 2, near: 1, offSystem: 0 },
	}),
	j({
		v: 2,
		at: "2026-10-04T10:00:01.000Z",
		kind: "score",
		source: "ci",
		git: { sha: "abc", branch: "main", dirty: false },
		tool: { version: "1.11.0" },
		runId: "r1",
		score: 88,
	}),
];

async function project(lines: string[]): Promise<string> {
	const dir = await freshTmp("ds-hist-export-");
	await mkdir(join(dir, ".ds-bridge"), { recursive: true });
	await writeFile(
		join(dir, ".ds-bridge", "history.jsonl"),
		`${lines.join("\n")}\n`,
		"utf8",
	);
	return dir;
}

describe("ds-bridge history export", () => {
	it("defaults to CSV: header + one row per metric per record", async () => {
		const dir = await project(LINES);
		const { code, stdout } = await runCli(["history", "export", dir]);
		expect(code).toBe(0);
		expect(stdout).toBe(
			[
				"at,date,runId,sha,branch,source,kind,subject,metric,value",
				"2026-09-01T10:00:00.000Z,2026-09-01,,,,,handoff,A,score,70",
				"2026-10-04T10:00:00.000Z,2026-10-04,r1,abc,main,ci,lint,,byKind.exact,2",
				"2026-10-04T10:00:00.000Z,2026-10-04,r1,abc,main,ci,lint,,byKind.near,1",
				"2026-10-04T10:00:00.000Z,2026-10-04,r1,abc,main,ci,lint,,byKind.offSystem,0",
				"2026-10-04T10:00:01.000Z,2026-10-04,r1,abc,main,ci,score,,score,88",
				"",
			].join("\n"),
		);
	});

	it("--format jsonl --kind score emits JSON rows for that kind only", async () => {
		const dir = await project(LINES);
		const { code, stdout } = await runCli([
			"history",
			"export",
			dir,
			"--format",
			"jsonl",
			"--kind",
			"score,handoff",
		]);
		expect(code).toBe(0);
		const rows = stdout
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(rows.map((r) => r.kind)).toEqual(["handoff", "score"]);
		expect(rows[1]).toEqual({
			at: "2026-10-04T10:00:01.000Z",
			date: "2026-10-04",
			runId: "r1",
			sha: "abc",
			branch: "main",
			source: "ci",
			kind: "score",
			subject: null,
			metric: "score",
			value: 88,
		});
	});

	it("--since (relative, pinned clock) and --until (date, whole day)", async () => {
		const dir = await project(LINES);
		const since = await runCli(["history", "export", dir, "--since", "7d"]);
		expect(since.code).toBe(0);
		expect(since.stdout).not.toContain("handoff");
		const until = await runCli([
			"history",
			"export",
			dir,
			"--until",
			"2026-09-01",
		]);
		expect(until.code).toBe(0);
		expect(until.stdout.trim().split("\n")).toHaveLength(2);
	});

	it("--out writes the file and prints its path", async () => {
		const dir = await project(LINES);
		const out = join(dir, "export.csv");
		const { code, stdout } = await runCli([
			"history",
			"export",
			dir,
			"--out",
			out,
		]);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe(out);
		expect(await readFile(out, "utf8")).toContain("lint,,byKind.exact,2");
	});

	it("an absent history is the header only (csv) / empty (jsonl), exit 0", async () => {
		const dir = await freshTmp("ds-hist-export-none-");
		const csv = await runCli(["history", "export", dir]);
		expect(csv.code).toBe(0);
		expect(csv.stdout).toBe(
			"at,date,runId,sha,branch,source,kind,subject,metric,value\n",
		);
		const jsonl = await runCli(["history", "export", dir, "--format", "jsonl"]);
		expect(jsonl.code).toBe(0);
		expect(jsonl.stdout).toBe("");
	});

	it("bad --format / --since / --until / path → exit 2", async () => {
		const dir = await project(LINES);
		for (const args of [
			["--format", "xlsx"],
			["--since", "last week"],
			["--until", "2026-13-40"],
		]) {
			const r = await runCli(["history", "export", dir, ...args]);
			expect(r.code).toBe(2);
			expect(r.stderr).not.toBe("");
		}
		const missing = await runCli([
			"history",
			"export",
			join(dir, "does-not-exist"),
		]);
		expect(missing.code).toBe(2);
	});
});
