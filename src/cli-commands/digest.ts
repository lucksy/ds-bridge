// D3 — `ds-bridge digest [path]` command builder (SPEC-digest §1.5/§1.6).
// Impure edge: reads <path>/.ds-bridge/history.jsonl, resolves the project's
// readinessThreshold from <path>/.ds-bridge.json (resolveConfig), reads the
// clock ONCE (now() at the edge), then drives the pure digest engine + markdown
// renderer. The engine never touches the clock/fs/network — `parseSince` takes
// the injected `nowIso` and `buildDigest` takes the resolved `sinceIso`.
//
// Output is the C4 generator convention: markdown to stdout (pipe-clean, no path
// line) so it drops straight into a Slack/Confluence paste or $GITHUB_STEP_SUMMARY;
// `--out <file>` redirects the markdown to a file and prints that path instead.
//
// Absent/empty history is NOT an error — `buildDigest` returns the typed `quiet`
// outcome and the renderer emits the one-line quiet-week digest (exit 0). Exit
// codes: 0 success (incl. quiet) · 2 usage/config error (bad --since/--audience,
// invalid .ds-bridge.json, unwritable --out, path not a directory).
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cwd as processCwd } from "node:process";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import type { ChangelogAudience } from "../engines/changelog/aggregate.js";
import { buildDigest, parseSince } from "../engines/report/digest.js";
import { renderDigestMarkdown } from "../engines/report/digest-md.js";

interface DigestOptions {
	since: string | undefined;
	audience: string;
	out: string | undefined;
}

/** Injectable dependencies so the command is testable end-to-end. */
export interface DigestDeps {
	cwd: string;
	now: () => Date;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

/** Real-edge defaults: process cwd, the live clock, process I/O. */
function defaultDeps(): DigestDeps {
	return {
		cwd: processCwd(),
		now: () => new Date(),
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	};
}

/** Normalize the --audience flag (plural CLI form) to the engine's audience. */
function parseAudience(
	flag: string,
): { kind: "ok"; value: ChangelogAudience } | { kind: "error" } {
	switch (flag) {
		case "designers":
		case "designer":
			return { kind: "ok", value: "designer" };
		case "developers":
		case "developer":
			return { kind: "ok", value: "developer" };
		case "both":
			return { kind: "ok", value: "both" };
		default:
			return { kind: "error" };
	}
}

/** Read <stateDir>/history.jsonl, or "" when the file is absent/unreadable. */
function readHistoryText(stateDir: string): string {
	try {
		return readFileSync(join(stateDir, "history.jsonl"), "utf8");
	} catch {
		return "";
	}
}

/**
 * Resolve the project's readinessThreshold from <targetDir>/.ds-bridge.json. An
 * absent project file → the configured default (resolveConfig fills it); an
 * INVALID project file → a typed error (exit 2 at the edge), never a silent
 * fallback that would disagree with the project (SPEC §1.4).
 */
function resolveReadinessThreshold(
	targetDir: string,
): { kind: "ok"; value: number } | { kind: "error"; message: string } {
	const configPath = join(targetDir, ".ds-bridge.json");
	let projectFileText: string | undefined;
	if (existsSync(configPath)) {
		try {
			projectFileText = readFileSync(configPath, "utf8");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return {
				kind: "error",
				message: `Could not read ${configPath}: ${detail}`,
			};
		}
	}
	const resolved = resolveConfig(
		projectFileText !== undefined ? { projectFileText } : {},
	);
	if (resolved.kind === "invalid-project-file") {
		return { kind: "error", message: resolved.message };
	}
	return { kind: "ok", value: resolved.config.readinessThreshold };
}

/** Execute the `digest` command with injected dependencies. */
export function runDigest(
	path: string,
	options: DigestOptions,
	deps: DigestDeps,
): void {
	// Validate flags first (usage errors exit 2 before any I/O).
	const audience = parseAudience(options.audience);
	if (audience.kind !== "ok") {
		deps.stderr(
			`Unknown --audience "${options.audience}". Expected "designers", "developers", or "both".\n`,
		);
		process.exitCode = 2;
		return;
	}

	const nowIso = deps.now().toISOString();
	const since = parseSince(options.since, nowIso);
	if (since.kind !== "ok") {
		deps.stderr(`Invalid --since "${options.since}". ${since.message}\n`);
		process.exitCode = 2;
		return;
	}

	const targetDir = resolve(deps.cwd, path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		deps.stderr(`Path "${targetDir}" is not a directory.\n`);
		process.exitCode = 2;
		return;
	}

	const threshold = resolveReadinessThreshold(targetDir);
	if (threshold.kind === "error") {
		deps.stderr(`${threshold.message}\n`);
		process.exitCode = 2;
		return;
	}

	const stateDir = join(targetDir, ".ds-bridge");
	const text = readHistoryText(stateDir);
	const model = buildDigest(
		text,
		since.sinceIso,
		audience.value,
		threshold.value,
	);
	const markdown = renderDigestMarkdown(model);

	// --out redirects to a file (and prints the path); otherwise the markdown goes
	// to stdout with NO trailing path line (pipe-cleanliness, the C4 convention).
	if (options.out !== undefined) {
		const outPath = resolve(deps.cwd, options.out);
		try {
			mkdirSync(dirname(outPath), { recursive: true });
			writeFileSync(outPath, markdown, "utf8");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			deps.stderr(`Could not write digest to "${outPath}": ${detail}\n`);
			process.exitCode = 2;
			return;
		}
		deps.stdout(`${outPath}\n`);
	} else {
		deps.stdout(markdown);
	}

	process.exitCode = 0;
}

/** Register the `digest` command on the program. Wiring entry for cli.ts. */
export function registerDigestCommand(program: Command): void {
	program
		.command("digest")
		.description(
			"Paste-anywhere markdown of what moved in a window, segmented by audience, ending in up to three concrete actions",
		)
		.argument("[path]", "project directory to digest", ".")
		.option(
			"--since <window>",
			'window start: an ISO date "YYYY-MM-DD" or a relative "<N>d" / "<N>w" (default 7d)',
		)
		.option("--audience <who>", "designers | developers | both", "both")
		.option(
			"--out <file>",
			"redirect the digest markdown to a file (and print the path) instead of stdout",
		)
		.action((path: string, options: DigestOptions) => {
			runDigest(path, options, defaultDeps());
		});
}
