#!/usr/bin/env node
// M1.4 — SessionStart token-persistence NUDGE hook (#62442, Design Decision
// §11.8). A thin, dependency-free ESM probe that NUDGES the user — ONCE, opt-in —
// toward `ds-bridge config persist-token`, and otherwise stays silent.
//
// Why this exists: Claude Code does NOT persist a plugin's `sensitive` userConfig
// (the Figma PAT) across restarts (#62442) — it lives only in the session's
// process.env as CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN. The opt-in, default-OFF fix is:
// this hook only NUDGES; the actual secret write happens ONLY when the user
// explicitly runs `ds-bridge config persist-token`. This hook therefore NEVER
// writes, creates, or modifies ANY file — it only reads and emits a nudge.
//
// Nudge condition (self-resolving): a Figma token IS present in process.env
// (CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN or FIGMA_TOKEN, non-empty) AND
// <cwd>/.ds-bridge.env either does not exist OR (parsed) has no non-empty
// FIGMA_TOKEN. Once the user persists, the file carries the token → the gate
// closes → no more nudge.
//
// Contract (fail-quiet AND cheap — a SessionStart hook runs on every session and
// must never break the user's flow or block on it):
//   • Reads the SessionStart payload from stdin: { cwd, ... }.
//   • Reads ONLY process.env and (read-only) <cwd>/.ds-bridge.env.
//   • Emits a single hookSpecificOutput block (hookEventName "SessionStart") when
//     the condition holds, else stays silent. Always exits 0.
//   • ANY error anywhere → exit 0, silent. NEVER writes a file. NEVER spawns the
//     CLI. NEVER prints the token.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Exit 0 emitting nothing. The default fail-quiet outcome. */
function exitSilent() {
	process.exit(0);
}

/** Read the entirety of stdin as a UTF-8 string. */
function readStdin() {
	return new Promise((resolvePromise) => {
		const chunks = [];
		process.stdin.on("data", (chunk) => chunks.push(chunk));
		process.stdin.on("end", () =>
			resolvePromise(Buffer.concat(chunks).toString("utf8")),
		);
		process.stdin.on("error", () => resolvePromise(""));
	});
}

/** A trimmed-to-presence string, or undefined for empty/non-string. */
function nonEmpty(value) {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * True when <cwd>/.ds-bridge.env already carries a non-empty FIGMA_TOKEN. Parses
 * the file with the SAME minimal KEY=VALUE rules as src/io/dotenv.ts's
 * parseDotenv (first `=`, one quote layer, skip blanks/comments) — kept inline so
 * this hook stays dependency-free. A missing/unreadable file → false. Never throws.
 */
function envFileHasToken(cwd) {
	let text;
	try {
		text = readFileSync(join(cwd, ".ds-bridge.env"), "utf8");
	} catch {
		return false;
	}
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		if (key !== "FIGMA_TOKEN") continue;
		let value = line.slice(eq + 1).trim();
		if (
			value.length >= 2 &&
			(value[0] === '"' || value[0] === "'") &&
			value[value.length - 1] === value[0]
		) {
			value = value.slice(1, -1);
		}
		return value.length > 0;
	}
	return false;
}

/**
 * The persist-token nudge, or undefined when it should stay silent. Fires only
 * when a Figma token is in the env (CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN or
 * FIGMA_TOKEN, matching src/config.ts precedence) AND the project's
 * `.ds-bridge.env` does not already carry a non-empty FIGMA_TOKEN. The nudge text
 * NEVER includes the token value.
 */
function persistTokenNudge(cwd, env) {
	const token =
		nonEmpty(env.CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN) ?? nonEmpty(env.FIGMA_TOKEN);
	if (token === undefined) return undefined;
	if (envFileHasToken(cwd)) return undefined;

	return (
		"ds-bridge: a Figma token is configured in the plugin dialog, but Claude Code does " +
		"not persist a plugin's sensitive config across restarts (Claude Code #62442) — it " +
		"only lives in this session's environment. To make it survive a restart, run " +
		"`ds-bridge config persist-token`: it saves the token (and file key, if set) to " +
		".ds-bridge.env, which is gitignored and written 0600. This is opt-in — nothing is " +
		"written until you run that command. Offer to run it for the user in THIS session " +
		"(the token must still be in the environment). After it succeeds, this nudge stops."
	);
}

async function main() {
	const raw = await readStdin();

	let payload;
	try {
		payload = JSON.parse(raw);
	} catch {
		exitSilent();
		return;
	}
	if (typeof payload !== "object" || payload === null) {
		exitSilent();
		return;
	}

	const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();

	const nudge = persistTokenNudge(cwd, process.env);
	if (nudge === undefined) {
		exitSilent();
		return;
	}

	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext: nudge,
			},
		}),
	);
	process.exit(0);
}

main().catch(() => exitSilent());
