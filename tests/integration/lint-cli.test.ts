// T2.5 — integration: the built CLI's `lint [path]` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like tokens-parse.test.ts).
// --fix tests COPY the sample project into a fresh tmp dir so the originals are
// never mutated; idempotency is asserted byte-for-byte across two fix runs.
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const sampleProject = join(repoRoot, "tests", "fixtures", "sample-project");
const sampleTokens = join(sampleProject, "tokens.json");
const expectedFindingsPath = join(sampleProject, "expected-findings.json");

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

/** Run the CLI; resolve with code/stdout/stderr whether it exits 0 or not. */
async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(process.execPath, [
			cliPath,
			...args,
		]);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

interface ExpectedFinding {
	file: string;
	line: number;
	col: number;
	raw: string;
	property: string;
	kind: string;
	expectedToken?: string;
	expectedCandidates?: string[];
}

interface JsonFinding {
	file: string;
	line: number;
	col: number;
	raw: string;
	property: string;
	kind: string;
	expectedToken?: string;
	expectedCandidates?: string[];
}

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

describe("ds-bridge lint (built dist/cli.mjs)", () => {
	beforeAll(async () => {
		await execFileAsync("npm", ["run", "build"], { cwd: repoRoot });
	}, 120_000);

	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("GOLDEN: --format=json finds every seeded violation, nothing extra (exit 1)", async () => {
		const { code, stdout } = await runCli([
			"lint",
			sampleProject,
			"--format=json",
			"--tokens",
			sampleTokens,
		]);
		expect(code).toBe(1);

		const actual = JSON.parse(stdout) as JsonFinding[];
		const expected = JSON.parse(
			await readFile(expectedFindingsPath, "utf8"),
		) as ExpectedFinding[];

		// Same number of findings — nothing extra, nothing missing.
		expect(actual.length).toBe(expected.length);

		// Order-independent: key each finding by file:line:col.
		const keyOf = (f: { file: string; line: number; col: number }) =>
			`${f.file}:${f.line}:${f.col}`;
		const byKey = new Map(actual.map((f) => [keyOf(f), f]));

		for (const want of expected) {
			const got = byKey.get(keyOf(want));
			expect(got, `missing finding at ${keyOf(want)}`).toBeDefined();
			if (got === undefined) continue;
			expect(got.file).toBe(want.file);
			expect(got.line).toBe(want.line);
			expect(got.col).toBe(want.col);
			expect(got.raw).toBe(want.raw);
			expect(got.property).toBe(want.property);
			expect(got.kind).toBe(want.kind);
			if (want.expectedToken !== undefined) {
				expect(got.expectedToken).toBe(want.expectedToken);
			}
			if (want.expectedCandidates !== undefined) {
				expect(got.expectedCandidates).toBeDefined();
				// The seeded best candidate must be the top-ranked candidate.
				expect(got.expectedCandidates?.[0]).toBe(want.expectedCandidates[0]);
			}
		}
	});

	it("term format mentions counts and at least one file:line:col (exit 1)", async () => {
		const { code, stdout } = await runCli([
			"lint",
			sampleProject,
			"--tokens",
			sampleTokens,
		]);
		expect(code).toBe(1);
		// A file:line:col position for at least one finding.
		expect(stdout).toMatch(/src\/[\w.]+:\d+:\d+/);
		// Summary mentions the finding kinds.
		expect(stdout.toLowerCase()).toContain("exact");
		expect(stdout.toLowerCase()).toContain("near");
	});

	it("a clean directory (only var() css) exits 0", async () => {
		const dir = await freshTmp("ds-lint-clean-");
		await cp(sampleTokens, join(dir, "tokens.json"));
		await writeFile(
			join(dir, "clean.css"),
			".x {\n\tcolor: var(--color-brand-primary);\n\tpadding: var(--space-md);\n}\n",
			"utf8",
		);
		const result = await runCli([
			"lint",
			dir,
			"--tokens",
			join(dir, "tokens.json"),
		]);
		expect(result.code).toBe(0);
	});

	it("--fix applies fixable exact edits and is idempotent on a second run", async () => {
		const dir = await freshTmp("ds-lint-fix-");
		await cp(sampleProject, dir, { recursive: true });
		const tokensInTmp = join(dir, "tokens.json");

		const buttonCss = join(dir, "src", "button.css");
		const bannerTsx = join(dir, "src", "Banner.tsx");
		const cardCss = join(dir, "src", "card.module.css");

		const cardBefore = await readFile(cardCss, "utf8");

		// Run 1: apply fixes.
		const run1 = await runCli(["lint", dir, "--fix", "--tokens", tokensInTmp]);
		expect(run1.stdout.toLowerCase()).toMatch(/chang/);

		const buttonAfter1 = await readFile(buttonCss, "utf8");
		const bannerAfter1 = await readFile(bannerTsx, "utf8");
		const cardAfter1 = await readFile(cardCss, "utf8");

		// button.css color #3b82f6 → var(--color-brand-primary).
		expect(buttonAfter1).toContain("color: var(--color-brand-primary);");
		// Banner.tsx color "#3b82f6" → "var(--color-brand-primary)".
		expect(bannerAfter1).toContain('"var(--color-brand-primary)"');
		// Composite shadow exact stays untouched (no single var() for inner color).
		expect(cardAfter1).toBe(cardBefore);

		// Run 2: byte-identical files — idempotency.
		const run2 = await runCli(["lint", dir, "--fix", "--tokens", tokensInTmp]);
		const buttonAfter2 = await readFile(buttonCss, "utf8");
		const bannerAfter2 = await readFile(bannerTsx, "utf8");
		const cardAfter2 = await readFile(cardCss, "utf8");
		expect(buttonAfter2).toBe(buttonAfter1);
		expect(bannerAfter2).toBe(bannerAfter1);
		expect(cardAfter2).toBe(cardAfter1);
		// near/off-system remain (shadow exact unfixable too) → still exit 1.
		expect(run2.code).toBe(1);
	});

	it("a directory with no token source exits 2 with actionable stderr", async () => {
		const dir = await freshTmp("ds-lint-notoken-");
		await writeFile(join(dir, "a.css"), ".x { color: #3b82f6; }\n", "utf8");
		const { code, stderr } = await runCli(["lint", dir]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("token");
	});

	it("a single FILE path lints only that file (exit 1), with token discovery from cwd", async () => {
		// Pointing at one file must not walk the whole project: only button.css
		// findings come back. Token source falls back to discovery from cwd when
		// the path is a file (here provided explicitly via --tokens for isolation).
		const buttonCss = join(sampleProject, "src", "button.css");
		const { code, stdout } = await runCli([
			"lint",
			buttonCss,
			"--format=json",
			"--tokens",
			sampleTokens,
		]);
		expect(code).toBe(1);
		const actual = JSON.parse(stdout) as JsonFinding[];
		// Every finding belongs to button.css — no Banner/Hero/card findings.
		expect(actual.length).toBeGreaterThan(0);
		for (const finding of actual) {
			expect(finding.file).toContain("button.css");
		}
		// The seeded exact #3b82f6 finding is present.
		expect(actual.some((f) => f.raw === "#3b82f6")).toBe(true);
	});

	it("--changed in a non-git directory exits 2 with actionable stderr", async () => {
		const dir = await freshTmp("ds-lint-nogit-");
		await cp(sampleTokens, join(dir, "tokens.json"));
		await writeFile(join(dir, "a.css"), ".x { color: #3b82f6; }\n", "utf8");
		const { code, stderr } = await runCli([
			"lint",
			dir,
			"--changed",
			"--tokens",
			join(dir, "tokens.json"),
		]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toMatch(/git|repository|repo/);
	});
});
