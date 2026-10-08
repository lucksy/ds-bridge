// `ds-bridge config connect` — the interactive, terminal-only secret writer (the
// secure path users are pointed to when the plugin dialog can't reach the CLI,
// #62442). The readline prompting needs a real TTY, so the prompts themselves are
// not unit-tested here; instead we test:
//   • applyConnect — the I/O seam the prompts feed: writes .ds-bridge.env (0600,
//     merging), gitignores the file, returns a masked summary. This is where all
//     the durable behavior lives.
//   • the built CLI's non-TTY guard: run without a TTY (execFile gives no TTY) it
//     must REFUSE with actionable guidance and write nothing — never block on stdin.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyConnect } from "../../src/cli-commands/config.js";
import { parseDotenv } from "../../src/io/dotenv.js";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ds-config-connect-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const envPath = (): string => join(dir, ".ds-bridge.env");
const gitignorePath = (): string => join(dir, ".gitignore");

describe("applyConnect (the config-connect I/O seam)", () => {
	it("writes FIGMA_TOKEN at 0600, masks the token, and gitignores the file", async () => {
		const token = "figd_secret_abcd1234";
		const summary = applyConnect(dir, token, "");

		// Full secret is never returned; only the masked form.
		expect(summary.masked).not.toContain(token);
		expect(summary.masked).toContain("1234");
		expect(summary.fileKey).toBeUndefined();
		expect(summary.gitignoreUpdated).toBe(true);

		const parsed = parseDotenv(await readFile(envPath(), "utf8"));
		expect(parsed.FIGMA_TOKEN).toBe(token);
		expect(parsed.FIGMA_DESIGN_SYSTEM_FILE).toBeUndefined();

		const mode = (await stat(envPath())).mode & 0o777;
		expect(mode).toBe(0o600);

		// The secret file is now gitignored via an explicit line.
		const ignore = await readFile(gitignorePath(), "utf8");
		expect(ignore.split(/\r?\n/)).toContain(".ds-bridge.env");
	});

	it("writes the file key when provided and trims it", async () => {
		const summary = applyConnect(dir, "figd_xyz", "  filekey123  ");
		expect(summary.fileKey).toBe("filekey123");
		const parsed = parseDotenv(await readFile(envPath(), "utf8"));
		expect(parsed.FIGMA_DESIGN_SYSTEM_FILE).toBe("filekey123");
	});

	it("normalizes a pasted Figma URL file key to the bare key", async () => {
		const summary = applyConnect(
			dir,
			"figd_url",
			"https://www.figma.com/design/xfXJSaAWt65rlq486RKvJB/Sahasra?m=auto&t=abc",
		);
		expect(summary.fileKey).toBe("xfXJSaAWt65rlq486RKvJB");
		const parsed = parseDotenv(await readFile(envPath(), "utf8"));
		expect(parsed.FIGMA_DESIGN_SYSTEM_FILE).toBe("xfXJSaAWt65rlq486RKvJB");
	});

	it("MERGE preserves a pre-existing unrelated key (no clobber)", async () => {
		applyConnect(dir, "figd_first", "");
		// A second connect overlays only FIGMA_TOKEN.
		const summary = applyConnect(dir, "figd_second", "");
		// .gitignore already had the line, so the second run does not re-append.
		expect(summary.gitignoreUpdated).toBe(false);
		const parsed = parseDotenv(await readFile(envPath(), "utf8"));
		expect(parsed.FIGMA_TOKEN).toBe("figd_second");
		// And the gitignore line is not duplicated.
		const ignore = await readFile(gitignorePath(), "utf8");
		const hits = ignore
			.split(/\r?\n/)
			.filter((l) => l.trim() === ".ds-bridge.env");
		expect(hits).toHaveLength(1);
	});
});

describe("ds-bridge config connect — non-TTY guard (built dist/cli.mjs)", () => {
	it("refuses without a TTY, explains how to run it, and writes nothing", async () => {
		// execFile provides no controlling TTY → process.stdin.isTTY is falsy.
		let code = 0;
		let stderr = "";
		try {
			await execFileAsync(process.execPath, [
				cliPath,
				"config",
				"connect",
				dir,
			]);
		} catch (error) {
			const e = error as { code?: number; stderr?: string };
			code = e.code ?? 0;
			stderr = e.stderr ?? "";
		}
		expect(code).toBe(2);
		expect(stderr).toContain("config connect");
		expect(stderr.toLowerCase()).toContain("terminal");
		// The documented command first, then how to get it onto the PATH.
		expect(stderr).toContain("ds-bridge config connect --verify");
		expect(stderr).toContain("npm i -g github:lucksy/ds-bridge#release");
		// It must not have blocked on stdin or written the secret file.
		await expect(stat(envPath())).rejects.toThrow();
	});
});
