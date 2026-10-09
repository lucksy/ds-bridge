// X4 (SPEC-exceptions §4) — `/ds-bridge:exceptions`: an inline wrapper whose
// pre-exec line renders the exceptions-review section as JSON for the model to
// triage. Runs only against a temp project (never the repo's own .ds-bridge/).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const commandPath = join(repoRoot, "commands", "exceptions.md");

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

const lh = (at: string, count: number) =>
	JSON.stringify({
		at,
		kind: "library-health",
		overrideHotspots: count,
		deprecatedUsage: 0,
		detachedCandidates: 0,
		topN: 10,
		topOverrides: [{ name: "Card", count }],
	});

describe("commands/exceptions.md (X4)", () => {
	it("pre-executes the exceptions-review section as JSON via the plugin root", async () => {
		const md = await readFile(commandPath, "utf8");
		expect(md).toMatch(/^---\n[\s\S]*description:/);
		expect(md).toContain("argument-hint:");
		expect(preExecLine(md)).toBe(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin-root placeholder in the command markdown
			"node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs report '$ARGUMENTS' --artifacts=exceptions-review --format=json",
		);
	});

	it("narrates every state, the config entry and the never-hides rule", async () => {
		const md = await readFile(commandPath, "utf8");
		for (const word of [
			"needs-owner",
			"overdue",
			"investigating",
			"fix-implementation",
			"evolve-component",
			"resolved",
			"not-seen",
			"review_by",
			"## Rules",
		]) {
			expect(md).toContain(word);
		}
		expect(md).toMatch(/changes no count and no\s+score/);
		expect(md).toMatch(/only after the user confirms/);
	});

	it("the exact pre-exec line returns the review for a recurring hotspot", async () => {
		const md = await readFile(commandPath, "utf8");
		const dir = await mkdtemp(join(tmpdir(), "ds-exceptions-cmd-"));
		tmpDirs.push(dir);
		await mkdir(join(dir, ".ds-bridge"), { recursive: true });
		await writeFile(
			join(dir, ".ds-bridge", "history.jsonl"),
			`${lh("2026-09-01T10:00:00.000Z", 4)}\n${lh("2026-09-08T10:00:00.000Z", 6)}\n`,
			"utf8",
		);
		const { stdout } = await execFileAsync(
			"sh",
			["-c", preExecLine(md).replace("$ARGUMENTS", "")],
			{
				cwd: dir,
				env: { ...process.env, CLAUDE_PLUGIN_ROOT: repoRoot },
				encoding: "utf8",
			},
		);
		const out = JSON.parse(stdout) as {
			data: { exceptionsReview?: { rows: { name: string; state: string }[] } };
		};
		expect(out.data.exceptionsReview?.rows).toMatchObject([
			{ name: "Card", state: "needs-owner" },
		]);
	});
});
