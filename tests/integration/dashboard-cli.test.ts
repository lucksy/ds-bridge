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
		expect(parsed.artifacts).toHaveLength(30);
		expect(parsed.artifacts.every((a) => a.enabled)).toBe(true);
		expect(parsed.view.source).toBe("default");
		expect(parsed.view.viewName).toBe("everything");
	});

	it("emits the thirty artifacts in catalog order with stable metadata", async () => {
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
			"consistency",
			"design-debt",
			"executive",
			"library-hotspots-trend",
			"frame-readiness-trend",
			"handoff-pass-rate",
		]);
		// system-score leads; drift-trend is second.
		const score = parsed.artifacts[0];
		expect(score?.id).toBe("system-score");
		expect(score?.title).toBe("System score");
		const drift = parsed.artifacts[1];
		expect(drift?.title).toBe("Token drift");
		expect(drift?.personas).toEqual(["ds-manager", "ds-engineer"]);
	});

	it("with dashboard_view=ds-designer, exactly the ds-designer §3.2 set is enabled", async () => {
		await writeFile(
			configPath(),
			`${JSON.stringify({ dashboard_view: "ds-designer" }, null, 2)}\n`,
			"utf8",
		);
		const result = await run(["dashboard", "list", "--format=json", dir]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as JsonList;
		const enabled = parsed.artifacts.filter((a) => a.enabled).map((a) => a.id);
		// ds-designer's full §3.2 set. `list` reports the ENABLED set in CATALOG
		// order (which, for a persona projection, equals the preset order).
		expect(enabled).toEqual([
			"system-score",
			"readiness",
			"parity",
			"a11y",
			"library-health",
			"parity-trend",
			"component-health",
			"library-health-trend",
			"data-freshness",
			"consistency",
			"design-debt",
			"library-hotspots-trend",
			"frame-readiness-trend",
			"handoff-pass-rate",
		]);
		expect(parsed.view.source).toBe("project");
		expect(parsed.view.viewName).toBe("ds-designer");
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

	it("emits the nine presets with descriptions + artifact lists (M7.1, X3, R6)", async () => {
		const result = await run(["dashboard", "list", "--format=json", dir]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as JsonList & {
			presets: { name: string; description: string; artifacts: string[] }[];
		};
		// The full preset-name list, in PRESET_NAMES order, for the persona wizard.
		expect(parsed.presets.map((p) => p.name)).toEqual([
			"ds-designer",
			"ds-manager",
			"ds-engineer",
			"product-designer",
			"product-manager",
			"product-engineer",
			"everything",
			"exec",
			"org",
		]);
		// Each carries a non-empty description + its full artifact id list.
		for (const preset of parsed.presets) {
			expect(preset.description.length).toBeGreaterThan(0);
			expect(preset.artifacts.length).toBeGreaterThan(0);
			expect(preset.artifacts[0]).toBe("system-score");
		}
		// `persona` marks the six wizard options; `everything` (the escape) and
		// `exec` (set with `dashboard set --view exec`) are not personas
		// (SPEC-personas §2.4) — commands/dashboard.md filters on this flag.
		const flagged = parsed.presets as unknown as {
			name: string;
			persona: boolean;
		}[];
		for (const preset of flagged) {
			expect(typeof preset.persona).toBe("boolean");
		}
		expect(flagged.filter((p) => p.persona).map((p) => p.name)).toEqual([
			"ds-designer",
			"ds-manager",
			"ds-engineer",
			"product-designer",
			"product-manager",
			"product-engineer",
		]);
		// `everything` is the 30-artifact catch-all.
		const everything = parsed.presets.find((p) => p.name === "everything");
		expect(everything?.artifacts).toHaveLength(30);
		// ds-designer names its real §3.2 set, not hand-prose.
		const dsDesigner = parsed.presets.find((p) => p.name === "ds-designer");
		expect(dsDesigner?.artifacts).toContain("component-health");
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
	it("set --view persists dashboard_view and resolves it on list", async () => {
		const setResult = await run([
			"dashboard",
			"set",
			"--view",
			"ds-designer",
			dir,
		]);
		expect(setResult.code).toBe(0);
		const written = await readConfig();
		expect(written.dashboard_view).toBe("ds-designer");
		expect(written.dashboard_artifacts).toBeUndefined();

		const listResult = await run(["dashboard", "list", "--format=json", dir]);
		const parsed = JSON.parse(listResult.stdout) as JsonList;
		expect(parsed.view.viewName).toBe("ds-designer");
	});

	it("set --artifacts persists dashboard_artifacts and clears any prior view", async () => {
		await run(["dashboard", "set", "--view", "ds-designer", dir]);
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
			"ds-designer",
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
		const result = await run(["dashboard", "set", "--view", "ds-designe", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("designer");
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
		await run(["dashboard", "set", "--view", "ds-designer", dir]);
		const result = await run(["dashboard", "add", "impact", dir]);
		expect(result.code).toBe(0);
		// ds-designer's fourteen artifacts (§3.2 + the X3 executive layer + the F5 trends) → + impact (appended) = fifteen.
		const written = await readConfig();
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"readiness",
			"parity",
			"a11y",
			"library-health",
			"parity-trend",
			"component-health",
			"library-health-trend",
			"data-freshness",
			"consistency",
			"design-debt",
			"library-hotspots-trend",
			"frame-readiness-trend",
			"handoff-pass-rate",
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
		await run(["dashboard", "set", "--view", "ds-designer", dir]);
		const result = await run(["dashboard", "remove", "parity", dir]);
		expect(result.code).toBe(0);
		const written = await readConfig();
		// ds-designer's fourteen artifacts → drop parity = thirteen.
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"readiness",
			"a11y",
			"library-health",
			"parity-trend",
			"component-health",
			"library-health-trend",
			"data-freshness",
			"consistency",
			"design-debt",
			"library-hotspots-trend",
			"frame-readiness-trend",
			"handoff-pass-rate",
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
		await run(["dashboard", "set", "--view", "ds-designer", dir]);
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
			dashboard_view: "ds-designer",
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
		// ds-designer's fourteen artifacts → + impact (appended)
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"readiness",
			"parity",
			"a11y",
			"library-health",
			"parity-trend",
			"component-health",
			"library-health-trend",
			"data-freshness",
			"consistency",
			"design-debt",
			"library-hotspots-trend",
			"frame-readiness-trend",
			"handoff-pass-rate",
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

// ---------- M8.4 — dashboard save / load / ls / rm + --freeze + gitignore ----------
//
// Saved dashboards live in dashboards/<name>(.local).json. `save` keeps a preset
// LIVE by default (stores the view name) and materializes with --freeze; `load`
// points dashboard_default at a saved name; `ls` lists them with shared/personal
// markers; `rm` deletes one. `--local` writes a .local.json and gitignores them.

async function readJson(file: string): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

describe("ds-bridge dashboard save (built dist/cli.mjs)", () => {
	it("save --view keeps the preset LIVE (stores the view name)", async () => {
		const result = await run([
			"dashboard",
			"save",
			"exec",
			"--view",
			"ds-manager",
			dir,
		]);
		expect(result.code).toBe(0);
		const saved = await readJson(join(dir, "dashboards", "exec.json"));
		expect(saved).toMatchObject({ name: "exec", view: "ds-manager" });
		expect(saved.artifacts).toBeUndefined();
	});

	it("save --freeze materializes the resolved artifact list", async () => {
		const result = await run([
			"dashboard",
			"save",
			"exec",
			"--view",
			"ds-manager",
			"--freeze",
			dir,
		]);
		expect(result.code).toBe(0);
		const saved = await readJson(join(dir, "dashboards", "exec.json"));
		expect(saved.view).toBeUndefined();
		expect(Array.isArray(saved.artifacts)).toBe(true);
		expect((saved.artifacts as string[])[0]).toBe("system-score");
		expect(saved.artifacts).toContain("ownership-leaderboard");
	});

	it("save --artifacts persists an explicit list", async () => {
		const result = await run([
			"dashboard",
			"save",
			"slim",
			"--artifacts",
			"system-score,parity",
			dir,
		]);
		expect(result.code).toBe(0);
		const saved = await readJson(join(dir, "dashboards", "slim.json"));
		expect(saved.artifacts).toEqual(["system-score", "parity"]);
	});

	it("save --from-current saves the project's live view", async () => {
		await run(["dashboard", "set", "--view", "ds-designer", dir]);
		const result = await run([
			"dashboard",
			"save",
			"mine",
			"--from-current",
			dir,
		]);
		expect(result.code).toBe(0);
		const saved = await readJson(join(dir, "dashboards", "mine.json"));
		expect(saved.view).toBe("ds-designer");
	});

	it("save --local writes a .local.json and gitignores them", async () => {
		const result = await run([
			"dashboard",
			"save",
			"mine",
			"--view",
			"ds-designer",
			"--local",
			dir,
		]);
		expect(result.code).toBe(0);
		await expect(
			readFile(join(dir, "dashboards", "mine.local.json"), "utf8"),
		).resolves.toContain("ds-designer");
		const gitignore = await readFile(join(dir, ".gitignore"), "utf8");
		expect(gitignore).toContain("dashboards/*.local.json");
	});
});

describe("ds-bridge dashboard load/ls/rm (built dist/cli.mjs)", () => {
	it("load points dashboard_default at the saved name, clearing view/artifacts", async () => {
		await run(["dashboard", "save", "exec", "--view", "ds-manager", dir]);
		await run(["dashboard", "set", "--view", "ds-designer", dir]);
		const result = await run(["dashboard", "load", "exec", dir]);
		expect(result.code).toBe(0);
		const cfg = await readConfig();
		expect(cfg.dashboard_default).toBe("exec");
		expect(cfg.dashboard_view).toBeUndefined();
		expect(cfg.dashboard_artifacts).toBeUndefined();
	});

	it("load of an unknown name exits 2 with the available list", async () => {
		await run(["dashboard", "save", "exec", "--view", "ds-manager", dir]);
		const result = await run(["dashboard", "load", "nope", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("exec");
	});

	it("ls lists saved dashboards with shared/personal markers", async () => {
		await run(["dashboard", "save", "exec", "--view", "ds-manager", dir]);
		await run([
			"dashboard",
			"save",
			"mine",
			"--view",
			"ds-designer",
			"--local",
			dir,
		]);
		const result = await run(["dashboard", "ls", dir]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("exec");
		expect(result.stdout).toContain("mine");
		expect(result.stdout.toLowerCase()).toMatch(/shared|personal/);
	});

	it("ls with no saved dashboards prints a friendly note", async () => {
		const result = await run(["dashboard", "ls", dir]);
		expect(result.code).toBe(0);
		expect(result.stdout.toLowerCase()).toContain("no saved dashboards");
	});

	it("rm deletes a saved dashboard", async () => {
		await run(["dashboard", "save", "exec", "--view", "ds-manager", dir]);
		const result = await run(["dashboard", "rm", "exec", dir]);
		expect(result.code).toBe(0);
		await expect(
			readFile(join(dir, "dashboards", "exec.json"), "utf8"),
		).rejects.toThrow();
	});

	it("rm of an unknown name exits 2", async () => {
		const result = await run(["dashboard", "rm", "nope", dir]);
		expect(result.code).toBe(2);
	});

	it("add --dashboard materializes + edits a saved dashboard's artifact list", async () => {
		await run([
			"dashboard",
			"save",
			"exec",
			"--artifacts",
			"system-score,parity",
			dir,
		]);
		const result = await run([
			"dashboard",
			"add",
			"impact",
			"--dashboard",
			"exec",
			dir,
		]);
		expect(result.code).toBe(0);
		const saved = await readJson(join(dir, "dashboards", "exec.json"));
		expect(saved.artifacts).toEqual(["system-score", "parity", "impact"]);
	});
});

describe("ds-bridge dashboard suggest (built dist/cli.mjs)", () => {
	it("ranks catalog matches for a free-text phrase + prints a save line", async () => {
		const result = await run([
			"dashboard",
			"suggest",
			"adoption trend and the breaking calendar",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("adoption-trend");
		expect(result.stdout).toContain("breaking-calendar");
		expect(result.stdout).toContain("dashboard save");
	});

	it("reports no match for an all-noise phrase", async () => {
		const result = await run(["dashboard", "suggest", "to go it"]);
		expect(result.code).toBe(0);
		expect(result.stdout.toLowerCase()).toContain("no artifacts matched");
	});
});
