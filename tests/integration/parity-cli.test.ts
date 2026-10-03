// T5.5 — integration: the built CLI's `ds-bridge parity` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like registry-cli) over
// a HAND-WRITTEN .ds-bridge/registry.json fixture dropped into a fresh tmp
// project — no network, no real scan. The fixture covers all four parity
// statuses so the term table, json, markdown and exit-code paths are exercised.
//
// Exit codes:
//   0  every row is ok
//   1  at least one non-ok row (CI gate)
//   2  operational error (missing registry, bad path)
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

// The CLI reads <cwd>/.ds-bridge.env and resolves "." against cwd, so run it from
// an empty dir: a checkout's own gitignored state (a real token, a registry) must
// not leak into what these tests assert.
const neutralCwd = mkdtempSync(join(tmpdir(), "ds-cli-cwd-"));

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

const tmpDirs: string[] = [];

/** A registry.json covering all four parity statuses. */
const MIXED_REGISTRY = {
	schemaVersion: 1,
	generatedAt: "2026-06-05T00:00:00.000Z",
	matches: [
		{
			codeName: "Button",
			importPath: "components/button.tsx",
			figmaName: "Button",
			nodeId: "10:1",
			score: 0.95,
		},
		{
			codeName: "Badge",
			importPath: "components/badge.tsx",
			figmaName: "Badge",
			nodeId: "10:3",
			score: 0.7,
		},
	],
	unmatchedCode: [
		{
			name: "HeroPanel",
			importPath: "components/hero-panel.tsx",
			candidates: [],
		},
	],
	unmatchedFigma: [
		{
			name: "Tooltip",
			nodeId: "10:9",
			candidates: [{ codeName: "Toolbar", score: 0.5 }],
		},
	],
};

/** A registry.json where everything is ok. */
const ALL_OK_REGISTRY = {
	schemaVersion: 1,
	generatedAt: "2026-06-05T00:00:00.000Z",
	matches: [
		{
			codeName: "Button",
			importPath: "components/button.tsx",
			figmaName: "Button",
			nodeId: "10:1",
			score: 0.95,
		},
		{
			codeName: "Card",
			importPath: "components/card.tsx",
			figmaName: "Card",
			nodeId: "10:2",
			score: 0.9,
		},
	],
	unmatchedCode: [],
	unmatchedFigma: [],
};

async function projectWith(registry: unknown): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-bridge-parity-"));
	tmpDirs.push(dir);
	await mkdir(join(dir, ".ds-bridge"), { recursive: true });
	await writeFile(
		join(dir, ".ds-bridge", "registry.json"),
		`${JSON.stringify(registry, null, 2)}\n`,
		"utf8",
	);
	return dir;
}

async function emptyProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-bridge-parity-"));
	tmpDirs.push(dir);
	return dir;
}

async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{
				encoding: "utf8",
				cwd: neutralCwd,
				env: { ...process.env, NO_COLOR: "1" },
			},
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

interface ParityJson {
	rows: { component: string; status: string; detail: string }[];
	summary: {
		ok: number;
		missingInCode: number;
		missingInFigma: number;
		propMismatch: number;
	};
}

describe("ds-bridge parity (built dist/cli.mjs)", () => {
	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("prints a term table and exits 1 when any row is non-ok", async () => {
		const dir = await projectWith(MIXED_REGISTRY);
		const result = await runCli(["parity", dir]);
		expect(result.code).toBe(1);
		// Every component appears in the table.
		expect(result.stdout).toContain("Button");
		expect(result.stdout).toContain("HeroPanel");
		expect(result.stdout).toContain("Tooltip");
		expect(result.stdout).toContain("Badge");
		// Statuses are visible.
		expect(result.stdout).toContain("missing-in-code");
		expect(result.stdout).toContain("missing-in-figma");
		expect(result.stdout).toContain("prop-mismatch");
	});

	it("--format=json prints a ParityReport with summary counts", async () => {
		const dir = await projectWith(MIXED_REGISTRY);
		const result = await runCli(["parity", dir, "--format=json"]);
		expect(result.code).toBe(1);
		const doc = JSON.parse(result.stdout) as ParityJson;
		expect(doc.summary).toEqual({
			ok: 1,
			missingInCode: 1,
			missingInFigma: 1,
			propMismatch: 1,
		});
		expect(doc.rows).toHaveLength(4);
	});

	it("a component filter narrows the rows by normalized name substring", async () => {
		const dir = await projectWith(MIXED_REGISTRY);
		const result = await runCli(["parity", "button", dir, "--format=json"]);
		// Still a non-ok run overall? No — filtered to Button which is ok -> exit 0.
		const doc = JSON.parse(result.stdout) as ParityJson;
		expect(doc.rows.map((r) => r.component)).toEqual(["Button"]);
		expect(doc.summary.ok).toBe(1);
		expect(result.code).toBe(0);
	});

	it("--markdown emits a GitHub-flavored markdown table with a header row", async () => {
		const dir = await projectWith(MIXED_REGISTRY);
		const result = await runCli(["parity", dir, "--markdown"]);
		expect(result.code).toBe(1);
		// A markdown table has a pipe-delimited header row and a separator row.
		const lines = result.stdout.split("\n").filter((l) => l.includes("|"));
		expect(lines.length).toBeGreaterThan(1);
		const headerRow = lines[0] ?? "";
		expect(headerRow).toContain("|");
		expect(headerRow.toLowerCase()).toContain("component");
		expect(headerRow.toLowerCase()).toContain("status");
		// The separator row of dashes.
		expect(result.stdout).toMatch(/\|\s*-+\s*\|/);
	});

	it("exits 0 when every row is ok", async () => {
		const dir = await projectWith(ALL_OK_REGISTRY);
		const result = await runCli(["parity", dir]);
		expect(result.code).toBe(0);
	});

	it("exits 2 with run-build guidance when the registry is missing", async () => {
		const dir = await emptyProject();
		const result = await runCli(["parity", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("registry build");
	});
});
