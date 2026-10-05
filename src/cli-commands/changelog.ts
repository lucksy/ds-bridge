// T7.14 — `ds-bridge changelog` command builder. Aggregates three change
// sources into one audience-segmented changelog and prints it (term | json | md).
//
// Impure edge only: it runs `git log` (injectable exec) for the code side and,
// WHEN a Figma token + file key both resolve, fetches file versions over REST
// (injectable client, same pattern as `handoff`). With no token/key the Figma
// side is skipped gracefully with a one-line note so the command works fully
// OFFLINE from a plain git repo. It writes nothing — stdout only.
//
// Token-diff side: the aggregation engine accepts a token diff, but computing it
// here would require git-show of the token file at the --since boundary plus a
// full parse+diff — out of scope for this slice (see notes / the TODO below).
// We pass an EMPTY diff (never a faked one) so the wiring is real and a later
// task can fill it in without touching the engine.
//
// Exit codes: 0 success · 2 operational error (bad --format/--audience, git
// unavailable). It is a generator, not a gate — clean and "has changes" are both 0.
import { join } from "node:path";
import { cwd as processCwd } from "node:process";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import {
	aggregateChangelog,
	type ChangelogAudience,
	type ChangelogEntry,
	type ChangelogSeverity,
	type ChangelogSource,
} from "../engines/changelog/aggregate.js";
import { renderChangelogMarkdown } from "../engines/changelog/render-md.js";
import type { TokenDiffResult } from "../engines/tokens/diff.js";
import {
	createFigmaClient,
	type FigmaClient,
	type FigmaVersion,
} from "../io/figma/client.js";
import { type GitExec, readGitLog, spawnGitExec } from "../io/git-log.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import {
	type Severity,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";

type ChangelogFormat = "term" | "json" | "md";

const DEFAULT_FIGMA_API_BASE = "https://api.figma.com";

/** Default lookback when no --since is given: 90 days, as a YYYY-MM-DD string. */
function defaultSince(now: Date): string {
	const ms = now.getTime() - 90 * 24 * 60 * 60 * 1000;
	return new Date(ms).toISOString().slice(0, 10);
}

/** TODO(T-future): compute the real token diff (git-show of the token file at the
 * --since boundary vs the working tree, then parse + diffTokenMaps). For now the
 * wiring is real but the diff is empty — the engine path is exercised, nothing faked. */
const EMPTY_TOKEN_DIFF: TokenDiffResult = { entries: [], unchanged: 0 };

interface ChangelogOptions {
	since: string | undefined;
	audience: string;
	format: string;
	/** Commander maps the negatable `--no-history` flag to `history: false`. */
	history: boolean;
}

/** How many entries the appended changelog line's `recent[]` keeps. */
const HISTORY_RECENT_LIMIT = 12;

/** Per-audience severity tally on the changelog history line (C10, M2.3). */
interface ChangelogSeverityCounts {
	breaking: number;
	notable: number;
	minor: number;
}

/** One persisted recent entry on the changelog line. */
interface ChangelogRecentEntry {
	audience: ChangelogAudience;
	severity: ChangelogSeverity;
	source: ChangelogSource;
	title: string;
}

/**
 * One appended changelog history record (read back by `report` for the
 * audience-changelog panel, C10/M2.3). Per-audience severity counts (bucketed by
 * each entry's LITERAL audience — the membership "both counts in both" rule is
 * applied by the report engine off `recent[]`), plus a capped, breaking-first
 * `recent[]` of {audience, severity, source, title}. Mirrors the handoff/impact
 * append pattern; the `at` ISO timestamp is read at the io edge.
 */
interface ChangelogHistoryRecord {
	at: string;
	kind: "changelog";
	since: string;
	designer: ChangelogSeverityCounts;
	developer: ChangelogSeverityCounts;
	both: ChangelogSeverityCounts;
	recent: ChangelogRecentEntry[];
}

/** Injectable dependencies so the command is testable end-to-end. */
export interface ChangelogDeps {
	exec: GitExec;
	/** Build a Figma client from a token; lets tests stub the REST edge. */
	makeClient: (token: string) => FigmaClient;
	env: Record<string, string | undefined>;
	cwd: string;
	now: () => Date;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

/** Real-edge defaults: spawnSync git, a live Figma client, process I/O. */
function defaultDeps(): ChangelogDeps {
	return {
		exec: spawnGitExec,
		makeClient: (token) =>
			createFigmaClient({
				token,
				baseUrl: process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE,
			}),
		env: process.env,
		cwd: processCwd(),
		now: () => new Date(),
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	};
}

/** Map a changelog severity to a terminal color severity. */
function severityFor(severity: ChangelogEntry["severity"]): Severity {
	switch (severity) {
		case "breaking":
			return "error";
		case "notable":
			return "warn";
		case "minor":
			return "info";
	}
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

/** Whether an entry is in scope for the chosen audience (both is always in scope). */
function audienceMatches(
	entry: ChangelogEntry,
	audience: ChangelogAudience,
): boolean {
	if (audience === "both") return true;
	return entry.audience === audience || entry.audience === "both";
}

/** Render the human-readable term report (audience-grouped, severity-colored). */
function renderTerm(
	entries: ChangelogEntry[],
	audience: ChangelogAudience,
	color: boolean,
): string {
	if (entries.length === 0) {
		return "No changes in the selected window.";
	}
	const lines: string[] = [`${entries.length} change(s):`, ""];
	for (const entry of entries) {
		const date = entry.dateIso.slice(0, 10);
		const badge = severityColor(severityFor(entry.severity), entry.severity, {
			color,
		});
		const tag = `[${entry.source}/${entry.audience}]`;
		const detail = entry.detail !== undefined ? ` — ${entry.detail}` : "";
		lines.push(`${date}  ${badge}  ${tag} ${entry.title}${detail}`);
	}
	// Audience filter is reflected only in which entries appear; the header notes it.
	if (audience !== "both") {
		lines.unshift(`(audience: ${audience})`, "");
	}
	return lines.join("\n");
}

/** Fetch labeled-or-not Figma versions, or undefined + a skip/warn note. */
async function fetchVersions(
	deps: ChangelogDeps,
): Promise<{ versions: FigmaVersion[]; note?: string }> {
	const resolved = resolveConfig({ env: deps.env });
	if (resolved.kind !== "ok") {
		return { versions: [], note: `Figma side skipped: ${resolved.message}` };
	}
	const { config } = resolved;
	if (
		config.figmaToken.kind !== "present" ||
		config.figmaFileKey === undefined
	) {
		return {
			versions: [],
			note: "Figma side skipped (no token / file key configured) — code + token changes only.",
		};
	}
	const client = deps.makeClient(config.figmaToken.value);
	const result = await client.getVersions(config.figmaFileKey);
	if (result.kind !== "ok") {
		return {
			versions: [],
			note: `Figma side skipped (API ${result.kind}) — code + token changes only.`,
		};
	}
	return { versions: result.data.versions };
}

/** Breaking-first rank: breaking floats to the front, the rest keep source order. */
function breakingRank(severity: ChangelogSeverity): number {
	return severity === "breaking" ? 0 : 1;
}

/** Tally one entry's severity into its literal-audience bucket. */
function tally(
	counts: ChangelogSeverityCounts,
	severity: ChangelogSeverity,
): void {
	counts[severity] += 1;
}

/**
 * Build the changelog history record from the FULL aggregated entries (audience
 * unfiltered — the panel needs every audience). Per-audience severity counts are
 * bucketed by each entry's literal audience; `recent[]` is breaking-first and
 * capped. The `at` ISO timestamp is read at the io edge (injected `now`).
 */
function buildChangelogHistoryRecord(
	entries: ChangelogEntry[],
	since: string,
	at: string,
): ChangelogHistoryRecord {
	const designer: ChangelogSeverityCounts = {
		breaking: 0,
		notable: 0,
		minor: 0,
	};
	const developer: ChangelogSeverityCounts = {
		breaking: 0,
		notable: 0,
		minor: 0,
	};
	const both: ChangelogSeverityCounts = { breaking: 0, notable: 0, minor: 0 };

	for (const entry of entries) {
		if (entry.audience === "designer") tally(designer, entry.severity);
		else if (entry.audience === "developer") tally(developer, entry.severity);
		else tally(both, entry.severity);
	}

	// recent[]: breaking-first (stable on the aggregate's date-sorted order), capped.
	const recent: ChangelogRecentEntry[] = entries
		.map((entry, order) => ({ entry, order }))
		.sort(
			(a, b) =>
				breakingRank(a.entry.severity) - breakingRank(b.entry.severity) ||
				a.order - b.order,
		)
		.slice(0, HISTORY_RECENT_LIMIT)
		.map(({ entry }) => ({
			audience: entry.audience,
			severity: entry.severity,
			source: entry.source,
			title: entry.title,
		}));

	return {
		at,
		kind: "changelog",
		since,
		designer,
		developer,
		both,
		recent,
	};
}

/**
 * Append ONE changelog history line to <cwd>/.ds-bridge/history.jsonl (the
 * project the user runs `ds-bridge changelog` from, the same place `report`
 * reads). Suppressed by `--no-history`. Mirrors the handoff/impact append.
 */
function appendChangelogHistory(
	deps: ChangelogDeps,
	record: ChangelogHistoryRecord,
): void {
	const stateDir = join(deps.cwd, ".ds-bridge");
	appendHistoryRecord(stateDir, record);
}

/** Execute the changelog command with injected dependencies. */
export async function runChangelog(
	options: ChangelogOptions,
	deps: ChangelogDeps,
): Promise<void> {
	const format = options.format as ChangelogFormat;
	if (format !== "term" && format !== "json" && format !== "md") {
		deps.stderr(
			`Unknown --format "${options.format}". Expected "term", "json", or "md".\n`,
		);
		process.exitCode = 2;
		return;
	}

	const audience = parseAudience(options.audience);
	if (audience.kind !== "ok") {
		deps.stderr(
			`Unknown --audience "${options.audience}". Expected "designers", "developers", or "both".\n`,
		);
		process.exitCode = 2;
		return;
	}

	const since = options.since ?? defaultSince(deps.now());

	// Code side: local git log (offline-friendly, the always-available source).
	const log = readGitLog({ exec: deps.exec, cwd: deps.cwd, since });
	if (log.kind === "git-unavailable") {
		deps.stderr(`Could not run git: ${log.message}\n`);
		process.exitCode = 2;
		return;
	}
	if (log.kind === "not-a-repo") {
		deps.stderr(
			`"${deps.cwd}" is not a git repository (or git failed). Run inside a repo.\n`,
		);
		process.exitCode = 2;
		return;
	}

	// Figma side: optional, skipped gracefully when not configured.
	const { versions, note } = await fetchVersions(deps);
	if (note !== undefined && format === "term") {
		deps.stderr(`${note}\n`);
	}

	const all = aggregateChangelog({
		versions,
		commits: log.commits,
		tokenDiff: EMPTY_TOKEN_DIFF,
		since,
	});
	const entries = all.filter((entry) => audienceMatches(entry, audience.value));

	// History (C10, M2.3): record the audience-segmented changelog from the FULL
	// (audience-unfiltered) entry set for the dashboard panel. Suppressible with
	// `--no-history`. The `at` clock read happens at this io edge (injected `now`).
	if (options.history) {
		appendChangelogHistory(
			deps,
			buildChangelogHistoryRecord(all, since, deps.now().toISOString()),
		);
	}

	if (format === "json") {
		deps.stdout(`${JSON.stringify({ since, entries }, null, 2)}\n`);
	} else if (format === "md") {
		deps.stdout(renderChangelogMarkdown(entries, { audience: audience.value }));
	} else {
		const color = shouldColor(deps.env, Boolean(process.stdout.isTTY));
		deps.stdout(`${renderTerm(entries, audience.value, color)}\n`);
	}

	process.exitCode = 0;
}

/** Register the `changelog` command on the program. Wiring entry for cli.ts. */
export function registerChangelogCommand(program: Command): void {
	program
		.command("changelog")
		.description(
			"Audience-segmented changelog from git log, Figma versions, and token changes",
		)
		.option(
			"--since <date>",
			"include changes since this date (default: 90 days ago)",
		)
		.option("--audience <who>", "designers | developers | both", "both")
		.option("--format <format>", "output format: term | json | md", "term")
		.option(
			"--no-history",
			"do not append a changelog record to .ds-bridge/history.jsonl in the current directory",
		)
		.action((options: ChangelogOptions) => {
			void runChangelog(options, defaultDeps());
		});
}
