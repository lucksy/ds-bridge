// M1.4 — `ds-bridge config` command group. The opt-in, default-OFF fix for
// #62442 (Design Decision §11.8): Claude Code does NOT persist a plugin's
// `sensitive` userConfig (the Figma PAT) across restarts — it lives only in the
// session's process.env. `config persist-token` (env → file) and `config connect`
// (interactive hidden prompt → file) are the ONLY places the secret is written to
// disk, and ONLY when the user explicitly runs one of them. A SessionStart hook
// (scripts/hook-save-config.mjs) merely NUDGES toward them; it never writes.
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
	appendFileSync,
	chmodSync,
	existsSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import * as readline from "node:readline";
import type { Command } from "commander";
import { resolveConfig, writeProjectConfig } from "../config.js";
import { parseDotenv } from "../io/dotenv.js";
import { extractFigmaFileKey } from "../io/figma/file-key.js";
import { verifyConnection } from "../io/figma/verify.js";

/** The project secret file name (gitignored, 0600). */
const ENV_FILE_NAME = ".ds-bridge.env";
/** The committed project config file name (shown in messages). */
const PROJECT_FILE_NAME = ".ds-bridge.json";

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
			"No Figma token in this session's environment, so nothing was written. " +
				"Either add it directly to .ds-bridge.env (FIGMA_TOKEN=figd_…, gitignored) " +
				"— the durable path the CLI auto-loads on every run — or set it in the " +
				"plugin dialog (`/plugin configure`) and run this in the SAME session " +
				"(before a restart: Claude Code drops the sensitive value on restart, #62442).",
		);
		return;
	}

	const rawFileKey =
		env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY ??
		env.FIGMA_DESIGN_SYSTEM_FILE ??
		undefined;
	// Store the BARE key even if a whole Figma URL reached the env.
	const fileKey =
		rawFileKey !== undefined ? extractFigmaFileKey(rawFileKey) : undefined;

	const targetDir = resolvePath(path);
	const updates: Record<string, string> = { FIGMA_TOKEN: token };
	if (fileKey !== undefined && fileKey !== "") {
		updates.FIGMA_DESIGN_SYSTEM_FILE = fileKey;
	}

	let gitignoreUpdated: boolean;
	try {
		writeEnvFileMerged(targetDir, updates);
		gitignoreUpdated = ensureGitignored(targetDir);
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
			"It now survives a restart; the live plugin-dialog value still wins when present.\n" +
			(gitignoreUpdated ? `Added ${ENV_FILE_NAME} to .gitignore.\n` : ""),
	);
	process.exitCode = 0;
}

/**
 * Ensure <dir>/.gitignore ignores `.ds-bridge.env` (the secret file). Idempotent:
 * returns true only when it actually appended the line. The explicit line is
 * required because the common `.env.*` glob does NOT match `.ds-bridge.env`
 * (SPEC-personas §6.1). Mirrors dashboard.ts's ensureLocalGitignore.
 */
function ensureGitignored(dir: string): boolean {
	const gitignorePath = join(dir, ".gitignore");
	let existing = "";
	if (existsSync(gitignorePath)) {
		existing = readFileSync(gitignorePath, "utf8");
		if (existing.split(/\r?\n/).some((line) => line.trim() === ENV_FILE_NAME)) {
			return false;
		}
	}
	const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
	appendFileSync(
		gitignorePath,
		`${prefix}# ds-bridge Figma token — never commit\n${ENV_FILE_NAME}\n`,
		"utf8",
	);
	return true;
}

/**
 * Best-effort default for the file-key prompt: an existing .ds-bridge.env's
 * FIGMA_DESIGN_SYSTEM_FILE, else the plugin-option / env value. Never throws.
 */
function detectFileKeyDefault(dir: string): string | undefined {
	const filePath = join(dir, ENV_FILE_NAME);
	if (existsSync(filePath)) {
		try {
			const existing = parseDotenv(readFileSync(filePath, "utf8"));
			const fromFile = existing.FIGMA_DESIGN_SYSTEM_FILE;
			if (fromFile !== undefined && fromFile !== "") {
				return extractFigmaFileKey(fromFile);
			}
		} catch {
			/* ignore an unreadable/garbled file — fall through to env */
		}
	}
	const env = process.env;
	const fromEnv =
		env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY ?? env.FIGMA_DESIGN_SYSTEM_FILE;
	return fromEnv !== undefined && fromEnv !== ""
		? extractFigmaFileKey(fromEnv)
		: undefined;
}

/** Result of {@link applyConnect}, used for the masked confirmation + tests. */
export interface ConnectSummary {
	envPath: string;
	masked: string;
	/** The file key written, or undefined when none was provided. */
	fileKey: string | undefined;
	gitignoreUpdated: boolean;
}

/**
 * Write the token (+ optional file key) into <dir>/.ds-bridge.env and make sure the
 * file is gitignored. The testable I/O seam under the interactive `config connect`
 * — the readline prompting stays a thin shell on top. Reuses the atomic 0600
 * merging writer, so an existing file's unrelated keys survive. Throws on fs error.
 */
export function applyConnect(
	dir: string,
	token: string,
	fileKey: string,
): ConnectSummary {
	const updates: Record<string, string> = { FIGMA_TOKEN: token };
	// A pasted Figma URL collapses to its bare key; a bare key is unchanged.
	const trimmedKey = extractFigmaFileKey(fileKey);
	if (trimmedKey !== "") updates.FIGMA_DESIGN_SYSTEM_FILE = trimmedKey;
	writeEnvFileMerged(dir, updates);
	const gitignoreUpdated = ensureGitignored(dir);
	return {
		envPath: join(dir, ENV_FILE_NAME),
		masked: maskToken(token),
		fileKey: trimmedKey === "" ? undefined : trimmedKey,
		gitignoreUpdated,
	};
}

/**
 * Prompt for a secret on a TTY with the keystrokes hidden (no echo, like `sudo`).
 * Writes the question once, suppresses every other write so the value never prints,
 * and resolves with the trimmed input. TTY-only — the caller guards on isTTY first.
 */
function promptHidden(question: string): Promise<string> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: true,
		});
		let promptShown = false;
		// readline writes the prompt + every keystroke through _writeToOutput; show
		// the prompt exactly once and drop the rest so the typed secret stays hidden.
		(rl as unknown as { _writeToOutput: () => void })._writeToOutput = () => {
			if (!promptShown) {
				process.stdout.write(question);
				promptShown = true;
			}
		};
		rl.question(question, (answer) => {
			rl.close();
			process.stdout.write("\n");
			resolve(answer.trim());
		});
	});
}

/** Prompt for a non-secret value with normal echo; resolves with trimmed input. */
function promptLine(question: string): Promise<string> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

/**
 * Execute `config connect [path]`. Interactive, terminal-only: prompts for the
 * Figma token (hidden) and library file key (visible, defaulting to any detected
 * value), then writes <path|cwd>/.ds-bridge.env (0600) and gitignores it. The
 * secret never enters argv, the chat transcript, or shell history. Without a TTY
 * (e.g. run through a tool runner) it refuses and explains how to run it for real,
 * rather than blocking on stdin.
 */
async function runConnect(path: string, verify: boolean): Promise<void> {
	const targetDir = resolvePath(path);

	if (!process.stdin.isTTY) {
		const cliPath = process.argv[1] ?? "<path-to>/dist/cli.mjs";
		fail(
			"`config connect` is interactive and needs a real terminal so it can " +
				"prompt for your token without echoing it. Run it directly in your shell " +
				"(not through Claude Code's tool runner):\n\n" +
				`  node ${cliPath} config connect\n\n` +
				"Already have FIGMA_TOKEN in your environment? Use `config persist-token` " +
				"instead, which is non-interactive.",
		);
		return;
	}

	process.stdout.write(
		"Connect ds-bridge to Figma. The token is written to .ds-bridge.env " +
			"(gitignored, mode 0600) and is never echoed or printed in full.\n\n",
	);

	const token = await promptHidden("Figma personal access token (hidden): ");
	if (token === "") {
		fail("No token entered — nothing was written.");
		return;
	}
	if (!token.startsWith("figd_") && !token.startsWith("figd-")) {
		process.stdout.write(
			"warning: that does not look like a Figma PAT (expected a figd_… value) — saving it anyway.\n",
		);
	}

	const defaultKey = detectFileKeyDefault(targetDir);
	const keyPrompt =
		defaultKey !== undefined
			? `Figma library file key [${defaultKey}]: `
			: "Figma library file key (optional — Enter to skip): ";
	const keyInput = await promptLine(keyPrompt);
	const fileKey = keyInput !== "" ? keyInput : (defaultKey ?? "");

	let summary: ConnectSummary;
	try {
		summary = applyConnect(targetDir, token, fileKey);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not write ${join(targetDir, ENV_FILE_NAME)}: ${detail}`);
		return;
	}

	const ignoreNote = summary.gitignoreUpdated
		? `Added ${ENV_FILE_NAME} to .gitignore.\n`
		: "";
	const keyNote =
		summary.fileKey !== undefined
			? ` and library file key (${summary.fileKey})`
			: "";
	process.stdout.write(
		`\n${ignoreNote}Saved Figma token (${summary.masked})${keyNote} to ` +
			`${summary.envPath} (mode 0600).\n\n` +
			"Connected. Back in Claude Code, run /ds-bridge:ds-docs (or /ds-bridge:connect) " +
			"— the CLI auto-loads .ds-bridge.env on every run.\n",
	);

	if (verify) {
		await runVerify(token, summary.fileKey);
		return; // runVerify owns the exit code from here.
	}
	process.exitCode = 0;
}

/**
 * Ping Figma to confirm a just-saved token actually works (the `--verify` tail of
 * `config connect`). Prints the structured report and sets the exit code: 0 only
 * when the token is valid AND (if a key is known) the library is readable, else 2.
 * The credentials were already written — a failed verify just flags "not usable
 * yet" so a script can branch on it. Never throws.
 */
async function runVerify(
	token: string,
	fileKey: string | undefined,
): Promise<void> {
	process.stdout.write("\nVerifying with Figma…\n");
	let result: { ok: boolean; lines: string[] };
	try {
		const apiBase = process.env.FIGMA_API_BASE;
		result = await verifyConnection({
			token,
			...(fileKey !== undefined ? { fileKey } : {}),
			...(apiBase !== undefined ? { baseUrl: apiBase } : {}),
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Verification could not run: ${detail}`);
		return;
	}
	for (const line of result.lines) {
		process.stdout.write(`  ${line}\n`);
	}
	process.exitCode = result.ok ? 0 : 2;
}

// ── Read/write helpers shared by show / list / set-library / add-product ──

/** Read & parse <dir>/.ds-bridge.json into a plain object; {} when absent/invalid. */
function readProjectObject(dir: string): Record<string, unknown> {
	const filePath = join(dir, PROJECT_FILE_NAME);
	if (!existsSync(filePath)) return {};
	try {
		const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
		if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
			return raw as Record<string, unknown>;
		}
	} catch {
		/* unreadable/garbled → treat as no committed declarations */
	}
	return {};
}

/** Read <dir>/.ds-bridge.env's keys; {} when absent/unreadable. Never throws. */
function readEnvFile(dir: string): Record<string, string> {
	const filePath = join(dir, ENV_FILE_NAME);
	if (!existsSync(filePath)) return {};
	try {
		return parseDotenv(readFileSync(filePath, "utf8"));
	} catch {
		return {};
	}
}

/** The committed `product_file_keys` map (string entries only); {} when absent. */
function readProductFileKeys(dir: string): Record<string, string> {
	const raw = readProjectObject(dir).product_file_keys;
	const out: Record<string, string> = {};
	if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
		for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
			if (typeof v === "string") out[k] = v;
		}
	}
	return out;
}

/**
 * Where an env value came from for `config show`: the gitignored .ds-bridge.env
 * file (hydrated into process.env at startup) vs a real shell/dialog env var.
 * Heuristic — file-backed iff the file declares the key with the value now in the
 * environment. A real env var of the SAME value is indistinguishable (it would have
 * won the autoload); we label the overwhelmingly common case and never mislead
 * about WHICH key won, only its backing.
 */
function envBacking(
	envFile: Record<string, string>,
	env: NodeJS.ProcessEnv,
	key: string,
): "file" | "env" | undefined {
	const value = env[key];
	if (value === undefined || value === "") return undefined;
	return envFile[key] === value ? "file" : "env";
}

/** Provenance label for the product alias `alias` (env override wins over file). */
function productSourceLabel(env: NodeJS.ProcessEnv, alias: string): string {
	const envKey = `FIGMA_PRODUCT_FILE_${alias.toUpperCase()}`;
	const fromEnv = env[envKey];
	return fromEnv !== undefined && fromEnv !== ""
		? `environment (${envKey})`
		: `${PROJECT_FILE_NAME} (product_file_keys.${alias})`;
}

/** Render `rows` as a padded `label  value  ← source` block (2-space indent). */
function renderRows(
	rows: readonly { label: string; value: string; source: string }[],
): string[] {
	const labelW = Math.max(...rows.map((r) => r.label.length));
	const valueW = Math.max(...rows.map((r) => r.value.length));
	return rows.map(
		(r) =>
			`  ${r.label.padEnd(labelW)}  ${r.value.padEnd(valueW)}  ← ${r.source}`,
	);
}

/**
 * Build the `config show` report: effective config with the winning source for
 * each value (token masked). Pure but for the fs reads; returns the lines to print
 * or a typed invalid-project-file error so the runner can exit 2 with the message.
 */
function buildShowReport(
	dir: string,
): { kind: "ok"; lines: string[] } | { kind: "invalid"; message: string } {
	const env = process.env;
	const projObj = readProjectObject(dir);
	const envFile = readEnvFile(dir);
	const projectFilePath = join(dir, PROJECT_FILE_NAME);
	const projectFileText = existsSync(projectFilePath)
		? readFileSync(projectFilePath, "utf8")
		: undefined;

	const resolved = resolveConfig({
		env,
		...(projectFileText !== undefined ? { projectFileText } : {}),
	});
	if (resolved.kind === "invalid-project-file") {
		return { kind: "invalid", message: resolved.message };
	}
	const cfg = resolved.config;

	// Token source (precedence: dialog env > .ds-bridge.env/real env).
	const tokenSource = env.CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN
		? "plugin dialog (CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN, session-only)"
		: envBacking(envFile, env, "FIGMA_TOKEN") === "file"
			? ENV_FILE_NAME
			: envBacking(envFile, env, "FIGMA_TOKEN") === "env"
				? "environment (FIGMA_TOKEN)"
				: "—";

	// Library-key source (precedence mirrors resolveConfig).
	const keyBacking = envBacking(envFile, env, "FIGMA_DESIGN_SYSTEM_FILE");
	const librarySource = env.CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY
		? "plugin dialog (CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY, session-only)"
		: keyBacking === "file"
			? `${ENV_FILE_NAME} (FIGMA_DESIGN_SYSTEM_FILE)`
			: keyBacking === "env"
				? "environment (FIGMA_DESIGN_SYSTEM_FILE)"
				: typeof projObj.figma_file_key === "string"
					? `${PROJECT_FILE_NAME} (figma_file_key)`
					: "—";

	const tokenSrcSource = env.CLAUDE_PLUGIN_OPTION_TOKEN_SOURCE
		? "plugin dialog (session-only)"
		: typeof projObj.token_source === "string"
			? PROJECT_FILE_NAME
			: "auto-detected at run time";

	const reportSource =
		env.CLAUDE_PLUGIN_OPTION_REPORT_STYLE === cfg.reportStyle
			? "plugin dialog (session-only)"
			: typeof projObj.report_style === "string"
				? PROJECT_FILE_NAME
				: "default";

	const readinessSource =
		env.CLAUDE_PLUGIN_OPTION_READINESS_THRESHOLD !== undefined &&
		Number(env.CLAUDE_PLUGIN_OPTION_READINESS_THRESHOLD) ===
			cfg.readinessThreshold
			? "plugin dialog (session-only)"
			: typeof projObj.readiness_threshold === "number"
				? PROJECT_FILE_NAME
				: "default";

	const core = renderRows([
		{
			label: "Figma token",
			value:
				cfg.figmaToken.kind === "present"
					? maskToken(cfg.figmaToken.value)
					: "— (not set)",
			source: tokenSource,
		},
		{
			label: "Library file key",
			value: cfg.figmaFileKey ?? "— (not set)",
			source: librarySource,
		},
		{
			label: "Token source",
			value: cfg.tokenSource ?? "— (auto-detect)",
			source: tokenSrcSource,
		},
		{ label: "Report style", value: cfg.reportStyle, source: reportSource },
		{
			label: "Readiness gate",
			value: String(cfg.readinessThreshold),
			source: readinessSource,
		},
	]);

	const lines: string[] = [
		`ds-bridge configuration  (${dir})`,
		"",
		...core,
		"",
	];

	const aliases = Object.keys(cfg.productFileKeys);
	if (aliases.length === 0) {
		lines.push(
			"  Product files: none — add one with `config add-product <alias> <url>`.",
		);
	} else {
		lines.push(`  Product files (${aliases.length}):`);
		lines.push(
			...renderRows(
				aliases.map((alias) => ({
					label: `  ${alias}`,
					value: cfg.productFileKeys[alias] ?? "",
					source: productSourceLabel(env, alias),
				})),
			),
		);
	}

	for (const warning of resolved.warnings) {
		lines.push("", `  ⚠ ${warning}`);
	}

	return { kind: "ok", lines };
}

/** Execute `config show [path]`: print effective config + winning sources. */
function runShow(path: string): void {
	const dir = resolvePath(path);
	const report = buildShowReport(dir);
	if (report.kind === "invalid") {
		fail(report.message);
		return;
	}
	process.stdout.write(`${report.lines.join("\n")}\n`);
	process.exitCode = 0;
}

/**
 * Execute `config set-library <url|key> [path]`: normalize a pasted URL or bare key
 * and write it to the COMMITTED `.ds-bridge.json` (`figma_file_key`) — the non-secret
 * key the whole team shares (closes gap #2). Reuses the atomic, order-preserving
 * writeProjectConfig.
 */
function runSetLibrary(value: string, path: string): void {
	const key = extractFigmaFileKey(value);
	if (key === "") {
		fail(
			"Provide a Figma library URL or file key, e.g. " +
				"`config set-library https://www.figma.com/design/<KEY>/...`",
		);
		return;
	}
	if (!/^[A-Za-z0-9]+$/.test(key)) {
		process.stdout.write(
			`warning: "${key}" doesn't look like a bare Figma file key (letters/digits only) — saving it anyway.\n`,
		);
	}
	const dir = resolvePath(path);
	try {
		writeProjectConfig(dir, { figma_file_key: key });
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not write ${join(dir, PROJECT_FILE_NAME)}: ${detail}`);
		return;
	}
	process.stdout.write(
		`Set figma_file_key to ${key} in ${join(dir, PROJECT_FILE_NAME)} ` +
			"(committed — share it with your team).\n",
	);
	process.exitCode = 0;
}

/**
 * Execute `config add-product <alias> <url|key> [path]`: register/replace a product
 * file under `product_file_keys` in the committed `.ds-bridge.json` (closes gap #3).
 * MERGES into any existing map so other aliases survive. The alias is stored as
 * typed (trimmed) — reference it with `--file-key <alias>`.
 */
function runAddProduct(alias: string, value: string, path: string): void {
	const cleanAlias = alias.trim();
	if (cleanAlias === "") {
		fail("Provide an alias, e.g. `config add-product web <url>`.");
		return;
	}
	const key = extractFigmaFileKey(value);
	if (key === "") {
		fail(
			`Provide a Figma URL or file key for "${cleanAlias}", e.g. ` +
				"`config add-product web https://www.figma.com/design/<KEY>/...`",
		);
		return;
	}
	const dir = resolvePath(path);
	const existing = readProductFileKeys(dir);
	const merged = { ...existing, [cleanAlias]: key };
	try {
		writeProjectConfig(dir, { product_file_keys: merged });
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not write ${join(dir, PROJECT_FILE_NAME)}: ${detail}`);
		return;
	}
	const verb = Object.hasOwn(existing, cleanAlias) ? "Updated" : "Registered";
	process.stdout.write(
		`${verb} product file "${cleanAlias}" → ${key} in ${join(dir, PROJECT_FILE_NAME)}. ` +
			`Use it with --file-key ${cleanAlias} ` +
			`(e.g. ds-bridge impact --file-key ${cleanAlias}).\n`,
	);
	process.exitCode = 0;
}

/**
 * Execute `config list [path]`: the file keys you can target — the privileged
 * library default and every product alias (env-merged), each with its source.
 */
function runList(path: string): void {
	const dir = resolvePath(path);
	const env = process.env;
	const projectFilePath = join(dir, PROJECT_FILE_NAME);
	const projectFileText = existsSync(projectFilePath)
		? readFileSync(projectFilePath, "utf8")
		: undefined;
	const resolved = resolveConfig({
		env,
		...(projectFileText !== undefined ? { projectFileText } : {}),
	});
	if (resolved.kind === "invalid-project-file") {
		fail(resolved.message);
		return;
	}
	const cfg = resolved.config;
	const lines: string[] = [
		`Library (default):  ${cfg.figmaFileKey ?? "— (not set — `config set-library <url|key>`)"}`,
		"",
	];
	const aliases = Object.keys(cfg.productFileKeys);
	if (aliases.length === 0) {
		lines.push(
			"Product files: none — add one with `config add-product <alias> <url>`.",
		);
	} else {
		lines.push(`Product files (${aliases.length}):`);
		lines.push(
			...renderRows(
				aliases.map((alias) => ({
					label: alias,
					value: cfg.productFileKeys[alias] ?? "",
					source: productSourceLabel(env, alias),
				})),
			),
		);
	}
	process.stdout.write(`${lines.join("\n")}\n`);
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

	config
		.command("connect")
		.description(
			"Interactively connect Figma: prompt for the token (hidden input) and " +
				"write .ds-bridge.env (gitignored, 0600). Run it in your own terminal.",
		)
		.argument("[path]", "project directory to write .ds-bridge.env into", ".")
		.option(
			"--verify",
			"after writing, ping Figma (/v1/me + a library read) to confirm the token works",
		)
		.action((path: string, options: { verify?: boolean }) => {
			void runConnect(path, options.verify === true);
		});

	config
		.command("show")
		.description(
			"Print the effective ds-bridge config (token masked) and which source won each value",
		)
		.argument("[path]", "project directory to read config from", ".")
		.action((path: string) => {
			runShow(path);
		});

	config
		.command("set-library")
		.description(
			"Write the design-system library file key (a URL or bare key) to the " +
				"committed .ds-bridge.json (figma_file_key) — shared by the whole team",
		)
		.argument("<url-or-key>", "Figma library file URL or bare file key")
		.argument("[path]", "project directory whose .ds-bridge.json to write", ".")
		.action((urlOrKey: string, path: string) => {
			runSetLibrary(urlOrKey, path);
		});

	config
		.command("add-product")
		.description(
			"Register a product/consumer Figma file under an alias in .ds-bridge.json " +
				"(product_file_keys); target it later with --file-key <alias>",
		)
		.argument("<alias>", "short alias, e.g. web | mobile | admin")
		.argument("<url-or-key>", "the product Figma file URL or bare file key")
		.argument("[path]", "project directory whose .ds-bridge.json to write", ".")
		.action((alias: string, urlOrKey: string, path: string) => {
			runAddProduct(alias, urlOrKey, path);
		});

	config
		.command("list")
		.description(
			"List the targetable file keys: the library default and every product alias",
		)
		.argument("[path]", "project directory to read config from", ".")
		.action((path: string) => {
			runList(path);
		});
}
