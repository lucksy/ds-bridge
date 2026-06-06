// T3.6 — integration: the built CLI's `report [path]` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like tokens-check.test.ts).
// Each scenario builds a throwaway project in a fresh tmp dir so nothing
// persistent is mutated; history.jsonl is read from <path>/.ds-bridge/ and the
// rendered dashboard lands under <path>/.ds-bridge/reports/ (or --out).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

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

/** Run the CLI; resolve with code/stdout/stderr whether it exits 0 or not. */
async function runCli(
	args: string[],
	env?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{
				encoding: "utf8",
				env: env === undefined ? process.env : { ...process.env, ...env },
			},
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
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

/** A well-formed tokens-check history record. */
function tokensCheckLine(
	at: string,
	stale: number,
	missing: number,
	orphan: number,
): string {
	return JSON.stringify({
		at,
		kind: "tokens-check",
		stale,
		missing,
		orphan,
		inSync: stale === 0 && missing === 0 && orphan === 0,
	});
}

/** A well-formed handoff history record (the T5.5b append shape). */
function handoffLine(
	at: string,
	score: number,
	frameName: string,
	deductions: { rule: string; points: number }[],
): string {
	return JSON.stringify({ at, kind: "handoff", score, frameName, deductions });
}

/** Write <dir>/.ds-bridge/registry.json with the given contents. */
async function seedRegistry(dir: string, registry: unknown): Promise<void> {
	const stateDir = join(dir, ".ds-bridge");
	await mkdir(stateDir, { recursive: true });
	await writeFile(
		join(stateDir, "registry.json"),
		`${JSON.stringify(registry, null, 2)}\n`,
		"utf8",
	);
}

/** A minimal, hand-written registry.json with one match + one gap each side. */
function sampleRegistry(): unknown {
	return {
		schemaVersion: 1,
		generatedAt: "2026-06-05T10:00:00.000Z",
		matches: [
			{
				codeName: "Button",
				importPath: "src/Button.tsx",
				figmaName: "Button / Primary",
				nodeId: "1:2",
				score: 0.95,
			},
		],
		unmatchedCode: [
			{ name: "Spinner", importPath: "src/Spinner.tsx", candidates: [] },
		],
		unmatchedFigma: [{ name: "Chip", nodeId: "3:4", candidates: [] }],
	};
}

/** Count occurrences of "<svg" in the HTML — one per populated chart section. */
function countSvgs(html: string): number {
	return html.split("<svg").length - 1;
}

describe("ds-bridge report (built dist/cli.mjs)", () => {
	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("no history → renders an empty-state dashboard and exits 0", async () => {
		const dir = await freshTmp("ds-report-empty-");

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		// The default output path is printed and points inside .ds-bridge/reports/.
		expect(result.stdout).toMatch(
			/\.ds-bridge[/\\]reports[/\\]dashboard\.html/,
		);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("No data yet");
	});

	it("history with two tokens-check lines → dashboard charts and names the project", async () => {
		const dir = await freshTmp("ds-report-trend-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 1, 1),
			tokensCheckLine("2026-06-02T10:00:00.000Z", 0, 2, 0),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		expect(html).toContain("<!DOCTYPE html>");
		// Two trend points → a real line chart is drawn.
		expect(html).toContain("<svg");
		// The header names the resolved project directory.
		expect(html).toContain(basename(dir));
	});

	it("--out writes to the requested file and prints that path", async () => {
		const dir = await freshTmp("ds-report-out-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 2, 0, 1),
		]);
		const outFile = join(dir, "custom-report.html");

		const result = await runCli(["report", dir, "--out", outFile]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain(outFile);

		const html = await readFile(outFile, "utf8");
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("<svg");
	});

	it("lint history lines populate the lint summary section", async () => {
		const dir = await freshTmp("ds-report-lint-");
		await seedHistory(dir, [
			JSON.stringify({
				at: "2026-06-03T10:00:00.000Z",
				kind: "lint",
				byKind: { exact: 3, near: 2, offSystem: 1 },
			}),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		// The lint section renders its bar chart rather than the empty state.
		expect(html).toContain("Off-system");
		expect(html).toContain("<svg");
	});

	it("a corrupted history line is skipped with a stderr warning; good lines still chart", async () => {
		const dir = await freshTmp("ds-report-corrupt-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 0),
			"{ this is not valid json",
			tokensCheckLine("2026-06-02T10:00:00.000Z", 0, 1, 0),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);
		expect(result.stderr.toLowerCase()).toContain("warning");

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		// The two good lines still produce a trend chart.
		expect(html).toContain("<svg");
	});

	it("unknown history kinds are skipped silently", async () => {
		const dir = await freshTmp("ds-report-unknown-");
		await seedHistory(dir, [
			JSON.stringify({ at: "2026-06-01T10:00:00.000Z", kind: "future-thing" }),
			tokensCheckLine("2026-06-02T10:00:00.000Z", 1, 0, 0),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);
		// No warning for forward-compatible unknown kinds.
		expect(result.stderr.toLowerCase()).not.toContain("warning");

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		expect(html).toContain("<svg");
	});

	it("--open with DS_BRIDGE_OPEN_CMD=true exits 0", async () => {
		const dir = await freshTmp("ds-report-open-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 0),
		]);

		const result = await runCli(["report", dir, "--open"], {
			DS_BRIDGE_OPEN_CMD: "true",
		});
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		expect(html).toContain("<!DOCTYPE html>");
	});

	it("--open spawn failure still exits 0 because the file exists", async () => {
		const dir = await freshTmp("ds-report-openfail-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 0),
		]);

		const result = await runCli(["report", dir, "--open"], {
			DS_BRIDGE_OPEN_CMD: "ds-bridge-no-such-opener-xyz",
		});
		expect(result.code).toBe(0);
		expect(result.stderr.toLowerCase()).toContain("warning");

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		expect(html).toContain("<!DOCTYPE html>");
	});

	it("a path that is not a directory exits 2", async () => {
		const dir = await freshTmp("ds-report-notdir-");
		const file = join(dir, "not-a-dir.txt");
		await writeFile(file, "hello", "utf8");

		const { code, stderr } = await runCli(["report", file]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("directory");
	});

	it("an unwritable --out exits 2", async () => {
		const dir = await freshTmp("ds-report-badout-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 0),
		]);
		// A path whose parent is a regular file cannot be created.
		const blocker = join(dir, "blocker.txt");
		await writeFile(blocker, "x", "utf8");
		const outFile = join(blocker, "report.html");

		const { code, stderr } = await runCli(["report", dir, "--out", outFile]);
		expect(code).toBe(2);
		expect(stderr.length).toBeGreaterThan(0);
	});

	it("T5.5b: a handoff history line populates the readiness section (no empty state)", async () => {
		const dir = await freshTmp("ds-report-readiness-");
		await seedHistory(dir, [
			handoffLine("2026-06-04T10:00:00.000Z", 72, "Card / Primary", [
				{ rule: "var-binding", points: 8 },
				{ rule: "auto-layout", points: 6 },
			]),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		// The readiness gauge is drawn (an SVG) and the frame name is rendered.
		expect(html).toContain("<svg");
		expect(html).toContain("Card / Primary");
		// A human-readable deduction reason (mapped from the rule) is shown.
		expect(html).toContain("Variable binding");
	});

	it("T5.5b: the LAST handoff line wins for the readiness section", async () => {
		const dir = await freshTmp("ds-report-readiness-last-");
		await seedHistory(dir, [
			handoffLine("2026-06-03T10:00:00.000Z", 50, "Old Frame", []),
			handoffLine("2026-06-04T10:00:00.000Z", 88, "New Frame", []),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		expect(html).toContain("New Frame");
		expect(html).not.toContain("Old Frame");
	});

	it("T5.5b: a hand-written registry.json populates the parity heat-grid", async () => {
		const dir = await freshTmp("ds-report-parity-");
		await seedRegistry(dir, sampleRegistry());

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		// The parity matrix renders its heat grid (an SVG) listing the components.
		expect(html).toContain("<svg");
		expect(html).toContain("Button");
		expect(html).toContain("Spinner");
		expect(html).toContain("Chip");
	});

	it("T5.5b ACCEPTANCE (C5): all four artifacts present → FOUR svg charts", async () => {
		const dir = await freshTmp("ds-report-four-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 1, 0),
			tokensCheckLine("2026-06-02T10:00:00.000Z", 0, 2, 1),
			JSON.stringify({
				at: "2026-06-03T10:00:00.000Z",
				kind: "lint",
				byKind: { exact: 3, near: 2, offSystem: 1 },
			}),
			handoffLine("2026-06-04T10:00:00.000Z", 72, "Card / Primary", [
				{ rule: "var-binding", points: 8 },
			]),
		]);
		await seedRegistry(dir, sampleRegistry());

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		// Drift trend, lint-by-type, readiness gauge, parity heat-grid: one each.
		expect(countSvgs(html)).toBe(4);
		// None of the four sections falls back to the empty state.
		expect(html).not.toContain("No data yet");
	});

	it("T5.5b: with no handoff line and no registry, readiness + parity stay empty", async () => {
		const dir = await freshTmp("ds-report-empty-sections-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 0),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		// Readiness + parity still show their empty-state panels.
		expect(html).toContain("No data yet");
		// Drift section is populated, but readiness + parity are not → only ONE svg.
		expect(countSvgs(html)).toBe(1);
	});
});
