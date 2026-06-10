// M2.1/M2.2 — integration: the built CLI's `dashboard` command group. Spawns
// dist/cli.mjs against a scratch project dir and asserts exit codes, the
// term/json shapes for `list`, and the set/add/remove edit + persistence
// semantics (materialization, idempotency, unrelated-key preservation).
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

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

interface JsonArtifact {
	id: string;
	title: string;
	personas: string[];
	enabled: boolean;
}

interface JsonList {
	artifacts: JsonArtifact[];
	view: { source: string; viewName?: string };
}

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ds-dashboard-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const configPath = (): string => join(dir, ".ds-bridge.json");

describe("ds-bridge dashboard list (built dist/cli.mjs)", () => {
	it("with no config, every artifact is enabled and the source is default", async () => {
		const result = await run(["dashboard", "list", "--format=json", dir]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as JsonList;
		expect(parsed.artifacts).toHaveLength(24);
		expect(parsed.artifacts.every((a) => a.enabled)).toBe(true);
		expect(parsed.view.source).toBe("default");
		expect(parsed.view.viewName).toBe("everything");
	});

	it("emits the twenty-four artifacts in catalog order with stable metadata", async () => {
		const result = await run(["dashboard", "list", "--format=json", dir]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as JsonList;
		expect(parsed.artifacts.map((a) => a.id)).toEqual([
			"system-score",
			"drift-trend",
			"lint-summary",
			"readiness",
			"parity",
			"a11y",
			"impact",
			"adoption-trend",
			"import-coverage",
			"leaderboard",
			"library-health",
			"breaking-calendar",
			"change-frequency",
			"targets",
			"parity-trend",
			"component-health",
			"library-health-trend",
			"migration-checklist",
			"score-velocity",
			"ownership-leaderboard",
			"audience-changelog",
			"frame-implementability",
			"release-readiness",
			"data-freshness",
		]);
		// system-score leads; drift-trend is second.
		const score = parsed.artifacts[0];
		expect(score?.id).toBe("system-score");
		expect(score?.title).toBe("System score");
		const drift = parsed.artifacts[1];
		expect(drift?.title).toBe("Token drift");
		expect(drift?.personas).toEqual(["ds-manager", "ds-engineer"]);
	});

	it("with dashboard_view=owner, exactly system-score/drift-trend/parity/a11y are enabled", async () => {
		await writeFile(
			configPath(),
			`${JSON.stringify({ dashboard_view: "owner" }, null, 2)}\n`,
			"utf8",
		);
		const result = await run(["dashboard", "list", "--format=json", dir]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as JsonList;
		const enabled = parsed.artifacts.filter((a) => a.enabled).map((a) => a.id);
		// owner is the full seven-artifact owner view (wave-3, B3). `list` reports
		// the ENABLED set in CATALOG order, not preset order.
		expect(enabled).toEqual([
			"system-score",
			"drift-trend",
			"parity",
			"a11y",
			"adoption-trend",
			"import-coverage",
			"leaderboard",
		]);
		expect(parsed.view.source).toBe("project");
		expect(parsed.view.viewName).toBe("owner");
	});

	it("with a custom dashboard_artifacts list, only those are enabled and no viewName", async () => {
		await writeFile(
			configPath(),
			`${JSON.stringify({ dashboard_artifacts: ["parity", "a11y"] }, null, 2)}\n`,
			"utf8",
		);
		const result = await run(["dashboard", "list", "--format=json", dir]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as JsonList;
		const enabled = parsed.artifacts.filter((a) => a.enabled).map((a) => a.id);
		expect(enabled).toEqual(["parity", "a11y"]);
		expect(parsed.view.source).toBe("project");
		expect(parsed.view.viewName).toBeUndefined();
	});

	it("term format prints a table with the catalog ids and an enabled marker", async () => {
		const result = await run(["dashboard", "list", dir]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("drift-trend");
		expect(result.stdout).toContain("Token drift");
		// box-drawing table frame
		expect(result.stdout).toMatch(/[┌┬┐│├┼┤└┴┘─]/);
	});

	it("an unknown --format exits 2 with an actionable message", async () => {
		const result = await run(["dashboard", "list", "--format=xml", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("format");
	});

	it("an invalid .ds-bridge.json exits 2", async () => {
		await writeFile(configPath(), "{ not json", "utf8");
		const result = await run(["dashboard", "list", "--format=json", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr.length).toBeGreaterThan(0);
	});
});

async function readConfig(): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(configPath(), "utf8")) as Record<
		string,
		unknown
	>;
}

describe("ds-bridge dashboard set (built dist/cli.mjs)", () => {
	it("set --view owner persists dashboard_view and resolves to owner on list", async () => {
		const setResult = await run(["dashboard", "set", "--view", "owner", dir]);
		expect(setResult.code).toBe(0);
		const written = await readConfig();
		expect(written.dashboard_view).toBe("owner");
		expect(written.dashboard_artifacts).toBeUndefined();

		const listResult = await run(["dashboard", "list", "--format=json", dir]);
		const parsed = JSON.parse(listResult.stdout) as JsonList;
		expect(parsed.view.viewName).toBe("owner");
	});

	it("set --artifacts persists dashboard_artifacts and clears any prior view", async () => {
		await run(["dashboard", "set", "--view", "owner", dir]);
		const setResult = await run([
			"dashboard",
			"set",
			"--artifacts",
			"parity,a11y",
			dir,
		]);
		expect(setResult.code).toBe(0);
		const written = await readConfig();
		expect(written.dashboard_artifacts).toEqual(["parity", "a11y"]);
		expect(written.dashboard_view).toBeUndefined();
	});

	it("set with both --view and --artifacts exits 2 (mutually exclusive)", async () => {
		const result = await run([
			"dashboard",
			"set",
			"--view",
			"owner",
			"--artifacts",
			"parity",
			dir,
		]);
		expect(result.code).toBe(2);
	});

	it("set with neither --view nor --artifacts exits 2", async () => {
		const result = await run(["dashboard", "set", dir]);
		expect(result.code).toBe(2);
	});

	it("set --view with an unknown preset exits 2 with suggestions", async () => {
		const result = await run(["dashboard", "set", "--view", "ownr", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("owner");
	});

	it("set --artifacts with an unknown id exits 2 with suggestions", async () => {
		const result = await run([
			"dashboard",
			"set",
			"--artifacts",
			"parity,paritee",
			dir,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("parity");
	});
});

describe("ds-bridge dashboard add/remove (built dist/cli.mjs)", () => {
	it("materializes the current preset into an explicit list, with a notice", async () => {
		await run(["dashboard", "set", "--view", "owner", dir]);
		const result = await run(["dashboard", "add", "impact", dir]);
		expect(result.code).toBe(0);
		// owner = the seven owner artifacts → + impact = 8 (wave-3 B3).
		const written = await readConfig();
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"adoption-trend",
			"import-coverage",
			"leaderboard",
			"drift-trend",
			"parity",
			"a11y",
			"impact",
		]);
		expect(written.dashboard_view).toBeUndefined();
		expect(result.stdout.toLowerCase()).toContain("explicit");
	});

	it("adding an already-present artifact is an idempotent no-op success with a notice", async () => {
		await run(["dashboard", "set", "--artifacts", "parity,a11y", dir]);
		const result = await run(["dashboard", "add", "parity", dir]);
		expect(result.code).toBe(0);
		const written = await readConfig();
		expect(written.dashboard_artifacts).toEqual(["parity", "a11y"]);
		expect(result.stdout.toLowerCase()).toMatch(/already|no-op|no change/);
	});

	it("removing an artifact materializes then drops it", async () => {
		await run(["dashboard", "set", "--view", "owner", dir]);
		const result = await run(["dashboard", "remove", "parity", dir]);
		expect(result.code).toBe(0);
		const written = await readConfig();
		// owner = the seven owner artifacts → drop parity = six (wave-3 B3).
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"adoption-trend",
			"import-coverage",
			"leaderboard",
			"drift-trend",
			"a11y",
		]);
	});

	it("removing an absent artifact is an idempotent no-op success with a notice", async () => {
		await run(["dashboard", "set", "--artifacts", "parity,a11y", dir]);
		const result = await run(["dashboard", "remove", "impact", dir]);
		expect(result.code).toBe(0);
		const written = await readConfig();
		expect(written.dashboard_artifacts).toEqual(["parity", "a11y"]);
		expect(result.stdout.toLowerCase()).toMatch(
			/already|no-op|not in|no change/,
		);
	});

	it("add with an unknown id exits 2 with suggestions and does not write", async () => {
		await run(["dashboard", "set", "--view", "owner", dir]);
		const before = await readFile(configPath(), "utf8");
		const result = await run(["dashboard", "add", "paritee", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("parity");
		expect(await readFile(configPath(), "utf8")).toBe(before);
	});

	it("preserves unrelated keys byte-wise when materializing", async () => {
		// A hand-written file with unrelated keys BEFORE dashboard_view; they (and
		// their order) must survive — only the dashboard keys are edited, with
		// dashboard_artifacts replacing dashboard_view in place at the end.
		const original = {
			figma_file_key: "ABC123",
			report_style: "html",
			dashboard_view: "owner",
		};
		await writeFile(
			configPath(),
			`${JSON.stringify(original, null, 2)}\n`,
			"utf8",
		);
		const result = await run(["dashboard", "add", "impact", dir]);
		expect(result.code).toBe(0);
		const text = await readFile(configPath(), "utf8");
		const written = JSON.parse(text) as Record<string, unknown>;
		expect(written.figma_file_key).toBe("ABC123");
		expect(written.report_style).toBe("html");
		expect(written.dashboard_view).toBeUndefined();
		// owner = the seven owner artifacts → + impact (wave-3 B3)
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"adoption-trend",
			"import-coverage",
			"leaderboard",
			"drift-trend",
			"parity",
			"a11y",
			"impact",
		]);
		// order preserved: unrelated keys first, dashboard_artifacts at the end
		expect(Object.keys(written)).toEqual([
			"figma_file_key",
			"report_style",
			"dashboard_artifacts",
		]);
		// 2-space indent + trailing newline convention
		expect(text.endsWith("}\n")).toBe(true);
		expect(text).toContain('  "figma_file_key"');
	});
});
