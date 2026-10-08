// The trimmed plugin payload published to the `release` branch. Claude Code has
// no ignore file for plugin installs, so the marketplace points at a branch
// holding only what runs: scripts/build-release.mjs assembles it from a tagged
// checkout (dist/ is committed at release tags). This suite builds it and proves
// the result is complete (every runtime import resolves, the CLI runs with no
// node_modules) and lean (no sources, tests or dev tooling).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
	cp,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const buildScript = join(repoRoot, "scripts", "build-release.mjs");

let out: string;
const tmpDirs: string[] = [];

beforeAll(async () => {
	const parent = await mkdtemp(join(tmpdir(), "ds-release-"));
	tmpDirs.push(parent);
	out = join(parent, "plugin");
	await execFileAsync(process.execPath, [buildScript, out], {
		cwd: repoRoot,
		encoding: "utf8",
	});
}, 120_000);

afterAll(async () => {
	await Promise.all(
		tmpDirs.map((d) => rm(d, { recursive: true, force: true })),
	);
});

describe("scripts/build-release.mjs", () => {
	it("ships every runtime part of the plugin", () => {
		for (const path of [
			".claude-plugin/plugin.json",
			".mcp.json",
			"README.md",
			"LICENSE",
			"commands/ds-lint.md",
			"agents/parity-auditor.md",
			"skills/design-system-context/SKILL.md",
			"hooks/hooks.json",
			"hooks/register.tsx",
			"hooks/insights/vendor",
			"scripts/hook-lint.mjs",
			"scripts/run-cli.mjs",
			"dist/cli.mjs",
			"schemas/report.v1.schema.json",
			"types/index.d.ts",
			// The insights mod imports this one source file directly.
			"src/render/terminal/blocks.ts",
		]) {
			expect(existsSync(join(out, path)), path).toBe(true);
		}
	});

	it("ships no sources, tests, dependencies or dev tooling", () => {
		for (const path of [
			"src/engines",
			"src/cli.ts",
			"tests",
			"e2e",
			"mod-tests",
			"node_modules",
			"coverage",
			"package-lock.json",
			"tsconfig.json",
			"vitest.config.ts",
			"scripts/build-release.mjs",
			"scripts/test-mod.mjs",
			".claude-plugin/marketplace.json",
		]) {
			expect(existsSync(join(out, path)), path).toBe(false);
		}
	});

	it("ships a runtime package.json (version source) without dependency lists", async () => {
		const pkg = JSON.parse(
			await readFile(join(out, "package.json"), "utf8"),
		) as Record<string, unknown>;
		expect(pkg.name).toBe("ds-bridge");
		expect(pkg.type).toBe("module");
		expect(pkg.dependencies).toBeUndefined();
		expect(pkg.devDependencies).toBeUndefined();
		expect(pkg.scripts).toBeUndefined();
	});

	it("runs the bundled CLI from the payload alone, at the manifest's version", async () => {
		const manifest = JSON.parse(
			await readFile(join(out, ".claude-plugin", "plugin.json"), "utf8"),
		) as { version: string };
		const { stdout } = await execFileAsync(
			process.execPath,
			[join(out, "dist", "cli.mjs"), "--version"],
			{ cwd: tmpdir(), encoding: "utf8" },
		);
		expect(stdout.trim()).toBe(manifest.version);
	});

	// The docs tell users to run `ds-bridge config connect --verify`. Inside a
	// Claude Code session the plugin's bin/ is on the Bash PATH; in a plain
	// terminal `npm i -g github:lucksy/ds-bridge#release` installs the same
	// command from this payload's package.json "bin".
	it("ships a bin/ds-bridge launcher that runs the CLI", async () => {
		const launcher = join(out, "bin", "ds-bridge");
		expect(existsSync(launcher)).toBe(true);
		const manifest = JSON.parse(
			await readFile(join(out, ".claude-plugin", "plugin.json"), "utf8"),
		) as { version: string };
		const { stdout } = await execFileAsync(launcher, ["--version"], {
			cwd: tmpdir(),
			encoding: "utf8",
		});
		expect(stdout.trim()).toBe(manifest.version);
		// Linked into a directory on the PATH (e.g. ~/bin), it still finds dist/.
		const linkDir = await mkdtemp(join(tmpdir(), "ds-release-link-"));
		tmpDirs.push(linkDir);
		await symlink(launcher, join(linkDir, "ds-bridge"));
		const linked = await execFileAsync(
			join(linkDir, "ds-bridge"),
			["--version"],
			{
				cwd: tmpdir(),
				encoding: "utf8",
			},
		);
		expect(linked.stdout.trim()).toBe(manifest.version);
	});

	it("installs a global ds-bridge command with npm from the payload", async () => {
		const parent = await mkdtemp(join(tmpdir(), "ds-release-npm-"));
		tmpDirs.push(parent);
		const { stdout: tarball } = await execFileAsync(
			"npm",
			["pack", out, "--pack-destination", parent, "--silent"],
			{ cwd: parent, encoding: "utf8" },
		);
		const prefix = join(parent, "prefix");
		await execFileAsync(
			"npm",
			[
				"install",
				"--global",
				"--prefix",
				prefix,
				"--no-audit",
				"--no-fund",
				join(parent, tarball.trim()),
			],
			{ cwd: parent, encoding: "utf8" },
		);
		const pkg = JSON.parse(
			await readFile(join(out, "package.json"), "utf8"),
		) as { version: string; bin?: Record<string, string> };
		expect(pkg.bin).toEqual({ "ds-bridge": "dist/cli.mjs" });
		const { stdout } = await execFileAsync(
			join(prefix, "bin", "ds-bridge"),
			["--version"],
			{ cwd: tmpdir(), encoding: "utf8" },
		);
		expect(stdout.trim()).toBe(pkg.version);
	}, 120_000);

	it("--from packages another checkout (an older tag) with this script", async () => {
		const parent = await mkdtemp(join(tmpdir(), "ds-release-from-"));
		tmpDirs.push(parent);
		const checkout = join(parent, "checkout");
		await cp(out, checkout, { recursive: true });
		await writeFile(join(checkout, "README.md"), "older tag readme\n");
		const fromOut = join(parent, "plugin");
		await execFileAsync(
			process.execPath,
			[buildScript, fromOut, "--from", checkout],
			{
				cwd: repoRoot,
			},
		);
		expect(await readFile(join(fromOut, "README.md"), "utf8")).toBe(
			"older tag readme\n",
		);
	});

	// v1.17.0–v1.18.1 shipped a cli.mjs whose rebuilt scan-code / usage chunks
	// were never committed: registry build crashed with ERR_MODULE_NOT_FOUND
	// for every marketplace user. The tagged checkout must carry every chunk.
	it("fails when dist/ lacks a chunk the CLI imports", async () => {
		const parent = await mkdtemp(join(tmpdir(), "ds-release-chunk-"));
		tmpDirs.push(parent);
		const checkout = join(parent, "checkout");
		await cp(out, checkout, { recursive: true });
		const cli = await readFile(join(checkout, "dist", "cli.mjs"), "utf8");
		const chunk = /import\("\.\/([^"]+\.mjs)"\)/.exec(cli)?.[1];
		expect(chunk).toBeDefined();
		await rm(join(checkout, "dist", chunk as string));
		await expect(
			execFileAsync(
				process.execPath,
				[buildScript, join(parent, "plugin"), "--from", checkout],
				{ cwd: repoRoot },
			),
		).rejects.toMatchObject({
			code: 1,
			stderr: expect.stringContaining(`dist/cli.mjs → ./${chunk}`),
		});
	});

	it("refuses to clear an existing directory it did not create", async () => {
		const dir = await mkdtemp(join(tmpdir(), "ds-release-foreign-"));
		tmpDirs.push(dir);
		await writeFile(join(dir, "keep.txt"), "mine");
		await expect(
			execFileAsync(process.execPath, [buildScript, dir], { cwd: repoRoot }),
		).rejects.toMatchObject({ code: 2 });
		expect(existsSync(join(dir, "keep.txt"))).toBe(true);
	});
});
