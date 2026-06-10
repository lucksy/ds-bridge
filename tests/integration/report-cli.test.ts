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

/** A well-formed a11y history record (the T7.22 append shape). */
function a11yLine(
	at: string,
	level: "AA" | "AAA",
	modes: { mode: string; passed: number; failed: number }[],
): string {
	return JSON.stringify({ at, kind: "a11y", level, modes });
}

/** A well-formed impact history record (the T7.22 append shape). */
function impactLine(
	at: string,
	counts: {
		breaking: number;
		additive: number;
		cosmetic: number;
		touchedCallSites: number;
	},
): string {
	return JSON.stringify({ at, kind: "impact", ...counts });
}

/**
 * A lint history line CARRYING an adoption block (A2 shape). Top-level
 * refs:3/literals:1 → on-system 75% (the adoption score component); byDirectory
 * worst-first (src/legacy 0% then src/components 100%). Used by the B3 seeds so
 * the adoption-trend + leaderboard sections populate and the composite stays 76.
 */
function adoptionLintLine(at: string): string {
	return JSON.stringify({
		at,
		kind: "lint",
		byKind: { exact: 3, near: 2, offSystem: 1 },
		adoption: {
			refs: 3,
			literals: 1,
			byDirectory: [
				{ dir: "src/legacy", refs: 0, literals: 1 },
				{ dir: "src/components", refs: 3, literals: 0 },
			],
		},
	});
}

/** A well-formed `adoption` history record (the A3b append shape). */
function adoptionLine(
	at: string,
	imported: number,
	total: number,
	uncovered: string[],
): string {
	return JSON.stringify({ at, kind: "adoption", imported, total, uncovered });
}

/** A well-formed `parity` history record (the C3 / M2.1 append shape). */
function parityLine(
	at: string,
	ok: number,
	total: number,
	score: number,
): string {
	return JSON.stringify({
		at,
		kind: "parity",
		ok,
		total,
		score,
		missingInCode: 0,
		missingInFigma: total - ok,
		propMismatch: 0,
	});
}

/** A well-formed `library-health` history record (the L5 append shape, counts only). */
function libraryHealthLine(
	at: string,
	counts: {
		overrideHotspots: number;
		deprecatedUsage: number;
		detachedCandidates: number;
	},
): string {
	return JSON.stringify({ at, kind: "library-health", ...counts });
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

	it("C3/M2.1: a parity history line populates the parity-trend section and feeds the score", async () => {
		const dir = await freshTmp("ds-report-parity-trend-");
		await seedHistory(dir, [
			parityLine("2026-06-01T10:00:00.000Z", 6, 10, 60),
			parityLine("2026-06-02T10:00:00.000Z", 9, 10, 90),
		]);

		// The default `everything` view includes parity-trend; render it.
		const result = await runCli(["report", dir, "--artifacts", "parity-trend"]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		// The parity-trend section is present (titled) and NOT in its empty state
		// (the stub renders a "preview" marker once parityTrend is populated).
		expect(html).toContain("Parity trend");
		expect(html).toContain("preview");
	});

	it("C3/M2.1: no parity line → parity-trend section stays in its empty state", async () => {
		const dir = await freshTmp("ds-report-no-parity-trend-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 0),
		]);

		const result = await runCli(["report", dir, "--artifacts", "parity-trend"]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		expect(html).toContain("Parity trend");
		// No parity line → the stub stays empty-state (no "preview" marker), which is
		// what keeps the no-config golden byte-identical.
		expect(html).not.toContain("preview");
	});

	it("C3/M2.1: a parity line contributes a parity component to the system score", async () => {
		const dir = await freshTmp("ds-report-parity-score-");
		await seedHistory(dir, [parityLine("2026-06-01T10:00:00.000Z", 8, 10, 80)]);

		const result = await runCli(["report", dir, "--artifacts", "system-score"]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		// The score legend lists the parity component (a single present component →
		// the composite equals its sub-score, 80).
		expect(html).toContain("parity");
		expect(html).toContain("System score");
	});

	it("B6 ACCEPTANCE: all thirteen artifacts present → THIRTEEN svg charts", async () => {
		const dir = await freshTmp("ds-report-six-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 1, 0),
			tokensCheckLine("2026-06-02T10:00:00.000Z", 0, 2, 1),
			adoptionLintLine("2026-06-03T10:00:00.000Z"),
			handoffLine("2026-06-04T10:00:00.000Z", 72, "Card / Primary", [
				{ rule: "var-binding", points: 8 },
			]),
			a11yLine("2026-06-05T10:00:00.000Z", "AA", [
				{ mode: "light", passed: 9, failed: 1 },
				{ mode: "dark", passed: 8, failed: 2 },
			]),
			impactLine("2026-06-06T10:00:00.000Z", {
				breaking: 2,
				additive: 3,
				cosmetic: 1,
				touchedCallSites: 14,
			}),
			adoptionLine("2026-06-07T10:00:00.000Z", 1, 3, ["Spinner", "Tooltip"]),
			libraryHealthLine("2026-06-08T10:00:00.000Z", {
				overrideHotspots: 3,
				deprecatedUsage: 3,
				detachedCandidates: 3,
			}),
		]);
		await seedRegistry(dir, sampleRegistry());

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		const html = await readFile(reportPath, "utf8");
		// Drift, lint, readiness, parity, contrast, impact: one chart each (6);
		// plus the system-score section's gauge + trend (2); plus the three owner
		// sections (adoption-trend line, coverage donut, leaderboard bar) → 11 (B3);
		// plus the library-health totals bar → 12 (B5); plus the change-frequency
		// per-kind bar → 13 (B6). breaking-calendar is a LIST, not a chart, so the
		// svg delta is +1, NOT +2 (the seed's stale>0 tokens-check + breaking>0
		// impact populate the calendar list).
		expect(countSvgs(html)).toBe(13);
		// None of the thirteen DATA sections falls back to the empty state; the 11
		// metric artifacts (C1–C13) have no engine yet → 11 empty-state stubs.
		expect(html.split("No data yet").length - 1).toBe(11);
	});

	it("T7.22: an a11y history line populates the contrast section", async () => {
		const dir = await freshTmp("ds-report-a11y-");
		await seedHistory(dir, [
			a11yLine("2026-06-05T10:00:00.000Z", "AAA", [
				{ mode: "light", passed: 5, failed: 3 },
			]),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);
		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		expect(html).toContain("5 passed");
		expect(html).toContain("3 failed");
		expect(html).toContain("AAA");
		expect(html).not.toContain("ds-bridge a11y</code>");
	});

	it("T7.22: the LAST a11y line wins for the contrast section", async () => {
		const dir = await freshTmp("ds-report-a11y-last-");
		await seedHistory(dir, [
			a11yLine("2026-06-04T10:00:00.000Z", "AA", [
				{ mode: "light", passed: 1, failed: 9 },
			]),
			a11yLine("2026-06-05T10:00:00.000Z", "AA", [
				{ mode: "light", passed: 9, failed: 0 },
			]),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);
		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		expect(html).toContain("9 passed");
		expect(html).not.toContain("9 failed");
	});

	it("T7.22: an impact history line populates the change-impact section", async () => {
		const dir = await freshTmp("ds-report-impact-");
		await seedHistory(dir, [
			impactLine("2026-06-05T10:00:00.000Z", {
				breaking: 1,
				additive: 0,
				cosmetic: 0,
				touchedCallSites: 7,
			}),
		]);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);
		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		expect(html).toContain("Touches 7 call sites");
		expect(html).not.toContain("ds-bridge impact</code>");
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
		// Drift section is populated (1 svg); the single tokens-check line also
		// yields a drift component so the system-score section computes its gauge +
		// trend (2 svgs) → THREE svgs (wave-2 S4b). The same line is a counted
		// `tokens-check` kind, so change-frequency draws its per-kind bar (+1) →
		// FOUR svgs total (B6). Its stale=1 also populates the breaking-calendar
		// LIST (no svg). Readiness + parity stay empty.
		expect(countSvgs(html)).toBe(4);
	});
});

// ---------- M1.3 — config-resolved artifact selection + v1.0.0 golden ----------

/** The repo-relative path to the recorded v1.0.0 no-config golden fixture. */
const goldenPath = join(
	repoRoot,
	"tests",
	"fixtures",
	"report",
	"golden-no-config.html",
);

/**
 * Seed the EXACT ten-artifact acceptance history + registry (the bytes the
 * golden was recorded against) into <dir>/.ds-bridge/. Identical literals to the
 * "all ten artifacts present" acceptance test above (now incl. the adoption
 * block + `adoption` line, B3) so the golden stays anchored.
 */
async function seedSixArtifacts(dir: string): Promise<void> {
	await seedHistory(dir, [
		tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 1, 0),
		tokensCheckLine("2026-06-02T10:00:00.000Z", 0, 2, 1),
		adoptionLintLine("2026-06-03T10:00:00.000Z"),
		handoffLine("2026-06-04T10:00:00.000Z", 72, "Card / Primary", [
			{ rule: "var-binding", points: 8 },
		]),
		a11yLine("2026-06-05T10:00:00.000Z", "AA", [
			{ mode: "light", passed: 9, failed: 1 },
			{ mode: "dark", passed: 8, failed: 2 },
		]),
		impactLine("2026-06-06T10:00:00.000Z", {
			breaking: 2,
			additive: 3,
			cosmetic: 1,
			touchedCallSites: 14,
		}),
		adoptionLine("2026-06-07T10:00:00.000Z", 1, 3, ["Spinner", "Tooltip"]),
		libraryHealthLine("2026-06-08T10:00:00.000Z", {
			overrideHotspots: 3,
			deprecatedUsage: 3,
			detachedCandidates: 3,
		}),
	]);
	await seedRegistry(dir, sampleRegistry());
}

/**
 * The SAME single sentinel substitution the golden capture used: replace the
 * fresh ISO timestamp after "Generated " with `__GENERATED_AT__`. No other
 * normalization — byte equality everywhere else is the contract.
 */
function withSentinelTimestamp(html: string): string {
	return html.replace(
		/(<span class="generated">Generated )[^<]*(<\/span>)/,
		"$1__GENERATED_AT__$2",
	);
}

/** Write <dir>/.ds-bridge.json with the given object (the project config file). */
async function seedProjectConfig(dir: string, config: unknown): Promise<void> {
	await writeFile(
		join(dir, ".ds-bridge.json"),
		`${JSON.stringify(config, null, 2)}\n`,
		"utf8",
	);
}

describe("ds-bridge report — dashboard composer (M1.3)", () => {
	it("no flags + no .ds-bridge.json → byte-identical to the v1.0.0 golden", async () => {
		// WAVE-6 RE-ANCHOR (B5): the golden was REGENERATED from this same seed +
		// the unchanged sentinel rule (only the fresh "Generated " timestamp is
		// substituted). The seed now also carries a `library-health` kind line, so
		// the no-config render gains the eleventh section (library-health) — a
		// totals bar chart + the heuristic caveat. Verified the diff is ONLY the
		// appended library-health section + its seed; every other byte is unchanged
		// (system-score still 2 charts, composite numeral STAYS 76). New bytes, same
		// contract. (B3 added the three owner sections; B5 adds library-health.)
		//
		// The golden's project name is its directory basename ("report-golden"),
		// so seed under a fixed-name subdir of a fresh tmp dir.
		const base = await freshTmp("ds-report-golden-");
		const dir = join(base, "report-golden");
		await seedSixArtifacts(dir);

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		const normalized = withSentinelTimestamp(html);
		// Re-anchor escape hatch: `DS_BRIDGE_UPDATE_GOLDEN=1 vitest …` authors the
		// golden fresh against the current render (single-sentinel rule), then
		// returns. The product is unpublished, so the golden is gated only against
		// itself, never a prior build.
		if (process.env.DS_BRIDGE_UPDATE_GOLDEN) {
			await writeFile(goldenPath, normalized, "utf8");
			return;
		}
		const golden = await readFile(goldenPath, "utf8");
		expect(normalized).toBe(golden);
	});

	it("--view owner renders all seven owner artifacts (8 svgs) and names the view", async () => {
		const dir = await freshTmp("ds-report-view-owner-");
		await seedSixArtifacts(dir);

		const result = await runCli(["report", dir, "--view", "owner"]);
		expect(result.code).toBe(0);

		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		// owner (B3) = system-score · adoption-trend · import-coverage · leaderboard
		// · drift-trend · parity · a11y → the score section's gauge + trend (2) plus
		// one chart each for the other six selected sections = EIGHT.
		expect(countSvgs(html)).toBe(8);
		// The omitted sections leave no trace (not even a title).
		expect(html).not.toContain("Lint violations");
		expect(html).not.toContain("Readiness");
		expect(html).not.toContain("Change impact");
		// The selected sections are present — including the new owner ones.
		expect(html).toContain("System score");
		expect(html).toContain("Adoption trend");
		expect(html).toContain("Import coverage");
		expect(html).toContain("Adoption leaderboard");
		expect(html).toContain("Drift trend");
		expect(html).toContain("Parity matrix");
		expect(html).toContain("Contrast (a11y)");
		// The active view is named in the HTML header.
		expect(html).toContain("owner");
	});

	it("B3: --view owner renders the three owner artifacts with real data, not empty states", async () => {
		const dir = await freshTmp("ds-report-view-owner-data-");
		await seedSixArtifacts(dir);

		const result = await runCli(["report", dir, "--view", "owner"]);
		expect(result.code).toBe(0);

		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		// import-coverage: 1/3 imported → 33% centred numeral; the uncovered names list.
		expect(html).toMatch(/<text[^>]*>33<\/text>/);
		expect(html).toContain("Spinner");
		expect(html).toContain("Tooltip");
		// leaderboard worst-first: src/legacy (0%) precedes src/components (100%).
		const legacyAt = html.indexOf("src/legacy");
		const componentsAt = html.indexOf("src/components");
		expect(legacyAt).toBeGreaterThan(-1);
		expect(legacyAt).toBeLessThan(componentsAt);
		// none of the three owner sections degrade to an empty state.
		expect(html).not.toContain("No data yet");
	});

	it("--view owner shows the computed system-score value in the HTML (S4b)", async () => {
		const dir = await freshTmp("ds-report-view-owner-score-");
		await seedSixArtifacts(dir);

		const result = await runCli(["report", dir, "--view", "owner"]);
		expect(result.code).toBe(0);

		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		// The donut gauge renders the current composite as a centered numeral.
		// seedSixArtifacts → drift 75 · lint 74 · readiness 72 · a11y 85 · adoption
		// 75 (refs 3 / 4 values), rebalanced weights 25/25/15/15/20 → 7580/100 =
		// 75.80 → 76. The adoption component holds the composite at 76 (B3).
		expect(html).toMatch(/<text[^>]*>76<\/text>/);
		// the components/weights legend names every present component kind.
		expect(html).toContain("drift");
		expect(html).toContain("lint");
		expect(html).toContain("readiness");
		expect(html).toContain("a11y");
	});

	it("B5: --view design renders the library-health section (appended last)", async () => {
		const dir = await freshTmp("ds-report-view-design-");
		await seedSixArtifacts(dir);

		const result = await runCli(["report", dir, "--view", "design"]);
		expect(result.code).toBe(0);

		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		// design = system-score · readiness · a11y · parity · library-health → the
		// score's gauge + trend (2) plus one chart each for readiness/a11y/parity +
		// the library-health totals bar = SIX charts (B5).
		expect(countSvgs(html)).toBe(6);
		expect(html).toContain("System score");
		expect(html).toContain("Readiness");
		expect(html).toContain("Contrast (a11y)");
		expect(html).toContain("Parity matrix");
		// the new library-health section renders, with its heuristic caveat.
		expect(html).toContain("Library health");
		expect(html.toLowerCase()).toContain("heuristic");
		// library-health is appended LAST (after parity) in the design view.
		const parityAt = html.indexOf("Parity matrix");
		const libraryAt = html.indexOf("Library health");
		expect(parityAt).toBeGreaterThan(-1);
		expect(parityAt).toBeLessThan(libraryAt);
		// none of the design sections degrade to an empty state.
		expect(html).not.toContain("No data yet");
		expect(html).toContain("design");
	});

	it("B6: --view consumer renders the breaking-calendar list + the change-frequency bar", async () => {
		const dir = await freshTmp("ds-report-view-consumer-");
		await seedSixArtifacts(dir);

		const result = await runCli(["report", dir, "--view", "consumer"]);
		expect(result.code).toBe(0);

		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		// consumer = system-score · parity · impact · breaking-calendar ·
		// change-frequency → the score's gauge + trend (2) plus one chart each for
		// parity/impact + the change-frequency per-kind bar = FIVE charts.
		// breaking-calendar is a LIST (no svg), so the count is 5, not 6 (B6).
		expect(countSvgs(html)).toBe(5);
		expect(html).toContain("System score");
		expect(html).toContain("Parity matrix");
		expect(html).toContain("Change impact");
		// both new consumer sections render with real data, not empty states.
		expect(html).toContain("Breaking calendar");
		expect(html).toContain("Change frequency");
		expect(html).not.toContain("No data yet");
		// the breaking calendar surfaces the seeded breakage: a tokens stale line
		// (2026-06-01, stale 1) and an impact breaking line (2026-06-06, breaking 2).
		expect(html).toContain("1 stale output");
		expect(html).toContain("2 breaking component changes");
		// change-frequency tallies the seeded kinds as bar labels.
		expect(html).toContain("tokens-check");
		expect(html).toContain("impact");
		expect(html).toContain("consumer");
	});

	it("--artifacts parity,a11y renders exactly two sections", async () => {
		const dir = await freshTmp("ds-report-artifacts-");
		await seedSixArtifacts(dir);

		const result = await runCli(["report", dir, "--artifacts", "parity,a11y"]);
		expect(result.code).toBe(0);

		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		expect(countSvgs(html)).toBe(2);
		expect(html).toContain("Parity matrix");
		expect(html).toContain("Contrast (a11y)");
		expect(html).not.toContain("Drift trend");
		expect(html).not.toContain("Change impact");
	});

	it(".ds-bridge.json dashboard_view=engineering is respected with no flags", async () => {
		const dir = await freshTmp("ds-report-cfg-eng-");
		await seedSixArtifacts(dir);
		await seedProjectConfig(dir, { dashboard_view: "engineering" });

		const result = await runCli(["report", dir]);
		expect(result.code).toBe(0);

		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		// engineering = system-score · lint-summary · impact · drift-trend → the
		// score's gauge + trend (2) plus one chart each for lint/impact/drift = 5.
		expect(countSvgs(html)).toBe(5);
		expect(html).toContain("System score");
		expect(html).toContain("Lint violations");
		expect(html).toContain("Change impact");
		expect(html).toContain("Drift trend");
		expect(html).not.toContain("Parity matrix");
		expect(html).not.toContain("Readiness");
		expect(html).toContain("engineering");
	});

	it("a --view flag beats a conflicting dashboard_view in config", async () => {
		const dir = await freshTmp("ds-report-flag-wins-");
		await seedSixArtifacts(dir);
		await seedProjectConfig(dir, { dashboard_view: "engineering" });

		const result = await runCli(["report", dir, "--view", "consumer"]);
		expect(result.code).toBe(0);

		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		// consumer = system-score · parity · impact · breaking-calendar ·
		// change-frequency → the score's gauge + trend (2) plus one chart each for
		// parity/impact + the change-frequency per-kind bar = FIVE (B6);
		// breaking-calendar is a LIST (no svg). engineering's lint absent.
		expect(countSvgs(html)).toBe(5);
		expect(html).toContain("System score");
		expect(html).toContain("Parity matrix");
		expect(html).toContain("Change impact");
		expect(html).not.toContain("Lint violations");
		expect(html).toContain("consumer");
	});

	it("--view and --artifacts together → exit 2 mentioning mutual exclusivity", async () => {
		const dir = await freshTmp("ds-report-conflict-");
		await seedSixArtifacts(dir);

		const { code, stderr } = await runCli([
			"report",
			dir,
			"--view",
			"owner",
			"--artifacts",
			"parity,a11y",
		]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("mutually exclusive");
	});

	it("an unknown artifact id → exit 2 with a suggestion", async () => {
		const dir = await freshTmp("ds-report-unknown-id-");
		await seedSixArtifacts(dir);

		const { code, stderr } = await runCli([
			"report",
			dir,
			"--artifacts",
			"parityy",
		]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("parityy");
		// Nearest-match suggestion is offered.
		expect(stderr).toContain("parity");
		expect(stderr.toLowerCase()).toMatch(/did you mean|suggestion/);
	});

	it("invalid .ds-bridge.json (both view + artifacts) → exit 2", async () => {
		const dir = await freshTmp("ds-report-bad-cfg-");
		await seedSixArtifacts(dir);
		await seedProjectConfig(dir, {
			dashboard_view: "owner",
			dashboard_artifacts: ["parity", "a11y"],
		});

		const { code, stderr } = await runCli(["report", dir]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("mutually exclusive");
	});
});

// ---------- C4 — `report --format md` + `--delta` (markdown scorecard) ----------
//
// The md path emits a markdown scorecard to stdout (CI-pipeable), `--out`
// redirects to a file, and `--delta <ref>` compares against the base ref's
// COMMITTED `.ds-bridge/history.jsonl` (read via git through the targetDir).
// The html path stays byte-identical (the golden above is the signature gate).

/**
 * Initialise a real git repo in `dir`, seed + COMMIT a history.jsonl (the
 * committed base the --delta ref reads), then optionally REPLACE the working
 * history with `workingLines` (the uncommitted current tip). Returns nothing —
 * the repo lives at `dir` and `--delta <ref>` reads the committed base via git.
 */
async function seedGitRepoWithHistory(
	dir: string,
	committedLines: string[],
	workingLines?: string[],
): Promise<void> {
	const git = (args: string[]): Promise<unknown> =>
		execFileAsync("git", args, {
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				GIT_AUTHOR_NAME: "ds-bridge-test",
				GIT_AUTHOR_EMAIL: "test@example.com",
				GIT_COMMITTER_NAME: "ds-bridge-test",
				GIT_COMMITTER_EMAIL: "test@example.com",
			},
		});
	await git(["init", "-q"]);
	await git(["checkout", "-q", "-b", "main"]);
	await seedHistory(dir, committedLines);
	await git(["add", "-A"]);
	await git(["commit", "-q", "-m", "seed history"]);
	if (workingLines !== undefined) {
		// Replace the working-tree history with the uncommitted current tip; the
		// committed base stays addressable as `main` / `HEAD`.
		await seedHistory(dir, workingLines);
	}
}

describe("ds-bridge report — markdown scorecard (C4)", () => {
	it("--format md with current history prints a markdown scorecard to stdout (no path line)", async () => {
		const dir = await freshTmp("ds-report-md-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 2),
			adoptionLintLine("2026-06-03T10:00:00.000Z"),
			handoffLine("2026-06-04T10:00:00.000Z", 72, "Card / Primary", []),
		]);

		const result = await runCli(["report", dir, "--format", "md"]);
		expect(result.code).toBe(0);
		// The markdown scorecard is emitted to stdout.
		expect(result.stdout).toContain("### Design-system scorecard");
		expect(result.stdout).toContain("| Metric | current |");
		expect(result.stdout).toContain("System score");
		// Current-only: no Δ column, no base label.
		expect(result.stdout).not.toContain(" | Δ |");
		// Pipe-cleanliness: stdout carries ONLY markdown — no dashboard.html path
		// line and no .html anywhere.
		expect(result.stdout).not.toContain(".html");
		expect(result.stdout).not.toMatch(/reports[/\\]dashboard/);
		// No file is written for the stdout md path.
		const reportPath = join(dir, ".ds-bridge", "reports", "dashboard.html");
		await expect(readFile(reportPath, "utf8")).rejects.toThrow();
	});

	it("--format md --delta <ref> compares against the committed base (arrows + a real delta)", async () => {
		const dir = await freshTmp("ds-report-md-delta-");
		await seedGitRepoWithHistory(
			dir,
			// committed base: lint 4 total violations, on-system 50%.
			[
				JSON.stringify({
					at: "2026-06-01T10:00:00.000Z",
					kind: "lint",
					byKind: { exact: 2, near: 1, offSystem: 1 },
					adoption: { refs: 1, literals: 1, byDirectory: [] },
				}),
			],
			// working tip: lint 1 total violation, on-system 75% — a real movement.
			[
				JSON.stringify({
					at: "2026-06-02T10:00:00.000Z",
					kind: "lint",
					byKind: { exact: 1, near: 0, offSystem: 0 },
					adoption: { refs: 3, literals: 1, byDirectory: [] },
				}),
			],
		);

		const result = await runCli([
			"report",
			dir,
			"--format",
			"md",
			"--delta",
			"main",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("### Design-system scorecard");
		// The Δ column is present and names the base ref as the base column.
		expect(result.stdout).toContain("| Metric | main | current | Δ |");
		// On-system moved up 50% → 75% (▲); lint violations dropped 4 → 1 (▼).
		expect(result.stdout).toContain("| On-system | 50% | 75% | +25 ▲ |");
		expect(result.stdout).toContain("| Lint violations | 4 | 1 | -3 ▼ |");
		// Pipe-cleanliness.
		expect(result.stdout).not.toContain(".html");
	});

	it("--delta to a ref with no committed history → exit 0 with a no-baseline note", async () => {
		const dir = await freshTmp("ds-report-md-nobase-");
		// A real repo whose FIRST commit has NO .ds-bridge/ — the committed dir
		// exists on disk (the working history) but not at the ref → missing.
		const git = (args: string[]): Promise<unknown> =>
			execFileAsync("git", args, {
				cwd: dir,
				encoding: "utf8",
				env: {
					...process.env,
					GIT_AUTHOR_NAME: "ds-bridge-test",
					GIT_AUTHOR_EMAIL: "test@example.com",
					GIT_COMMITTER_NAME: "ds-bridge-test",
					GIT_COMMITTER_EMAIL: "test@example.com",
				},
			});
		await git(["init", "-q"]);
		await git(["checkout", "-q", "-b", "main"]);
		await writeFile(join(dir, "README.md"), "seed\n", "utf8");
		await git(["add", "-A"]);
		await git(["commit", "-q", "-m", "no history yet"]);
		// Now add a working-tree history (uncommitted) so the current side has data.
		await seedHistory(dir, [adoptionLintLine("2026-06-03T10:00:00.000Z")]);

		const result = await runCli([
			"report",
			dir,
			"--format",
			"md",
			"--delta",
			"main",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("### Design-system scorecard");
		expect(result.stdout).toContain("_no baseline at main_");
		// Falls back to a current-only table (no Δ column).
		expect(result.stdout).not.toContain(" | Δ |");
	});

	it("--delta to a bad ref → exit 2 (git-error)", async () => {
		const dir = await freshTmp("ds-report-md-badref-");
		await seedGitRepoWithHistory(dir, [
			adoptionLintLine("2026-06-03T10:00:00.000Z"),
		]);

		const { code, stderr } = await runCli([
			"report",
			dir,
			"--format",
			"md",
			"--delta",
			"no-such-ref-xyz",
		]);
		expect(code).toBe(2);
		expect(stderr.length).toBeGreaterThan(0);
	});

	it("--delta without --format md → exit 2", async () => {
		const dir = await freshTmp("ds-report-md-deltaonly-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 0),
		]);

		const { code, stderr } = await runCli(["report", dir, "--delta", "main"]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("--delta");
		expect(stderr.toLowerCase()).toContain("md");
	});

	it("--open with --format md → exit 2", async () => {
		const dir = await freshTmp("ds-report-md-open-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 0),
		]);

		const { code, stderr } = await runCli([
			"report",
			dir,
			"--format",
			"md",
			"--open",
		]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("--open");
	});

	it("an unknown --format → exit 2 listing both html and md", async () => {
		const dir = await freshTmp("ds-report-md-badfmt-");
		await seedHistory(dir, [
			tokensCheckLine("2026-06-01T10:00:00.000Z", 1, 0, 0),
		]);

		const { code, stderr } = await runCli(["report", dir, "--format", "term"]);
		expect(code).toBe(2);
		expect(stderr).toContain("html");
		expect(stderr).toContain("md");
	});

	it("--format md --out writes the scorecard to a file and prints that path", async () => {
		const dir = await freshTmp("ds-report-md-out-");
		await seedHistory(dir, [
			adoptionLintLine("2026-06-03T10:00:00.000Z"),
			handoffLine("2026-06-04T10:00:00.000Z", 72, "Card / Primary", []),
		]);
		const outFile = join(dir, "scorecard.md");

		const result = await runCli([
			"report",
			dir,
			"--format",
			"md",
			"--out",
			outFile,
		]);
		expect(result.code).toBe(0);
		// The path IS printed when redirected to a file.
		expect(result.stdout).toContain(outFile);

		const md = await readFile(outFile, "utf8");
		expect(md).toContain("### Design-system scorecard");
		expect(md).toContain("System score");
	});

	it("--format md with no history → exit 2 with run-a-check guidance", async () => {
		const dir = await freshTmp("ds-report-md-nodata-");
		// No .ds-bridge/history.jsonl at all → no-data → exit 2.

		const { code, stderr } = await runCli(["report", dir, "--format", "md"]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("run");
		expect(stderr.toLowerCase()).toContain("check");
	});
});
