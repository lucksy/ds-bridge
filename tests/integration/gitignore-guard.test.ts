// M1.2 — gitignore guard for `.ds-bridge.env` (SPEC-personas §6.1 security). The
// file holds the Figma PAT and MUST never be committed. The existing `.env.*` glob
// does NOT match `.ds-bridge.env` (that glob needs a literal `.env.` prefix), so an
// EXPLICIT `.ds-bridge.env` line is required. This test proves the ignore actually
// matches by asking git itself, via `git check-ignore`.
//
// With no `files` allowlist and no `.npmignore` in package.json, the gitignore line
// is also what keeps the secret out of any published plugin tarball.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");

/**
 * Run `git check-ignore <path>` at the repo root. git exits 0 and prints the path
 * when it is ignored, exits 1 (no output) when it is NOT ignored. We resolve with
 * both so the test can assert the exact contract.
 */
function checkIgnore(
	relPath: string,
): Promise<{ code: number; stdout: string }> {
	return new Promise((resolvePromise, reject) => {
		execFile(
			"git",
			["check-ignore", relPath],
			{ cwd: repoRoot },
			(error, stdout) => {
				// `check-ignore` uses exit 1 (path not ignored) as a normal outcome, which
				// execFile surfaces as an error with a numeric `.code`. Only a real spawn
				// failure (no numeric code) is a genuine rejection.
				if (error && typeof (error as { code?: unknown }).code !== "number") {
					reject(error);
					return;
				}
				const code =
					error && typeof (error as { code?: unknown }).code === "number"
						? (error as { code: number }).code
						: 0;
				resolvePromise({ code, stdout });
			},
		);
	});
}

describe("gitignore guard — .ds-bridge.env (Figma PAT, never committed)", () => {
	it("`.ds-bridge.env` is git-ignored (explicit line — the .env.* glob does NOT match it)", async () => {
		const { code, stdout } = await checkIgnore(".ds-bridge.env");
		expect(code).toBe(0);
		expect(stdout.trim()).toBe(".ds-bridge.env");
	});

	it("the broad `.env.*` glob alone does NOT cover `.ds-bridge.env` (regression guard)", async () => {
		// `.foo.env` shares the `.env` suffix but is NOT matched by `.env.*` either —
		// proves the match above comes from the explicit line, not the glob. If the
		// explicit line were ever removed, this asserts the glob would not save us.
		const { code } = await checkIgnore(".foo.env");
		expect(code).toBe(1);
	});

	it("a real dotenv-glob file like `.env.local` IS ignored (glob intact)", async () => {
		const { code, stdout } = await checkIgnore(".env.local");
		expect(code).toBe(0);
		expect(stdout.trim()).toBe(".env.local");
	});
});
