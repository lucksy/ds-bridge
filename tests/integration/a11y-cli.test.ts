// T7.3 — integration: the built CLI's `a11y [path]` command. Spawns
// dist/cli.mjs against token fixtures and asserts exit codes + JSON shape.
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const fixturesRoot = join(repoRoot, "tests", "fixtures", "tokens");
const modesFixture = join(fixturesRoot, "a11y-modes.tokens.json");

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

/** Run the CLI; resolve with exit code + streams whether it exits 0 or non-0. */
async function run(args: string[]): Promise<ExecResult> {
	try {
		const { stdout, stderr } = await execFileAsync(process.execPath, [
			cliPath,
			...args,
		]);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (isExecError(error)) return error;
		throw error;
	}
}

interface JsonFinding {
	mode: string;
	foreground: string;
	background: string;
	ratio?: number;
	required: number;
	status: "pass" | "fail" | "unparseable";
	suggestion?: { kind: string; value?: string };
}

interface JsonReport {
	level: "AA" | "AAA";
	findings: JsonFinding[];
	summary: {
		total: number;
		passed: number;
		failed: number;
		unparseable: number;
	};
}

describe("ds-bridge a11y (built dist/cli.mjs)", () => {
	it("--format=json over the modes fixture exits 1 (dark mode fails) with the report shape", async () => {
		const result = await run([
			"a11y",
			modesFixture,
			"--format=json",
			"--level=AA",
		]);
		expect(result.code).toBe(1);
		const report = JSON.parse(result.stdout) as JsonReport;
		expect(report.level).toBe("AA");
		expect(Array.isArray(report.findings)).toBe(true);
		expect(report.summary.total).toBeGreaterThan(0);
		// dark mode text.muted on surface.canvas fails (2.35 < 4.5)
		const darkFail = report.findings.find(
			(f) =>
				f.mode === "dark" &&
				f.foreground.includes("muted") &&
				f.status === "fail",
		);
		expect(darkFail).toBeDefined();
		expect(darkFail?.suggestion?.kind).toBe("adjusted");
		expect(typeof darkFail?.suggestion?.value).toBe("string");
	});

	it("--modes light filters to only the passing mode and exits 0", async () => {
		const result = await run([
			"a11y",
			modesFixture,
			"--modes=light",
			"--format=json",
			"--level=AA",
		]);
		expect(result.code).toBe(0);
		const report = JSON.parse(result.stdout) as JsonReport;
		expect(report.findings.every((f) => f.mode === "light")).toBe(true);
		expect(report.summary.failed).toBe(0);
	});

	it("--level=AAA tightens the threshold so light mode also fails", async () => {
		const result = await run([
			"a11y",
			modesFixture,
			"--modes=light",
			"--format=json",
			"--level=AAA",
		]);
		// text.muted #6b7280 on white is 4.83 < 7.0 → fail at AAA
		expect(result.code).toBe(1);
		const report = JSON.parse(result.stdout) as JsonReport;
		expect(report.level).toBe("AAA");
		expect(report.summary.failed).toBeGreaterThan(0);
	});

	it("term format prints a table and exits 1 on failures", async () => {
		const result = await run(["a11y", modesFixture, "--format=term"]);
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("dark");
		expect(result.stdout.toLowerCase()).toContain("muted");
	});

	it("an unknown --format exits 2 with an actionable message", async () => {
		const result = await run(["a11y", modesFixture, "--format=xml"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("format");
	});

	it("an unknown --level exits 2 with an actionable message", async () => {
		const result = await run(["a11y", modesFixture, "--level=AAAA"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("level");
	});

	it("a nonexistent path exits 2 with an actionable message", async () => {
		const missing = join(fixturesRoot, "does-not-exist.json");
		const result = await run(["a11y", missing, "--format=json"]);
		expect(result.code).toBe(2);
		expect(result.stderr.length).toBeGreaterThan(0);
	});

	it("an unknown --modes value exits 2 listing the available modes", async () => {
		const result = await run(["a11y", modesFixture, "--modes=nope"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("mode");
	});

	it("T7.22: a directory run appends one a11y history line", async () => {
		const dir = await mkdtemp(join(tmpdir(), "ds-a11y-history-"));
		try {
			await copyFile(modesFixture, join(dir, "tokens.json"));
			const result = await run(["a11y", dir, "--format=json"]);
			expect(result.code).toBe(1);

			const text = await readFile(
				join(dir, ".ds-bridge", "history.jsonl"),
				"utf8",
			);
			const lines = text.trim().split("\n");
			expect(lines).toHaveLength(1);
			const record = JSON.parse(lines[0] ?? "") as {
				at: string;
				kind: string;
				level: string;
				modes: { mode: string; passed: number; failed: number }[];
			};
			expect(record.kind).toBe("a11y");
			expect(record.level).toBe("AA");
			expect(record.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			const dark = record.modes.find((m) => m.mode === "dark");
			expect(dark?.failed).toBeGreaterThan(0);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("T7.22: a single-file run appends NO history (fixtures stay clean)", async () => {
		const dir = await mkdtemp(join(tmpdir(), "ds-a11y-nohistory-"));
		try {
			const file = join(dir, "tokens.json");
			await copyFile(modesFixture, file);
			const result = await run(["a11y", file, "--format=json"]);
			expect(result.code).toBe(1);
			await expect(
				readFile(join(dir, ".ds-bridge", "history.jsonl"), "utf8"),
			).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
