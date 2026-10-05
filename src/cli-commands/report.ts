// T3.6 — `ds-bridge report [path]` command builder.
// The CLI layer: flags → selection (io/report-selection.ts) → ReportData
// (io/report-data.ts: one read of history + registry, every section's compute
// step, the timeline's past states) → the chosen renderer (html, md, exec,
// json, terminal, site, snapshots) → the file or stdout, and (optionally) a
// platform opener. The renderer never
// touches the clock/fs/network; the single fresh `generatedAt` ISO timestamp is
// read here, at the io edge, so the rendered document is otherwise reproducible.
//
// Missing/empty history is NOT an error — it renders an empty-state dashboard
// and exits 0. Corrupted JSONL lines are skipped with one stderr warning each
// and never fatal. Unknown record kinds are skipped silently (forward compat).
//
// Exit codes: 0 success (even with no data) · 2 operational error (path not a
// directory, unwritable --out).
import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { platform } from "node:process";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import { readinessByFrame } from "../engines/history/readiness-frames.js";
import { buildFreshness } from "../engines/report/freshness.js";
import { replayHistory } from "../engines/report/history-lines.js";
import { buildLibraryHealthTrend } from "../engines/report/library-health-trend.js";
import { buildManagerReport } from "../engines/report/manager-report.js";
import { rollupByOwner } from "../engines/report/ownership.js";
import { resolveView } from "../engines/report/presets.js";
import { reportJsonDocument } from "../engines/report/report-json.js";
import {
	resolveWeightProfile,
	scoreFromHistory,
} from "../engines/report/score.js";
import { buildScorecard } from "../engines/report/scorecard.js";
import {
	renderScorecardMarkdown,
	type ScorecardBlocks,
} from "../engines/report/scorecard-md.js";
import type { A11ySummary, ReportData } from "../engines/report/types.js";
import { listDashboards, readDashboardFile } from "../io/dashboards.js";
import { readFileAtRef, spawnGitExec } from "../io/git-log.js";
import {
	assemblePastStates,
	assembleReportData,
	byDirectoryFromRecords,
	computeAudienceChangelog,
	computeDataFreshness,
	computeLibraryHealthTrend,
	computeMigrationChecklist,
	computeOwnershipLeaderboard,
	computeScoreVelocity,
	computeSystemScore,
	computeTargets,
	parseVelocityWindow,
	readHistoryText,
	renderInstant,
	resolveOwnership,
} from "../io/report-data.js";
import {
	type ReportError,
	type ResolvedSelection,
	resolveSelection,
} from "../io/report-selection.js";
import {
	type DashboardPastState,
	renderDashboard,
} from "../render/html/dashboard.js";
import { type IndexEntry, renderIndex } from "../render/html/index.js";
import { renderManagerHtml } from "../render/html/manager.js";
import { normalizeSnapshot } from "../render/html/snapshot.js";
import { renderManagerMarkdown } from "../render/markdown/manager.js";
import { renderTerminalDashboard } from "../render/terminal/dashboard.js";
import { shouldColor } from "../render/terminal/index.js";

/** X9 — the latest a11y summary → failing pairs + the modes that fail. */
function managerContrast(
	a11y: A11ySummary | undefined,
): { failed: number; level: "AA" | "AAA"; modes: string[] } | undefined {
	if (a11y === undefined) return undefined;
	let failed = 0;
	const modes: string[] = [];
	for (const m of a11y.modes) {
		if (typeof m.failed === "number" && m.failed > 0) {
			failed += m.failed;
			modes.push(m.mode);
		}
	}
	return { failed, level: a11y.level, modes };
}

/**
 * X10 — stored `kind:"score"` records dated inside the velocity window
 * (`[now − windowDays, now]`), in file order, as `{date, score}`.
 */
function storedScorePoints(
	replayed: ReturnType<typeof replayHistory>,
	nowIso: string,
	windowDays: number,
): { date: string; score: number }[] {
	const nowMs = Date.parse(nowIso);
	const startMs = Number.isNaN(nowMs)
		? Number.NEGATIVE_INFINITY
		: nowMs - windowDays * 24 * 60 * 60 * 1000;
	const out: { date: string; score: number }[] = [];
	for (const entry of replayed) {
		if (entry.kind !== "score") continue;
		const r = entry.record as { at?: unknown; score?: unknown };
		if (typeof r.at !== "string") continue;
		if (typeof r.score !== "number" || !Number.isFinite(r.score)) continue;
		const atMs = Date.parse(r.at);
		// Inside [now − window, now]: a point after the render instant (e.g. a
		// SOURCE_DATE_EPOCH-pinned render) is not "since" anything.
		if (Number.isNaN(atMs) || atMs < startMs || atMs > nowMs) continue;
		out.push({ date: r.at.slice(0, 10), score: r.score });
	}
	return out;
}

/**
 * Render the DS-manager one-page report (SPEC-exec-report §5/§6) from the SAME
 * assembled ReportData the dashboard uses, plus per-frame readiness (H7) from
 * the replayed history. `exec` → paste-ready Markdown on stdout (or `--out`);
 * `exec-html` → one offline page at `--out` or .ds-bridge/reports/exec.html.
 */
function runManagerReport(
	format: "exec" | "exec-html",
	stateDir: string,
	options: ReportOptions,
	selection: ResolvedSelection,
	data: ReportData,
	windowDays: number,
): void {
	const replayed = replayHistory(readHistoryText(stateDir));
	const frames = readinessByFrame(replayed, selection.readinessThreshold);
	const lastDrift = data.driftTrend?.[data.driftTrend.length - 1];
	const contrast = managerContrast(data.a11y);
	const scorePoints = storedScorePoints(replayed, data.generatedAt, windowDays);
	const report = buildManagerReport({
		project: data.project,
		generatedAt: data.generatedAt,
		windowDays,
		readinessThreshold: selection.readinessThreshold,
		...(data.systemScore !== undefined
			? { systemScore: data.systemScore }
			: {}),
		...(data.scoreVelocity !== undefined
			? { scoreVelocity: data.scoreVelocity }
			: {}),
		...(data.adoptionTrend !== undefined
			? { adoptionTrend: data.adoptionTrend }
			: {}),
		...(data.importCoverage !== undefined
			? { importCoverage: data.importCoverage }
			: {}),
		...(data.targets !== undefined ? { targets: data.targets } : {}),
		...(data.consistency !== undefined
			? { consistency: data.consistency }
			: {}),
		...(data.debt !== undefined ? { debt: data.debt } : {}),
		...(data.dataFreshness !== undefined
			? { dataFreshness: data.dataFreshness }
			: {}),
		frames,
		...(lastDrift !== undefined
			? {
					breakingDrift: lastDrift.breaking,
					tokenGaps: {
						missing: lastDrift.additive,
						orphan: lastDrift.cosmetic,
					},
				}
			: {}),
		...(contrast !== undefined ? { contrast } : {}),
		...(scorePoints.length > 0 ? { scorePoints } : {}),
	});

	if (format === "exec") {
		const markdown = renderManagerMarkdown(report);
		if (options.out !== undefined) {
			const outPath = resolve(options.out);
			const written = writeDashboard(outPath, markdown);
			if (written.kind === "error") {
				failReport(written.message);
				return;
			}
			process.stdout.write(`${outPath}\n`);
		} else {
			process.stdout.write(markdown);
		}
		process.exitCode = 0;
		return;
	}

	const outPath =
		options.out !== undefined
			? resolve(options.out)
			: join(stateDir, "reports", "exec.html");
	const written = writeDashboard(outPath, renderManagerHtml(report));
	if (written.kind === "error") {
		failReport(written.message);
		return;
	}
	process.stdout.write(`${outPath}\n`);
	if (options.open) openReport(outPath, process.env);
	process.exitCode = 0;
}

/** Render the dashboard and write it to `outPath`, or fail with exit code 2. */
function writeDashboard(
	outPath: string,
	html: string,
): { kind: "ok" } | ReportError {
	try {
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, html, "utf8");
		return { kind: "ok" };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Could not write report to "${outPath}": ${detail}`,
		};
	}
}

/** The opener command: DS_BRIDGE_OPEN_CMD override, else the platform default. */
function openerCommand(env: NodeJS.ProcessEnv): string {
	const override = env.DS_BRIDGE_OPEN_CMD;
	if (override !== undefined && override.trim() !== "") return override;
	return platform === "darwin" ? "open" : "xdg-open";
}

/**
 * Spawn the opener for `filePath`. Failure is non-fatal: the report already
 * exists on disk, so a missing opener only earns a stderr warning.
 */
function openReport(filePath: string, env: NodeJS.ProcessEnv): void {
	const command = openerCommand(env);
	try {
		const child = spawn(command, [filePath], {
			stdio: "ignore",
			detached: false,
		});
		child.on("error", (error) => {
			process.stderr.write(
				`warning: could not open report with "${command}": ${error.message}\n`,
			);
		});
		child.unref();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`warning: could not open report with "${command}": ${detail}\n`,
		);
	}
}

interface ReportOptions {
	open: boolean;
	out: string | undefined;
	view: string | undefined;
	artifacts: string | undefined;
	/** Output format flag: "html" | "md", or undefined (defaults via dashboard report_type → html). */
	format: string | undefined;
	/** `--delta <ref>`: compare against the base ref's committed history (md only). */
	delta: string | undefined;
	/** `--gate`: a red metric-target verdict exits 1 (md only; html → exit 2). */
	gate: boolean;
	/** `--velocity-window <N>d|<N>w`: C8 score-velocity look-back (flag > config > 30d). */
	velocityWindow: string | undefined;
	/** `--dashboard <name>`: render a saved dashboard (flags layer; SPEC §7, M8.3). */
	dashboard: string | undefined;
	/** `--dashboards <a,b>`: the explicit static-site publish set (--format site, M11.1). */
	dashboards: string | undefined;
	/** `--all-dashboards`: publish every committed (non-`.local`) saved dashboard. */
	allDashboards: boolean | undefined;
	/** `--snapshot`: write normalized committed HTML snapshots (M12.1). */
	snapshot: boolean | undefined;
	/** Commander maps `--no-timeline` to `timeline: false` (html/site only). */
	timeline?: boolean;
}

function failReport(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/**
 * Render the markdown scorecard (the `--format md` path, C4). Compares the
 * current `.ds-bridge/history.jsonl` against the base ref's COMMITTED history
 * when `--delta <ref>` is given, and emits the scorecard to stdout (CI-pipeable)
 * or — with `--out` — writes it to a file and prints that path.
 *
 * Base resolution (per SPEC §1.1, via the injectable GitExec seam, cwd =
 * targetDir): `missing` → render current-only + a no-baseline note (exit 0);
 * `git-error` → exit 2 with the message; `ok` → diff against the committed text.
 * Both sides score with the CURRENT weights (§1.5). An absent/empty current
 * history surfaces as `no-data` → exit 2 with run-a-check guidance.
 */
function runMarkdownReport(
	targetDir: string,
	options: ReportOptions,
	selection: ResolvedSelection,
): void {
	// Resolve the effective weights for THIS render via the SAME C2 precedence the
	// html score + the badge use (active view's by-view override > global
	// score_weights > defaults), so the scorecard score row shows the SAME number
	// the dashboard does. Render-scoped — never written back. §1.5: BOTH scorecard
	// sides score with this one table.
	const weightProfile = resolveWeightProfile(
		selection.viewName,
		selection.scoreWeights,
		selection.scoreWeightsByView,
	);
	const stateDir = join(targetDir, ".ds-bridge");
	const currentText = readHistoryText(stateDir);
	const currentRecords = replayHistory(currentText);

	// Optional base: read the ref's committed history through git (cwd = the
	// resolved targetDir, not process.cwd()). The render options carry the labels.
	let baseText: string | undefined;
	let noBaseline = false;
	const baseLabel = options.delta;
	if (options.delta !== undefined) {
		const outcome = readFileAtRef({
			ref: options.delta,
			path: join(".ds-bridge", "history.jsonl"),
			cwd: targetDir,
			exec: spawnGitExec,
		});
		if (outcome.kind === "git-error") {
			failReport(`Could not read "${options.delta}": ${outcome.message}`);
			return;
		}
		if (outcome.kind === "missing") {
			// The realistic case: the committed .ds-bridge/ has no history at the ref.
			// Render current-only plus a no-baseline note (exit 0).
			noBaseline = true;
		} else {
			baseText = outcome.text;
		}
	}

	const effectiveWeights = weightProfile.weights;
	const model = buildScorecard(currentText, baseText, effectiveWeights);
	if (model.kind === "no-data") {
		failReport(
			"No design-system history yet — run a check (e.g. ds-bridge tokens-check) to populate the scorecard.",
		);
		return;
	}

	// Selection-gated appendix (M5.1): compute the SAME per-metric sections the
	// HTML dashboard does, from the SAME history, so the markdown scorecard surfaces
	// the artifacts the active view selected. `generatedAt` is the single io-clock
	// read (injected → reproducible ages/velocity). Each section is computed
	// unconditionally; the renderer gates on `selection.artifacts` + presence.
	const generatedAt = renderInstant();
	const systemScore = computeSystemScore(currentText, effectiveWeights);
	// runReport already validated this flag (exit 2 on a bad value) before
	// dispatching here; re-parse for the day count and fall back to config/default.
	const parsedWindow = parseVelocityWindow(options.velocityWindow);
	const velocityWindowDays =
		(parsedWindow.kind === "ok" ? parsedWindow.days : undefined) ??
		selection.scoreVelocityWindow;
	const ownership = resolveOwnership(
		targetDir,
		selection.ownership,
		selection.ownershipFile,
	);
	const blocks: ScorecardBlocks = {};
	const targets = computeTargets(
		currentRecords,
		selection.metricTargets,
		systemScore?.current,
	);
	if (targets.length > 0) blocks.targets = targets;
	const dataFreshness = computeDataFreshness(
		currentRecords,
		generatedAt,
		selection.freshnessThresholds,
	);
	if (dataFreshness.length > 0) blocks.dataFreshness = dataFreshness;
	const scoreVelocity =
		systemScore !== undefined
			? computeScoreVelocity(systemScore.trend, generatedAt, velocityWindowDays)
			: undefined;
	if (scoreVelocity !== undefined) blocks.scoreVelocity = scoreVelocity;
	const ownershipLeaderboard = computeOwnershipLeaderboard(
		currentRecords,
		ownership,
	);
	if (ownershipLeaderboard.length > 0) {
		blocks.ownershipLeaderboard = ownershipLeaderboard;
	}
	const migrationChecklist = computeMigrationChecklist(
		currentRecords,
		selection.migrationSitesCap,
	);
	if (migrationChecklist.sites.length > 0) {
		blocks.migrationChecklist = migrationChecklist;
	}
	const libraryHealthTrend = computeLibraryHealthTrend(currentRecords);
	if (libraryHealthTrend.length > 0)
		blocks.libraryHealthTrend = libraryHealthTrend;
	const audienceChangelog = computeAudienceChangelog(currentRecords);
	if (audienceChangelog.slices.length > 0) {
		blocks.audienceChangelog = audienceChangelog;
	}

	// Base-side delta sections (only the delta-aware blocks: freshness ages,
	// ownership moves, library-health counts) from the committed `--delta` text.
	let baseBlocks: ScorecardBlocks | undefined;
	if (baseText !== undefined) {
		const baseRecords = replayHistory(baseText);
		const b: ScorecardBlocks = {};
		const baseFreshness = buildFreshness(
			baseRecords,
			generatedAt,
			selection.freshnessThresholds,
		);
		if (baseFreshness.length > 0) b.dataFreshness = baseFreshness;
		const baseLht = buildLibraryHealthTrend(baseRecords);
		if (baseLht.length > 0) b.libraryHealthTrend = baseLht;
		if (ownership !== undefined) {
			const baseOwners = rollupByOwner(
				byDirectoryFromRecords(baseRecords),
				ownership,
			);
			if (baseOwners.length > 0) b.ownershipLeaderboard = baseOwners;
		}
		baseBlocks = b;
	}

	const markdown = renderScorecardMarkdown(model, {
		...(baseLabel !== undefined ? { baseLabel } : {}),
		...(noBaseline ? { noBaseline: true } : {}),
		artifacts: selection.artifacts,
		blocks,
		...(baseBlocks !== undefined ? { baseBlocks } : {}),
	});

	// --out redirects to a file (and prints the path); otherwise the markdown goes
	// to stdout with NO trailing path line (pipe-cleanliness for CI / step summary).
	if (options.out !== undefined) {
		const outPath = resolve(options.out);
		const written = writeDashboard(outPath, markdown);
		if (written.kind === "error") {
			failReport(written.message);
			return;
		}
		process.stdout.write(`${outPath}\n`);
	} else {
		process.stdout.write(markdown);
	}

	// CI gate (C1, M3.1): with --gate set, a RED metric-target verdict exits 1 —
	// the scorecard still rendered above (the gate is an exit-code concern, not a
	// mute). Without --gate, or with no red verdict, the md path stays exit 0. The
	// targets are banded against the CURRENT-side scalars (and its composite score).
	if (options.gate) {
		const score = scoreFromHistory(currentText, effectiveWeights);
		const verdicts = computeTargets(
			currentRecords,
			selection.metricTargets,
			score.kind === "ok" ? score.current : undefined,
		);
		if (verdicts.some((v) => v.band === "red")) {
			process.exitCode = 1;
			return;
		}
	}

	process.exitCode = 0;
}

/** Read the project config's `publish` set (M11.1), or undefined when absent. */
function readPublishConfig(targetDir: string): string[] | undefined {
	const configPath = join(targetDir, ".ds-bridge.json");
	if (!existsSync(configPath)) return undefined;
	try {
		const projectFileText = readFileSync(configPath, "utf8");
		const resolved = resolveConfig({ projectFileText });
		return resolved.kind === "ok" ? resolved.config.publish : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Resolve the static-site publish set (M11.1), never including `.local`
 * dashboards: `--dashboards a,b` (explicit) > `--all-dashboards` (every committed
 * saved dashboard) > the `publish` config array > [] (the caller then publishes
 * just the active view as one page).
 */
function resolvePublishNames(
	targetDir: string,
	options: ReportOptions,
): string[] {
	if (options.dashboards !== undefined) {
		return options.dashboards
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}
	if (options.allDashboards === true) {
		return listDashboards(targetDir)
			.filter((e) => e.hasShared)
			.map((e) => e.name);
	}
	return readPublishConfig(targetDir) ?? [];
}

/**
 * Render the static site (M11.1, SPEC §7): each published dashboard to
 * `<out>/<name>.html` via the SAME pure renderDashboard, plus a generated
 * `<out>/index.html` from renderIndex. The publish set comes from
 * resolvePublishNames; an empty set publishes just the active view as one page.
 * `--out` is the OUTPUT DIRECTORY (default `<stateDir>/reports`).
 */
function runSiteReport(
	targetDir: string,
	options: ReportOptions,
	selection: ResolvedSelection,
	data: Parameters<typeof renderDashboard>[0],
	weightProfile: ReturnType<typeof resolveWeightProfile>,
	mode: "live" | "snapshot",
	timeline: readonly DashboardPastState[] = [],
): void {
	const stateDir = join(targetDir, ".ds-bridge");
	// Snapshots (M12.1): normalized HTML committed to .ds-bridge/snapshots/ with a
	// `.snapshot.html` suffix, so a content-free re-render is a zero-byte diff. The
	// live site goes to .ds-bridge/reports/ unchanged.
	const snapshot = mode === "snapshot";
	const suffix = snapshot ? ".snapshot.html" : ".html";
	const transform = snapshot
		? normalizeSnapshot
		: (html: string): string => html;
	const outDir =
		options.out !== undefined
			? resolve(options.out)
			: join(stateDir, snapshot ? "snapshots" : "reports");
	const names = resolvePublishNames(targetDir, options);
	const entries: IndexEntry[] = [];

	const writePage = (name: string, html: string): boolean => {
		const written = writeDashboard(
			join(outDir, `${name}${suffix}`),
			transform(html),
		);
		if (written.kind === "error") {
			failReport(written.message);
			return false;
		}
		entries.push({ name, href: `./${name}${suffix}` });
		return true;
	};

	if (names.length === 0) {
		// Default publish set = the active view, as one page named by its label.
		const name = selection.viewLabel ?? "dashboard";
		const html = renderDashboard(data, selection.artifacts, {
			viewLabel: name,
			weightProfile: {
				source: weightProfile.source,
				...(weightProfile.name !== undefined
					? { name: weightProfile.name }
					: {}),
			},
			timeline,
		});
		if (!writePage(name, html)) return;
	} else {
		for (const name of names) {
			const read = readDashboardFile(targetDir, name);
			if (read.kind === "not-found") {
				failReport(`Unknown dashboard "${name}" in the publish set.`);
				return;
			}
			if (read.kind === "invalid") {
				failReport(`Dashboard "${name}" is invalid: ${read.message}`);
				return;
			}
			const sel = read.dashboard.selection;
			const outcome = resolveView(
				sel.kind === "view" ? { view: sel.view } : { artifacts: sel.artifacts },
				{},
			);
			if (outcome.kind !== "ok") {
				failReport(`Dashboard "${name}" has an unresolvable selection.`);
				return;
			}
			const html = renderDashboard(data, outcome.artifacts, {
				viewLabel: name,
				timeline,
			});
			if (!writePage(name, html)) return;
		}
	}

	const indexName = snapshot ? "index.snapshot.html" : "index.html";
	const indexWritten = writeDashboard(
		join(outDir, indexName),
		transform(renderIndex(entries)),
	);
	if (indexWritten.kind === "error") {
		failReport(indexWritten.message);
		return;
	}
	process.stdout.write(`${outDir}\n`);
	process.exitCode = 0;
}

/** Execute the `report` command. Exit codes: 0 success · 2 operational error. */
function runReport(path: string, options: ReportOptions): void {
	// An EXPLICIT --format is two-valued (html | md) — reject a bad value before any
	// I/O. When the flag is omitted, the effective format is resolved AFTER the
	// selection (a saved dashboard's report_type defaults it, M9.3).
	if (
		options.format !== undefined &&
		options.format !== "html" &&
		options.format !== "md" &&
		options.format !== "terminal" &&
		options.format !== "site" &&
		options.format !== "exec" &&
		options.format !== "exec-html" &&
		options.format !== "json"
	) {
		failReport(
			`Unknown --format "${options.format}". Expected "html", "md", "terminal", "site", "exec", "exec-html", or "json".`,
		);
		return;
	}
	// --velocity-window (C8): parse the flag grammar up front so a malformed value
	// exits 2 before any I/O. `ok.days` undefined → fall back to config / the default.
	const velocityWindowFlag = parseVelocityWindow(options.velocityWindow);
	if (velocityWindowFlag.kind === "error") {
		failReport(velocityWindowFlag.message);
		return;
	}

	const targetDir = resolve(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		failReport(`Path "${targetDir}" is not a directory.`);
		return;
	}

	// Resolve which artifacts to render (flags > .ds-bridge.json > everything)
	// before any history/registry work — a usage/config error should exit 2 fast.
	// (Also resolves the CURRENT-side score weights + a saved dashboard's report_type.)
	const selection = resolveSelection(targetDir, options);
	if ("kind" in selection) {
		failReport(selection.message);
		return;
	}

	// Effective format (M9.3): the explicit --format flag wins; else a saved
	// dashboard's report_type; else html. `site` lands in M11 — until then an
	// unsupported resolved target is a typed error.
	const format = options.format ?? selection.reportType ?? "html";
	if (
		format !== "html" &&
		format !== "md" &&
		format !== "terminal" &&
		format !== "site" &&
		format !== "exec" &&
		format !== "exec-html" &&
		format !== "json"
	) {
		failReport(
			`report_type "${format}" is not a supported render target — pass --format html|md|terminal|site|exec|exec-html|json.`,
		);
		return;
	}
	// Combo validations against the EFFECTIVE format: --delta/--gate require md;
	// --open is only valid with the file-producing html target.
	if (options.delta !== undefined && format !== "md") {
		failReport("--delta requires --format md.");
		return;
	}
	if (options.open && format !== "html" && format !== "exec-html") {
		failReport(
			`--open is not valid with --format ${format} (there is no file to open).`,
		);
		return;
	}
	if (options.gate && format !== "md") {
		failReport(
			"--gate requires --format md (the gate acts on the text scorecard, not the HTML dashboard).",
		);
		return;
	}
	// --snapshot writes normalized HTML snapshots; it is incompatible with the
	// text targets (md/terminal). html/site are fine (site implies html pages).
	if (options.snapshot && format !== "html" && format !== "site") {
		failReport(
			`--snapshot renders HTML snapshots — not valid with --format ${format}.`,
		);
		return;
	}

	// The md path emits a markdown scorecard and RETURNS before the html tail.
	if (format === "md") {
		runMarkdownReport(targetDir, options, selection);
		return;
	}

	const { data, stateDir, generatedAt, velocityWindowDays, weightProfile } =
		assembleReportData(targetDir, selection, velocityWindowFlag.days);

	// JSON (E3, SPEC-analytics-export §2): the full ReportData in a versioned
	// envelope (schemas/report.v1.schema.json), stdout or --out.
	if (format === "json") {
		const text = `${JSON.stringify(
			reportJsonDocument(data, selection.artifacts, selection.viewLabel),
			null,
			2,
		)}\n`;
		if (options.out !== undefined) {
			const outPath = resolve(options.out);
			const written = writeDashboard(outPath, text);
			if (written.kind === "error") {
				failReport(written.message);
				return;
			}
			process.stdout.write(`${outPath}\n`);
		} else {
			process.stdout.write(text);
		}
		process.exitCode = 0;
		return;
	}

	// The DS-manager one-pager (SPEC-exec-report §6) renders from the SAME data.
	if (format === "exec" || format === "exec-html") {
		runManagerReport(
			format,
			stateDir,
			options,
			selection,
			data,
			velocityWindowDays,
		);
		return;
	}

	// Snapshots (M12.1): write normalized committed HTML snapshots and return,
	// regardless of the (html/site) format. Reuses the publish set, so canonical
	// named dashboards (never `.local`) snapshot to .ds-bridge/snapshots/.
	if (options.snapshot === true) {
		runSiteReport(
			targetDir,
			options,
			selection,
			data,
			weightProfile,
			"snapshot",
		);
		return;
	}

	// Static site (M11.1): render the explicit publish set — each dashboard to
	// reports/<name>.html + a generated reports/index.html. Returns before the
	// single-page html/terminal tails.
	// Timeline (html/site): the dashboard's earlier states, unless --no-timeline.
	const pastStates = (): DashboardPastState[] =>
		options.timeline === false
			? []
			: assemblePastStates(targetDir, selection, velocityWindowFlag.days);

	if (format === "site") {
		runSiteReport(
			targetDir,
			options,
			selection,
			data,
			weightProfile,
			"live",
			pastStates(),
		);
		return;
	}

	// Terminal (M10.3): render the SAME ReportData to stdout (CI-pipeable like md);
	// color is decided once at the edge via shouldColor; `--out` optionally
	// redirects; `--open` was already rejected for a non-html target above.
	if (format === "terminal") {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		const text = renderTerminalDashboard(data, selection.artifacts, {
			generatedAt,
			color,
			...(selection.viewLabel !== undefined
				? { viewLabel: selection.viewLabel }
				: {}),
		});
		if (options.out !== undefined) {
			const outPath = resolve(options.out);
			const written = writeDashboard(outPath, text);
			if (written.kind === "error") {
				failReport(written.message);
				return;
			}
			process.stdout.write(`${outPath}\n`);
		} else {
			process.stdout.write(`${text}\n`);
		}
		process.exitCode = 0;
		return;
	}

	// HTML (default): the offline self-contained dashboard, written to a file.
	const html = renderDashboard(data, selection.artifacts, {
		timeline: pastStates(),
		...(selection.viewLabel !== undefined
			? { viewLabel: selection.viewLabel }
			: {}),
		// Caption the system-score section ONLY for a `view`-source profile; the
		// renderer renders nothing for project/default (golden-neutral).
		weightProfile: {
			source: weightProfile.source,
			...(weightProfile.name !== undefined ? { name: weightProfile.name } : {}),
		},
	});

	const outPath =
		options.out !== undefined
			? resolve(options.out)
			: join(stateDir, "reports", "dashboard.html");

	const written = writeDashboard(outPath, html);
	if (written.kind === "error") {
		failReport(written.message);
		return;
	}

	process.stdout.write(`${outPath}\n`);

	if (options.open) {
		openReport(outPath, process.env);
	}

	process.exitCode = 0;
}

/** Register the `report` command on the program. Wiring entry for cli.ts. */
export function registerReportCommand(program: Command): void {
	program
		.command("report")
		.description("Render an offline HTML dashboard from the project history")
		.argument("[path]", "project directory to report on", ".")
		.option(
			"--view <preset>",
			"render a preset: ds-designer | ds-manager | ds-engineer | product-designer | product-manager | product-engineer | everything | exec | org",
		)
		.option(
			"--artifacts <ids>",
			"render a custom comma-separated artifact list (mutually exclusive with --view)",
		)
		.option(
			"--format <format>",
			"output format: html (default, the offline dashboard) | md (a markdown scorecard for PR comments / $GITHUB_STEP_SUMMARY) | terminal | site | exec (the paste-ready markdown DS-manager one-pager) | exec-html (the same one-pager as offline HTML, default .ds-bridge/reports/exec.html) | json (the full ReportData, versioned — schemas/report.v1.schema.json). A saved --dashboard's report_type defaults it.",
		)
		.option(
			"--delta <ref>",
			"compare against the base ref's committed history (requires --format md)",
		)
		.option(
			"--gate",
			"exit 1 when a metric_targets verdict is red (requires --format md; CI gate, C1)",
			false,
		)
		.option(
			"--velocity-window <window>",
			"score-velocity look-back window as <N>d|<N>w (C8; overrides score_velocity_window, default 30d)",
		)
		.option(
			"--dashboard <name>",
			"render a saved dashboard from dashboards/<name>.json (mutually exclusive with --view/--artifacts)",
		)
		.option(
			"--dashboards <names>",
			"with --format site: the comma-separated publish set (saved dashboard names)",
		)
		.option(
			"--all-dashboards",
			"with --format site: publish every committed (non-.local) saved dashboard",
			false,
		)
		.option(
			"--snapshot",
			"write normalized committed HTML snapshots to .ds-bridge/snapshots/ (M12.1)",
			false,
		)
		.option(
			"--no-timeline",
			"html/site: leave out the header timeline of earlier days (smaller file)",
		)
		.option(
			"--out <file>",
			"output file (default <path>/.ds-bridge/reports/dashboard.html; exec-html → .ds-bridge/reports/exec.html; with --format md|exec|json, writes to the file instead of stdout)",
		)
		.option(
			"--open",
			'open the report after writing (override the opener with the DS_BRIDGE_OPEN_CMD env var; defaults to "open" on macOS, "xdg-open" elsewhere)',
			false,
		)
		.action((path: string, options: ReportOptions) => {
			runReport(path, options);
		});
}
