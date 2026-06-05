// T1.8 — integration: the built CLI's `tokens parse <path>` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like cli-shell.test.ts).
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const fixturesRoot = join(repoRoot, "tests", "fixtures", "tokens");

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

const FIXTURES = ["w3c", "tokens-studio", "style-dictionary"] as const;

describe("ds-bridge tokens parse (built dist/cli.mjs)", () => {
	beforeAll(async () => {
		// Build the bundle the test exercises — acceptance is against dist, not src.
		await execFileAsync("npm", ["run", "build"], { cwd: repoRoot });
	}, 120_000);

	describe("--format=json deep-equals the golden twin (checkpoint C1)", () => {
		for (const fixture of FIXTURES) {
			it(`${fixture}: JSON output matches expected.json`, async () => {
				const tokensPath = join(fixturesRoot, fixture, "tokens.json");
				const expectedPath = join(fixturesRoot, fixture, "expected.json");
				const { stdout } = await execFileAsync(process.execPath, [
					cliPath,
					"tokens",
					"parse",
					tokensPath,
					"--format=json",
				]);
				const actual = JSON.parse(stdout);
				const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
				expect(actual).toEqual(expected);
			});
		}
	});

	it("term format on the w3c fixture shows count and format, exits 0", async () => {
		const tokensPath = join(fixturesRoot, "w3c", "tokens.json");
		const { stdout } = await execFileAsync(process.execPath, [
			cliPath,
			"tokens",
			"parse",
			tokensPath,
			"--format=term",
		]);
		// 14 tokens in the w3c golden fixture (see fixtures README).
		expect(stdout).toContain("14");
		expect(stdout).toContain("w3c");
	});

	it("term format is the default when --format is omitted", async () => {
		const tokensPath = join(fixturesRoot, "w3c", "tokens.json");
		const { stdout } = await execFileAsync(process.execPath, [
			cliPath,
			"tokens",
			"parse",
			tokensPath,
		]);
		expect(stdout).toContain("14");
		expect(stdout).toContain("w3c");
	});

	it("alias-cycle source exits 1 and names the error on stderr", async () => {
		const cyclePath = join(fixturesRoot, "w3c", "invalid-cycle.json");
		try {
			await execFileAsync(process.execPath, [
				cliPath,
				"tokens",
				"parse",
				cyclePath,
			]);
			throw new Error("expected non-zero exit");
		} catch (error) {
			if (!isExecError(error)) throw error;
			expect(error.code).toBe(1);
			expect(error.stderr).toContain("alias-cycle");
		}
	});

	it("nonexistent path exits 1 with an actionable message", async () => {
		const missing = join(fixturesRoot, "does-not-exist.json");
		try {
			await execFileAsync(process.execPath, [
				cliPath,
				"tokens",
				"parse",
				missing,
			]);
			throw new Error("expected non-zero exit");
		} catch (error) {
			if (!isExecError(error)) throw error;
			expect(error.code).toBe(1);
			expect(error.stderr.toLowerCase()).toContain("could not read");
			expect(error.stderr).toContain(missing);
		}
	});

	it("a non-JSON file exits 1 with an invalid-JSON message", async () => {
		const readmePath = join(fixturesRoot, "README.md");
		try {
			await execFileAsync(process.execPath, [
				cliPath,
				"tokens",
				"parse",
				readmePath,
			]);
			throw new Error("expected non-zero exit");
		} catch (error) {
			if (!isExecError(error)) throw error;
			expect(error.code).toBe(1);
			expect(error.stderr.toLowerCase()).toContain("not valid json");
		}
	});

	it("preserves --version behavior (does not break the shell)", async () => {
		const { stdout } = await execFileAsync(process.execPath, [
			cliPath,
			"--version",
		]);
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };
		expect(stdout.trim()).toBe(pkg.version);
	});
});
