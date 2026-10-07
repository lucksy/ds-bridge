// Real-user regression (GitHub Primer testbed, 2026-10-07): Primer's real token
// source is JSON5 DTCG 2025 (color objects, {value, unit} dimensions), nested by
// layer under tokens/, with theme variants as `light.high-contrast` /
// `dark.dimmed` files, dark values in `$extensions["org.primer.overrides"]`,
// a token-level `alpha`, and a CSS build that emits var() references inside
// attribute-scoped theme rules. Spawns dist/cli.mjs against a throwaway copy of
// tests/fixtures/primer-project.
import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const fixture = join(repoRoot, "tests", "fixtures", "primer-project");

interface Run {
	code: number;
	stdout: string;
	stderr: string;
}

async function runCli(args: string[], cwd: string): Promise<Run> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ cwd, env: { ...process.env, NO_COLOR: "1" } },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

let project: string;

beforeAll(async () => {
	project = await mkdtemp(join(tmpdir(), "ds-primer-"));
	await cp(fixture, project, { recursive: true });
});

afterAll(async () => {
	await rm(project, { recursive: true, force: true });
});

describe("tokens check — Primer JSON5 set", () => {
	it("discovers tokens/, reads JSON5, and is in sync in light and dark", async () => {
		const run = await runCli(["tokens", "check", "--format", "json"], project);
		const out = JSON.parse(run.stdout) as {
			inSync: boolean;
			entries: unknown[];
			source: { path: string; modes: string[] };
			skippedModes?: string[];
			unbuiltLayers?: { prefix: string; tokens: number }[];
		};
		expect(out.entries).toEqual([]);
		expect(out.inSync).toBe(true);
		expect(out.source.path).toBe("tokens");
		expect(out.source.modes).toEqual([
			"light",
			"dark",
			"dark-dimmed",
			"light-high-contrast",
		]);
		expect(out.skippedModes).toEqual(["dark-dimmed", "light-high-contrast"]);
		expect(out.unbuiltLayers).toEqual([{ prefix: "base.color", tokens: 2 }]);
		expect(run.code).toBe(0);
	});
});

describe("lint — Primer project", () => {
	it("finds the JSON5 tokens from `lint src` and skips the banner-less theme CSS", async () => {
		const run = await runCli(["lint", "src", "--format", "json"], project);
		expect(run.stderr).not.toContain("No design-token source");
		const out = JSON.parse(run.stdout) as {
			file: string;
			raw: string;
			expectedToken?: string;
		}[];
		expect(out.map((v) => [v.file, v.raw, v.expectedToken])).toEqual([
			// bgColor.inset and bgColor.muted share #f6f8fa; either is a surface.
			["src/components/PromoBox.tsx", '"#f6f8fa"', "bgColor.inset"],
			["src/components/PromoBox.tsx", "4px", "space.xs"],
		]);
		expect(run.code).toBe(1);
	});
});
