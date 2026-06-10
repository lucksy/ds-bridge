// C13 / M3.7 — `ds-bridge release-check [path]` command builder. Reads the saved
// .ds-bridge/history.jsonl, extracts the latest impact/drift/parity signals, runs
// the pure release-readiness engine, and prints the go/no-go verdict + per-gate
// detail (term table · json), gating the exit code as the pre-publish CI gate.
//
// Impure edge only: it reads the history file and writes to stdout/stderr. All
// judgement is delegated to the pure engine; bad input becomes an exit code +
// actionable stderr, never a thrown stack trace.
//
// Exit codes (mirroring parity's CI-gate semantics, SPEC-personas §5 C13):
//   0  go      — every gate passes
//   1  no-go   — any gate fails (incl. insufficient-data gates)
//   2  operational error (path not a directory, invalid --format)
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { replayHistory } from "../engines/report/history-lines.js";
import {
	evaluateReleaseReadiness,
	extractReleaseSignals,
} from "../engines/report/release-readiness.js";
import type { ReleaseReadiness } from "../engines/report/types.js";
import { renderTable } from "../render/terminal/index.js";

type ReleaseCheckFormat = "term" | "json";

interface ReleaseCheckOptions {
	format: string;
}

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Read <stateDir>/history.jsonl, or "" when the file is absent/unreadable. */
function readHistoryText(stateDir: string): string {
	try {
		return readFileSync(join(stateDir, "history.jsonl"), "utf8");
	} catch {
		return "";
	}
}

/** Render the verdict as an aligned term table headed by a GO / NO-GO line. */
function renderTerm(readiness: ReleaseReadiness): string {
	const headline = `RELEASE: ${readiness.go ? "GO" : "NO-GO"}`;
	const rows = readiness.checks.map((check) => [
		check.name,
		check.pass ? "pass" : "fail",
		check.detail ?? "",
	]);
	const table = renderTable(["gate", "status", "detail"], rows, {
		color: false,
	});
	return `${headline}\n${table}`;
}

/** Execute the `release-check` command. */
function runReleaseCheck(path: string, options: ReleaseCheckOptions): void {
	const format = options.format as ReleaseCheckFormat;
	if (format !== "term" && format !== "json") {
		fail(`Unknown --format "${options.format}". Expected "term" or "json".`);
		return;
	}

	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return;
	}

	const stateDir = join(targetDir, ".ds-bridge");
	const signals = extractReleaseSignals(
		replayHistory(readHistoryText(stateDir)),
	);
	// The standalone CI gate ALWAYS evaluates — an empty history yields three
	// insufficient-data gates → no-go (exit 1), never a silent pass.
	const readiness = evaluateReleaseReadiness(signals);

	if (format === "json") {
		process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
	} else {
		process.stdout.write(`${renderTerm(readiness)}\n`);
	}

	// CI gate semantics: exit 0 on go, 1 on no-go.
	process.exitCode = readiness.go ? 0 : 1;
}

/** Register the `release-check` command on the program. Wiring entry for cli.ts. */
export function registerReleaseCheckCommand(program: Command): void {
	program
		.command("release-check")
		.description(
			"Pre-publish go/no-go gate over the project history (exit 0 go / 1 no-go / 2 error)",
		)
		.argument(
			"[path]",
			"project directory holding .ds-bridge/history.jsonl",
			".",
		)
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: ReleaseCheckOptions) => {
			runReleaseCheck(path, options);
		});
}
