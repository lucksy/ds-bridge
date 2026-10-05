// E6 (SPEC-analytics-export §5) — `/ds-bridge:analytics` runs the real CLI for
// its headline instead of replaying the md scorecard and asking the model to
// blend consistency/debt itself.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const commandPath = join(repoRoot, "commands", "analytics.md");
const cliPath = join(repoRoot, "dist", "cli.mjs");

/** 2026-10-05T12:00:00Z — the pinned render instant. */
const ENV = { SOURCE_DATE_EPOCH: "1791201600" };

const tmpDirs: string[] = [];
afterAll(async () => {
	await Promise.all(
		tmpDirs.map((d) => rm(d, { recursive: true, force: true })),
	);
});

/** A project with a long history: every domain populated, long arrays. */
async function seededProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-analytics-cmd-"));
	tmpDirs.push(dir);
	const stateDir = join(dir, ".ds-bridge");
	await mkdir(stateDir, { recursive: true });
	const lines: object[] = [];
	for (let i = 0; i < 150; i++) {
		const day = new Date(Date.UTC(2026, 4, 1) + i * 86_400_000).toISOString();
		lines.push({
			at: day,
			kind: "lint",
			byKind: { exact: 3 + (i % 4), near: 2, offSystem: 6 - (i % 3) },
			adoption: {
				refs: 30 + i,
				literals: 10,
				byDirectory: [{ dir: `src/d${i % 12}`, refs: i, literals: 1 }],
			},
		});
		lines.push({
			at: day,
			kind: "handoff",
			score: 40 + (i % 50),
			frameName: `Frame ${i % 30}`,
			fileKey: "F1",
			nodeId: `${i % 30}:1`,
			deductions: [],
		});
	}
	lines.push(
		{
			at: "2026-10-02T10:00:00.000Z",
			kind: "library-health",
			overrideHotspots: 1,
			deprecatedUsage: 2,
			detachedCandidates: 0,
		},
		{
			at: "2026-10-04T10:00:00.000Z",
			kind: "adoption",
			imported: 6,
			total: 8,
			uncovered: ["Spinner", "Tooltip"],
		},
	);
	await writeFile(
		join(stateDir, "history.jsonl"),
		`${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
		"utf8",
	);
	await writeFile(
		join(stateDir, "registry.json"),
		JSON.stringify({
			schemaVersion: 1,
			generatedAt: "2026-10-01T00:00:00.000Z",
			matches: Array.from({ length: 8 }, (_, i) => ({
				codeName: `C${i}`,
				importPath: `./C${i}`,
				figmaName: `C${i}`,
				nodeId: `1:${i}`,
				score: 1,
			})),
			unmatchedCode: [],
			unmatchedFigma: [],
		}),
		"utf8",
	);
	return dir;
}

/** The `!` pre-exec line of the command markdown (the headline block). */
function preExecLine(md: string): string {
	const match = md.match(/^!`(.+)`$/m);
	if (match === null) throw new Error("no pre-exec line");
	return match[1] as string;
}

describe("commands/analytics.md (E6)", () => {
	it("pre-executes the bounded `analytics` term rollup through the plugin root", async () => {
		const md = await readFile(commandPath, "utf8");
		expect(md).toMatch(/^---\n[\s\S]*description:/);
		expect(preExecLine(md)).toBe(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin-root placeholder in the command markdown
			"node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs analytics 2>&1 || true",
		);
		expect(md).not.toContain("report --format=md");
		expect(md).not.toContain("| head -400");
	});

	it("the exact pre-exec line keeps every headline number on a long history", async () => {
		const md = await readFile(commandPath, "utf8");
		const dir = await seededProject();
		const env = { ...process.env, ...ENV, CLAUDE_PLUGIN_ROOT: repoRoot };
		const { stdout } = await execFileAsync("sh", ["-c", preExecLine(md)], {
			cwd: dir,
			env,
			encoding: "utf8",
		});
		const json = await execFileAsync(
			process.execPath,
			[cliPath, "analytics", dir, "--format", "json"],
			{ env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
		);
		const doc = JSON.parse(json.stdout);
		// The JSON form is long (sorted keys put executive after every domain) —
		// exactly why the headline is the term rollup.
		expect(json.stdout.split("\n").length).toBeGreaterThan(400);
		const ex = doc.executive as Record<string, number>;
		expect(ex.health).toBeTypeOf("number");
		expect(ex.adoption).toBeTypeOf("number");
		expect(ex.debt).toBeTypeOf("number");
		const lines = stdout.trimEnd().split("\n");
		expect(lines.length).toBeLessThanOrEqual(40);
		expect(stdout).toContain(`Health           ${ex.health}/100`);
		expect(stdout).toContain(`Import coverage  ${ex.adoption}%`);
		expect(stdout).toContain(`Debt             ${ex.debt}/100 (`);
		if (ex.consistency !== undefined) {
			expect(stdout).toContain(`Consistency      ${ex.consistency}/100`);
		}
		for (const domain of ["figma", "code", "token", "git", "score"]) {
			expect(stdout).toMatch(new RegExp(`^  ${domain} `, "m"));
		}
	});

	it("offers the JSON artifacts option and keeps the agents + one-pager", async () => {
		const md = await readFile(commandPath, "utf8");
		expect(md).toContain("analytics --emit all");
		expect(md).toContain("analytics-planner");
		expect(md).toContain("ds-recommender");
		expect(md).toContain("report --format exec");
	});

	it("keeps the report-only and never-invent rules", async () => {
		const md = await readFile(commandPath, "utf8");
		expect(md).toContain("**Report only.**");
		expect(md).toContain("**Never invent numbers.**");
	});
});
