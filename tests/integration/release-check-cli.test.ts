// C13 / M3.7 — integration: the built CLI's `ds-bridge release-check [path]`
// command. Spawns dist/cli.mjs over a hand-seeded .ds-bridge/history.jsonl, runs
// the pure release-readiness engine, prints the go/no-go + per-gate detail, and
// gates the exit code:
//   0  go      (every gate passes)
//   1  no-go   (any gate fails, incl. insufficient data)
//   2  operational error (bad path)
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

interface ExecError {
	code: number;
	stdout: string;
	stderr: string;
}

function isExecError(value: unknown): value is ExecError {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		"stderr" in value
	);
}

async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8" },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

/** Seed <dir>/.ds-bridge/history.jsonl with the given raw lines. */
async function seedHistory(dir: string, lines: string[]): Promise<void> {
	const stateDir = join(dir, ".ds-bridge");
	await mkdir(stateDir, { recursive: true });
	await writeFile(
		join(stateDir, "history.jsonl"),
		`${lines.join("\n")}\n`,
		"utf8",
	);
}

function impactLine(at: string, breaking: number): string {
	return JSON.stringify({
		at,
		kind: "impact",
		breaking,
		additive: 0,
		cosmetic: 0,
		touchedCallSites: 0,
	});
}

function tokensCheckLine(at: string, stale: number, missing: number): string {
	return JSON.stringify({
		at,
		kind: "tokens-check",
		stale,
		missing,
		orphan: 0,
		inSync: stale === 0 && missing === 0,
	});
}

function parityLine(
	at: string,
	missingInCode: number,
	missingInFigma: number,
	total: number,
): string {
	return JSON.stringify({
		at,
		kind: "parity",
		ok: total - missingInCode - missingInFigma,
		total,
		score: 100,
		missingInCode,
		missingInFigma,
		propMismatch: 0,
	});
}

/** All three gates clean → go. */
function cleanHistory(): string[] {
	return [
		impactLine("2026-06-01T10:00:00.000Z", 0),
		tokensCheckLine("2026-06-02T10:00:00.000Z", 0, 0),
		parityLine("2026-06-03T10:00:00.000Z", 0, 0, 4),
	];
}

afterAll(async () => {
	await Promise.all(
		tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("ds-bridge release-check (built dist/cli.mjs)", () => {
	it("all gates clean → exit 0 (GO)", async () => {
		const dir = await freshTmp("ds-release-go-");
		await seedHistory(dir, cleanHistory());

		const result = await runCli(["release-check", dir]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("GO");
	});

	it("a breaking impact change → exit 1 (NO-GO)", async () => {
		const dir = await freshTmp("ds-release-impact-");
		await seedHistory(dir, [
			impactLine("2026-06-01T10:00:00.000Z", 2),
			tokensCheckLine("2026-06-02T10:00:00.000Z", 0, 0),
			parityLine("2026-06-03T10:00:00.000Z", 0, 0, 4),
		]);

		const result = await runCli(["release-check", dir]);
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("NO-GO");
	});

	it("a stale token → exit 1 (NO-GO)", async () => {
		const dir = await freshTmp("ds-release-drift-");
		await seedHistory(dir, [
			impactLine("2026-06-01T10:00:00.000Z", 0),
			tokensCheckLine("2026-06-02T10:00:00.000Z", 3, 0),
			parityLine("2026-06-03T10:00:00.000Z", 0, 0, 4),
		]);

		const result = await runCli(["release-check", dir]);
		expect(result.code).toBe(1);
	});

	it("a missing parity signal → exit 1 (NO-GO, insufficient data)", async () => {
		const dir = await freshTmp("ds-release-no-parity-");
		await seedHistory(dir, [
			impactLine("2026-06-01T10:00:00.000Z", 0),
			tokensCheckLine("2026-06-02T10:00:00.000Z", 0, 0),
		]);

		const result = await runCli(["release-check", dir]);
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("no parity data");
	});

	it("empty history → exit 1 (NO-GO, all insufficient)", async () => {
		const dir = await freshTmp("ds-release-empty-");
		await mkdir(join(dir, ".ds-bridge"), { recursive: true });

		const result = await runCli(["release-check", dir]);
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("NO-GO");
	});

	it("--format json emits a machine-readable go/no-go + checks", async () => {
		const dir = await freshTmp("ds-release-json-");
		await seedHistory(dir, cleanHistory());

		const result = await runCli(["release-check", dir, "--format", "json"]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			go: boolean;
			checks: { name: string; pass: boolean }[];
		};
		expect(parsed.go).toBe(true);
		expect(parsed.checks.map((c) => c.name)).toEqual([
			"impact",
			"drift",
			"parity",
		]);
	});

	it("a path that is not a directory → exit 2 (operational error)", async () => {
		const result = await runCli([
			"release-check",
			join(repoRoot, "does-not-exist-xyz"),
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("not a directory");
	});

	it("an unknown --format → exit 2", async () => {
		const dir = await freshTmp("ds-release-bad-format-");
		await seedHistory(dir, cleanHistory());

		const result = await runCli(["release-check", dir, "--format", "xml"]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("--format");
	});
});
