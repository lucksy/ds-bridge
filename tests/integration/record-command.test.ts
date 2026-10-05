// S1 (SPEC-analytics-surfaces §2) — `/ds-bridge:record`: an inline wrapper whose
// pre-exec line runs one `record` batch and hands the model the JSON summary.
// Runs only against a temp copy of the sample project (never the repo's own
// .ds-bridge/).
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const commandPath = join(repoRoot, "commands", "record.md");
const sample = join(repoRoot, "tests", "fixtures", "sample-project");

const tmpDirs: string[] = [];
afterAll(async () => {
	await Promise.all(
		tmpDirs.map((d) => rm(d, { recursive: true, force: true })),
	);
});

function preExecLine(md: string): string {
	const match = md.match(/^!`(.+)`$/m);
	if (match === null) throw new Error("no pre-exec line");
	return match[1] as string;
}

describe("commands/record.md (S1)", () => {
	it("is a frontmatter wrapper that pre-executes record --format=json via the plugin root", async () => {
		const md = await readFile(commandPath, "utf8");
		expect(md).toMatch(/^---\n[\s\S]*description:/);
		expect(md).toContain("argument-hint:");
		expect(preExecLine(md)).toBe(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin-root placeholder in the command markdown
			"node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs record $ARGUMENTS --format=json 2>&1 || true",
		);
	});

	it("narrates the JSON shape, the skip reasons and CI recording", async () => {
		const md = await readFile(commandPath, "utf8");
		for (const key of ["runId", "checks", "skipped", "reason", "score"]) {
			expect(md).toContain(key);
		}
		expect(md).toContain("--figma");
		expect(md).toContain("docs/ci-recording.md");
		expect(md).toContain("ds-bridge-data");
		expect(md).toContain("## Rules");
		// Findings never fail a record run; the command never edits code.
		expect(md).toMatch(/never edit/i);
	});

	it("the exact pre-exec line records one batch with a stored score", async () => {
		const md = await readFile(commandPath, "utf8");
		const dir = await mkdtemp(join(tmpdir(), "ds-record-cmd-"));
		tmpDirs.push(dir);
		await cp(sample, dir, { recursive: true });
		const env: NodeJS.ProcessEnv = {
			...process.env,
			CLAUDE_PLUGIN_ROOT: repoRoot,
		};
		for (const k of ["FIGMA_TOKEN", "CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN"]) {
			delete env[k];
		}
		const { stdout } = await execFileAsync("sh", ["-c", preExecLine(md)], {
			cwd: dir,
			env,
			encoding: "utf8",
		});
		const out = JSON.parse(stdout) as {
			runId: string;
			checks: { id: string; status: string }[];
			score?: { score: number };
		};
		expect(out.runId.length).toBeGreaterThan(0);
		expect(out.checks.find((c) => c.id === "lint")?.status).toBe("recorded");
		expect(typeof out.score?.score).toBe("number");
		const history = await readFile(
			join(dir, ".ds-bridge", "history.jsonl"),
			"utf8",
		);
		expect(history).toContain(`"runId":"${out.runId}"`);
	});
});
