// M7.3 — the persona-first `dashboard setup` wizard. Unit-style specs drive
// runSetupWizard over INJECTED streams (PassThrough in, capture out) across
// every interactive path — deterministic, no timers. The flow: pick a persona
// (or the `everything` escape) → capture the per-side file-key model (producer
// confirms the library key; consumer pins a product_file_keys alias) → confirm
// → write ONLY dashboard_view + product_file_keys (never report_style /
// readiness_threshold) → echo the persona audience default + a render hint.
// Plus ONE spawn-harness case: piped stdin (non-TTY) → exit 2.
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

async function readConfig(): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(configPath(), "utf8")) as Record<
		string,
		unknown
	>;
}

async function configExists(): Promise<boolean> {
	try {
		await readFile(configPath(), "utf8");
		return true;
	} catch {
		return false;
	}
}

// PRESET_NAMES order: 1 ds-designer, 2 ds-manager, 3 ds-engineer,
// 4 product-designer, 5 product-manager, 6 product-engineer, 7 everything.

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

	it("the preset list is numbered with every persona + the everything escape", async () => {
		// Pick 1 (ds-designer, producer); library key configured? y; confirm y.
		const { output } = await drive(["1", "y", "y"]);
		expect(output).toMatch(/1[).:]/);
		for (const name of [
			"ds-designer",
			"ds-manager",
			"ds-engineer",
			"product-designer",
			"product-manager",
			"product-engineer",
			"everything",
		]) {
			expect(output).toContain(name);
		}
	});

	it("producer persona: confirm library key → writes ONLY dashboard_view", async () => {
		// Pick 1 (ds-designer); library key configured? y; confirm y.
		const { exitCode, output } = await drive(["1", "y", "y"]);
		expect(exitCode).toBe(0);
		const written = await readConfig();
		expect(written.dashboard_view).toBe("ds-designer");
		// Onboarding writes ONLY dashboard_view (+ product_file_keys) — never these.
		expect(written.dashboard_artifacts).toBeUndefined();
		expect(written.product_file_keys).toBeUndefined();
		expect(written.report_style).toBeUndefined();
		expect(written.readiness_threshold).toBeUndefined();
		expect(Object.keys(written)).toEqual(["dashboard_view"]);
		// The persona audience default is echoed (ds-designer → designers).
		expect(output.toLowerCase()).toContain("designers");
		expect(output.toLowerCase()).toContain("report --open");
	});

	it("producer with the library key UNSET warns about empty sections but still saves", async () => {
		// Pick 2 (ds-manager); library key configured? n (warn); confirm y.
		const { exitCode, output } = await drive(["2", "n", "y"]);
		expect(exitCode).toBe(0);
		expect(output.toLowerCase()).toContain("empty");
		const written = await readConfig();
		expect(written.dashboard_view).toBe("ds-manager");
		// ds-manager → both audiences.
		expect(output.toLowerCase()).toContain("both");
	});

	it("consumer persona: pins a product_file_keys alias + writes dashboard_view", async () => {
		// Pick 4 (product-designer, consumer); alias "web"; key "ABC123"; confirm y.
		const { exitCode, output } = await drive(["4", "web", "ABC123", "y"]);
		expect(exitCode).toBe(0);
		const written = await readConfig();
		expect(written.dashboard_view).toBe("product-designer");
		expect(written.product_file_keys).toEqual({ web: "ABC123" });
		// Onboarding still writes nothing else.
		expect(Object.keys(written).sort()).toEqual([
			"dashboard_view",
			"product_file_keys",
		]);
		expect(output.toLowerCase()).toContain("designers");
	});

	it("consumer merges the new alias onto any existing product_file_keys", async () => {
		await drive(["4", "web", "ABC123", "y"]); // first product file
		// Pick 6 (product-engineer); alias "ios"; key "XYZ789"; confirm y.
		const { exitCode } = await drive(["6", "ios", "XYZ789", "y"]);
		expect(exitCode).toBe(0);
		const written = await readConfig();
		expect(written.product_file_keys).toEqual({
			web: "ABC123",
			ios: "XYZ789",
		});
		expect(written.dashboard_view).toBe("product-engineer");
	});

	it("consumer may skip the product file pin with a blank alias", async () => {
		// Pick 5 (product-manager); blank alias → skip; confirm y.
		const { exitCode, output } = await drive(["5", "", "y"]);
		expect(exitCode).toBe(0);
		const written = await readConfig();
		expect(written.dashboard_view).toBe("product-manager");
		expect(written.product_file_keys).toBeUndefined();
		// product-manager → both audiences.
		expect(output.toLowerCase()).toContain("both");
	});

	it("the `everything` escape needs no setup and writes nothing", async () => {
		// Pick 7 (everything) → no config written, exit 0.
		const { exitCode, output } = await drive(["7"]);
		expect(exitCode).toBe(0);
		expect(output.toLowerCase()).toContain("everything");
		expect(await configExists()).toBe(false);
	});

	it("ds-engineer echoes the developers audience default", async () => {
		// Pick 3 (ds-engineer, producer); key y; confirm y.
		const { output } = await drive(["3", "y", "y"]);
		expect(output.toLowerCase()).toContain("developers");
	});

	it("declining at the confirm step aborts without writing (exit 0)", async () => {
		const { exitCode } = await drive(["1", "y", "n"]);
		expect(exitCode).toBe(0);
		expect(await configExists()).toBe(false);
	});

	it("EOF mid-flow (no preset answer) → exit 2, config untouched", async () => {
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
		// 9 is out of range (1..7) → re-prompt; 1 picks ds-designer; key y; confirm y.
		const { exitCode } = await drive(["9", "1", "y", "y"]);
		expect(exitCode).toBe(0);
		const written = await readConfig();
		expect(written.dashboard_view).toBe("ds-designer");
	});

	it("never offers the curated non-persona views (`exec`, `org` — SPEC-rollup §4)", async () => {
		// Only 1..7 exist: 8 (would be exec/org) is re-prompted; 7 is everything.
		const { exitCode, output } = await drive(["8", "7"]);
		expect(exitCode).toBe(0);
		expect(output).toContain("between 1 and 7");
		expect(output).not.toMatch(/\borg\b/);
		expect(await configExists()).toBe(false);
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
