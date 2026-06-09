// M2.3 — the `dashboard setup` wizard. Unit-style specs drive runSetupWizard
// over INJECTED streams (PassThrough in, capture out) across every interactive
// path — deterministic, no timers. Plus ONE spawn-harness integration case:
// piped stdin (non-TTY) → exit 2 pointing at `dashboard set`.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSetupWizard } from "../../src/cli-commands/dashboard-wizard.js";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ds-wizard-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const configPath = (): string => join(dir, ".ds-bridge.json");

interface DriveResult {
	exitCode: number;
	output: string;
}

/**
 * Drive runSetupWizard with the given input lines. Each line is written to the
 * injected `input` stream; `output` is captured to a string. The input ends
 * (EOF) after the supplied lines unless `keepOpen` is set.
 */
async function drive(
	lines: string[],
	opts: { isTTY?: boolean } = {},
): Promise<DriveResult> {
	const input = new PassThrough();
	const output = new PassThrough();
	let captured = "";
	output.on("data", (chunk: Buffer) => {
		captured += chunk.toString();
	});

	const promise = runSetupWizard({
		input,
		output,
		cwd: dir,
		isTTY: opts.isTTY ?? true,
	});

	for (const line of lines) {
		input.write(`${line}\n`);
	}
	input.end();

	const outcome = await promise;
	return { exitCode: outcome.exitCode, output: captured };
}

async function configExists(): Promise<boolean> {
	try {
		await readFile(configPath(), "utf8");
		return true;
	} catch {
		return false;
	}
}

describe("runSetupWizard (injected streams)", () => {
	it("non-TTY returns exit 2 pointing at `dashboard set`, before any prompt", async () => {
		const input = new PassThrough();
		const output = new PassThrough();
		let captured = "";
		output.on("data", (chunk: Buffer) => {
			captured += chunk.toString();
		});
		const outcome = await runSetupWizard({
			input,
			output,
			cwd: dir,
			isTTY: false,
		});
		expect(outcome.exitCode).toBe(2);
		expect(captured.toLowerCase()).toContain("dashboard set");
		expect(await configExists()).toBe(false);
	});

	it("happy path: pick a preset, no customization → persists dashboard_view", async () => {
		// presets listed 1..5 in PRESET_NAMES order: owner, engineering, design,
		// consumer, everything. Pick 1 (owner), customize? N, confirm y.
		const { exitCode, output } = await drive(["1", "n", "y"]);
		expect(exitCode).toBe(0);
		const written = JSON.parse(await readFile(configPath(), "utf8")) as Record<
			string,
			unknown
		>;
		expect(written.dashboard_view).toBe("owner");
		expect(written.dashboard_artifacts).toBeUndefined();
		// numbered preset list shown + final view summary + report hint
		expect(output).toContain("owner");
		expect(output.toLowerCase()).toContain("report --open");
	});

	it("the preset list is numbered with every preset name", async () => {
		const { output } = await drive(["1", "n", "y"]);
		expect(output).toMatch(/1[).:]/);
		for (const name of [
			"owner",
			"engineering",
			"design",
			"consumer",
			"everything",
		]) {
			expect(output).toContain(name);
		}
	});

	it("customize add+remove loop materializes an explicit artifact list", async () => {
		// Pick owner (the seven owner artifacts — wave-3 B3); customize? y; add
		// impact; remove parity; done; confirm y.
		// → [system-score, adoption-trend, import-coverage, leaderboard, drift-trend,
		//    a11y, impact]
		const { exitCode } = await drive([
			"1",
			"y",
			"add impact",
			"remove parity",
			"done",
			"y",
		]);
		expect(exitCode).toBe(0);
		const written = JSON.parse(await readFile(configPath(), "utf8")) as Record<
			string,
			unknown
		>;
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"adoption-trend",
			"import-coverage",
			"leaderboard",
			"drift-trend",
			"a11y",
			"impact",
		]);
		expect(written.dashboard_view).toBeUndefined();
	});

	it("B5: customizing the design preset materializes a list including library-health", async () => {
		// presets listed 1..5 in PRESET_NAMES order: owner, engineering, design,
		// consumer, everything. Pick 3 (design = system-score, readiness, a11y,
		// parity, library-health — wave-6 B5); customize? y; add impact; done;
		// confirm y. The materialized list preserves design order + the new addition.
		const { exitCode } = await drive(["3", "y", "add impact", "done", "y"]);
		expect(exitCode).toBe(0);
		const written = JSON.parse(await readFile(configPath(), "utf8")) as Record<
			string,
			unknown
		>;
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"readiness",
			"a11y",
			"parity",
			"library-health",
			"impact",
		]);
		expect(written.dashboard_view).toBeUndefined();
	});

	it("B6: customizing the consumer preset materializes the breaking-calendar + change-frequency list", async () => {
		// presets listed 1..5 in PRESET_NAMES order: owner, engineering, design,
		// consumer, everything. Pick 4 (consumer = system-score, parity, impact,
		// breaking-calendar, change-frequency — wave-7 B6); customize? y; done;
		// confirm y. With no edits the materialized list equals the consumer preset.
		const { exitCode } = await drive(["4", "y", "done", "y"]);
		expect(exitCode).toBe(0);
		const written = JSON.parse(await readFile(configPath(), "utf8")) as Record<
			string,
			unknown
		>;
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"parity",
			"impact",
			"breaking-calendar",
			"change-frequency",
		]);
		expect(written.dashboard_view).toBeUndefined();
	});

	it("the customize loop shows the current selection each round", async () => {
		const { output } = await drive(["1", "y", "add impact", "done", "y"]);
		// current selection echoed at least once with the preset's artifacts
		expect(output).toContain("drift-trend");
		expect(output).toContain("parity");
	});

	it("an unknown add target in the loop is reported and the loop continues", async () => {
		const { exitCode, output } = await drive([
			"1",
			"y",
			"add paritee",
			"done",
			"y",
		]);
		expect(exitCode).toBe(0);
		expect(output.toLowerCase()).toContain("parity"); // suggestion echoed
		// unknown add did not corrupt the selection: owner preset persisted as list
		// (wave-3 B3: the full seven-artifact owner view).
		const written = JSON.parse(await readFile(configPath(), "utf8")) as Record<
			string,
			unknown
		>;
		expect(written.dashboard_artifacts).toEqual([
			"system-score",
			"adoption-trend",
			"import-coverage",
			"leaderboard",
			"drift-trend",
			"parity",
			"a11y",
		]);
	});

	it("declining at the confirm step aborts without writing (exit 0)", async () => {
		const { exitCode } = await drive(["1", "n", "n"]);
		expect(exitCode).toBe(0);
		expect(await configExists()).toBe(false);
	});

	it("EOF mid-flow (no preset answer) → exit 2, config untouched", async () => {
		// Input ends immediately with no lines → the first question hits EOF.
		const { exitCode } = await drive([]);
		expect(exitCode).toBe(2);
		expect(await configExists()).toBe(false);
	});

	it("EOF after the preset pick but before confirm → exit 2, config untouched", async () => {
		const { exitCode } = await drive(["1"]);
		expect(exitCode).toBe(2);
		expect(await configExists()).toBe(false);
	});

	it("an out-of-range preset number is re-prompted, not crashed", async () => {
		// 9 is out of range → re-prompt; 1 picks owner; N; y.
		const { exitCode } = await drive(["9", "1", "n", "y"]);
		expect(exitCode).toBe(0);
		const written = JSON.parse(await readFile(configPath(), "utf8")) as Record<
			string,
			unknown
		>;
		expect(written.dashboard_view).toBe("owner");
	});
});

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

describe("ds-bridge dashboard setup (built dist/cli.mjs)", () => {
	it("piped stdin (non-TTY) exits 2 with a message mentioning `dashboard set`", async () => {
		// A spawned CLI is never a TTY; piping closed stdin guarantees non-TTY.
		const result: ExecResult = await new Promise((resolveP) => {
			const child = execFileAsync(process.execPath, [
				cliPath,
				"dashboard",
				"setup",
				dir,
			]);
			child.child.stdin?.end();
			child
				.then(({ stdout, stderr }) => resolveP({ code: 0, stdout, stderr }))
				.catch((error: unknown) => {
					if (isExecError(error)) resolveP(error);
					else throw error;
				});
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("dashboard set");
	});
});
