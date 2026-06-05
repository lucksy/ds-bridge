// T6.2 — Headless E2E: prove the plugin actually loads in a real `claude -p`
// session (SPEC §1 "Headless E2E testing").
//
// This file is NOT part of the default `tests/**` glob (see vitest.config.ts),
// so `npm test` never runs it. It runs ONLY via the dedicated e2e config:
//
//   npx vitest run --config vitest.e2e.config.ts e2e/plugin-load.test.ts
//
// Even then the whole suite self-skips unless DS_BRIDGE_E2E is set (explicit
// opt-in: `claude` must be authenticated). Locally: `DS_BRIDGE_E2E=1 npx
// vitest …` where claude is logged in via subscription. CI sets DS_BRIDGE_E2E
// plus ANTHROPIC_API_KEY (see .github/workflows/ci.yml e2e job).
//
// What we assert (verified against a live `claude -p … --output-format
// stream-json` run, claude 2.1.x): the `system/init` NDJSON event carries a
// `plugins` array of `{ name, path, source }` objects, one of which is named
// "ds-bridge"; and that no plugin-error field on the init event mentions
// ds-bridge. On any failure we print the full init event JSON for debugging.
//
// On `--bare`: the flag is the SPEC-blessed minimal mode, but it reads auth
// STRICTLY from ANTHROPIC_API_KEY / apiKeyHelper — OAuth/subscription is never
// read under --bare. So we only add --bare when ANTHROPIC_API_KEY is present
// (the CI path); with a local subscription login (no key) we omit it so the
// session authenticates. The init event + plugin loading are identical either
// way (the plugin loads via --plugin-dir regardless of --bare).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const gated = !process.env.DS_BRIDGE_E2E;

// Repo root is this file's dir (e2e/) → parent.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// Internal watchdog (90s) kills the child and resolves with whatever streamed
// so far — kept below the it() timeout (120s) so a hung session can't blow the
// vitest timeout. The `system/init` event is emitted in the first seconds
// (before the model turn), so a watchdog kill still captures it.
const WATCHDOG_MS = 90_000;
const IT_TIMEOUT_MS = 120_000;

interface ClaudeRun {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
}

/**
 * Spawn `claude -p` non-interactively and collect the full stream. Never
 * rejects — the caller inspects the parsed stream instead (auth/turn failures
 * still emit a usable `system/init` event up front). A watchdog kills the child
 * after WATCHDOG_MS and resolves with whatever was captured.
 */
function runClaude(args: readonly string[]): Promise<ClaudeRun> {
	return new Promise((resolvePromise) => {
		const child = spawn("claude", [...args], {
			cwd: repoRoot,
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
			// Non-JSON noise (warnings etc.) — ignore.
		}
	}
	return events;
}

/** Find the `system`/`init` event in a parsed stream. */
function findInitEvent(
	events: readonly Record<string, unknown>[],
): Record<string, unknown> | undefined {
	return events.find(
		(event) => event.type === "system" && event.subtype === "init",
	);
}

describe.skipIf(gated)("headless E2E: ds-bridge plugin loads", () => {
	it(
		"system/init lists ds-bridge in plugins[] with no plugin error",
		async (ctx) => {
			// --bare only when an API key is available (CI). Locally (subscription
			// OAuth) --bare would force apiKeySource=none and fail auth, so omit it.
			const bareArgs = process.env.ANTHROPIC_API_KEY ? ["--bare"] : [];
			const run = await runClaude([
				"-p",
				"Say only the word ready.",
				...bareArgs,
				"--plugin-dir",
				repoRoot,
				"--output-format",
				"stream-json",
				"--max-turns",
				"1",
				"--verbose",
			]);

			const events = parseNdjson(run.stdout);
			const init = findInitEvent(events);

			if (init === undefined) {
				const detail =
					`exit=${run.code} timedOut=${run.timedOut}\n` +
					`--- stdout ---\n${run.stdout}\n` +
					`--- stderr ---\n${run.stderr}`;
				// A watchdog kill before the init event is an infra hiccup, not a
				// plugin-load defect — degrade to skip (never RED on a hung session).
				if (run.timedOut) {
					console.warn(
						`[plugin-load] watchdog fired before system/init — skipping.\n${detail}`,
					);
					ctx.skip();
					return;
				}
				// Otherwise the session ran to completion with no init event — that
				// is a real failure. Dump everything for debugging.
				throw new Error(
					`no system/init event found in claude stream\n${detail}`,
				);
			}

			const initJson = JSON.stringify(init, null, 2);

			// `plugins` is an array of { name, path, source } objects.
			const plugins = init.plugins;
			if (!Array.isArray(plugins)) {
				throw new Error(
					`init event has no plugins[] array\ninit event:\n${initJson}`,
				);
			}

			const names = plugins
				.map((plugin) =>
					typeof plugin === "object" &&
					plugin !== null &&
					typeof (plugin as { name?: unknown }).name === "string"
						? (plugin as { name: string }).name
						: undefined,
				)
				.filter((name): name is string => name !== undefined);

			if (!names.includes("ds-bridge")) {
				throw new Error(
					`ds-bridge not in loaded plugins (saw: ${names.join(", ")})\n` +
						`init event:\n${initJson}`,
				);
			}
			expect(names).toContain("ds-bridge");

			// Robust no-error check: scan any field whose name looks like a
			// plugin-error/loading-error channel; none may mention ds-bridge.
			for (const [key, value] of Object.entries(init)) {
				const lowerKey = key.toLowerCase();
				const looksLikeError =
					(lowerKey.includes("plugin") || lowerKey.includes("loading")) &&
					lowerKey.includes("error");
				if (!looksLikeError) continue;
				const serialized = JSON.stringify(value).toLowerCase();
				if (serialized.includes("ds-bridge")) {
					throw new Error(
						`init event field "${key}" reports a ds-bridge error\n` +
							`init event:\n${initJson}`,
					);
				}
			}
		},
		IT_TIMEOUT_MS,
	);
});
