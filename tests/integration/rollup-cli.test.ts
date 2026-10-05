// R5 (SPEC-rollup §4) — integration: `ds-bridge rollup` spawned against
// throwaway repos (temp dirs only; nothing is written into any source).
import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const PINNED = { SOURCE_DATE_EPOCH: "1791201600" }; // 2026-10-05T12:00:00Z

async function runCli(
	args: string[],
	cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8", cwd, env: { ...process.env, ...PINNED } },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

const j = (r: Record<string, unknown>) => JSON.stringify(r);
const handoff = (at: string, score: number) =>
	j({ at, kind: "handoff", score, frameName: "F" });

let root: string;
async function seed(name: string, lines: string[]): Promise<string> {
	const dir = join(root, name);
	await mkdir(join(dir, ".ds-bridge"), { recursive: true });
	await writeFile(
		join(dir, ".ds-bridge", "history.jsonl"),
		`${lines.join("\n")}\n`,
		"utf8",
	);
	return dir;
}

interface Json {
	schema: string;
	aggregate: { repos: number; scored: number; meanScore?: number };
	repos: {
		name: string;
		rank?: number;
		status: string;
		score?: number;
		team?: string;
		notes: string[];
	}[];
}

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "ds-rollup-cli-"));
	await seed("web", [handoff("2026-10-01T00:00:00Z", 90)]);
	await seed("ios", [handoff("2026-10-01T00:00:00Z", 60)]);
	await seed("broken", ["not json", "{"]);
	await mkdir(join(root, "nohistory"));
	// A git repo whose committed history differs from its working tree.
	const git = await seed("android", [handoff("2026-10-01T00:00:00Z", 40)]);
	const g = (args: string[]) =>
		execFileSync("git", args, { cwd: git, stdio: "ignore" });
	g(["init", "-q", "-b", "main"]);
	g(["add", "."]);
	g([
		"-c",
		"user.email=t@example.com",
		"-c",
		"user.name=t",
		"commit",
		"-q",
		"-m",
		"seed",
	]);
	g(["branch", "ds-bridge-data"]);
	await writeFile(
		join(git, ".ds-bridge", "history.jsonl"),
		`${handoff("2026-10-02T00:00:00Z", 99)}\n`,
	);
});
afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("ds-bridge rollup", () => {
	it("ranks two repos (term default)", async () => {
		const r = await runCli(["rollup", "web", "ios"], root);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain("Org rollup — 2 repos (2 scored)");
		expect(r.stdout.indexOf("web")).toBeLessThan(r.stdout.indexOf("ios"));
	});

	it("--format json prints the model", async () => {
		const r = await runCli(["rollup", "ios", "web", "--format", "json"], root);
		expect(r.code).toBe(0);
		const doc = JSON.parse(r.stdout) as Json;
		expect(doc.schema).toBe("ds-bridge/rollup");
		expect(doc.repos.map((x) => [x.name, x.rank, x.score])).toEqual([
			["web", 1, 90],
			["ios", 2, 60],
		]);
		expect(doc.aggregate).toMatchObject({ repos: 2, scored: 2, meanScore: 75 });
	});

	it("reads <path>@<ref> from git, not the working tree", async () => {
		const r = await runCli(
			["rollup", "android@ds-bridge-data", "android", "--format=json"],
			root,
		);
		expect(r.code).toBe(0);
		const doc = JSON.parse(r.stdout) as Json;
		expect(doc.repos.map((x) => [x.name, x.score])).toEqual([
			["android (2)", 99],
			["android", 40],
		]);
	});

	it("notes missing, corrupt and bad-ref sources and still exits 0", async () => {
		const r = await runCli(
			[
				"rollup",
				"web",
				"broken",
				"nohistory",
				"does-not-exist",
				"android@no-such-ref",
				"--format",
				"json",
			],
			root,
		);
		expect(r.code).toBe(0);
		const doc = JSON.parse(r.stdout) as Json;
		const by = new Map(doc.repos.map((x) => [x.name, x]));
		expect(by.get("web")?.status).toBe("ok");
		expect(by.get("broken")?.status).toBe("no-data");
		expect(by.get("nohistory")?.status).toBe("unavailable");
		expect(by.get("does-not-exist")?.status).toBe("unavailable");
		expect(by.get("android")?.status).toBe("unavailable");
		for (const name of ["broken", "nohistory", "does-not-exist", "android"]) {
			expect(by.get(name)?.notes.length).toBeGreaterThan(0);
		}
	});

	it("uses ./.ds-bridge/rollup.json (relative sources, teams) by default", async () => {
		const project = join(root, "org");
		await mkdir(join(project, ".ds-bridge"), { recursive: true });
		await writeFile(
			join(project, ".ds-bridge", "rollup.json"),
			j([
				{ name: "Web app", source: "../web", team: "Web" },
				{ name: "iOS", source: "../ios" } as never,
			] as never),
		);
		const r = await runCli(["rollup", "--format", "json"], project);
		expect(r.code).toBe(0);
		const doc = JSON.parse(r.stdout) as Json;
		expect(doc.repos.map((x) => [x.name, x.team])).toEqual([
			["Web app", "Web"],
			["iOS", undefined],
		]);
	});

	it("--config reads an explicit config and combines it with positional sources", async () => {
		const cfg = join(root, "rollup.json");
		await writeFile(cfg, j([{ name: "W", source: "web" }] as never));
		const r = await runCli(
			["rollup", "ios", "--config", cfg, "--format", "json"],
			root,
		);
		expect(r.code).toBe(0);
		const doc = JSON.parse(r.stdout) as Json;
		expect(doc.repos.map((x) => x.name)).toEqual(["W", "ios"]);
	});

	it("--format md renders a Markdown table", async () => {
		const r = await runCli(["rollup", "web", "--format", "md"], root);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain("## Design-system org rollup");
	});

	it("--format md never publishes absolute local paths in notes", async () => {
		const r = await runCli(
			[
				"rollup",
				"web",
				"nohistory",
				"does-not-exist",
				"android@no-such-ref",
				"--format",
				"md",
			],
			root,
		);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain("### Notes");
		expect(r.stdout).not.toContain(root);
		expect(r.stdout).not.toMatch(/\/(private|var|tmp|Users)\//);
		expect(r.stdout).toContain("does-not-exist does not exist.");
	});

	it("--out writes the html page and prints the path", async () => {
		const out = join(root, "out", "org.html");
		const r = await runCli(
			["rollup", "web", "ios", "--format", "html", "--out", out],
			root,
		);
		expect(r.code).toBe(0);
		expect(r.stdout.trim()).toBe(out);
		const html = await readFile(out, "utf8");
		expect(html).toContain("<title>Design system org rollup</title>");
	});

	it("leaves every source repo untouched", async () => {
		const before = await readFile(
			join(root, "web", ".ds-bridge", "history.jsonl"),
			"utf8",
		);
		await runCli(["rollup", "web"], root);
		const after = await readFile(
			join(root, "web", ".ds-bridge", "history.jsonl"),
			"utf8",
		);
		expect(after).toBe(before);
	});

	it("exits 2 with no sources and no rollup.json", async () => {
		const r = await runCli(["rollup"], join(root, "nohistory"));
		expect(r.code).toBe(2);
		expect(r.stderr).toMatch(/rollup\.json/);
	});

	it("exits 2 on a bad --format", async () => {
		const r = await runCli(["rollup", "web", "--format", "pdf"], root);
		expect(r.code).toBe(2);
		expect(r.stderr).toMatch(/--format/);
	});

	it("exits 2 on an invalid config", async () => {
		const cfg = join(root, "bad.json");
		await writeFile(cfg, j({ repos: [] }));
		const r = await runCli(["rollup", "--config", cfg], root);
		expect(r.code).toBe(2);
		expect(r.stderr).toMatch(/array/);
	});

	it("exits 2 on a missing --config file", async () => {
		const r = await runCli(
			["rollup", "--config", join(root, "missing.json")],
			root,
		);
		expect(r.code).toBe(2);
	});

	it("is listed in --help", async () => {
		const r = await runCli(["rollup", "--help"], root);
		expect(r.stdout).toContain("--config <file>");
		expect(r.stdout).toContain("term | md | json | html");
	});
});
