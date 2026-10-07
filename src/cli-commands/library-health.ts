// L5 — `ds-bridge library-health [--file-key <key>] [--format term|json]
// [--refresh]` command. Crawls a Figma file's node tree (REST getFile) for
// design-system hygiene signals — override hotspots, deprecated-component usage,
// detached-instance candidates — completing both ends of the bridge for the
// `design` preset (SPEC-library-health §1).
//
// Impure edge: HTTP through the injectable Figma client (FIGMA_API_BASE-
// overridable like impact.ts/handoff.ts) + reads config from the environment +
// reads/writes the L2 response cache. All judgement is delegated to the pure
// engine (assessLibraryHealth). Bad input becomes an exit code + actionable
// stderr, NEVER a thrown stack trace.
//
// SPEC §3/§4 — the crawl is CLI-ONLY (network) and NEVER reachable from a hook.
// The raw getFile response is cached (TTL-stamped) under CLAUDE_PLUGIN_DATA/figma/
// (env set) else <cwd>/.ds-bridge/cache/library-<key>.json (L2): a fresh hit is
// reused; a stale/miss/`--refresh` re-fetches and re-stamps. A rate-limit outcome
// is TOLERATED — warn + use the cache if present, else exit 2. Missing token /
// file key → exit 2 with connect-Figma guidance.
//
// On success → assessLibraryHealth over the (fetched or cached) file → append one
// `library-health` history line (the three TOTALS as counts → the artifact trend)
// + print the term/json report. The line also carries the top-N per-component
// lists (`topN`, `topOverrides`, `topDeprecated`, `topDetached`; `--top`, default
// 10, `0` = counts only) so the dashboard can trend specific components (F2).
//
// Exit codes: 0 success (findings are informational) · 2 config/operational error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, env as processEnv } from "node:process";
import type { Command } from "commander";
import { readProjectConfigText, resolveConfig } from "../config.js";
import {
	assessLibraryHealth,
	capLibraryHealth,
} from "../engines/figma/library-health.js";
import {
	DEFAULT_TOP_N,
	type LibraryHealthTopLists,
	libraryHealthTopLists,
	parseTopN,
} from "../engines/figma/library-health-top.js";
import {
	type CacheEnv,
	type CacheFs,
	cachePath,
	readCache,
	writeCache,
} from "../io/figma/cache.js";
import {
	createFigmaClient,
	type FigmaFile,
	type FigmaResult,
} from "../io/figma/client.js";
import { resolveFileKey } from "../io/figma/file-key.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import {
	renderTable,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";
import {
	figmaAuthErrorMessage,
	missingFigmaTokenMessage,
} from "./figma-auth-help.js";

type LibraryHealthFormat = "json" | "term";

const DEFAULT_FIGMA_API_BASE = "https://api.figma.com";

// The cached getFile response is fresh for an hour — re-crawl only past that or
// on --refresh (SPEC §3 crawl discipline: cached + TTL-stamped, on demand only).
const CACHE_TTL_MS = 60 * 60 * 1000;

interface LibraryHealthOptions {
	fileKey: string | undefined;
	format: string;
	refresh: boolean;
	top: string | undefined;
}

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Guidance shown when no Figma PAT is configured (shared via figma-auth-help). */
function missingTokenMessage(): string {
	return missingFigmaTokenMessage([
		"The token needs the file_content:read scope, and must come from a Dev or",
		"Full seat — a View seat is rate-limited and cannot be used here.",
	]);
}

/** Guidance shown when no Figma library file key is configured. */
function missingFileKeyMessage(): string {
	return [
		"No Figma library file key configured.",
		"",
		"Pass --file-key <key>, set the figma_file_key plugin option, or export it:",
		"",
		"  export CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY=<key>",
		"",
		"The key is the segment after /file/ or /design/ in the library file URL.",
	].join("\n");
}

/** Guidance shown when --file-key names an unknown product alias (M1.3). */
function unknownAliasMessage(
	outcome: { alias: string; suggestions: string[] },
	productFileKeys: Record<string, string>,
): string {
	const aliases = Object.keys(productFileKeys);
	const lines = [`Unknown --file-key alias "${outcome.alias}".`];
	if (outcome.suggestions.length > 0) {
		lines.push(`Did you mean ${outcome.suggestions.join(", ")}?`);
	}
	lines.push(
		"",
		aliases.length > 0
			? `Available product_file_keys aliases: ${aliases.join(", ")}.`
			: "No product_file_keys aliases are configured.",
		"Or pass --file-key <raw-figma-file-key> directly.",
	);
	return lines.join("\n");
}

/** Translate a non-ok Figma client result into an actionable stderr message. */
function clientErrorMessage(
	result: Exclude<FigmaResult<unknown>, { kind: "ok" }>,
): string {
	switch (result.kind) {
		case "auth-error":
			return figmaAuthErrorMessage(result);
		case "scope-error":
			return `Figma token is missing a required scope: ${result.message}. The token needs file_content:read.`;
		case "not-found":
			return "Figma could not find that file. Check the file key is correct and the token's account can access the library.";
		case "rate-limited":
			return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited — use a Dev/Full-seat PAT.`;
		case "network-error":
			return `Could not reach the Figma API: ${result.message}.`;
	}
}

/** A thin node:fs wrapper for the injectable L2 cache (the CLI's io edge). */
const fsAdapter: CacheFs = {
	exists: (path) => existsSync(path),
	read: (path) => readFileSync(path, "utf8"),
	mkdir: (path) => {
		mkdirSync(path, { recursive: true });
	},
	write: (path, content) => {
		writeFileSync(path, content, "utf8");
	},
};

/**
 * One appended library-health history record (read back by `report` for the
 * library-health section — L6). Carries the three TOTALS as counts only (SPEC §3
 * keeps the line lean — the section's bars come from these totals; the lists are
 * reconstructed empty downstream).
 */
interface LibraryHealthHistoryRecord extends Partial<LibraryHealthTopLists> {
	at: string;
	kind: "library-health";
	/** The resolved Figma file key (additive): the hotspots trend follows one file. */
	fileKey: string;
	overrideHotspots: number;
	deprecatedUsage: number;
	detachedCandidates: number;
}

/**
 * Append ONE library-health history line to <cwd>/.ds-bridge/history.jsonl — the
 * project state dir (NOT the cache location), so `report` finds it beside the
 * other history kinds. `at` is read from the system clock at this io edge.
 */
function appendLibraryHealthHistory(
	totals: {
		overrideHotspots: number;
		deprecatedUsage: number;
		detachedCandidates: number;
	},
	lists: LibraryHealthTopLists | undefined,
	fileKey: string,
): void {
	const stateDir = join(cwd(), ".ds-bridge");
	const record: LibraryHealthHistoryRecord = {
		at: new Date().toISOString(),
		kind: "library-health",
		fileKey,
		overrideHotspots: totals.overrideHotspots,
		deprecatedUsage: totals.deprecatedUsage,
		detachedCandidates: totals.detachedCandidates,
		// F2 — the top-N lists (new keys; the counts above stay numbers).
		...(lists !== undefined ? lists : {}),
	};
	appendHistoryRecord(stateDir, record);
}

/** Render the human-readable term report for the three hygiene signals. */
function renderTerm(
	report: ReturnType<typeof assessLibraryHealth>,
	color: boolean,
): string {
	const { totals } = report;
	const clean =
		totals.overrideHotspots === 0 &&
		totals.deprecatedUsage === 0 &&
		totals.detachedCandidates === 0;

	const header = severityColor(
		clean ? "ok" : "warn",
		clean
			? "Library health: no hygiene signals found."
			: "Library health — hygiene signals found (informational).",
		{ color },
	);

	const summary = renderTable(
		["signal", "count"],
		[
			["override hotspots", String(totals.overrideHotspots)],
			["deprecated usage", String(totals.deprecatedUsage)],
			["detached candidates", String(totals.detachedCandidates)],
		],
		{ color },
	);

	const lines = [header, "", summary];

	if (report.overrideHotspots.length > 0) {
		lines.push("", "Top override hotspots:");
		for (const h of report.overrideHotspots) {
			const named =
				h.componentName !== undefined ? ` (${h.componentName})` : "";
			const fields =
				h.fields !== undefined && h.fields.length > 0
					? ` — ${h.fields.join(", ")}`
					: "";
			lines.push(
				`  ${h.name}${named}: ${h.overrideCount} override(s)${fields}`,
			);
		}
	}

	// The detached-candidate caveat is surfaced wherever the number renders —
	// REST cannot truly distinguish a detached instance from a hand-built frame.
	lines.push(
		"",
		`Detached candidates: ${totals.detachedCandidates} — heuristic — REST cannot truly detect detachment; expect false positives.`,
	);

	return lines.join("\n");
}

/** Execute the `library-health` command. */
async function runLibraryHealth(options: LibraryHealthOptions): Promise<void> {
	const format = options.format as LibraryHealthFormat;
	if (format !== "json" && format !== "term") {
		fail(`Unknown --format "${options.format}". Expected "json" or "term".`);
		return;
	}
	const topN =
		options.top === undefined ? DEFAULT_TOP_N : parseTopN(options.top);
	if (topN === undefined) {
		fail(
			`Invalid --top "${options.top}". Expected a whole number from 0 to 100 (0 = counts only).`,
		);
		return;
	}

	// Read the project file so `product_file_keys` aliases are available to the
	// generalized --file-key resolver (M1.3); env still merges its own aliases.
	const projectFileText = readProjectConfigText(cwd());
	const resolved = resolveConfig({
		env: process.env,
		...(projectFileText !== undefined ? { projectFileText } : {}),
	});
	if (resolved.kind !== "ok") {
		fail(resolved.message);
		return;
	}
	for (const warning of resolved.warnings) {
		process.stderr.write(`warning: ${warning}\n`);
	}
	const { config } = resolved;

	if (config.figmaToken.kind === "missing") {
		fail(missingTokenMessage());
		return;
	}
	// Generalized --file-key (M1.3): accept a raw key OR a product_file_keys
	// alias; precedence flag (alias-resolved, else raw) > figma_file_key default.
	const fileKeyOutcome = resolveFileKey({
		...(options.fileKey !== undefined ? { flagValue: options.fileKey } : {}),
		productFileKeys: config.productFileKeys,
		...(config.figmaFileKey !== undefined
			? { defaultKey: config.figmaFileKey }
			: {}),
	});
	if (fileKeyOutcome.kind === "unknown-alias") {
		fail(unknownAliasMessage(fileKeyOutcome, config.productFileKeys));
		return;
	}
	if (fileKeyOutcome.kind === "missing") {
		fail(missingFileKeyMessage());
		return;
	}
	const fileKey = fileKeyOutcome.key;

	// Build the cache env conditionally so `exactOptionalPropertyTypes` keeps an
	// unset CLAUDE_PLUGIN_DATA genuinely-absent (the L2 fallback path triggers).
	const cacheEnv: CacheEnv =
		processEnv.CLAUDE_PLUGIN_DATA !== undefined
			? { CLAUDE_PLUGIN_DATA: processEnv.CLAUDE_PLUGIN_DATA }
			: {};
	const cacheArgs = {
		key: fileKey,
		env: cacheEnv,
		cwd: cwd(),
	};

	// 1) Try the cache first (unless --refresh forces a re-crawl). A fresh hit is
	//    used verbatim and skips the network entirely.
	let file: FigmaFile | undefined;
	if (!options.refresh) {
		const cached = readCache({
			...cacheArgs,
			fs: fsAdapter,
			now: Date.now(),
			ttlMs: CACHE_TTL_MS,
		});
		if (cached.kind === "hit") {
			file = cached.data as FigmaFile;
		}
	}

	// 2) Stale / miss / --refresh → fetch. A rate-limit is tolerated: fall back to
	//    a stale-but-present cache if one exists, else exit 2.
	if (file === undefined) {
		const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE;
		const client = createFigmaClient({
			token: config.figmaToken.value,
			baseUrl,
		});
		const result = await client.getFile(fileKey);

		if (result.kind === "ok") {
			file = result.data;
			// Cache the raw response (best-effort; writeCache swallows fs failures).
			writeCache({
				...cacheArgs,
				fs: fsAdapter,
				now: Date.now(),
				data: result.data,
			});
		} else if (result.kind === "rate-limited") {
			process.stderr.write(`warning: ${clientErrorMessage(result)}\n`);
			// Tolerate the rate-limit: serve the cached copy if there is one (ignore
			// its TTL — a stale crawl beats no crawl), else exit 2.
			const fallback = existsSync(cachePath(cacheArgs))
				? readCache({
						...cacheArgs,
						fs: fsAdapter,
						now: Date.now(),
						// A huge TTL so any present envelope counts as a hit.
						ttlMs: Number.MAX_SAFE_INTEGER,
					})
				: { kind: "miss" as const };
			if (fallback.kind === "hit") {
				file = fallback.data as FigmaFile;
			} else {
				process.exitCode = 2;
				return;
			}
		} else {
			fail(clientErrorMessage(result));
			return;
		}
	}

	// 3) Assess the (fetched or cached) file ONCE, uncapped — pure, never throws.
	//    The printed report is its capped view; the history lists group from the
	//    full one (one walk of a large library document instead of two).
	const full = assessLibraryHealth(file, { cap: Number.POSITIVE_INFINITY });
	const report = capLibraryHealth(full);

	// 4) Append the history line for the dashboard trends: the counts (L6) plus,
	//    unless --top 0, the per-component top-N lists (F2).
	const lists = topN > 0 ? libraryHealthTopLists(full, topN) : undefined;
	appendLibraryHealthHistory(report.totals, lists, fileKey);

	// 5) Emit the report.
	if (format === "json") {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		process.stdout.write(`${renderTerm(report, color)}\n`);
	}

	process.exitCode = 0;
}

/** Register the `library-health` command on the program. Wiring entry for cli.ts. */
export function registerLibraryHealthCommand(program: Command): void {
	program
		.command("library-health")
		.description(
			"Crawl a Figma file for design-system hygiene signals (override hotspots, deprecated usage, detached-instance candidates)",
		)
		.option(
			"--file-key <keyOrAlias>",
			"Figma file key OR a product_file_keys alias (overrides config)",
		)
		.option("--format <format>", "output format: term | json", "term")
		.option("--refresh", "bypass the response cache and re-crawl", false)
		.option(
			"--top <n>",
			"store the top N components per signal in history for trends (0-100, 0 = counts only; default 10)",
		)
		.action((options: LibraryHealthOptions) => {
			void runLibraryHealth(options);
		});
}
