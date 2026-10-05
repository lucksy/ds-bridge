// D3 — integration: the built CLI's `digest [path]` command. Spawns dist/cli.mjs
// (acceptance against the bundle, like adoption-cli) over a self-contained temp
// project seeded with dated history lines. The clock is read at the edge, so the
// relative-window specs use ROBUST MARGINS (now−30d clearly out of a 7d window,
// now−1d clearly in) and assert MEMBERSHIP only — midnight/TZ drift can never
// reclassify them. The exact-boundary cases live in the pure engine specs; here,
// only the absolute-ISO --since specs assert exact rows (the boundary is fixed).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

function isExecError(value: unknown): value is ExecResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		"stderr" in value
	);
}

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

/** Run the CLI in `cwd`; resolve with code/stdout/stderr whether or not it exits 0. */
async function runCli(cwd: string, args: string[]): Promise<ExecResult> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8", cwd },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
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

/** An ISO instant `daysAgo` days before now (a robust, never-ambiguous margin). */
function daysAgoIso(daysAgo: number): string {
	return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

describe("ds-bridge digest (built dist/cli.mjs)", () => {
	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("absent history → the quiet-week digest, exit 0, no actions", async () => {
		const dir = await freshTmp("ds-digest-quiet-");
		await mkdir(dir, { recursive: true });

		const result = await runCli(dir, ["digest"]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("# Design-system digest");
		expect(result.stdout).toContain("Quiet week");
		expect(result.stdout).not.toContain("## Actions");
	});

	it("relative 7d default: now−30d is the baseline (out), now−1d is in-window", async () => {
		const dir = await freshTmp("ds-digest-default-");
		await seedHistory(dir, [
			line({ at: daysAgoIso(30), kind: "handoff", score: 60 }), // baseline (out)
			line({ at: daysAgoIso(1), kind: "handoff", score: 90 }), // in-window
		]);

		const result = await runCli(dir, ["digest"]);
		expect(result.code).toBe(0);
		// Membership only: a readiness movement row exists (baseline 60 → 90).
		expect(result.stdout).toContain("Readiness");
		expect(result.stdout).toContain("## For designers");
	});

	it("relative window with a clearly-out-of-window-only baseline → quiet", async () => {
		const dir = await freshTmp("ds-digest-stale-");
		await seedHistory(dir, [
			line({ at: daysAgoIso(30), kind: "handoff", score: 60 }),
			line({ at: daysAgoIso(20), kind: "lint", byKind: { offSystem: 1 } }),
		]);

		const result = await runCli(dir, ["digest"]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("Quiet week");
	});

	it("absolute-ISO --since fixes the boundary → exact movement + action rows", async () => {
		const dir = await freshTmp("ds-digest-iso-");
		await seedHistory(dir, [
			line({
				at: "2026-05-20T00:00:00.000Z",
				kind: "tokens-check",
				stale: 5,
				missing: 0,
				orphan: 0,
			}),
			line({
				at: "2026-06-03T00:00:00.000Z",
				kind: "tokens-check",
				stale: 2,
				missing: 0,
				orphan: 0,
			}),
		]);

		const result = await runCli(dir, ["digest", "--since", "2026-06-01"]);
		expect(result.code).toBe(0);
		// Boundary fixed at 2026-06-01T00:00:00.000Z → the 06-03 line is in-window,
		// the 05-20 line is the baseline: an exact "Drift ▼ 5 → 2" row.
		expect(result.stdout).toContain("- Drift ▼ 5 → 2");
		// stale>0 in window → the token-check action fires.
		expect(result.stdout).toContain("1. Run `ds-bridge tokens check`");
	});

	it("--audience designers renders a single section and filters developer-only rows", async () => {
		const dir = await freshTmp("ds-digest-aud-");
		await seedHistory(dir, [
			line({ at: "2026-06-02T00:00:00.000Z", kind: "handoff", score: 90 }),
			line({
				at: "2026-06-02T00:00:00.000Z",
				kind: "lint",
				byKind: { offSystem: 1 },
			}),
		]);

		const result = await runCli(dir, [
			"digest",
			"--since",
			"2026-06-01",
			"--audience",
			"designers",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("## For designers");
		expect(result.stdout).not.toContain("## For developers");
		expect(result.stdout).toContain("Readiness");
		expect(result.stdout).not.toContain("Lint violations");
	});

	it("stdout is pipe-clean (no trailing path line) without --out", async () => {
		const dir = await freshTmp("ds-digest-pipe-");
		await seedHistory(dir, [
			line({
				at: "2026-06-03T00:00:00.000Z",
				kind: "handoff",
				score: 90,
			}),
		]);

		const result = await runCli(dir, ["digest", "--since", "2026-06-01"]);
		expect(result.code).toBe(0);
		// The body starts with the title and contains no filesystem path line.
		expect(result.stdout.startsWith("# Design-system digest")).toBe(true);
		expect(result.stdout).not.toContain(dir);
	});

	it("--out writes the digest to a file and prints that path", async () => {
		const dir = await freshTmp("ds-digest-out-");
		await seedHistory(dir, [
			line({ at: "2026-06-03T00:00:00.000Z", kind: "handoff", score: 90 }),
		]);
		const outFile = join(dir, "digest.md");

		const result = await runCli(dir, [
			"digest",
			"--since",
			"2026-06-01",
			"--out",
			outFile,
		]);
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe(outFile);
		const written = await readFile(outFile, "utf8");
		expect(written).toContain("# Design-system digest");
		expect(written).toContain("Readiness");
	});

	it("honors a raised readiness_threshold from .ds-bridge.json (handoff-qa action)", async () => {
		const dir = await freshTmp("ds-digest-cfg-");
		await seedHistory(dir, [
			line({ at: "2026-06-03T00:00:00.000Z", kind: "handoff", score: 85 }),
		]);
		await writeFile(
			join(dir, ".ds-bridge.json"),
			`${JSON.stringify({ readiness_threshold: 90 })}\n`,
			"utf8",
		);

		const result = await runCli(dir, ["digest", "--since", "2026-06-01"]);
		expect(result.code).toBe(0);
		// 85 is fine under the default 80, but the project raised the gate to 90.
		expect(result.stdout).toContain("Run `ds-bridge handoff <frame-url>`");
	});

	it("an invalid .ds-bridge.json exits 2", async () => {
		const dir = await freshTmp("ds-digest-badcfg-");
		await seedHistory(dir, [
			line({ at: "2026-06-03T00:00:00.000Z", kind: "handoff", score: 50 }),
		]);
		await writeFile(join(dir, ".ds-bridge.json"), "{ not json", "utf8");

		const result = await runCli(dir, ["digest", "--since", "2026-06-01"]);
		expect(result.code).toBe(2);
	});

	it("bad --since exits 2 listing the accepted forms", async () => {
		const dir = await freshTmp("ds-digest-badsince-");
		await mkdir(dir, { recursive: true });

		const result = await runCli(dir, ["digest", "--since", "last tuesday"]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("YYYY-MM-DD");
		expect(result.stderr).toContain("<N>d");
	});

	it("bad --audience exits 2", async () => {
		const dir = await freshTmp("ds-digest-badaud-");
		await mkdir(dir, { recursive: true });

		const result = await runCli(dir, ["digest", "--audience", "everyone"]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("--audience");
	});

	it("accepts an explicit [path] argument", async () => {
		const parent = await freshTmp("ds-digest-path-");
		const projectDir = join(parent, "project");
		await seedHistory(projectDir, [
			line({ at: "2026-06-03T00:00:00.000Z", kind: "handoff", score: 90 }),
		]);

		const result = await runCli(parent, [
			"digest",
			"project",
			"--since",
			"2026-06-01",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("Readiness");
	});

	// ---------- F7 — manager audience + HTML format (SPEC-figma-trends §4) ----------

	it("F7: --audience manager renders ONE For managers section with every movement", async () => {
		const dir = await freshTmp("ds-digest-mgr-");
		await seedHistory(dir, [
			line({ at: "2026-06-02T00:00:00.000Z", kind: "handoff", score: 90 }),
			line({
				at: "2026-06-02T00:00:00.000Z",
				kind: "lint",
				byKind: { offSystem: 1 },
			}),
		]);
		for (const audience of ["manager", "managers"]) {
			const result = await runCli(dir, [
				"digest",
				"--since",
				"2026-06-01",
				"--audience",
				audience,
			]);
			expect(result.code).toBe(0);
			expect(result.stdout).toContain("## For managers");
			expect(result.stdout).not.toContain("## For designers");
			expect(result.stdout).not.toContain("## For developers");
			expect(result.stdout).toContain("Readiness");
			expect(result.stdout).toContain("Lint violations");
		}
	});

	it("F7: --format html --out writes an offline page", async () => {
		const dir = await freshTmp("ds-digest-html-");
		await seedHistory(dir, [
			line({ at: "2026-06-03T00:00:00.000Z", kind: "handoff", score: 90 }),
		]);
		const outFile = join(dir, "site", "digest.html");
		const result = await runCli(dir, [
			"digest",
			"--since",
			"2026-06-01",
			"--audience",
			"manager",
			"--format",
			"html",
			"--out",
			outFile,
		]);
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe(outFile);
		const html = await readFile(outFile, "utf8");
		expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
		expect(html).toContain("<h2>For managers</h2>");
		expect(html).toContain("Readiness");
	});

	it("F7: --format md is the default output, byte-identical", async () => {
		const dir = await freshTmp("ds-digest-md-");
		await seedHistory(dir, [
			line({ at: "2026-06-03T00:00:00.000Z", kind: "handoff", score: 90 }),
		]);
		const plain = await runCli(dir, ["digest", "--since", "2026-06-01"]);
		const md = await runCli(dir, [
			"digest",
			"--since",
			"2026-06-01",
			"--format",
			"md",
		]);
		expect(md.code).toBe(0);
		expect(md.stdout).toBe(plain.stdout);
	});

	it("F7: a bad --format exits 2", async () => {
		const dir = await freshTmp("ds-digest-fmt-");
		const result = await runCli(dir, ["digest", "--format", "pdf"]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("--format");
	});
});
