// T7.9 — `ds-bridge impact` command. Breaking-change radar: poll the Figma
// library on demand, diff the current published-component inventory against the
// last-seen snapshot (the version cursor), classify each change breaking |
// additive | cosmetic, and map breaking/affected components to their code call
// sites via the registry.
//
// Impure edge: HTTP through the injectable Figma client (FIGMA_API_BASE-
// overridable like handoff.ts/registry.ts) + reads config from the environment +
// reads/writes the cursor cache + (optionally) ts-morph-scans the project. All
// judgement is delegated to the pure engines (scan-figma, component-diff) and the
// usage mapper. Bad input becomes an exit code + actionable stderr, never a
// thrown stack trace.
//
// SPEC §11.3 — impact polls ON DEMAND ONLY. Network polling NEVER runs in a hook.
//
// Baseline model (v2): the cursor stores the last-seen component SNAPSHOT (the
// built FigmaComponentModel[]) alongside the version id, so the diff is simply
// `cached snapshot vs fresh fetch`. The very first run (no cursor, no --since)
// has nothing to diff against: it captures a baseline, writes the cursor, exit 0.
// `capturedAt` is read from the system clock HERE, at the io edge — the engines
// stay clock-free.
//
// Cursor location: $CLAUDE_PLUGIN_DATA/impact-cursor.json when that env is set
// (rebuildable cache that survives plugin updates, SPEC §1), else the project
// fallback <cwd>/.ds-bridge/cache/impact-cursor.json.
//
// Exit codes (lint convention, SPEC §11.7):
//   0  no breaking changes (clean, or baseline captured)
//   1  one or more breaking changes found
//   2  operational error (missing token / file key, API error, bad flag)
//
// NO history.jsonl writing and NO dashboard/HTML — that is the shared T7.22 task.
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { cwd, env as processEnv } from "node:process";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import {
	type ComponentDiff,
	diffComponents,
} from "../engines/impact/component-diff.js";
import type { ComponentUsage } from "../engines/impact/usage.js";
import type { RegistryFile } from "../engines/registry/persist.js";
import {
	buildFigmaComponentModel,
	type FigmaComponentModel,
} from "../engines/registry/scan-figma.js";
import { createFigmaClient, type FigmaResult } from "../io/figma/client.js";
import { resolveFileKey } from "../io/figma/file-key.js";
import {
	renderTable,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";

type ImpactFormat = "json" | "term";

const DEFAULT_FIGMA_API_BASE = "https://api.figma.com";

interface ImpactOptions {
	since: string | undefined;
	fileKey: string | undefined;
	format: string;
}

/** The version cursor persisted between runs (a rebuildable cache). */
interface ImpactCursor {
	fileKey: string;
	/** The newest file versionId observed at capture time. */
	versionId: string;
	/** ISO timestamp — read from the system clock at this io edge. */
	capturedAt: string;
	/** The last-seen component inventory (built models), the diff baseline. */
	snapshot: FigmaComponentModel[];
}

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Guidance shown when no Figma PAT is configured (mirrors handoff/registry). */
function missingTokenMessage(): string {
	return [
		"No Figma personal access token configured.",
		"",
		"Set one via the plugin config dialog (stored in the system keychain) or,",
		"for standalone CLI use, export FIGMA_TOKEN with a Dev/Full-seat PAT:",
		"",
		"  export FIGMA_TOKEN=figd_your_token_here",
		"",
		"The token needs the library_content:read and file_versions:read scopes, and",
		"must come from a Dev or Full seat — a View seat is rate-limited and cannot",
		"be used here.",
	].join("\n");
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
			return "Figma rejected the token (auth error). Check that FIGMA_TOKEN is a valid Dev/Full-seat personal access token.";
		case "scope-error":
			return `Figma token is missing a required scope: ${result.message}. The token needs library_content:read and file_versions:read.`;
		case "not-found":
			return "Figma could not find that file. Check the file key is correct and the token's account can access the library.";
		case "rate-limited":
			return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited — use a Dev/Full-seat PAT.`;
		case "network-error":
			return `Could not reach the Figma API: ${result.message}.`;
	}
}

/** Read <cwd>/.ds-bridge.json text (for product_file_keys), or undefined when absent. */
function readProjectConfigText(): string | undefined {
	const configPath = join(cwd(), ".ds-bridge.json");
	if (!existsSync(configPath)) return undefined;
	try {
		return readFileSync(configPath, "utf8");
	} catch {
		return undefined;
	}
}

/** Resolve the cursor file path: CLAUDE_PLUGIN_DATA when set, else cwd fallback. */
function cursorPath(): string {
	const dataDir = processEnv.CLAUDE_PLUGIN_DATA;
	if (dataDir !== undefined && dataDir !== "") {
		return join(dataDir, "impact-cursor.json");
	}
	return join(cwd(), ".ds-bridge", "cache", "impact-cursor.json");
}

/** Read + parse the saved cursor, or undefined when absent/unreadable/invalid. */
function readCursor(path: string): ImpactCursor | undefined {
	if (!existsSync(path)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as ImpactCursor;
		if (!Array.isArray(parsed.snapshot)) return undefined;
		return parsed;
	} catch {
		return undefined;
	}
}

/** Write the cursor to disk (creating parent dirs). Returns false on failure. */
function writeCursor(path: string, cursor: ImpactCursor): boolean {
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(cursor, null, 2)}\n`, "utf8");
		return true;
	} catch {
		return false;
	}
}

/** Load the project registry (for usage mapping), or undefined when absent. */
function loadRegistry(): RegistryFile | undefined {
	const registryPath = join(cwd(), ".ds-bridge", "registry.json");
	if (!existsSync(registryPath)) return undefined;
	try {
		return JSON.parse(readFileSync(registryPath, "utf8")) as RegistryFile;
	} catch {
		return undefined;
	}
}

/**
 * Map the changed Figma component names to code call sites via the registry +
 * ts-morph. Deferred import: ts-morph references CJS globals during its eager
 * module init that the single-file ESM bundle leaves undefined, so we backfill
 * __filename/__dirname (mirrors registry.ts) and only load it on this path.
 */
async function mapChangedUsage(
	registry: RegistryFile,
	changedFigmaNames: string[],
): Promise<ComponentUsage[]> {
	const globals = globalThis as Record<string, unknown>;
	if (typeof globals.__filename !== "string") {
		const filename = fileURLToPath(import.meta.url);
		globals.__filename = filename;
		globals.__dirname = dirname(filename);
	}
	const { mapUsage } = await import("../engines/impact/usage.js");
	return mapUsage({ registry, changedFigmaNames, projectDir: cwd() });
}

/** Every changed (non-cosmetic-only) Figma name worth mapping to code. */
function changedNames(diff: ComponentDiff): string[] {
	const names: string[] = [];
	for (const removed of diff.removed) names.push(removed.name);
	for (const renamed of diff.renamed) names.push(renamed.fromName);
	for (const changed of diff.changed) names.push(changed.name);
	for (const added of diff.added) names.push(added.name);
	return names;
}

/** True when any diff entry is classified breaking. */
function hasBreaking(diff: ComponentDiff): boolean {
	if (diff.removed.length > 0) return true;
	if (diff.renamed.length > 0) return true;
	return diff.changed.some((c) => c.impact === "breaking");
}

/**
 * One appended impact history record (read back by `report` for the
 * change-impact section — T7.22). Counts per classification + blast radius.
 */
interface ImpactHistoryRecord {
	at: string;
	kind: "impact";
	breaking: number;
	additive: number;
	cosmetic: number;
	touchedCallSites: number;
}

/** Tally every diff entry by its classification. */
function countByImpact(
	diff: ComponentDiff,
): Pick<ImpactHistoryRecord, "breaking" | "additive" | "cosmetic"> {
	const counts = { breaking: 0, additive: 0, cosmetic: 0 };
	const all = [
		...diff.added,
		...diff.removed,
		...diff.renamed,
		...diff.changed,
	];
	for (const entry of all) {
		if (entry.impact === "breaking") counts.breaking += 1;
		else if (entry.impact === "additive") counts.additive += 1;
		else counts.cosmetic += 1;
	}
	return counts;
}

/**
 * Append ONE impact history line to <targetDir>/.ds-bridge/history.jsonl.
 * Only diff runs append — a baseline capture has nothing to report yet.
 */
function appendImpactHistory(
	targetDir: string,
	diff: ComponentDiff,
	usageByName: Map<string, ComponentUsage>,
): void {
	const stateDir = join(targetDir, ".ds-bridge");
	let touchedCallSites = 0;
	for (const usage of usageByName.values()) {
		touchedCallSites += usage.usages.length;
	}
	const record: ImpactHistoryRecord = {
		at: new Date().toISOString(),
		kind: "impact",
		...countByImpact(diff),
		touchedCallSites,
	};
	mkdirSync(stateDir, { recursive: true });
	appendFileSync(
		join(stateDir, "history.jsonl"),
		`${JSON.stringify(record)}\n`,
		"utf8",
	);
}

interface DiffRow {
	component: string;
	/**
	 * The name the usage map is keyed by (T7.24): for renamed rows the OLD
	 * figma name — the registry knows components by their pre-rename name.
	 */
	lookupName: string;
	category: string;
	impact: string;
	detail: string;
}

/** Flatten the diff into display rows (one per change), worst-first by impact. */
function diffRows(diff: ComponentDiff): DiffRow[] {
	const rows: DiffRow[] = [];
	for (const r of diff.removed) {
		rows.push({
			component: r.name,
			lookupName: r.name,
			category: "removed",
			impact: r.impact,
			detail: "component removed from the library",
		});
	}
	for (const r of diff.renamed) {
		rows.push({
			component: r.toName,
			lookupName: r.fromName,
			category: "renamed",
			impact: r.impact,
			detail: `renamed from "${r.fromName}"`,
		});
	}
	for (const c of diff.changed) {
		const parts: string[] = [];
		if (c.descriptionChanged) parts.push("description changed");
		for (const vc of c.variantChanges) {
			if (vc.kind === "axis-added") parts.push(`+axis ${vc.axis}`);
			else if (vc.kind === "axis-removed") parts.push(`-axis ${vc.axis}`);
			else if (vc.kind === "value-added") parts.push(`+${vc.axis}=${vc.value}`);
			else parts.push(`-${vc.axis}=${vc.value}`);
		}
		rows.push({
			component: c.name,
			lookupName: c.name,
			category: "changed",
			impact: c.impact,
			detail: parts.join(", "),
		});
	}
	for (const a of diff.added) {
		rows.push({
			component: a.name,
			lookupName: a.name,
			category: "added",
			impact: a.impact,
			detail: "new component",
		});
	}
	const rank: Record<string, number> = {
		breaking: 0,
		additive: 1,
		cosmetic: 2,
	};
	rows.sort((x, y) => {
		const byImpact = (rank[x.impact] ?? 9) - (rank[y.impact] ?? 9);
		return byImpact !== 0
			? byImpact
			: x.component < y.component
				? -1
				: x.component > y.component
					? 1
					: 0;
	});
	return rows;
}

/** Render the human-readable term report. */
function renderTerm(
	diff: ComponentDiff,
	usageByName: Map<string, ComponentUsage>,
	registryPresent: boolean,
	color: boolean,
): string {
	const rows = diffRows(diff);
	if (rows.length === 0) {
		return severityColor(
			"ok",
			"No component changes since the last snapshot.",
			{
				color,
			},
		);
	}

	const breaking = hasBreaking(diff);
	const header = severityColor(
		breaking ? "error" : "ok",
		breaking
			? `${rows.length} change(s) — BREAKING changes found.`
			: `${rows.length} change(s) — no breaking changes.`,
		{ color },
	);

	const tableRows = rows.map((row) => {
		const usage = usageByName.get(row.lookupName);
		const sites = usage?.count ?? 0;
		const touches = registryPresent
			? sites > 0
				? `touches ${sites} call site${sites === 1 ? "" : "s"}`
				: "no call sites"
			: "—";
		const sev =
			row.impact === "breaking"
				? "error"
				: row.impact === "additive"
					? "warn"
					: "info";
		return [
			severityColor(sev, row.impact, { color }),
			row.category,
			row.component,
			row.detail,
			touches,
		];
	});
	const table = renderTable(
		["impact", "category", "component", "detail", "code"],
		tableRows,
		{ color },
	);

	const lines = [header, "", table];
	if (!registryPresent) {
		lines.push(
			"",
			'No .ds-bridge/registry.json found — run "ds-bridge registry build" to map changes to code call sites.',
		);
	}
	return lines.join("\n");
}

/** Execute the `impact` command. */
async function runImpact(options: ImpactOptions): Promise<void> {
	const format = options.format as ImpactFormat;
	if (format !== "json" && format !== "term") {
		fail(`Unknown --format "${options.format}". Expected "json" or "term".`);
		return;
	}

	// Read the project file so `product_file_keys` aliases are available to the
	// generalized --file-key resolver (M1.3); env still merges its own aliases.
	const projectFileText = readProjectConfigText();
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

	const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE;
	const client = createFigmaClient({ token: config.figmaToken.value, baseUrl });

	// Fresh fetch: published components + versions.
	const componentsResult = await client.getComponents(fileKey);
	if (componentsResult.kind !== "ok") {
		fail(clientErrorMessage(componentsResult));
		return;
	}
	const versionsResult = await client.getVersions(fileKey);
	if (versionsResult.kind !== "ok") {
		fail(clientErrorMessage(versionsResult));
		return;
	}

	const freshSnapshot = buildFigmaComponentModel({
		published: componentsResult.data,
	});
	const newestVersionId = versionsResult.data.versions[0]?.id ?? "";

	// The single io-edge clock read — engines stay clock-free.
	const capturedAt = new Date().toISOString();
	const path = cursorPath();
	const cursor = readCursor(path);

	// Baseline: no cursor and no --since means there is nothing to diff against.
	// `--since` is recorded for provenance; v2's diff baseline is the cached
	// snapshot (the REST API offers no per-version component inventory), so a
	// --since with no cached snapshot still captures a baseline.
	const haveBaseline = cursor !== undefined && cursor.fileKey === fileKey;

	const nextCursor: ImpactCursor = {
		fileKey,
		versionId: newestVersionId,
		capturedAt,
		snapshot: freshSnapshot,
	};

	if (!haveBaseline) {
		if (!writeCursor(path, nextCursor)) {
			fail(`Could not write the impact cursor to "${path}".`);
			return;
		}
		const sinceNote =
			options.since !== undefined
				? ` (--since ${options.since} noted; v2 diffs against the cached snapshot)`
				: "";
		if (format === "json") {
			process.stdout.write(
				`${JSON.stringify(
					{
						baseline: true,
						breaking: false,
						fileKey,
						versionId: newestVersionId,
						componentCount: freshSnapshot.length,
					},
					null,
					2,
				)}\n`,
			);
		} else {
			process.stdout.write(
				`Captured a baseline snapshot of ${freshSnapshot.length} component(s)${sinceNote}.\nRun "ds-bridge impact" again after library changes to see the diff.\n`,
			);
		}
		process.exitCode = 0;
		return;
	}

	// Diff the cached snapshot against the fresh fetch (pure).
	const diff = diffComponents(cursor.snapshot, freshSnapshot);
	const breaking = hasBreaking(diff);

	// Usage mapping (best-effort): only when a registry exists.
	const registry = loadRegistry();
	const usageByName = new Map<string, ComponentUsage>();
	if (registry !== undefined) {
		const usages = await mapChangedUsage(registry, changedNames(diff));
		for (const usage of usages) usageByName.set(usage.figmaName, usage);
	}

	if (format === "json") {
		const usageList = [...usageByName.values()];
		process.stdout.write(
			`${JSON.stringify(
				{
					baseline: false,
					breaking,
					fileKey,
					fromVersionId: cursor.versionId,
					toVersionId: newestVersionId,
					diff,
					usage: usageList,
					registryPresent: registry !== undefined,
				},
				null,
				2,
			)}\n`,
		);
	} else {
		const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
		process.stdout.write(
			`${renderTerm(diff, usageByName, registry !== undefined, color)}\n`,
		);
	}

	// History line for the dashboard (diff runs only) — T7.22. Lands in the
	// project's .ds-bridge (cwd), NOT the cursor cache location, so `report`
	// finds it alongside the other history kinds.
	appendImpactHistory(cwd(), diff, usageByName);

	// Advance the cursor after a successful run (write after reporting).
	if (!writeCursor(path, nextCursor)) {
		process.stderr.write(
			`warning: could not update the impact cursor at "${path}".\n`,
		);
	}

	process.exitCode = breaking ? 1 : 0;
}

/** Register the `impact` command on the program. Wiring entry for cli.ts. */
export function registerImpactCommand(program: Command): void {
	program
		.command("impact")
		.description(
			"Detect breaking Figma library changes since the last snapshot and map them to code",
		)
		.option(
			"--since <versionId>",
			"note a baseline version id (v2 diffs against the cached snapshot)",
		)
		.option(
			"--file-key <keyOrAlias>",
			"Figma file key OR a product_file_keys alias (overrides config)",
		)
		.option("--format <format>", "output format: term | json", "term")
		.action((options: ImpactOptions) => {
			void runImpact(options);
		});
}
