#!/usr/bin/env node
// T2.6 — PostToolUse lint hook adapter. A thin, dependency-free ESM bridge between
// Claude Code's hook protocol and the built `ds-bridge lint` command.
//
// Contract (intentionally fail-quiet — a hook must never break the user's flow):
//   • Reads the whole PostToolUse payload from stdin:
//       { tool_name, tool_input: { file_path }, cwd, ... }
//   • Anything it cannot act on → exit 0 with NO stdout:
//       - stdin is not JSON
//       - no tool_input.file_path
//       - file extension not in .css/.scss/.tsx/.jsx
//   • Otherwise spawns: <node> <root>/dist/cli.mjs lint <file> --format=json
//       with cwd = payload.cwd so token discovery resolves the project's tokens.
//       (1500ms timeout; a kill → silent exit 0.)
//   • lint exit codes: 0 (clean) or 2 (no tokens / error) or spawn failure
//       → silent exit 0. exit 1 with parseable findings JSON → emit a
//       hookSpecificOutput block summarising the findings.
//   • ALWAYS exits 0.
import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LINTABLE_EXTENSIONS = [".css", ".scss", ".tsx", ".jsx"];
const TIMEOUT_MS = 1500;
const MAX_LISTED_FINDINGS = 5;

// Resolve the plugin/repo root as <script dir>/.. so this works both in-repo
// (scripts/ → repo root) and when installed as a plugin (scripts/ → plugin root).
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

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

/** True when the path ends in a lintable extension (case-insensitive). */
function hasLintableExtension(filePath) {
	const lower = filePath.toLowerCase();
	return LINTABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Short suggestion text for a single finding (mirrors the term renderer). */
function suggestionFor(finding) {
	if (finding.kind === "exact" && typeof finding.expectedToken === "string") {
		return finding.expectedToken;
	}
	if (
		finding.kind === "near" &&
		Array.isArray(finding.expectedCandidates) &&
		finding.expectedCandidates.length > 0
	) {
		return `near ${finding.expectedCandidates[0]}`;
	}
	return "no matching token";
}

/** Build the additionalContext summary string for the findings. */
function summarise(findings, fileBasename) {
	const count = findings.length;
	const noun = count === 1 ? "value" : "values";
	const shown = findings.slice(0, MAX_LISTED_FINDINGS);
	const parts = shown.map((finding) => {
		const where = `${finding.line}:${finding.col}`;
		return `${where} ${finding.raw} -> ${suggestionFor(finding)}`;
	});
	const overflow = count - shown.length;
	if (overflow > 0) parts.push(`and ${overflow} more`);
	return `ds-bridge: ${count} hardcoded design ${noun} in ${fileBasename}: ${parts.join("; ")}`;
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

	const toolInput = payload.tool_input;
	const filePath =
		toolInput && typeof toolInput === "object"
			? toolInput.file_path
			: undefined;
	if (typeof filePath !== "string" || filePath.length === 0) {
		exitSilent();
		return;
	}

	if (!hasLintableExtension(filePath)) {
		exitSilent();
		return;
	}

	const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();

	const result = spawnSync(
		process.execPath,
		[cliPath, "lint", filePath, "--format=json"],
		{ cwd, encoding: "utf8", timeout: TIMEOUT_MS },
	);

	// Spawn failure or a kill (timeout) → fail quiet.
	if (result.error !== undefined && result.error !== null) {
		exitSilent();
		return;
	}
	if (result.signal !== null) {
		exitSilent();
		return;
	}

	// Only exit 1 (findings remain) carries actionable findings; 0 (clean) and
	// 2 (no tokens / operational error) are silent.
	if (result.status !== 1) {
		exitSilent();
		return;
	}

	let findings;
	try {
		findings = JSON.parse(result.stdout);
	} catch {
		exitSilent();
		return;
	}
	if (!Array.isArray(findings) || findings.length === 0) {
		exitSilent();
		return;
	}

	const additionalContext = summarise(findings, basename(filePath));
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext,
			},
		}),
	);
	process.exit(0);
}

main().catch(() => exitSilent());
