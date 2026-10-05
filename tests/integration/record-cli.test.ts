// H5 — integration: `ds-bridge record` against a throwaway copy of the sample
// project (spawns dist/cli.mjs). One coherent batch: every record shares a runId
// and source, the batch ends with ONE `score` record, and findings never fail
// the run (recording is not gating).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const sampleProject = join(repoRoot, "tests", "fixtures", "sample-project");

const tmpDirs: string[] = [];
async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}
afterAll(async () => {
	for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
});

/** Hermetic env: no Figma config, no inherited batch/source vars. */
function hermeticEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of [
		"FIGMA_TOKEN",
		"FIGMA_DESIGN_SYSTEM_FILE",
		"CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN",
		"CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY",
		"DS_BRIDGE_SOURCE",
		"DS_BRIDGE_RUN_ID",
	]) {
		delete env[key];
	}
	return env;
}

async function runCli(
	args: string[],
	cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8", env: hermeticEnv(), ...(cwd ? { cwd } : {}) },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

async function readRecords(dir: string): Promise<Record<string, unknown>[]> {
	const text = await readFile(join(dir, ".ds-bridge", "history.jsonl"), "utf8");
	return text
		.split("\n")
		.filter((l) => l.trim() !== "")
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

interface RecordJson {
	runId: string;
	source: string;
	checks: { id: string; status: string; reason?: string; frame?: string }[];
	score: { score: number; weightsSource: string } | null;
}

describe("ds-bridge record (H5)", () => {
	it("records one batch sharing a runId, ending with one score record (exit 0 despite findings)", async () => {
		const dir = await freshTmp("ds-record-");
		await cp(sampleProject, dir, { recursive: true });

		const { code, stdout } = await runCli(["record", dir, "--format", "json"]);
		expect(code).toBe(0);
		const out = JSON.parse(stdout) as RecordJson;
		expect(out.source).toBe("local");
		expect(out.runId).toMatch(/\S/);

		const status = Object.fromEntries(out.checks.map((c) => [c.id, c.status]));
		// The sample project has violations (lint exits 1) — still recorded.
		expect(status.lint).toBe("recorded");
		expect(status["tokens-check"]).toBe("recorded");
		expect(status.adoption).toBe("skipped");
		expect(status["registry-build"]).toBe("skipped");

		const records = await readRecords(dir);
		expect(records.length).toBeGreaterThanOrEqual(3);
		for (const r of records) {
			expect(r.v).toBe(2);
			expect(r.runId).toBe(out.runId);
			expect(r.source).toBe("local");
		}
		const last = records[records.length - 1];
		expect(last?.kind).toBe("score");
		expect(records.filter((r) => r.kind === "score")).toHaveLength(1);
		expect(last?.score).toBe(out.score?.score);
		expect(last?.weightsSource).toBe("default");
		expect(last?.weights).toBeTypeOf("object");
	});

	it("H12: never writes the project's .gitattributes (history init is opt-in)", async () => {
		const dir = await freshTmp("ds-record-attrs-");
		await cp(sampleProject, dir, { recursive: true });
		expect((await runCli(["record", dir, "--format", "json"])).code).toBe(0);
		await expect(
			readFile(join(dir, ".gitattributes"), "utf8"),
		).rejects.toThrow();
	});

	it("--source ci stamps every record of the batch", async () => {
		const dir = await freshTmp("ds-record-ci-");
		await cp(sampleProject, dir, { recursive: true });
		const { code } = await runCli([
			"record",
			dir,
			"--source",
			"ci",
			"--format",
			"json",
		]);
		expect(code).toBe(0);
		const records = await readRecords(dir);
		expect(records.every((r) => r.source === "ci")).toBe(true);
	});

	it("defaults the project to the cwd and prints a term summary", async () => {
		const dir = await freshTmp("ds-record-term-");
		await cp(sampleProject, dir, { recursive: true });
		const { code, stdout } = await runCli(["record"], dir);
		expect(code).toBe(0);
		expect(stdout).toContain("lint");
		expect(stdout).toMatch(/recorded/);
		expect(stdout).toMatch(/score/i);
	});

	it("a project with nothing to check: exit 0, checks skipped, no score record", async () => {
		const dir = await freshTmp("ds-record-empty-");
		await writeFile(join(dir, "README.md"), "nothing here\n", "utf8");
		const { code, stdout } = await runCli(["record", dir, "--format", "json"]);
		expect(code).toBe(0);
		const out = JSON.parse(stdout) as RecordJson;
		expect(out.score).toBeNull();
		expect(out.checks.find((c) => c.id === "lint")?.status).toBe("skipped");
	});

	it("--figma without Figma config skips the Figma checks with a reason", async () => {
		const dir = await freshTmp("ds-record-figma-");
		await cp(sampleProject, dir, { recursive: true });
		// cwd = the tmp project: no .ds-bridge.env is hydrated from elsewhere.
		const { code, stdout } = await runCli(
			["record", dir, "--figma", "--format", "json"],
			dir,
		);
		expect(code).toBe(0);
		const out = JSON.parse(stdout) as RecordJson;
		const reg = out.checks.find((c) => c.id === "registry-build");
		expect(reg?.status).toBe("skipped");
		expect(reg?.reason).toMatch(/not configured/i);
	});

	it("exit 2 on an invalid --source, --format, or a missing path", async () => {
		const dir = await freshTmp("ds-record-bad-");
		expect((await runCli(["record", dir, "--source", "nightly"])).code).toBe(2);
		expect((await runCli(["record", dir, "--format", "xml"])).code).toBe(2);
		expect((await runCli(["record", join(dir, "does-not-exist")])).code).toBe(
			2,
		);
	});

	it("F2: exit 2 on an invalid --library-top (before any check runs)", async () => {
		const dir = await freshTmp("ds-record-top-");
		const result = await runCli(["record", dir, "--library-top", "lots"]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("--library-top");
		expect(existsSync(join(dir, ".ds-bridge", "history.jsonl"))).toBe(false);
	});

	it("F2: --help documents --library-top", async () => {
		const { stdout } = await runCli(["record", "--help"]);
		expect(stdout).toContain("--library-top");
	});

	it("--help documents the flags", async () => {
		const { code, stdout } = await runCli(["record", "--help"]);
		expect(code).toBe(0);
		for (const flag of ["--source", "--figma", "--no-figma", "--format"]) {
			expect(stdout).toContain(flag);
		}
	});
});

// ---------- H14 — tracked frames: record --figma scores each with handoff ----------

describe("ds-bridge record — tracked frames (H14)", () => {
	const FILE_KEY = "ABcdEFghIJklMNopQRstUV";
	const fixturesDir = join(repoRoot, "tests", "fixtures", "figma");
	let server: import("node:http").Server;
	let baseUrl = "";

	beforeAll(async () => {
		const { createServer } = await import("node:http");
		const { readFile: read } = await import("node:fs/promises");
		const fileJson = await read(join(fixturesDir, "file.json"), "utf8");
		const nodesJson = await read(join(fixturesDir, "file-nodes.json"), "utf8");
		server = createServer((req, res) => {
			const url = req.url ?? "";
			if (url.startsWith(`/v1/files/${FILE_KEY}/nodes`)) {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(nodesJson);
				return;
			}
			if (url === `/v1/files/${FILE_KEY}`) {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(fileJson);
				return;
			}
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ err: "Not found" }));
		});
		await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
		const address = server.address() as import("node:net").AddressInfo;
		baseUrl = `http://127.0.0.1:${address.port}`;
	}, 120_000);

	afterAll(async () => {
		await new Promise<void>((done) => server.close(() => done()));
	});

	async function runWithFigma(
		args: string[],
	): Promise<{ code: number; stdout: string; stderr: string }> {
		const env = {
			...hermeticEnv(),
			FIGMA_API_BASE: baseUrl,
			FIGMA_TOKEN: "figd-test-token",
		};
		try {
			const { stdout, stderr } = await execFileAsync(
				process.execPath,
				[cliPath, ...args],
				{ encoding: "utf8", env },
			);
			return { code: 0, stdout, stderr };
		} catch (error) {
			const e = error as { code: number; stdout: string; stderr: string };
			return { code: e.code, stdout: e.stdout, stderr: e.stderr };
		}
	}

	it("scores each tracked frame inside the same runId; without --figma they are skipped", async () => {
		const dir = await freshTmp("ds-record-frames-");
		await cp(sampleProject, dir, { recursive: true });
		const frame = `https://www.figma.com/design/${FILE_KEY}/Demo`;
		const configPath = join(dir, ".ds-bridge.json");
		const existing = existsSync(configPath)
			? (JSON.parse(await readFile(configPath, "utf8")) as Record<
					string,
					unknown
				>)
			: {};
		await writeFile(
			configPath,
			JSON.stringify({ ...existing, tracked_frames: [frame] }),
			"utf8",
		);

		const skipped = await runWithFigma(["record", dir, "--format", "json"]);
		expect(skipped.code).toBe(0);
		const skippedJson = JSON.parse(skipped.stdout) as RecordJson & {
			checks: { id: string; status: string; reason?: string; frame?: string }[];
		};
		const skippedRow = skippedJson.checks.find((c) => c.id === "handoff");
		expect(skippedRow?.status).toBe("skipped");
		expect(skippedRow?.frame).toBe(frame);
		expect(skippedRow?.reason).toMatch(/--figma/);

		const result = await runWithFigma([
			"record",
			dir,
			"--figma",
			"--format",
			"json",
		]);
		expect(result.code).toBe(0);
		const json = JSON.parse(result.stdout) as RecordJson & {
			checks: { id: string; status: string; frame?: string }[];
		};
		const row = json.checks.find((c) => c.id === "handoff");
		expect(row).toEqual(expect.objectContaining({ status: "recorded", frame }));
		const records = await readRecords(dir);
		const handoffs = records.filter(
			(r) => r.kind === "handoff" && r.runId === json.runId,
		);
		expect(handoffs).toHaveLength(1);
		expect(handoffs[0]?.fileKey).toBe(FILE_KEY);
		expect(handoffs[0]?.score).toBe(90);
		// The stored score now includes the readiness component.
		const score = records.filter(
			(r) => r.kind === "score" && r.runId === json.runId,
		);
		expect(
			(score[0]?.subScores as Record<string, unknown> | undefined)?.readiness,
		).toBe(90);
	});
});
