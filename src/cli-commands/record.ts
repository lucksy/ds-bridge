// H5 — `ds-bridge record [path]` (SPEC-history-v2 §4, PLAN B-P0 #2). The unit of
// time in the series: runs every configured, network-free check (plus the Figma
// ones with --figma) as ONE batch sharing a runId, then appends ONE `score`
// record so the composite is stored with the weights that produced it (G3).
//
// Design (SPEC §1.4): each check runs as a subprocess of the SAME bundle with
// cwd = the project and DS_BRIDGE_RUN_ID / DS_BRIDGE_SOURCE in its env, so every
// check keeps its exact semantics and appends through the single writer. A
// check that cannot run (exit 2: no tokens, no registry…) is reported as
// skipped with its first stderr line. Whether a check RECORDED is decided by the
// history itself (a record of its kind carrying this runId), not by exit codes.
//
// Exit codes: 0 the batch ran (findings never fail a recording run) · 2 internal
// error (bad flag, bad path, no check could be spawned, score append failed).
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import { parseTopN } from "../engines/figma/library-health-top.js";
import { parseFigmaUrl } from "../engines/handoff/parse-url.js";
import {
	type HistorySource,
	parseSource,
} from "../engines/history/envelope.js";
import {
	type ScoreRecordPayload,
	scoreRecordPayload,
} from "../engines/history/score-record.js";
import {
	type HistoryRecord,
	replayHistory,
} from "../engines/report/history-lines.js";
import {
	resolveWeightProfile,
	type WeightProfile,
} from "../engines/report/score.js";
import { loadDotenvInto } from "../io/dotenv.js";
import { appendHistoryRecord, historyFilePath } from "../io/history-writer.js";
import { severityColor, shouldColor } from "../render/terminal/index.js";
import { weightProfileForConfig } from "./badge.js";

/** The checks a batch can contain, in run order. */
export type RecordStepId =
	| "registry-build"
	| "lint"
	| "tokens-check"
	| "a11y"
	| "adoption"
	| "library-health"
	| "handoff";

/** One planned check: whether it runs, why not, its CLI args and history kind. */
export interface RecordStep {
	id: RecordStepId;
	/** The history kind the check appends (how "recorded" is verified). */
	kind: string;
	/** CLI args, run with cwd = the project directory. */
	args: string[];
	run: boolean;
	/** Why the step does not run (only when `run` is false). */
	reason?: string;
	/** H14 — the tracked frame URL (handoff steps only). */
	frame?: string;
}

/** What the plan needs to know about the project. */
export interface RecordContext {
	/** `.ds-bridge/registry.json` exists. */
	hasRegistry: boolean;
	/** A Figma token AND a library file key resolve. */
	figmaConfigured: boolean;
	/** `--figma` was passed. */
	figma: boolean;
	/** `--library-top N`, forwarded to library-health as `--top N` (F2). */
	libraryTop?: number;
	/**
	 * H14 — a Figma token resolves (handoff needs no library file key: the URL
	 * carries it). Defaults to `figmaConfigured`.
	 */
	figmaToken?: boolean;
	/** H14 — `tracked_frames` URLs, scored with `handoff` after library-health. */
	trackedFrames?: string[];
}

/**
 * Plan the batch (pure). Order: `registry build` first (it refreshes the
 * registry and appends parity), the local checks, `adoption` (needs a registry —
 * existing, or built by this batch), `library-health`, then one `handoff` per
 * tracked frame (H14). Figma steps need BOTH `--figma` and a configured token +
 * file key; handoff steps need `--figma` and a token.
 */
export function planRecordSteps(ctx: RecordContext): RecordStep[] {
	const figmaRuns = ctx.figma && ctx.figmaConfigured;
	const figmaReason = !ctx.figma
		? "Figma checks need network — pass --figma"
		: "Figma not configured (token + library file key)";
	const json = ["--format", "json"];
	const figmaStep = (
		id: RecordStepId,
		kind: string,
		args: string[],
	): RecordStep =>
		figmaRuns
			? { id, kind, args, run: true }
			: { id, kind, args, run: false, reason: figmaReason };
	const adoptionRuns = ctx.hasRegistry || figmaRuns;
	return [
		figmaStep("registry-build", "parity", ["registry", "build", ".", ...json]),
		{ id: "lint", kind: "lint", args: ["lint", ".", ...json], run: true },
		{
			id: "tokens-check",
			kind: "tokens-check",
			args: ["tokens", "check", ".", ...json],
			run: true,
		},
		{ id: "a11y", kind: "a11y", args: ["a11y", ".", ...json], run: true },
		adoptionRuns
			? {
					id: "adoption",
					kind: "adoption",
					args: ["adoption", ".", ...json],
					run: true,
				}
			: {
					id: "adoption",
					kind: "adoption",
					args: ["adoption", ".", ...json],
					run: false,
					reason: "no registry (.ds-bridge/registry.json) — run registry build",
				},
		figmaStep("library-health", "library-health", [
			"library-health",
			...json,
			...(ctx.libraryTop !== undefined
				? ["--top", String(ctx.libraryTop)]
				: []),
		]),
		...handoffSteps(ctx),
	];
}

/** H14 — one handoff step per tracked frame (config order). */
function handoffSteps(ctx: RecordContext): RecordStep[] {
	const token = ctx.figmaToken ?? ctx.figmaConfigured;
	const runs = ctx.figma && token;
	const reason = !ctx.figma
		? "Figma checks need network — pass --figma"
		: "Figma token not configured";
	return (ctx.trackedFrames ?? []).map((frame) => ({
		id: "handoff",
		kind: "handoff",
		args: ["handoff", frame, "--format", "json"],
		frame,
		run: runs,
		...(runs ? {} : { reason }),
	}));
}

/**
 * H14 — did this batch record the tracked frame? A `handoff` record carrying the
 * runId with the URL's fileKey and, when the URL has a node-id, the same nodeId.
 */
export function handoffRecordedFor(
	records: readonly Pick<HistoryRecord, "kind" | "record" | "envelope">[],
	runId: string,
	frameUrl: string,
): boolean {
	const parsed = parseFigmaUrl(frameUrl);
	if (parsed.kind !== "ok") return false;
	return records.some((r) => {
		if (r.kind !== "handoff" || r.envelope?.runId !== runId) return false;
		const rec = r.record as { fileKey?: unknown; nodeId?: unknown };
		if (rec.fileKey !== parsed.fileKey) return false;
		return parsed.nodeId === undefined || rec.nodeId === parsed.nodeId;
	});
}

/** A finished subprocess, as the classifier sees it. */
export interface StepRun {
	/** Exit status; null when the process never ran / was killed. */
	status: number | null;
	stderr: string;
	/** Spawn failure message. */
	error?: string;
}

/** The outcome of one check in the batch. */
export interface StepOutcome {
	status: "recorded" | "skipped" | "error";
	exitCode?: number;
	reason?: string;
}

/**
 * Classify a finished check (pure). `recorded` iff a record of its kind carries
 * the batch runId — findings (exit 1) still count; exit 2 (could not run) is
 * `skipped` with its first stderr line; a spawn failure is `error`.
 */
export function classifyStep(run: StepRun, recorded: boolean): StepOutcome {
	if (run.error !== undefined || run.status === null) {
		return { status: "error", reason: run.error ?? "check did not exit" };
	}
	if (recorded) return { status: "recorded", exitCode: run.status };
	const firstLine = run.stderr
		.split("\n")
		.map((l) => l.trim())
		.find((l) => l !== "");
	return {
		status: "skipped",
		exitCode: run.status,
		reason: firstLine ?? "no history record written",
	};
}

/** Runs one check subprocess (injectable for tests). */
export type StepRunner = (
	args: string[],
	options: { cwd: string; env: NodeJS.ProcessEnv },
) => StepRun;

/** A check that runs longer than this is stopped (a stalled Figma call). */
const STEP_TIMEOUT_MS = 5 * 60 * 1000;
/** stderr kept per check; a noisy check must not fail with ENOBUFS. */
const STEP_STDERR_MAX = 16 * 1024 * 1024;

/**
 * The per-check timeout: `DS_BRIDGE_RECORD_STEP_TIMEOUT_MS` (a positive
 * integer) or 5 minutes.
 */
export function stepTimeoutMs(env: NodeJS.ProcessEnv): number {
	const raw = env.DS_BRIDGE_RECORD_STEP_TIMEOUT_MS;
	const parsed = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : 0;
	return parsed > 0 ? parsed : STEP_TIMEOUT_MS;
}

/**
 * The real runner: the SAME bundle (or tsx entry), stdout discarded. Bounded:
 * a check is stopped after {@link stepTimeoutMs} so a stalled network call
 * cannot hang a CI job, and its stderr buffer is large enough not to fail.
 */
function spawnSelf(
	args: string[],
	options: { cwd: string; env: NodeJS.ProcessEnv },
): StepRun {
	const entry = process.argv[1];
	if (entry === undefined) {
		return { status: null, stderr: "", error: "cannot locate the CLI entry" };
	}
	const run = spawnSync(
		process.execPath,
		[...process.execArgv, entry, ...args],
		{
			cwd: options.cwd,
			env: options.env,
			encoding: "utf8",
			stdio: ["ignore", "ignore", "pipe"],
			timeout: stepTimeoutMs(options.env),
			killSignal: "SIGTERM",
			maxBuffer: STEP_STDERR_MAX,
		},
	);
	if (run.error !== undefined) {
		const code = (run.error as NodeJS.ErrnoException).code;
		const error =
			code === "ETIMEDOUT"
				? `timed out after ${Math.round(stepTimeoutMs(options.env) / 1000)}s`
				: run.error.message;
		return { status: null, stderr: "", error };
	}
	return { status: run.status, stderr: run.stderr ?? "" };
}

type RecordFormat = "term" | "json";

interface RecordOptions {
	source: string | undefined;
	figma: boolean | undefined;
	format: string;
	libraryTop?: string | undefined;
}

/** One check row in the output. */
interface CheckRow extends StepOutcome {
	id: RecordStepId;
	kind: string;
	/** H14 — the tracked frame URL (handoff rows only). */
	frame?: string;
}

/** The machine-readable result (`--format json`). */
interface RecordResult {
	runId: string;
	source: HistorySource;
	historyPath: string;
	checks: CheckRow[];
	score: Omit<ScoreRecordPayload, "kind"> | null;
}

function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Read the project file + env into the bits record needs (never throws). */
function readProjectSettings(
	targetDir: string,
	env: NodeJS.ProcessEnv,
):
	| {
			kind: "ok";
			figmaConfigured: boolean;
			figmaToken: boolean;
			trackedFrames: string[] | undefined;
			profile: WeightProfile;
	  }
	| { kind: "error"; message: string } {
	const configPath = join(targetDir, ".ds-bridge.json");
	let projectFileText: string | undefined;
	if (existsSync(configPath)) {
		try {
			projectFileText = readFileSync(configPath, "utf8");
		} catch {
			projectFileText = undefined;
		}
	}
	const resolved = resolveConfig({
		env,
		...(projectFileText !== undefined ? { projectFileText } : {}),
	});
	if (resolved.kind !== "ok")
		return { kind: "error", message: resolved.message };
	const { config } = resolved;
	return {
		kind: "ok",
		figmaConfigured:
			config.figmaToken.kind === "present" && config.figmaFileKey !== undefined,
		figmaToken: config.figmaToken.kind === "present",
		trackedFrames: config.trackedFrames,
		profile:
			projectFileText !== undefined
				? weightProfileForConfig(config)
				: resolveWeightProfile(undefined, undefined, undefined),
	};
}

function readHistoryText(stateDir: string): string {
	try {
		return readFileSync(historyFilePath(stateDir), "utf8");
	} catch {
		return "";
	}
}

function renderTerm(result: RecordResult, color: boolean): string {
	const lines = [
		`ds-bridge record · run ${result.runId} · source ${result.source}`,
		"",
	];
	const width = Math.max(...result.checks.map((c) => c.id.length));
	for (const check of result.checks) {
		const name = check.id.padEnd(width);
		const frame = check.frame !== undefined ? ` · ${check.frame}` : "";
		if (check.status === "recorded") {
			lines.push(
				`  ${severityColor("ok", "✓", { color })} ${name}  recorded${frame}`,
			);
		} else if (check.status === "skipped") {
			lines.push(`  – ${name}  skipped: ${check.reason ?? ""}${frame}`);
		} else {
			lines.push(
				`  ${severityColor("error", "✗", { color })} ${name}  error: ${check.reason ?? ""}${frame}`,
			);
		}
	}
	lines.push("");
	lines.push(
		result.score === null
			? "System score: no score-relevant data yet (nothing stored)"
			: `System score: ${result.score.score}/100 (stored, weights: ${result.score.weightsSource})`,
	);
	lines.push(`History: ${result.historyPath}`);
	return lines.join("\n");
}

/** Injectable seams for {@link runRecord}. */
export interface RecordDeps {
	runStep: StepRunner;
	env: NodeJS.ProcessEnv;
	newRunId: () => string;
}

/** Execute `record`; returns the exit code (0 ran · 2 internal error). */
export function runRecord(
	path: string,
	options: RecordOptions,
	deps: RecordDeps,
): number {
	const format = options.format as RecordFormat;
	if (format !== "term" && format !== "json") {
		fail(`Unknown --format "${options.format}". Expected "term" or "json".`);
		return 2;
	}
	let source: HistorySource = "local";
	if (options.source !== undefined) {
		const parsed = parseSource(options.source);
		if (parsed === undefined) {
			fail(
				`Unknown --source "${options.source}". Expected "local", "ci" or "hook".`,
			);
			return 2;
		}
		source = parsed;
	} else {
		source = parseSource(deps.env.DS_BRIDGE_SOURCE) ?? "local";
	}

	let libraryTop: number | undefined;
	if (options.libraryTop !== undefined) {
		libraryTop = parseTopN(options.libraryTop);
		if (libraryTop === undefined) {
			fail(
				`Invalid --library-top "${options.libraryTop}". Expected a whole number from 0 to 100.`,
			);
			return 2;
		}
	}

	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return 2;
	}
	const stateDir = join(targetDir, ".ds-bridge");

	// The checks run with cwd = the project, so they hydrate ITS .ds-bridge.env;
	// mirror that here so Figma detection agrees with what they will see.
	const detectEnv: NodeJS.ProcessEnv = { ...deps.env };
	loadDotenvInto(join(targetDir, ".ds-bridge.env"), detectEnv);
	const settings = readProjectSettings(targetDir, detectEnv);
	if (settings.kind === "error") {
		fail(settings.message);
		return 2;
	}

	const runId = deps.newRunId();
	const childEnv: NodeJS.ProcessEnv = {
		...deps.env,
		DS_BRIDGE_RUN_ID: runId,
		DS_BRIDGE_SOURCE: source,
	};

	const steps = planRecordSteps({
		hasRegistry: existsSync(join(stateDir, "registry.json")),
		figmaConfigured: settings.figmaConfigured,
		figma: options.figma === true,
		figmaToken: settings.figmaToken,
		...(settings.trackedFrames !== undefined
			? { trackedFrames: settings.trackedFrames }
			: {}),
		...(libraryTop !== undefined ? { libraryTop } : {}),
	});

	// Keyed by plan index: several handoff steps share the id (H14).
	const runs = new Map<number, StepRun>();
	steps.forEach((step, index) => {
		if (!step.run) return;
		runs.set(index, deps.runStep(step.args, { cwd: targetDir, env: childEnv }));
	});

	// Which kinds did THIS batch actually record? Ask the history itself.
	const batchRecords = replayHistory(readHistoryText(stateDir)).filter(
		(r) => r.envelope?.runId === runId,
	);
	const recordedKinds = new Set(batchRecords.map((r) => r.kind));

	const checks: CheckRow[] = steps.map((step, index) => {
		const frame = step.frame !== undefined ? { frame: step.frame } : {};
		const run = runs.get(index);
		if (run === undefined) {
			return {
				id: step.id,
				kind: step.kind,
				...frame,
				status: "skipped",
				reason: step.reason ?? "not planned",
			};
		}
		const recorded =
			step.frame !== undefined
				? handoffRecordedFor(batchRecords, runId, step.frame)
				: recordedKinds.has(step.kind);
		return {
			id: step.id,
			kind: step.kind,
			...frame,
			...classifyStep(run, recorded),
		};
	});

	const ran = checks.filter((_c, index) => runs.has(index));
	if (ran.length > 0 && ran.every((c) => c.status === "error")) {
		fail(
			`record: no check could be started (${ran[0]?.reason ?? "unknown error"}).`,
		);
		return 2;
	}

	// The stored composite (G3): one score record per batch, only with data —
	// and only when this batch measured something. A batch whose checks were
	// all skipped would otherwise store a fresh, "now"-dated score made of old
	// measurements, and the trend would show a measurement that never happened.
	let score: RecordResult["score"] = null;
	const payload =
		batchRecords.length > 0
			? scoreRecordPayload(readHistoryText(stateDir), settings.profile)
			: undefined;
	if (payload !== undefined) {
		try {
			appendHistoryRecord(stateDir, payload, { env: childEnv, source });
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			fail(`Could not append the score record: ${detail}`);
			return 2;
		}
		const { kind: _kind, ...rest } = payload;
		score = rest;
	}

	const result: RecordResult = {
		runId,
		source,
		historyPath: historyFilePath(stateDir),
		checks,
		score,
	};
	if (format === "json") {
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} else {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		process.stdout.write(`${renderTerm(result, color)}\n`);
	}
	return 0;
}

/** Register the `record` command on the program. Wiring entry for cli.ts. */
export function registerRecordCommand(program: Command): void {
	program
		.command("record")
		.description(
			"Run the configured checks as one batch (shared runId) and append them plus the system score to history",
		)
		.argument("[path]", "project directory to record", ".")
		.option(
			"--source <source>",
			"record source: local | ci | hook (default: DS_BRIDGE_SOURCE or local)",
		)
		.option(
			"--figma",
			"also run the Figma checks (registry build → parity, library-health: token + library file key; handoff for each tracked_frames URL: token)",
		)
		.option("--no-figma", "skip the Figma checks (default)")
		.option(
			"--library-top <n>",
			"top N components per library-health signal stored for trends (0-100; default 10)",
		)
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: RecordOptions) => {
			process.exitCode = runRecord(path, options, {
				runStep: spawnSelf,
				env: process.env,
				newRunId: randomUUID,
			});
		});
}
