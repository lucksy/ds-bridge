// T6.2 — Headless E2E: prove the PostToolUse lint hook actually fires in a real
// `claude -p` session (SPEC §1 "Headless E2E testing": `--include-hook-events`
// to assert hooks fired; slash commands are NOT invocable in -p, so the test
// describes a task that exercises the hook instead).
//
// NOT part of the default `tests/**` glob — runs ONLY via the e2e config:
//
//   npx vitest run --config vitest.e2e.config.ts e2e/lint-hook.test.ts
//
// Self-skips unless DS_BRIDGE_E2E is set (same opt-in gate as plugin-load).
//
// Scenario (verified against a live claude 2.1.x run): a tmp project containing
// a tokens.json (copy of the w3c fixture) and a clean styles.css. We ask the
// model to append a line with hardcoded values (`#3b82f6`, an exact match for
// token `color.brand.primary`) using Edit/Write. With --include-hook-events the
// stream then carries a `system`/`hook_response` event for `PostToolUse` whose
// `output` is the hook's JSON, containing `hookSpecificOutput.additionalContext`
// = "ds-bridge: … #3b82f6 -> color.brand.primary".
//
// NO --bare here: --bare explicitly skips hooks ("Minimal mode: skip hooks…"),
// which would defeat the entire point of this test. The hook ships inside the
// plugin and runs because the plugin is loaded via --plugin-dir.
//
// Live-model tolerance: this is a real-model test, so flakiness must degrade to
// SKIP, never RED. If the model refuses / never writes the file, we skip at
// runtime. Only a run where the file actually changed asserts the hook fired
// with a token suggestion.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const gated = !process.env.DS_BRIDGE_E2E;

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const w3cTokensFixture = fileURLToPath(
	new URL("../tests/fixtures/tokens/w3c/tokens.json", import.meta.url),
);

// Internal watchdog (90s) kills the child and resolves with whatever streamed
// so far. It MUST be comfortably below the it() timeout (120s) so a slow/hung
// live session degrades to a graceful skip rather than a hard vitest timeout
// (RED). The it() timeout below is the outer backstop.
const WATCHDOG_MS = 90_000;
const IT_TIMEOUT_MS = 120_000;
const CLEAN_CSS = ".btn {\n\tpadding: 8px;\n}\n";

interface ClaudeRun {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
}

/**
 * Spawn `claude -p` in `cwd`; never rejects on non-zero exit. A watchdog kills
 * the child after WATCHDOG_MS and resolves with `timedOut: true` plus whatever
 * was captured — so a hung live session can degrade to skip, never RED.
 */
function runClaude(args: readonly string[], cwd: string): Promise<ClaudeRun> {
	return new Promise((resolvePromise) => {
		const child = spawn("claude", [...args], {
			cwd,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;

		const settle = (code: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(watchdog);
			resolvePromise({ code, stdout, stderr, timedOut });
		};

		const watchdog = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
			settle(null);
		}, WATCHDOG_MS);

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		// A spawn error (e.g. claude not on PATH) is a tolerated outcome here:
		// resolve with empty output → the test degrades to skip.
		child.on("error", () => settle(null));
		child.on("close", (code) => settle(code));
	});
}

/** Parse an NDJSON stream into events, skipping unparsable lines. */
function parseNdjson(stream: string): Record<string, unknown>[] {
	const events: Record<string, unknown>[] = [];
	for (const line of stream.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed === "object" && parsed !== null) {
				events.push(parsed as Record<string, unknown>);
			}
		} catch {
			// Non-JSON noise — ignore.
		}
	}
	return events;
}

/**
 * Collect every PostToolUse hook event's raw text. Hook events come from
 * `--include-hook-events` as `system`/`hook_response` (and `hook_started`)
 * objects with `hook_event: "PostToolUse"` and a JSON-string `output`. We fold
 * the whole event into one string so the caller can match on hook-lint markers
 * regardless of the exact field nesting.
 */
function postToolUseHookTexts(
	events: readonly Record<string, unknown>[],
): string[] {
	const texts: string[] = [];
	for (const event of events) {
		if (event.type !== "system") continue;
		const subtype = event.subtype;
		if (subtype !== "hook_response" && subtype !== "hook_started") continue;
		const hookEvent = event.hook_event ?? event.hook_event_name;
		const hookName = event.hook_name;
		const mentionsPostToolUse =
			(typeof hookEvent === "string" && hookEvent.includes("PostToolUse")) ||
			(typeof hookName === "string" && hookName.includes("PostToolUse"));
		if (!mentionsPostToolUse) continue;
		texts.push(JSON.stringify(event));
	}
	return texts;
}

let tmpProject = "";
let stylesPath = "";

beforeAll(() => {
	if (gated) return;
	tmpProject = mkdtempSync(join(tmpdir(), "ds-bridge-e2e-hook-"));
	writeFileSync(
		join(tmpProject, "tokens.json"),
		readFileSync(w3cTokensFixture, "utf8"),
		"utf8",
	);
	stylesPath = join(tmpProject, "styles.css");
	writeFileSync(stylesPath, CLEAN_CSS, "utf8");
});

afterAll(() => {
	// Leave the tmp dir for post-mortem; the OS reclaims tmpdir. (Removing it
	// here would erase evidence if a run needs debugging.)
});

describe.skipIf(gated)(
	"headless E2E: ds-bridge PostToolUse lint hook fires",
	() => {
		it(
			"appending a hardcoded token triggers the lint hook with a suggestion",
			async (ctx) => {
				const run = await runClaude(
					[
						"-p",
						"Append the line .x { color: #3b82f6; } to the end of styles.css " +
							"using the Edit or Write tool, then stop.",
						"--plugin-dir",
						repoRoot,
						"--include-hook-events",
						"--output-format",
						"stream-json",
						"--max-turns",
						"4",
						"--permission-mode",
						"acceptEdits",
						"--verbose",
					],
					tmpProject,
				);

				const events = parseNdjson(run.stdout);

				// Live-model tolerance: a watchdog kill (hung/slow session) or a model
				// that never wrote the marker line leaves nothing for the hook to lint
				// — skip, never fail.
				const fileContent = readFileSync(stylesPath, "utf8");
				if (run.timedOut || !fileContent.includes("#3b82f6")) {
					ctx.skip();
					return;
				}

				const hookTexts = postToolUseHookTexts(events);

				if (hookTexts.length === 0) {
					// The file was edited but no PostToolUse hook surfaced — that is a
					// genuine failure (the hook should have fired). Dump for debugging.
					throw new Error(
						"file was edited but no PostToolUse hook event appeared\n" +
							`exit=${run.code}\n` +
							`--- file ---\n${fileContent}\n` +
							`--- stdout ---\n${run.stdout}\n` +
							`--- stderr ---\n${run.stderr}`,
					);
				}

				// The hook FIRED. It must reference our adapter — either the script name
				// (hook-lint) or our additionalContext marker ("ds-bridge:").
				const joined = hookTexts.join("\n");
				expect(
					joined.includes("ds-bridge:") || joined.includes("hook-lint"),
				).toBe(true);

				// A fired-hook-with-findings run also names a token suggestion: the
				// hardcoded #3b82f6 resolves to color.brand.primary (verified live).
				const fired = hookTexts.find((text) => text.includes("ds-bridge:"));
				if (fired !== undefined) {
					if (!fired.includes("color.brand.primary")) {
						throw new Error(
							"hook fired but additionalContext lacked the expected token " +
								"suggestion (color.brand.primary)\n" +
								`--- hook events ---\n${joined}`,
						);
					}
					expect(fired).toContain("color.brand.primary");
				}
			},
			IT_TIMEOUT_MS,
		);
	},
);
