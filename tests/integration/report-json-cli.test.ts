// E3 (SPEC-analytics-export §2) — integration: `report --format json`. Spawns
// dist/cli.mjs against throwaway projects in fresh tmp dirs; SOURCE_DATE_EPOCH
// pins the render instant. Output is validated against schemas/report.v1.schema.json.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { type JsonSchema, validateJsonSchema } from "../helpers/json-schema.js";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

/** 2026-10-05T12:00:00Z — the pinned render instant. */
const ENV = { SOURCE_DATE_EPOCH: "1791201600" };

async function runCli(
	args: string[],
	extraEnv: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8", env: { ...process.env, ...ENV, ...extraEnv } },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

const tmpDirs: string[] = [];
afterAll(async () => {
	await Promise.all(
		tmpDirs.map((d) => rm(d, { recursive: true, force: true })),
	);
});

async function project(lines: object[], registry?: object): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-report-json-"));
	tmpDirs.push(dir);
	const stateDir = join(dir, ".ds-bridge");
	await mkdir(stateDir, { recursive: true });
	if (lines.length > 0) {
		await writeFile(
			join(stateDir, "history.jsonl"),
			`${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
			"utf8",
		);
	}
	if (registry !== undefined) {
		await writeFile(
			join(stateDir, "registry.json"),
			JSON.stringify(registry),
			"utf8",
		);
	}
	return dir;
}

const HISTORY: object[] = [
	{
		at: "2026-09-10T10:00:00.000Z",
		kind: "lint",
		byKind: { exact: 3, near: 2, offSystem: 6 },
		adoption: { refs: 30, literals: 10, byDirectory: [] },
	},
	{
		at: "2026-09-20T10:00:00.000Z",
		kind: "handoff",
		score: 60,
		frameName: "Checkout",
		fileKey: "F1",
		nodeId: "1:2",
		deductions: [],
	},
	{
		at: "2026-10-01T10:00:00.000Z",
		kind: "handoff",
		score: 90,
		frameName: "Profile",
		fileKey: "F1",
		nodeId: "3:4",
		deductions: [],
	},
	{
		at: "2026-10-02T10:00:00.000Z",
		kind: "library-health",
		overrideHotspots: 1,
		deprecatedUsage: 2,
		detachedCandidates: 0,
	},
	{
		at: "2026-10-03T10:00:00.000Z",
		kind: "lint",
		byKind: { exact: 3, near: 2, offSystem: 4 },
		adoption: { refs: 36, literals: 4, byDirectory: [] },
	},
	{
		at: "2026-10-04T10:00:00.000Z",
		kind: "adoption",
		imported: 6,
		total: 8,
		uncovered: ["Spinner", "Tooltip"],
	},
];

const REGISTRY = {
	schemaVersion: 1,
	generatedAt: "2026-10-01T00:00:00.000Z",
	matches: [
		{
			codeName: "Button",
			importPath: "./B",
			figmaName: "Button",
			nodeId: "1:1",
			score: 1,
		},
		{
			codeName: "Card",
			importPath: "./C",
			figmaName: "Card",
			nodeId: "1:2",
			score: 1,
		},
		{
			codeName: "Input",
			importPath: "./I",
			figmaName: "Input",
			nodeId: "1:3",
			score: 1,
		},
	],
	unmatchedCode: [{ name: "FancyBox", importPath: "./F", candidates: [] }],
	unmatchedFigma: [],
};

const schema = JSON.parse(
	await readFile(join(repoRoot, "schemas", "report.v1.schema.json"), "utf8"),
) as JsonSchema;

describe("ds-bridge report --format json", () => {
	it("prints the versioned document; it validates against the committed schema", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const result = await runCli(["report", dir, "--format", "json"]);
		expect(result.code).toBe(0);
		const doc = JSON.parse(result.stdout);
		expect(validateJsonSchema(schema, doc, { strict: true })).toEqual([]);
		expect(doc.schema).toBe("ds-bridge/report");
		expect(doc.schemaVersion).toBe(1);
		expect(doc.view).toBeNull();
		expect(doc.data.generatedAt).toBe("2026-10-05T12:00:00.000Z");
		// The same numbers the exec one-pager shows (one assembly).
		expect(doc.data.systemScore.current).toBe(71);
		expect(doc.data.consistency.score).toBe(84);
		expect(doc.data.debt.pct).toBe(24);
		expect(doc.data.executive.consistency).toBe(84);
		expect(doc.data.importCoverage).toEqual({
			imported: 6,
			total: 8,
			uncovered: ["Spinner", "Tooltip"],
			uncoveredTotal: 2,
		});
		expect(doc.artifacts[0]).toBe("system-score");
	});

	it("--view names the view and its artifacts; data stays the full ReportData", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const full = JSON.parse(
			(await runCli(["report", dir, "--format", "json"])).stdout,
		);
		const exec = JSON.parse(
			(await runCli(["report", dir, "--format", "json", "--view", "exec"]))
				.stdout,
		);
		expect(exec.view).toBe("exec");
		expect(exec.artifacts).toContain("executive");
		expect(exec.artifacts.length).toBeLessThan(full.artifacts.length);
		expect(exec.data).toEqual(full.data);
	});

	it("an empty project is a valid minimal document", async () => {
		const dir = await project([]);
		const result = await runCli(["report", dir, "--format", "json"]);
		expect(result.code).toBe(0);
		expect(
			validateJsonSchema(schema, JSON.parse(result.stdout), { strict: true }),
		).toEqual([]);
	});

	it("is byte-stable with a pinned instant; --out writes the file", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const a = await runCli(["report", dir, "--format", "json"]);
		const out = join(dir, "report.json");
		const b = await runCli(["report", dir, "--format", "json", "--out", out]);
		expect(b.code).toBe(0);
		expect(b.stdout.trim()).toBe(out);
		expect(await readFile(out, "utf8")).toBe(a.stdout);
	});

	it("rejects md/html-only flags with json (exit 2)", async () => {
		const dir = await project(HISTORY, REGISTRY);
		for (const flag of [
			["--gate"],
			["--open"],
			["--snapshot"],
			["--delta", "main"],
		]) {
			const r = await runCli(["report", dir, "--format", "json", ...flag]);
			expect(r.code).toBe(2);
		}
	});

	it("an unknown --format names json among the accepted values", async () => {
		const dir = await project([]);
		const r = await runCli(["report", dir, "--format", "yaml"]);
		expect(r.code).toBe(2);
		expect(r.stderr).toContain("json");
	});
});
