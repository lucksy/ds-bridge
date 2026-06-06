// T7.19 — integration: the built CLI's `ds-bridge docs` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like parity-cli) over a
// HAND-WRITTEN .ds-bridge/registry.json fixture plus a self-contained component
// file dropped into a fresh tmp project — no network. The component file lets the
// in-process ts-morph scan resolve real props/variants so the generated MDX is
// non-trivial; the figma side stays offline (the registry carries names/nodeIds,
// figma descriptions are unavailable without a fetch, so they surface as gaps).
//
// Asserts: MDX files written under --out, llms.txt content, json shape, the term
// summary table, the [component] filter, and the missing-registry exit-2 path.
//
// Exit codes:
//   0  success (gaps are informational)
//   2  operational error (missing registry, bad path, component not found)
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

interface ExecError {
	code: number;
	stdout: string;
	stderr: string;
}

function isExecError(value: unknown): value is ExecError {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		"stderr" in value
	);
}

const tmpDirs: string[] = [];

/** A registry covering a matched component, a code-only, and a figma-only. */
const REGISTRY = {
	schemaVersion: 1,
	generatedAt: "2026-06-06T00:00:00.000Z",
	matches: [
		{
			codeName: "Button",
			importPath: "components/button.tsx",
			figmaName: "Button",
			nodeId: "10:1",
			score: 0.95,
		},
	],
	unmatchedCode: [
		{
			name: "HeroPanel",
			importPath: "components/hero-panel.tsx",
			candidates: [],
		},
	],
	unmatchedFigma: [
		{
			name: "Tooltip",
			nodeId: "10:9",
			candidates: [],
		},
	],
};

/** Self-contained component so the in-process ts-morph scan resolves props. */
const BUTTON_TSX = `declare namespace React {
	type ReactNode = unknown;
}

export function Button(props: {
	variant: "primary" | "secondary";
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return props as unknown as JSX.Element;
}
`;

const HERO_PANEL_TSX = `export function HeroPanel(props: { title: string }) {
	return props as unknown as JSX.Element;
}
`;

/** Drop a registry + component files into a fresh tmp project. */
async function freshProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-bridge-docs-"));
	tmpDirs.push(dir);
	await mkdir(join(dir, ".ds-bridge"), { recursive: true });
	await writeFile(
		join(dir, ".ds-bridge", "registry.json"),
		`${JSON.stringify(REGISTRY, null, 2)}\n`,
		"utf8",
	);
	await mkdir(join(dir, "components"), { recursive: true });
	await writeFile(join(dir, "components", "button.tsx"), BUTTON_TSX, "utf8");
	await writeFile(
		join(dir, "components", "hero-panel.tsx"),
		HERO_PANEL_TSX,
		"utf8",
	);
	return dir;
}

/** A tmp project with NO registry, for the error path. */
async function emptyProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-bridge-docs-empty-"));
	tmpDirs.push(dir);
	return dir;
}

/** Run the CLI; resolve with code/stdout/stderr whether it exits 0 or not. */
async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8" },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

describe("ds-bridge docs (built dist/cli.mjs)", () => {
	beforeAll(async () => {
		await execFileAsync("npm", ["run", "build"], { cwd: repoRoot });
	}, 120_000);

	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("writes one MDX page per component + llms.txt to the default out dir", async () => {
		const dir = await freshProject();
		const result = await runCli(["docs", dir]);
		expect(result.code).toBe(0);

		const outDir = join(dir, ".ds-bridge", "docs");
		const button = await readFile(join(outDir, "Button.mdx"), "utf8");
		const hero = await readFile(join(outDir, "HeroPanel.mdx"), "utf8");
		const tooltip = await readFile(join(outDir, "Tooltip.mdx"), "utf8");

		// The matched Button carries its scanned props (the ts-morph scan ran).
		expect(button).toContain("# Button");
		expect(button).toContain("variant");
		expect(button).toContain("primary");
		// Code-only and figma-only pages exist too — nothing is dropped.
		expect(hero).toContain("# HeroPanel");
		expect(tooltip).toContain("# Tooltip");

		const llms = await readFile(join(outDir, "llms.txt"), "utf8");
		expect(llms).toContain("# Design System");
		expect(llms).toContain("## Components");
		expect(llms).toContain("Button");
		expect(llms).toContain("Tooltip");
	}, 60_000);

	it("honors --out and reports the page/gap summary in term output", async () => {
		const dir = await freshProject();
		const outDir = join(dir, "site", "docs");
		const result = await runCli(["docs", dir, "--out", outDir]);
		expect(result.code).toBe(0);
		// Term summary mentions how many pages were written.
		expect(result.stdout.toLowerCase()).toContain("pages");
		// Files landed at the requested --out, not the default.
		const button = await readFile(join(outDir, "Button.mdx"), "utf8");
		expect(button).toContain("# Button");
		const llms = await readFile(join(outDir, "llms.txt"), "utf8");
		expect(llms).toContain("# Design System");
	}, 60_000);

	it("--format=json emits a machine-readable result shape", async () => {
		const dir = await freshProject();
		const outDir = join(dir, "json-out");
		const result = await runCli([
			"docs",
			dir,
			"--out",
			outDir,
			"--format",
			"json",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			outDir: string;
			pages: { component: string; gaps: string[] }[];
			llmsPath: string;
		};
		expect(parsed.pages.map((p) => p.component).sort()).toEqual([
			"Button",
			"HeroPanel",
			"Tooltip",
		]);
		expect(typeof parsed.llmsPath).toBe("string");
		// Tooltip (figma-only, no description) carries gaps.
		const tooltip = parsed.pages.find((p) => p.component === "Tooltip");
		expect(tooltip?.gaps).toContain("unmatched-in-code");
	}, 60_000);

	it("[component] filters to a single component", async () => {
		const dir = await freshProject();
		const outDir = join(dir, "filtered");
		const result = await runCli([
			"docs",
			"Button",
			dir,
			"--out",
			outDir,
			"--format",
			"json",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			pages: { component: string }[];
		};
		expect(parsed.pages.map((p) => p.component)).toEqual(["Button"]);
	}, 60_000);

	it("exits 2 with candidate names when the component is not found", async () => {
		const dir = await freshProject();
		const result = await runCli([
			"docs",
			"Nonexistent",
			dir,
			"--out",
			join(dir, "nf"),
		]);
		expect(result.code).toBe(2);
		// The error lists the real component names as candidates.
		expect(result.stderr).toContain("Button");
	}, 60_000);

	it("exits 2 with run-build guidance when there is no registry", async () => {
		const dir = await emptyProject();
		const result = await runCli(["docs", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("registry build");
	}, 60_000);
});
