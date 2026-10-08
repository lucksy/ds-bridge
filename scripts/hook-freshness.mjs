#!/usr/bin/env node
// T3.8 — SessionStart freshness hook. A thin, dependency-free ESM probe that emits
// up to two getting-started nudges and otherwise stays silent. It NEVER blocks the
// user's flow, makes no network calls, and never spawns the CLI.
//
// Nudge 1 — token-source staleness: nudges toward /ds-bridge:token-check when the
// design-token source changed since the last drift check (or was never checked).
//
// Nudge 2 — unbuilt registry: nudges toward `registry build` when Figma is fully
// configured (a PAT AND a library file key are both resolvable) but
// <cwd>/.ds-bridge/registry.json does not exist yet. This is exactly the state
// right after the user saves their plugin config and restarts — the userConfig
// values are now in the env, but no registry has been built, so every
// registry-backed command (docs, parity, impact, figma-impl) would otherwise fail
// with "run registry build first". The nudge turns that lurking dead-end into an
// upfront, actionable next step.
//
// Contract (intentionally fail-quiet AND cheap — a SessionStart hook runs on every
// session and must never break the user's flow or block on it; target <200ms):
//   • Reads the SessionStart payload from stdin: { cwd, ... }
//   • Locates the project token source CHEAPLY (a few statSync probes, NOT a tree
//     walk): .ds-bridge.json token_source if set, else the conventional names
//     tokens.json / design-tokens.json at <cwd> root or under <cwd>/tokens/.
//   • Reads the LAST line of <cwd>/.ds-bridge/history.jsonl and takes its `at`
//     timestamp as the last-check instant (missing/empty/unparseable → never-checked).
//   • Figma config is read with the same precedence as src/config.ts: the token
//     from CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN / FIGMA_TOKEN (env only, never a file),
//     the file key from CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY else .ds-bridge.json.
//   • Emits a single hookSpecificOutput block (hookEventName "SessionStart") whose
//     additionalContext carries whichever nudges apply (newline-joined), or stays
//     silent when none do, and exits 0.
//   • ANY error anywhere → exit 0, silent. NEVER lints, never spawns the CLI.
import { readdirSync, readFileSync, statSync } from "node:fs";
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

/** Token files a set may hold: *.json, and *.json5 (Style Dictionary v4, Primer). */
const TOKEN_FILE = /\.json5?$/;

/**
 * Newest mtime of the token files in `dir` and its sub-folders (Material's
 * flat md.ref / md.sys.color.light files, Primer's nested
 * tokens/base/color/light/*.json5). A bounded walk — at most 200 files, 4
 * levels — keeps the probe cheap. undefined when `dir` is not a directory or
 * holds fewer than two.
 */
function tokenSetMtimeMs(dir) {
	const files = [];
	const walk = (current, depth) => {
		if (depth > 4 || files.length >= 200) return;
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
					walk(join(current, entry.name), depth + 1);
				}
			} else if (TOKEN_FILE.test(entry.name)) {
				files.push(join(current, entry.name));
			}
		}
	};
	walk(dir, 0);
	if (files.length < 2) return undefined;
	let newest;
	for (const file of files) {
		const ms = fileMtimeMs(file);
		if (ms !== undefined && (newest === undefined || ms > newest)) newest = ms;
	}
	return newest;
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
 *   4. <cwd>/tokens/ itself when it holds a multi-file token set
 * Returns { path, mtimeMs } or undefined when nothing matches.
 */
function findTokenSource(cwd) {
	const configured = configuredTokenSource(cwd);
	if (configured !== undefined) {
		const mtimeMs = fileMtimeMs(configured) ?? tokenSetMtimeMs(configured);
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
		// 4. A folder of token files read as one set.
		const setMtimeMs = tokenSetMtimeMs(join(cwd, subdir));
		if (setMtimeMs !== undefined) {
			return { path: join(cwd, subdir), mtimeMs: setMtimeMs };
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

/** A trimmed-to-presence string, or undefined for empty/non-string. */
function nonEmpty(value) {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** True when <cwd>/.ds-bridge/registry.json exists as a regular file. */
function registryExists(cwd) {
	return fileMtimeMs(join(cwd, ".ds-bridge", "registry.json")) !== undefined;
}

/**
 * Read `figma_file_key` from <cwd>/.ds-bridge.json (a non-empty string), or
 * undefined when the config is absent, unreadable, not JSON, or lacks the key.
 * Mirrors `configuredTokenSource`: cheap, single small read, never throws. The
 * Figma TOKEN is deliberately NOT read from any file (secret) — env only.
 */
function configuredFigmaFileKey(cwd) {
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
	return nonEmpty(parsed.figma_file_key);
}

/**
 * Token-source staleness nudge (Nudge 1), or undefined when there is no token
 * source or the last drift check is already current. Same precedence/logic as
 * before — just hoisted out of main() so both nudges compose cleanly.
 */
function tokenCheckNudge(cwd) {
	const source = findTokenSource(cwd);
	if (source === undefined) return undefined;

	const checkedAt = lastCheckMs(cwd);
	const neverChecked = checkedAt === undefined;
	const changedSince = !neverChecked && source.mtimeMs > checkedAt;
	if (!neverChecked && !changedSince) return undefined;

	const name = baseName(source.path);
	return `ds-bridge: token source ${name} changed since the last drift check (or was never checked) - consider running /ds-bridge:token-check`;
}

/**
 * Unbuilt-registry nudge (Nudge 2), or undefined. Fires only when BOTH a Figma
 * PAT and a library file key are resolvable (so `registry build` could actually
 * succeed) AND the registry has not been built yet. Env precedence matches
 * src/config.ts; the file key may also come from .ds-bridge.json.
 */
function registryBuildNudge(cwd, env) {
	const token =
		nonEmpty(env.CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN) ?? nonEmpty(env.FIGMA_TOKEN);
	const fileKey =
		nonEmpty(env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY) ??
		configuredFigmaFileKey(cwd);
	if (token === undefined || fileKey === undefined) return undefined;
	if (registryExists(cwd)) return undefined;

	return (
		"ds-bridge: Figma is configured but the component registry has not been built yet, " +
		"so registry-backed commands (/ds-bridge:ds-docs, /ds-bridge:parity-audit, " +
		'/ds-bridge:impact, /ds-bridge:figma-impl) will report "run registry build first". ' +
		"Build it once with `ds-bridge registry build` — it scans this project's components and " +
		"fetches the Figma library into .ds-bridge/registry.json. Offer to run it for the user " +
		"(it needs network access to Figma); after it succeeds, those commands work."
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

	// The registry nudge leads: it is the just-configured getting-started step.
	// The token-staleness nudge follows. Either, both, or neither may apply.
	const nudges = [
		registryBuildNudge(cwd, process.env),
		tokenCheckNudge(cwd),
	].filter((nudge) => nudge !== undefined);

	if (nudges.length === 0) {
		exitSilent();
		return;
	}

	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext: nudges.join("\n"),
			},
		}),
	);
	process.exit(0);
}

main().catch(() => exitSilent());
