// X4 — recurring exceptions end to end (SPEC-exceptions §2–§4) through the
// built CLI: stored library-health top-N lists + the project's `exceptions`
// config → the `exceptions-review` section in terminal and JSON output. The
// logged decision never changes the stored counts (the score input).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliPath = join(import.meta.dirname, "..", "..", "dist", "cli.mjs");
const tmpDirs: string[] = [];

afterAll(async () => {
	await Promise.all(
		tmpDirs.map((d) => rm(d, { recursive: true, force: true })),
	);
});

async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{
				encoding: "utf8",
				env: { ...process.env, NO_COLOR: "1", SOURCE_DATE_EPOCH: "1791547200" },
			},
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

type Entry = { name: string; count: number };

function lh(at: string, topOverrides: Entry[]): string {
	return JSON.stringify({
		at,
		kind: "library-health",
		fileKey: "LIB",
		overrideHotspots: topOverrides.reduce((n, e) => n + e.count, 0),
		deprecatedUsage: 0,
		detachedCandidates: 0,
		topN: 10,
		topOverrides,
		topDeprecated: [],
		topDetached: [],
	});
}

async function project(config?: unknown): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-exceptions-"));
	tmpDirs.push(dir);
	await mkdir(join(dir, ".ds-bridge"), { recursive: true });
	await writeFile(
		join(dir, ".ds-bridge", "history.jsonl"),
		`${[
			lh("2026-09-01T10:00:00.000Z", [
				{ name: "Card", count: 4 },
				{ name: "Button", count: 3 },
				{ name: "Badge", count: 1 },
			]),
			lh("2026-09-08T10:00:00.000Z", [
				{ name: "Card", count: 6 },
				{ name: "Button", count: 3 },
			]),
			lh("2026-09-15T10:00:00.000Z", [
				{ name: "Card", count: 7 },
				{ name: "Button", count: 2 },
			]),
		].join("\n")}\n`,
		"utf8",
	);
	if (config !== undefined) {
		await writeFile(
			join(dir, ".ds-bridge.json"),
			`${JSON.stringify(config, null, 2)}\n`,
			"utf8",
		);
	}
	return dir;
}

const ARGS = ["--artifacts", "exceptions-review"];

describe("ds-bridge report — recurring exceptions (X4)", () => {
	it("flags components overridden run after run as needing an owner", async () => {
		const dir = await project();
		const result = await runCli([
			"report",
			dir,
			...ARGS,
			"--format",
			"terminal",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("Recurring exceptions");
		expect(result.stdout).toContain("2 listed · 2 need an owner");
		expect(result.stdout).toMatch(/Card\s+overrides · 7 latest · 3 of 3 runs/);
		// Badge appeared once and dropped out — a one-off, not recurring.
		expect(result.stdout).not.toMatch(/Badge\s+overrides/);
	});

	it("shows the logged owner + decision, and the same counts as before", async () => {
		const dir = await project({
			exceptions: [
				{
					component: "Card",
					owner: "@checkout-design",
					decision: "evolve-component",
					note: "Needs a compact layout for order lists",
					review_by: "2026-11-15",
				},
			],
		});
		const result = await runCli(["report", dir, ...ARGS, "--format", "json"]);
		expect(result.code).toBe(0);
		const doc = JSON.parse(result.stdout) as {
			data: { exceptionsReview: { rows: unknown[]; totals: unknown } };
		};
		expect(doc.data.exceptionsReview.rows).toEqual([
			{
				signal: "overrides",
				name: "Button",
				runs: 3,
				latest: 2,
				state: "needs-owner",
			},
			{
				signal: "overrides",
				name: "Card",
				runs: 3,
				latest: 7,
				state: "evolve-component",
				owner: "@checkout-design",
				decision: "evolve-component",
				note: "Needs a compact layout for order lists",
				reviewBy: "2026-11-15",
			},
		]);
	});

	it("rejects a malformed exceptions entry with exit 2 and a precise message", async () => {
		const dir = await project({
			exceptions: [{ component: "Card", owner: "@a", decision: "ignore" }],
		});
		const result = await runCli(["report", dir, ...ARGS]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain(
			"exceptions[0].decision must be one of investigating | fix-implementation | evolve-component",
		);
	});
});
