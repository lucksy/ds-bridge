// M1.4 — `ds-bridge config` command group. The opt-in, default-OFF fix for
// #62442 (Design Decision §11.8): Claude Code does NOT persist a plugin's
// `sensitive` userConfig (the Figma PAT) across restarts — it lives only in the
// session's process.env. `config persist-token` is the ONLY place the secret is
// written to disk, and ONLY when the user explicitly runs it. A SessionStart hook
// (scripts/hook-save-config.mjs) merely NUDGES toward this command; it never writes.
//
// Security posture (conservative):
//   • The token is read from the env ONLY (CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN ??
//     FIGMA_TOKEN), never from a committed file.
//   • The write MERGES into `.ds-bridge.env` via parseDotenv — overlay ONLY the
//     keys being set, preserve every other existing key.
//   • The write is atomic (same-dir temp + rename) and the result is chmod 0600
//     so the secret is owner-read/write only. The temp file is created 0600 too,
//     so the secret never momentarily exists with looser permissions.
//   • stdout MASKS the token (figd_…last4) — the full value is never printed.
//   • Never throws: a missing token → exit 2; an fs error → exit 2 with a message.
import {
	chmodSync,
	existsSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import type { Command } from "commander";
import { parseDotenv } from "../io/dotenv.js";

/** The project secret file name (gitignored, 0600). */
const ENV_FILE_NAME = ".ds-bridge.env";

/** Print a fatal usage/config error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/**
 * Mask a secret for display: keep a short recognizable prefix + the last 4 chars,
 * eliding the middle. Short secrets collapse to all-asterisks so nothing leaks.
 * The full value is NEVER returned.
 */
function maskToken(token: string): string {
	if (token.length <= 8) return "*".repeat(token.length);
	const head = token.slice(0, 5);
	const tail = token.slice(-4);
	return `${head}…${tail}`;
}

/**
 * Serialize a dotenv map back to `KEY=VALUE` lines. Values are written verbatim
 * (Figma tokens and file keys are simple ASCII with no whitespace/quotes), one
 * per line, trailing newline — the repo's file convention. Insertion order of the
 * map is preserved (existing keys first, then any newly added ones).
 */
function serializeDotenv(map: Record<string, string>): string {
	return `${Object.entries(map)
		.map(([key, value]) => `${key}=${value}`)
		.join("\n")}\n`;
}

/**
 * Atomic, 0600, merging secret writer for `.ds-bridge.env`. Reads any existing
 * file via parseDotenv, overlays ONLY `updates` (preserving all other keys),
 * re-serializes, writes to a same-dir temp file created 0600, then renames over
 * the target (and re-chmods 0600 to defend against a pre-existing looser file).
 * Throws on fs failure — the caller converts that into exit 2.
 */
function writeEnvFileMerged(
	dir: string,
	updates: Record<string, string>,
): void {
	const filePath = join(dir, ENV_FILE_NAME);

	const existing: Record<string, string> = existsSync(filePath)
		? parseDotenv(readFileSync(filePath, "utf8"))
		: {};

	// Overlay only the keys being set; every other existing key is preserved.
	const merged: Record<string, string> = { ...existing, ...updates };
	const text = serializeDotenv(merged);

	// Atomic: write a same-dir temp file (created 0600 so the secret is never
	// world/group-readable even momentarily), then rename over the target.
	const tempPath = join(dir, `${ENV_FILE_NAME}.${process.pid}.tmp`);
	try {
		writeFileSync(tempPath, text, { encoding: "utf8", mode: 0o600 });
		renameSync(tempPath, filePath);
	} catch (error) {
		// Best-effort cleanup of the temp file so a partial write leaves no residue.
		try {
			if (existsSync(tempPath)) unlinkSync(tempPath);
		} catch {
			/* ignore cleanup failure */
		}
		throw error;
	}
	// rename preserves the temp file's 0600, but if the target pre-existed with a
	// looser mode the rename replaced it entirely (still 0600). Re-assert anyway.
	chmodSync(filePath, 0o600);
}

/**
 * Execute `config persist-token [path]`. Reads the Figma token (env only) and the
 * optional file key, then merges them into `<path|cwd>/.ds-bridge.env`. No token
 * in env → exit 2 with an actionable message. fs error → exit 2.
 */
function runPersistToken(path: string): void {
	const env = process.env;
	const token =
		env.CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN ?? env.FIGMA_TOKEN ?? undefined;
	if (token === undefined || token === "") {
		fail(
			"No Figma token in this session's environment. Configure it in the plugin " +
				"dialog (`/plugin configure`) first, then run this in the SAME session.",
		);
		return;
	}

	const fileKey =
		env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY ??
		env.FIGMA_DESIGN_SYSTEM_FILE ??
		undefined;

	const targetDir = resolvePath(path);
	const updates: Record<string, string> = { FIGMA_TOKEN: token };
	if (fileKey !== undefined && fileKey !== "") {
		updates.FIGMA_DESIGN_SYSTEM_FILE = fileKey;
	}

	try {
		writeEnvFileMerged(targetDir, updates);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not write ${join(targetDir, ENV_FILE_NAME)}: ${detail}`);
		return;
	}

	const savedKey =
		updates.FIGMA_DESIGN_SYSTEM_FILE !== undefined
			? " and the design-system file key"
			: "";
	process.stdout.write(
		`Saved Figma token (${maskToken(token)})${savedKey} to ` +
			`${join(targetDir, ENV_FILE_NAME)} (gitignored, mode 0600). ` +
			"It now survives a restart; the live plugin-dialog value still wins when present.\n",
	);
	process.exitCode = 0;
}

/** Register the `config` command group on the program. Wiring for cli.ts. */
export function registerConfigCommand(program: Command): void {
	const config = program
		.command("config")
		.description("Manage ds-bridge project configuration");

	config
		.command("persist-token")
		.description(
			"Save this session's Figma token to .ds-bridge.env (gitignored, 0600) so " +
				"it survives a restart (opt-in fix for Claude Code #62442)",
		)
		.argument("[path]", "project directory to write .ds-bridge.env into", ".")
		.action((path: string) => {
			runPersistToken(path);
		});
}
