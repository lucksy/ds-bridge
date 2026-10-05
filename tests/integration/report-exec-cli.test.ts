// X7 (SPEC-exec-report §3 + §6) — integration: the built CLI's executive layer
// and the DS-manager one-page report (`report --format exec | exec-html`).
// Spawns dist/cli.mjs against throwaway projects in fresh tmp dirs; the project
// .ds-bridge/ is never touched. SOURCE_DATE_EPOCH pins the render instant.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { currentState } from "../helpers/dashboard-state.js";

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
	const dir = await mkdtemp(join(tmpdir(), "ds-report-exec-"));
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

describe("ds-bridge report --format exec (markdown manager report)", () => {
	it("prints the paste-ready one-pager to stdout (pipe-clean)", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const result = await runCli(["report", dir, "--format", "exec"]);
		expect(result.code).toBe(0);
		const md = result.stdout;
		expect(md.startsWith("# Design system report: ")).toBe(true);
		expect(md).toContain("Report date 2026-10-05");
		// The score engine's replay of this history: 71 now, +24 over the window.
		expect(md).toContain("| System score | 71/100 | ▲ +24 in 30 days |");
		// On-system 90% (36/40), up from 75% (30/40).
		expect(md).toContain(
			"| On-system usage | 90% | +15 pts since 2026-09-10 |",
		);
		expect(md).toContain("| Component import coverage | 75% (6 of 8) | — |");
		// Consistency: tokens 90·40 + components 75·40 + overrides 92·20 → 84.4 → 84.
		expect(md).toContain("| Consistency | 84/100 | — |");
		// Debt: off-system 4·2 + deprecated (counts-only) 2·8 = 24 → low.
		expect(md).toContain("| Design debt | 24/100 (low) | — |");
		expect(md).toContain("| Handoff readiness | 1 of 2 frames ready | — |");
		expect(md).toContain("| Checkout | 60 | 0% | 1 |");
		expect(md).toContain(
			'Raise handoff readiness of "Checkout" from 60 to 80+ (run ds-bridge handoff)',
		);
		expect(md).toContain(
			"Replace 2 usages of deprecated components (run ds-bridge library-health for the list)",
		);
		// The whole risks block: below-bar frame (sev 2) before the never-measured
		// score inputs (sev 1), in plain labels — impact/parity/changelog are not
		// score inputs, so they are not risks.
		expect(md).toContain(
			[
				"## Top risks",
				"",
				'1. 1 of 2 tracked frames is below the 80 readiness bar (lowest: "Checkout" at 60)',
				"2. Never measured: token drift, a11y",
				"",
				"## Next actions",
			].join("\n"),
		);
		expect(md).toContain("## Data coverage");
		expect(md).not.toContain(".html");
		await expect(
			readFile(join(dir, ".ds-bridge", "reports", "exec.html"), "utf8"),
		).rejects.toThrow();
	});

	it("orders risks by severity and labels targets in plain language", async () => {
		const dir = await project(HISTORY, REGISTRY);
		await writeFile(
			join(dir, ".ds-bridge.json"),
			JSON.stringify({
				metric_targets: {
					"on-system": { op: ">=", value: 95, warn: 5 },
					"system-score": { op: ">=", value: 90 },
				},
			}),
			"utf8",
		);
		const result = await runCli(["report", dir, "--format", "exec"]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain(
			"| On-system usage | 90% | ≥ 95% | At risk |\n| System score | 71 | ≥ 90 | Off track |",
		);
		// Severity 3 (red target) → 2 (frame) → 1 (amber target); the lower
		// never-measured risk is capped out.
		expect(result.stdout).toContain(
			[
				"## Top risks",
				"",
				"1. System score is off target: 71 vs goal ≥ 90",
				'2. 1 of 2 tracked frames is below the 80 readiness bar (lowest: "Checkout" at 60)',
				"3. On-system usage is close to its goal: 90% vs ≥ 95%",
				"",
			].join("\n"),
		);
		expect(result.stdout).toContain("1. Bring System score to ≥ 90 (now 71)");
	});

	it("is byte-stable across runs with a pinned instant", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const a = await runCli(["report", dir, "--format", "exec"]);
		const b = await runCli(["report", dir, "--format", "exec"]);
		expect(a.stdout).toBe(b.stdout);
	});

	it("--out writes the markdown to a file and prints the path", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const out = join(dir, "monthly.md");
		const result = await runCli([
			"report",
			dir,
			"--format",
			"exec",
			"--out",
			out,
		]);
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe(out);
		expect(await readFile(out, "utf8")).toContain("## Top risks");
	});

	it("an empty project still renders (every metric not measured) and exits 0", async () => {
		const dir = await project([]);
		const result = await runCli(["report", dir, "--format", "exec"]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("| System score | not measured | — |");
		// Nothing was ever measured — that IS the risk, and refreshing the action.
		expect(result.stdout).toContain(
			"1. Never measured: token drift, lint, handoff readiness, a11y, adoption",
		);
		expect(result.stdout).toContain(
			"1. Refresh the data: run ds-bridge record",
		);
		// Checks `record` does not run get their own command.
		expect(result.stdout).toContain(
			// `<frame-url>` is escaped, or GitHub would swallow it as an HTML tag.
			"2. Start measuring handoff readiness: run ds-bridge handoff \\<frame-url\\>",
		);
	});

	it("rejects --gate, --delta and --open with exec (exit 2)", async () => {
		const dir = await project(HISTORY);
		for (const extra of [["--gate"], ["--delta", "HEAD"], ["--open"]]) {
			const result = await runCli([
				"report",
				dir,
				"--format",
				"exec",
				...extra,
			]);
			expect(result.code).toBe(2);
		}
	});
});

describe("ds-bridge report --format exec-html", () => {
	it("writes the one-page HTML to .ds-bridge/reports/exec.html by default", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const result = await runCli(["report", dir, "--format", "exec-html"]);
		expect(result.code).toBe(0);
		const outPath = join(dir, ".ds-bridge", "reports", "exec.html");
		expect(result.stdout.trim()).toBe(outPath);
		const html = await readFile(outPath, "utf8");
		expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
		expect(html).toContain("<h2>Top risks</h2>");
		expect(html).not.toMatch(/<script\b/i);
	});

	it("accepts --open: writes the page and exits 0 (opener stubbed)", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const result = await runCli(
			["report", dir, "--format", "exec-html", "--open"],
			{
				DS_BRIDGE_OPEN_CMD: "true",
			},
		);
		expect(result.code).toBe(0);
		const outPath = join(dir, ".ds-bridge", "reports", "exec.html");
		expect(result.stdout.trim()).toBe(outPath);
		expect(await readFile(outPath, "utf8")).toContain("<h2>Top risks</h2>");
	});

	it("rejects --snapshot (exit 2)", async () => {
		const dir = await project(HISTORY);
		const result = await runCli([
			"report",
			dir,
			"--format",
			"exec-html",
			"--snapshot",
		]);
		expect(result.code).toBe(2);
	});
});

describe("ds-bridge report — executive layer in the dashboard (AN5/AN7)", () => {
	it("--view ds-manager renders the consistency, debt and executive sections", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const out = join(dir, "dash.html");
		const result = await runCli([
			"report",
			dir,
			"--view",
			"ds-manager",
			"--out",
			out,
		]);
		expect(result.code).toBe(0);
		const html = await readFile(out, "utf8");
		for (const title of ["Consistency", "Design debt", "Executive summary"]) {
			const start = html.indexOf(`<h2>${title}</h2>`);
			expect(start).toBeGreaterThan(-1);
			const section = html.slice(start, html.indexOf("</section>", start));
			expect(section).not.toContain("No data yet");
		}
	});

	it("--view exec renders the curated five-artifact view", async () => {
		const dir = await project(HISTORY, REGISTRY);
		const out = join(dir, "exec-dash.html");
		const result = await runCli([
			"report",
			dir,
			"--view",
			"exec",
			"--out",
			out,
		]);
		expect(result.code).toBe(0);
		const html = currentState(await readFile(out, "utf8"));
		expect(html.match(/<section class="panel/g)?.length).toBe(5);
		expect(html).toContain("<h2>Executive summary</h2>");
	});

	it("without lint or library-health history, debt stays an empty state (absent, not 0%)", async () => {
		const dir = await project([
			{
				at: "2026-10-01T10:00:00.000Z",
				kind: "tokens-check",
				stale: 0,
				missing: 0,
				orphan: 0,
				inSync: true,
			},
		]);
		const out = join(dir, "d.html");
		await runCli(["report", dir, "--artifacts", "design-debt", "--out", out]);
		const html = await readFile(out, "utf8");
		expect(html).toContain("No data yet");
	});
});

// ---------- X9 / X10 — failing checks surface; same-day score change ----------

describe("report --format exec — failing contrast and token gaps (X9, X10)", () => {
	it("lists failing contrast + missing tokens in risks and actions; score change uses stored score records", async () => {
		const dir = await project([
			{
				at: "2026-10-04T09:00:00.000Z",
				kind: "tokens-check",
				stale: 0,
				missing: 13,
				orphan: 0,
			},
			{
				at: "2026-10-04T09:00:01.000Z",
				kind: "a11y",
				level: "AA",
				modes: [
					{ mode: "light", passed: 0, failed: 1 },
					{ mode: "dark", passed: 2, failed: 0 },
				],
			},
			{ at: "2026-10-04T09:00:02.000Z", kind: "score", score: 35 },
			{ at: "2026-10-04T10:00:02.000Z", kind: "score", score: 35 },
		]);
		const result = await runCli(["report", dir, "--format", "exec"]);
		expect(result.code).toBe(0);
		const md = result.stdout;
		expect(md).toContain("1. 1 contrast pair fails WCAG AA (light)");
		expect(md).toContain("13 design tokens are missing from the code output");
		expect(md).toContain(
			"1. Fix the 1 failing contrast pair (run ds-bridge a11y)",
		);
		expect(md).toContain(
			"Add the 13 missing tokens to the code output (run ds-bridge tokens check)",
		);
		// The change is measured against "Now" itself (stored first point 35),
		// so the row can never read "Now N · ±0" while N ≠ 35.
		const row =
			/\| System score \| (\d+)\/100 \| ([+−-]?\d+|±0) pts since 2026-10-04 \|/.exec(
				md,
			);
		expect(row).not.toBeNull();
		const now = Number(row?.[1]);
		const change = row?.[2] === "±0" ? 0 : Number(row?.[2]?.replace("−", "-"));
		expect(change).toBe(now - 35);
	});
});
