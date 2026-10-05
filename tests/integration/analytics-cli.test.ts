// E5 (SPEC-analytics-export §3) — integration: `ds-bridge analytics` rollup and
// `--emit` artifacts. Spawns dist/cli.mjs against throwaway projects in fresh tmp
// dirs; SOURCE_DATE_EPOCH pins the render instant (byte-stable artifacts).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

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
	const dir = await mkdtemp(join(tmpdir(), "ds-analytics-"));
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

const ARTIFACTS = [
	"analytics.json",
	"code-metrics.json",
	"design-system-score.json",
	"figma-metrics.json",
	"git-metrics.json",
	"token-metrics.json",
];

describe("ds-bridge analytics (rollup)", () => {
	it("prints the executive headline and per-domain status; writes nothing", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const result = await runCli(["analytics", dir]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("Health           71/100");
		expect(result.stdout).toContain("Consistency      84/100");
		expect(result.stdout).toContain("Debt             24/100 (low)");
		expect(result.stdout).toContain(
			"token   no data — run ds-bridge tokens check",
		);
		expect(existsSync(join(dir, ".ds-bridge", "analytics"))).toBe(false);
	});

	it("--format json prints the merged analytics document (same numbers as report json)", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const result = await runCli(["analytics", dir, "--format", "json"]);
		expect(result.code).toBe(0);
		const doc = JSON.parse(result.stdout);
		const report = JSON.parse(
			(await runCli(["report", dir, "--format", "json"])).stdout,
		);
		expect(doc.schema).toBe("ds-bridge/analytics");
		expect(doc.schemaVersion).toBe(1);
		expect(doc.executive).toEqual(report.data.executive);
		expect(doc.domains.score.metrics.debt).toEqual(report.data.debt);
		expect(doc.domains.figma.status).toBe("ok");
		expect(existsSync(join(dir, ".ds-bridge", "analytics"))).toBe(false);
	});

	it("an empty project is all no-data, exit 0", async () => {
		const dir = await project([]);
		const result = await runCli(["analytics", dir, "--format", "json"]);
		expect(result.code).toBe(0);
		const doc = JSON.parse(result.stdout);
		expect(doc.domains).toEqual({
			figma: {
				status: "no-data",
				metrics: {},
				hint: "ds-bridge record --figma (per-frame readiness: ds-bridge handoff / ds-bridge frame-impl)",
			},
			code: { status: "no-data", metrics: {}, hint: "ds-bridge record" },
			token: {
				status: "no-data",
				metrics: {},
				hint: "ds-bridge tokens check",
			},
			git: { status: "no-data", metrics: {}, hint: "ds-bridge changelog" },
			score: { status: "no-data", metrics: {}, hint: "ds-bridge record" },
		});
		const term = await runCli(["analytics", dir]);
		expect(term.code).toBe(0);
		expect(term.stdout).not.toContain("ok (");
		expect(term.stdout).toContain(
			"Nothing recorded yet — run ds-bridge record.",
		);
	});
});

describe("ds-bridge analytics --emit", () => {
	it("--emit all writes the five artifacts + analytics.json under .ds-bridge/analytics/", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const result = await runCli(["analytics", dir, "--emit", "all"]);
		expect(result.code).toBe(0);
		const outDir = join(dir, ".ds-bridge", "analytics");
		expect((await readdir(outDir)).sort()).toEqual(ARTIFACTS);
		expect(result.stdout.trim().split("\n").sort()).toEqual(
			ARTIFACTS.map((f) => join(outDir, f)).sort(),
		);
		const score = JSON.parse(
			await readFile(join(outDir, "design-system-score.json"), "utf8"),
		);
		expect(score.schema).toBe("ds-bridge/analytics/score");
		expect(score.status).toBe("ok");
		expect(score.metrics.consistency.score).toBe(84);
		expect(score.generatedAt).toBe("2026-10-05T12:00:00.000Z");
	});

	it("artifacts are byte-stable across runs with a pinned instant (sorted keys)", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const outDir = join(dir, ".ds-bridge", "analytics");
		await runCli(["analytics", dir, "--emit", "all"]);
		const first = await readFile(join(outDir, "analytics.json"), "utf8");
		await runCli(["analytics", dir, "--emit", "all"]);
		expect(await readFile(join(outDir, "analytics.json"), "utf8")).toBe(first);
		const keys = Object.keys(JSON.parse(first));
		expect(keys).toEqual([...keys].sort());
	});

	it("--emit <domain> --out <dir> writes one artifact there; json lists it", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const out = join(dir, "custom-out");
		const result = await runCli([
			"analytics",
			dir,
			"--emit",
			"figma",
			"--out",
			out,
			"--format",
			"json",
		]);
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({
			written: [join(out, "figma-metrics.json")],
		});
		expect(await readdir(out)).toEqual(["figma-metrics.json"]);
		expect(existsSync(join(dir, ".ds-bridge", "analytics"))).toBe(false);
	});

	it("usage errors exit 2: bad --emit, bad --format, --out without --emit, bad path", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const bad = [
			["analytics", dir, "--emit", "design"],
			["analytics", dir, "--format", "html"],
			["analytics", dir, "--out", join(dir, "x")],
			["analytics", join(dir, "missing")],
		];
		for (const args of bad) {
			const r = await runCli(args);
			expect(r.code).toBe(2);
			expect(r.stderr).not.toBe("");
		}
		expect(existsSync(join(dir, "x"))).toBe(false);
	});

	it("an invalid .ds-bridge.json is exit 2", async () => {
		const dir = await project(HISTORY, REGISTRY);
		await writeFile(join(dir, ".ds-bridge.json"), "{not json", "utf8");
		const r = await runCli(["analytics", dir]);
		expect(r.code).toBe(2);
	});
});
