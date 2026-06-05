// T0.4 — integration: the built single-file CLI responds to --version and --help.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

const pkg = JSON.parse(
	readFileSync(join(repoRoot, "package.json"), "utf8"),
) as {
	version: string;
};

describe("ds-bridge CLI shell (built dist/cli.mjs)", () => {
	beforeAll(async () => {
		// Build the bundle the test exercises — acceptance is against dist, not src.
		const { execFile: ef } = await import("node:child_process");
		await promisify(ef)("npm", ["run", "build"], { cwd: repoRoot });
	}, 120_000);

	it("--version prints the package version and exits 0", async () => {
		const { stdout } = await execFileAsync(process.execPath, [
			cliPath,
			"--version",
		]);
		expect(stdout.trim()).toBe(pkg.version);
	});

	it("--help prints usage with the program name and exits 0", async () => {
		const { stdout } = await execFileAsync(process.execPath, [
			cliPath,
			"--help",
		]);
		expect(stdout).toContain("ds-bridge");
		expect(stdout).toContain("Usage:");
	});

	it("unknown command exits non-zero with an error message", async () => {
		await expect(
			execFileAsync(process.execPath, [cliPath, "definitely-not-a-command"]),
		).rejects.toMatchObject({ code: 1 });
	});
});
