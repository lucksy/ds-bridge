// M2.1 — integration: the built CLI's `dashboard list` command. Spawns
// dist/cli.mjs against a scratch project dir and asserts exit codes plus the
// term/json shapes. (M2.2 extends this file with set/add/remove blocks.)
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
		expect(parsed.artifacts).toHaveLength(6);
		expect(parsed.artifacts.every((a) => a.enabled)).toBe(true);
		expect(parsed.view.source).toBe("default");
		expect(parsed.view.viewName).toBe("everything");
	});

	it("emits the six artifacts in catalog order with stable metadata", async () => {
		const result = await run(["dashboard", "list", "--format=json", dir]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as JsonList;
		expect(parsed.artifacts.map((a) => a.id)).toEqual([
			"drift-trend",
			"lint-summary",
			"readiness",
			"parity",
			"a11y",
			"impact",
		]);
		const drift = parsed.artifacts[0];
		expect(drift?.title).toBe("Token drift");
		expect(drift?.personas).toEqual(["owner", "engineering"]);
	});

	it("with dashboard_view=owner, exactly drift-trend/parity/a11y are enabled", async () => {
		await writeFile(
			configPath(),
			`${JSON.stringify({ dashboard_view: "owner" }, null, 2)}\n`,
			"utf8",
		);
		const result = await run(["dashboard", "list", "--format=json", dir]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as JsonList;
		const enabled = parsed.artifacts.filter((a) => a.enabled).map((a) => a.id);
		expect(enabled).toEqual(["drift-trend", "parity", "a11y"]);
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
