// S5b — integration: the built CLI's `badge [path] [--out <file>]` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like report-cli.test.ts)
// against a throwaway project dir. Reads <path>/.ds-bridge/history.jsonl, replays
// it into the weighted system score (the same engine the dashboard uses), renders
// a self-contained badge SVG, and writes it (plain writeFileSync, report-writer
// precedent) to --out (default <path>/.ds-bridge/badge.svg), printing the path.
//
// Exit codes: 0 success · 2 no history / no score-relevant data (naming the
// commands that create history).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function handoffLine(at: string, score: number): string {
	return JSON.stringify({
		at,
		kind: "handoff",
		score,
		frameName: "Frame",
		deductions: [],
	});
}

// Band fill literals (must match src/render/html/badge.ts exactly).
const BAND_GREEN = "#16a34a"; // >= 90
const BAND_AMBER = "#d97706"; // >= 70 (< 90)
const BAND_RED = "#dc2626"; // < 70

describe("ds-bridge badge (built dist/cli.mjs)", () => {
	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("happy path: writes badge.svg, prints the path, contains NN/100 + the band hex", async () => {
		const dir = await freshTmp("ds-badge-happy-");
		// A single handoff score=72 → readiness component 72, sole component →
		// composite 72 → AMBER band, value "72/100".
		await seedHistory(dir, [handoffLine("2026-06-05T10:00:00.000Z", 72)]);

		const result = await runCli(["badge", dir]);
		expect(result.code).toBe(0);

		const badgePath = join(dir, ".ds-bridge", "badge.svg");
		// the resolved path is printed to stdout.
		expect(result.stdout).toContain(badgePath);

		const svg = await readFile(badgePath, "utf8");
		expect(svg).toContain("<svg");
		expect(svg).toContain("72/100");
		expect(svg).toContain(BAND_AMBER);
		expect(svg).not.toContain(BAND_GREEN);
		expect(svg).not.toContain(BAND_RED);
	});

	it("a high score lands in the green band", async () => {
		const dir = await freshTmp("ds-badge-green-");
		await seedHistory(dir, [handoffLine("2026-06-05T10:00:00.000Z", 95)]);

		const result = await runCli(["badge", dir]);
		expect(result.code).toBe(0);

		const svg = await readFile(join(dir, ".ds-bridge", "badge.svg"), "utf8");
		expect(svg).toContain("95/100");
		expect(svg).toContain(BAND_GREEN);
	});

	it("--out writes to a custom path and prints it", async () => {
		const dir = await freshTmp("ds-badge-out-");
		await seedHistory(dir, [handoffLine("2026-06-05T10:00:00.000Z", 88)]);
		const out = join(dir, "nested", "score-badge.svg");

		const result = await runCli(["badge", dir, "--out", out]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain(out);

		const svg = await readFile(out, "utf8");
		expect(svg).toContain("<svg");
		expect(svg).toContain("88/100");
		expect(svg).toContain(BAND_AMBER);
	});

	it("no history file → exit 2 naming the commands that create history", async () => {
		const dir = await freshTmp("ds-badge-nohist-");

		const result = await runCli(["badge", dir]);
		expect(result.code).toBe(2);
		// Guidance names the history-creating commands.
		expect(result.stderr).toContain("ds-lint");
		expect(result.stderr.toLowerCase()).toContain("token");
	});

	it("history with no score-relevant data → exit 2 with the same guidance", async () => {
		const dir = await freshTmp("ds-badge-nodata-");
		// only an unknown kind → no score component → no-data.
		await seedHistory(dir, [
			JSON.stringify({ at: "2026-06-05T10:00:00.000Z", kind: "future-thing" }),
		]);

		const result = await runCli(["badge", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("ds-lint");
		expect(result.stderr.toLowerCase()).toContain("token");
	});

	it("respects score_weights from .ds-bridge.json", async () => {
		const dir = await freshTmp("ds-badge-weights-");
		// drift 100 (clean tokens-check) + readiness 50 (handoff). With drift
		// weighted far heavier the composite lands in the green band.
		await seedHistory(dir, [
			JSON.stringify({
				at: "2026-06-04T10:00:00.000Z",
				kind: "tokens-check",
				stale: 0,
				missing: 0,
				orphan: 0,
				inSync: true,
			}),
			handoffLine("2026-06-05T10:00:00.000Z", 50),
		]);
		await writeFile(
			join(dir, ".ds-bridge.json"),
			`${JSON.stringify({ score_weights: { drift: 100, readiness: 1 } }, null, 2)}\n`,
			"utf8",
		);

		const result = await runCli(["badge", dir]);
		expect(result.code).toBe(0);
		const svg = await readFile(join(dir, ".ds-bridge", "badge.svg"), "utf8");
		// (100*100 + 50*1) / 101 = 10050/101 = 99.5 → 100 → green.
		expect(svg).toContain("100/100");
		expect(svg).toContain(BAND_GREEN);
	});
});
