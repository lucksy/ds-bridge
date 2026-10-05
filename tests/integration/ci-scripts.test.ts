// The ds-bridge-record action's decision scripts: which mode a run gets
// (record only the default branch) and which PR comment it may update (only
// its own).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const modeScript = join(repoRoot, "scripts", "ci-mode.mjs");
const commentScript = join(repoRoot, "scripts", "ci-pr-comment.mjs");

const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function mode(env: Record<string, string>): {
	code: number;
	stdout: string;
	output: string;
} {
	const dir = mkdtempSync(join(tmpdir(), "ds-ci-mode-"));
	dirs.push(dir);
	const outFile = join(dir, "out");
	const run = spawnSync(process.execPath, [modeScript], {
		encoding: "utf8",
		env: { PATH: process.env.PATH ?? "", GITHUB_OUTPUT: outFile, ...env },
	});
	let output = "";
	try {
		output = readFileSync(outFile, "utf8");
	} catch {
		// not written
	}
	return { code: run.status ?? 1, stdout: run.stdout, output };
}

const onMain = { REF_NAME: "main", DEFAULT_BRANCH: "main" };

describe("scripts/ci-mode.mjs", () => {
	it("auto: a push to the default branch records, a pull request checks", () => {
		expect(mode({ ...onMain, EVENT_NAME: "push" }).output).toBe(
			"mode=record\n",
		);
		expect(mode({ ...onMain, EVENT_NAME: "pull_request" }).output).toBe(
			"mode=check\n",
		);
	});

	it("auto: a dispatch from a feature branch only checks (never pollutes the series)", () => {
		const run = mode({
			EVENT_NAME: "workflow_dispatch",
			REF_NAME: "feature/x",
			DEFAULT_BRANCH: "main",
		});
		expect(run.code).toBe(0);
		expect(run.output).toBe("mode=check\n");
		expect(run.stdout).toContain(
			"::notice::ds-bridge-record: 'feature/x' is not the default branch 'main'",
		);
	});

	it("auto: an unfiltered push of another branch or a tag only checks", () => {
		for (const ref of ["dev", "v1.0.0"]) {
			expect(
				mode({ EVENT_NAME: "push", REF_NAME: ref, DEFAULT_BRANCH: "main" })
					.output,
			).toBe("mode=check\n");
		}
	});

	it("an explicit record of another ref fails, unless allow-any-ref", () => {
		const refused = mode({
			INPUT_MODE: "record",
			EVENT_NAME: "push",
			REF_NAME: "dev",
			DEFAULT_BRANCH: "main",
		});
		expect(refused.code).toBe(1);
		expect(refused.stdout).toContain("::error::refusing to record");
		expect(refused.output).toBe("");
		expect(
			mode({
				INPUT_MODE: "record",
				EVENT_NAME: "push",
				REF_NAME: "dev",
				DEFAULT_BRANCH: "main",
				ALLOW_ANY_REF: "true",
			}).output,
		).toBe("mode=record\n");
	});

	it("schedule records even when the payload has no default branch", () => {
		expect(mode({ EVENT_NAME: "schedule", REF_NAME: "main" }).output).toBe(
			"mode=record\n",
		);
	});

	it("pull_request_target checks and warns about checking out the PR head", () => {
		const run = mode({ ...onMain, EVENT_NAME: "pull_request_target" });
		expect(run.output).toBe("mode=check\n");
		expect(run.stdout).toContain("::warning::");
		expect(run.stdout).toContain("pull_request_target");
	});

	it("site and check pass through; an unknown mode fails", () => {
		expect(
			mode({ ...onMain, INPUT_MODE: "site", EVENT_NAME: "push" }).output,
		).toBe("mode=site\n");
		const bad = mode({ ...onMain, INPUT_MODE: "publish", EVENT_NAME: "push" });
		expect(bad.code).toBe(1);
		expect(bad.stdout).toContain("::error::unknown mode 'publish'");
	});
});

/** Run a snippet against the comment script's pure exports. */
function commentExports(snippet: string): unknown {
	const run = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`import * as m from ${JSON.stringify(commentScript)}; process.stdout.write(JSON.stringify(${snippet}));`,
		],
		{ encoding: "utf8" },
	);
	expect(run.stderr).toBe("");
	return JSON.parse(run.stdout);
}

describe("scripts/ci-pr-comment.mjs", () => {
	it("updates only the marker comment written by the token's own account", () => {
		const comments = [
			{ id: 1, login: "mallory", body: "<!-- ds-bridge-scorecard -->\nfake" },
			{ id: 2, login: "github-actions[bot]", body: "unrelated" },
			{
				id: 3,
				login: "github-actions[bot]",
				body: "<!-- ds-bridge-scorecard -->\nours",
			},
		];
		expect(
			commentExports(
				`m.findOwnComment(${JSON.stringify(comments)}, "github-actions[bot]")`,
			),
		).toBe(3);
		// Someone else's marker comment alone → none of ours → post a new one.
		expect(
			commentExports(
				`m.findOwnComment(${JSON.stringify(comments.slice(0, 2))}, "github-actions[bot]") ?? null`,
			),
		).toBeNull();
	});

	it("prefixes the marker and caps the body below GitHub's limit", () => {
		expect(commentExports(`m.commentBody("hi")`)).toBe(
			"<!-- ds-bridge-scorecard -->\nhi",
		);
		const long = commentExports(`m.commentBody("x".repeat(70000))`) as string;
		expect(long.length).toBeLessThan(65_536);
		expect(long).toContain("(truncated");
	});
});
