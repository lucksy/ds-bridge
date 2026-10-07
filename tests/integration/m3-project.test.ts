// Real-user regression (Material 3 testbed, 2026-10-07): a W3C (DTCG) token
// set split across files — md.ref primitives, md.sys.color.{light,dark} roles —
// built by Style Dictionary into generated light/dark CSS. Spawns dist/cli.mjs
// against a throwaway copy of tests/fixtures/m3-project.
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const fixture = join(repoRoot, "tests", "fixtures", "m3-project");

interface Run {
	code: number;
	stdout: string;
	stderr: string;
}

async function runCli(args: string[], cwd: string): Promise<Run> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ cwd, env: { ...process.env, NO_COLOR: "1" } },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

let project: string;

beforeAll(async () => {
	project = await mkdtemp(join(tmpdir(), "ds-m3-"));
	await cp(fixture, project, { recursive: true });
});

afterAll(async () => {
	await rm(project, { recursive: true, force: true });
});

describe("tokens check — multi-file DTCG set", () => {
	it("reads the whole tokens/ folder and is in sync across light and dark", async () => {
		const run = await runCli(["tokens", "check", "--format", "json"], project);
		const out = JSON.parse(run.stdout) as {
			inSync: boolean;
			entries: unknown[];
			source: { path: string; files: number; modes: string[] };
		};
		expect(out.entries).toEqual([]);
		expect(out.inSync).toBe(true);
		expect(out.source).toEqual({
			path: "tokens",
			files: 4,
			modes: ["light", "dark"],
		});
		expect(run.code).toBe(0);
	});

	it("names the token source in the terminal output", async () => {
		const run = await runCli(["tokens", "check"], project);
		expect(run.stdout).toContain(
			"Token source: tokens (4 files · modes light, dark)",
		);
	});

	it("reports a stale dark-mode output as dark drift", async () => {
		const dark = join(project, "src", "styles", "tokens.dark.css");
		const original = await readFile(dark, "utf8");
		await writeFile(
			dark,
			original.replace(
				"--md-sys-color-primary: #cfbdfe",
				"--md-sys-color-primary: #d0bcff",
			),
		);
		try {
			const run = await runCli(
				["tokens", "check", "--format", "json"],
				project,
			);
			const out = JSON.parse(run.stdout) as {
				entries: { kind: string; mode?: string; token: { name: string } }[];
			};
			expect(out.entries).toHaveLength(1);
			expect(out.entries[0]).toMatchObject({
				kind: "stale-output",
				mode: "dark",
				token: { name: "md.sys.color.primary" },
			});
			expect(run.code).toBe(1);
		} finally {
			await writeFile(dark, original);
		}
	});

	it("accepts the folder through --tokens", async () => {
		const run = await runCli(
			[
				"tokens",
				"check",
				"--tokens",
				join(project, "tokens"),
				"--format",
				"json",
			],
			project,
		);
		expect(JSON.parse(run.stdout).inSync).toBe(true);
	});

	it("tokens parse reads a folder", async () => {
		const run = await runCli(
			["tokens", "parse", "tokens", "--format", "json"],
			project,
		);
		const map = JSON.parse(run.stdout) as { tokens: { name: string }[] };
		expect(map.tokens.map((t) => t.name)).toContain("md.sys.color.on-primary");
		expect(run.code).toBe(0);
	});
});

describe("lint — Material 3 project", () => {
	it("skips generated token outputs and suggests semantic md.sys tokens", async () => {
		const run = await runCli(["lint", ".", "--format", "json"], project);
		const findings = JSON.parse(run.stdout) as {
			file: string;
			raw: string;
			kind: string;
			expectedToken?: string;
		}[];
		expect([...new Set(findings.map((f) => f.file))]).toEqual([
			"src/styles/app.css",
		]);
		const byRaw = Object.fromEntries(findings.map((f) => [f.raw, f]));
		expect(byRaw["#ffffff"]).toMatchObject({
			kind: "exact",
			expectedToken: "md.sys.color.on-primary",
		});
		expect(byRaw["16px"]).toMatchObject({
			kind: "exact",
			expectedToken: "md.sys.spacing.4",
		});
	});
});

describe("a11y — Material on-X / X pairs per mode", () => {
	it("audits on-primary and on-surface in light and dark", async () => {
		const run = await runCli(["a11y", ".", "--format", "json"], project);
		const out = JSON.parse(run.stdout) as {
			findings: { mode: string; foreground: string; background: string }[];
		};
		const keys = out.findings.map(
			(f) => `${f.mode}:${f.foreground}|${f.background}`,
		);
		expect(keys).toEqual(
			expect.arrayContaining([
				"light:md.sys.color.on-primary|md.sys.color.primary",
				"dark:md.sys.color.on-primary|md.sys.color.primary",
				"light:md.sys.color.on-surface|md.sys.color.surface",
				"dark:md.sys.color.on-surface|md.sys.color.surface",
			]),
		);
		expect(run.code).toBe(0);
	});
});
