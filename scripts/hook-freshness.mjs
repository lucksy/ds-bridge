#!/usr/bin/env node
// T3.8 — SessionStart freshness hook. A thin, dependency-free ESM staleness probe
// that nudges the user toward /ds-bridge:token-check when the design-token source
// changed since the last drift check (or was never checked).
//
// Contract (intentionally fail-quiet AND cheap — a SessionStart hook runs on every
// session and must never break the user's flow or block on it; target <200ms):
//   • Reads the SessionStart payload from stdin: { cwd, ... }
//   • Locates the project token source CHEAPLY (a few statSync probes, NOT a tree
//     walk): .ds-bridge.json token_source if set, else the conventional names
//     tokens.json / design-tokens.json at <cwd> root or under <cwd>/tokens/.
//   • No token source found → exit 0, silent.
//   • Reads the LAST line of <cwd>/.ds-bridge/history.jsonl and takes its `at`
//     timestamp as the last-check instant (missing/empty/unparseable → never-checked).
//   • token-source mtime > last-check  OR  never-checked → stdout a
//     hookSpecificOutput block (hookEventName "SessionStart", additionalContext
//     pointing at /ds-bridge:token-check) and exit 0.
//   • Otherwise → exit 0, silent.
//   • ANY error anywhere → exit 0, silent. NEVER lints, never spawns the CLI.
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** Conventional token-source basenames, in probe order. */
const CONVENTIONAL_NAMES = ["tokens.json", "design-tokens.json"];
/** Subdirectories probed for the conventional names (besides the cwd root). */
const TOKEN_SUBDIRS = ["tokens"];

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

/** mtime (epoch ms) of `path`, or undefined when it is not an existing file. */
function fileMtimeMs(path) {
	try {
		const stat = statSync(path);
		return stat.isFile() ? stat.mtimeMs : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Read `token_source` from <cwd>/.ds-bridge.json, resolved against cwd. Returns
 * undefined when the config is absent, unreadable, not JSON, or has no string
 * token_source. Stays cheap (one read of a small file) and never throws.
 */
function configuredTokenSource(cwd) {
	let text;
	try {
		text = readFileSync(join(cwd, ".ds-bridge.json"), "utf8");
	} catch {
		return undefined;
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const src = parsed.token_source;
	if (typeof src !== "string" || src.length === 0) return undefined;
	return isAbsolute(src) ? src : resolve(cwd, src);
}

/**
 * Find the token source with a few statSync probes (no directory walk):
 *   1. .ds-bridge.json token_source (if it points at an existing file)
 *   2. <cwd>/<name> for each conventional name
 *   3. <cwd>/tokens/<name> for each conventional name
 * Returns { path, mtimeMs } or undefined when nothing matches.
 */
function findTokenSource(cwd) {
	const configured = configuredTokenSource(cwd);
	if (configured !== undefined) {
		const mtimeMs = fileMtimeMs(configured);
		if (mtimeMs !== undefined) return { path: configured, mtimeMs };
	}

	for (const name of CONVENTIONAL_NAMES) {
		const candidate = join(cwd, name);
		const mtimeMs = fileMtimeMs(candidate);
		if (mtimeMs !== undefined) return { path: candidate, mtimeMs };
	}

	for (const subdir of TOKEN_SUBDIRS) {
		for (const name of CONVENTIONAL_NAMES) {
			const candidate = join(cwd, subdir, name);
			const mtimeMs = fileMtimeMs(candidate);
			if (mtimeMs !== undefined) return { path: candidate, mtimeMs };
		}
	}

	return undefined;
}

/**
 * Last-check instant (epoch ms) from <cwd>/.ds-bridge/history.jsonl: the `at`
 * timestamp of the last non-empty, JSON-parseable line. undefined ⇒ never checked
 * (missing/empty/unparseable file, no usable `at`).
 */
function lastCheckMs(cwd) {
	let text;
	try {
		text = readFileSync(join(cwd, ".ds-bridge", "history.jsonl"), "utf8");
	} catch {
		return undefined;
	}
	const lines = text.split("\n");
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const trimmed = lines[i].trim();
		if (trimmed === "") continue;
		let record;
		try {
			record = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (
			record !== null &&
			typeof record === "object" &&
			typeof record.at === "string"
		) {
			const ms = Date.parse(record.at);
			if (Number.isFinite(ms)) return ms;
		}
		// A line existed but had no usable `at` — treat as never-checked.
		return undefined;
	}
	return undefined;
}

/** Plain basename of a path without importing node:path's basename (cheap). */
function baseName(path) {
	const parts = path.split(/[\\/]/);
	return parts[parts.length - 1] || path;
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

	const source = findTokenSource(cwd);
	if (source === undefined) {
		exitSilent();
		return;
	}

	const checkedAt = lastCheckMs(cwd);
	const neverChecked = checkedAt === undefined;
	const changedSince = !neverChecked && source.mtimeMs > checkedAt;

	if (!neverChecked && !changedSince) {
		exitSilent();
		return;
	}

	const name = baseName(source.path);
	const additionalContext = `ds-bridge: token source ${name} changed since the last drift check (or was never checked) - consider running /ds-bridge:token-check`;
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext,
			},
		}),
	);
	process.exit(0);
}

main().catch(() => exitSilent());
