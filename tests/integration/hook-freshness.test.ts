// T3.8 — integration: the SessionStart freshness hook (scripts/hook-freshness.mjs).
// The hook is a thin, dependency-free stdin/stdout adapter that performs a CHEAP
// staleness check (a few statSync probes, no linting, no tree walk): it reads a
// SessionStart payload ({ cwd, ... }), finds the project token source, compares
// its mtime against the last <cwd>/.ds-bridge/history.jsonl `at` timestamp, and
// — when the source changed since (or was never checked) — emits a
// hookSpecificOutput block nudging the user toward /ds-bridge:token-check. It
// ALWAYS exits 0 and stays silent on anything it cannot handle (no token source,
// up-to-date check, non-JSON stdin, errors).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const hookScript = join(repoRoot, "scripts", "hook-freshness.mjs");

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

/** Run the hook with the given stdin payload; resolve with code + stdout. */
function runHook(
	stdin: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolvePromise, reject) => {
		const child = execFile(
			process.execPath,
			[hookScript],
			(error, stdout, stderr) => {
				// execFile reports a non-zero exit via `error`; the hook should always
				// exit 0, but resolve with whatever code surfaced so we can assert it.
				if (error && typeof error.code !== "number") {
					reject(error);
					return;
				}
				const code = error && typeof error.code === "number" ? error.code : 0;
				resolvePromise({ code, stdout, stderr });
			},
		);
		child.stdin?.end(stdin);
	});
}

/** Set a file's mtime (and atime) to a fixed epoch-millis instant. */
async function setMtime(path: string, epochMs: number): Promise<void> {
	const when = new Date(epochMs);
	await utimes(path, when, when);
}

/** Write a single tokens-check history line whose `at` is the given instant. */
async function writeHistory(stateDir: string, atMs: number): Promise<void> {
	await mkdir(stateDir, { recursive: true });
	const record = {
		at: new Date(atMs).toISOString(),
		kind: "tokens-check",
		stale: 0,
		missing: 0,
		orphan: 0,
		inSync: true,
	};
	await writeFile(
		join(stateDir, "history.jsonl"),
		`${JSON.stringify(record)}\n`,
		"utf8",
	);
}

describe("ds-bridge SessionStart freshness hook (scripts/hook-freshness.mjs)", () => {
	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("(a) tokens.json newer than the last history line → SessionStart JSON nudging token-check", async () => {
		const dir = await freshTmp("ds-fresh-stale-");
		const tokensPath = join(dir, "tokens.json");
		await writeFile(
			tokensPath,
			JSON.stringify({
				color: { primary: { $type: "color", $value: "#3b82f6" } },
			}),
			"utf8",
		);
		// History checked an hour ago; the token source was just touched (now).
		const hourAgo = Date.now() - 60 * 60 * 1000;
		await writeHistory(join(dir, ".ds-bridge"), hourAgo);
		await setMtime(tokensPath, Date.now());

		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(payload);
		expect(code).toBe(0);

		const parsed = JSON.parse(stdout) as {
			hookSpecificOutput: {
				hookEventName: string;
				additionalContext: string;
			};
		};
		expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
		expect(parsed.hookSpecificOutput.additionalContext).toContain(
			"token-check",
		);
		expect(parsed.hookSpecificOutput.additionalContext).toContain(
			"tokens.json",
		);
	});

	it("(b) last history line newer than the token mtime → exit 0, empty stdout", async () => {
		const dir = await freshTmp("ds-fresh-fresh-");
		const tokensPath = join(dir, "tokens.json");
		await writeFile(
			tokensPath,
			JSON.stringify({
				color: { primary: { $type: "color", $value: "#3b82f6" } },
			}),
			"utf8",
		);
		// Token source was touched an hour ago; the check ran just now (newer).
		const hourAgo = Date.now() - 60 * 60 * 1000;
		await setMtime(tokensPath, hourAgo);
		await writeHistory(join(dir, ".ds-bridge"), Date.now());

		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(payload);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("");
	});

	it("(c) no token source in cwd → exit 0, empty stdout", async () => {
		const dir = await freshTmp("ds-fresh-notoken-");
		// A history line exists, but there is no token source to compare against.
		await writeHistory(join(dir, ".ds-bridge"), Date.now());

		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(payload);
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("");
	});

	it("(d) malformed stdin → exit 0, empty stdout", async () => {
		const { code, stdout } = await runHook("not json");
		expect(code).toBe(0);
		expect(stdout.trim()).toBe("");
	});

	it("(e) token source exists but was never checked (no history) → SessionStart nudge", async () => {
		const dir = await freshTmp("ds-fresh-never-");
		await writeFile(
			join(dir, "design-tokens.json"),
			JSON.stringify({
				color: { primary: { $type: "color", $value: "#3b82f6" } },
			}),
			"utf8",
		);
		// No .ds-bridge/history.jsonl at all → treated as never-checked.
		const payload = JSON.stringify({ cwd: dir });
		const { code, stdout } = await runHook(payload);
		expect(code).toBe(0);

		const parsed = JSON.parse(stdout) as {
			hookSpecificOutput: {
				hookEventName: string;
				additionalContext: string;
			};
		};
		expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
		expect(parsed.hookSpecificOutput.additionalContext).toContain(
			"token-check",
		);
		expect(parsed.hookSpecificOutput.additionalContext).toContain(
			"design-tokens.json",
		);
	});
});
