// T5.4 — `ds-bridge registry build|resolve` command group.
// Impure edge: scans the code side (ts-morph, via scan-code), fetches the Figma
// side over REST (the injectable client, FIGMA_API_BASE-overridable like
// handoff.ts), runs the pure matcher, then persists `.ds-bridge/registry.json`.
// `resolve` reads that file back and answers a node name/id query.
//
// All judgement is delegated to the pure engines (scan-figma, match, persist);
// every bad-input path becomes an exit code + actionable stderr, never a thrown
// stack trace. The single `generatedAt` ISO timestamp is read here, at the io
// edge — never inside the pure persist module.
//
// Exit codes:
//   build   — 0 success (even when components are unmatched: that's
//             informational) · 2 operational error (bad path, missing token /
//             file key, Figma API failure, unwritable registry).
//   resolve — 0 confident match · 1 candidates OR not-found · 2 operational
//             error (missing registry → "run registry build first", bad path).
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, posix, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { readProjectConfigText, resolveConfig } from "../config.js";
import { matchComponents, type PinnedPair } from "../engines/registry/match.js";
import {
	buildParity,
	type ParityHistoryRecord,
	parityHistoryRecord,
} from "../engines/registry/parity.js";
import {
	type RegistryFile,
	resolveEntry,
	toRegistryFile,
} from "../engines/registry/persist.js";
import type { CodeComponent } from "../engines/registry/scan-code.js";
import { buildFigmaComponentModel } from "../engines/registry/scan-figma.js";
import { readCodeConnectPins } from "../io/code-connect.js";
import type { ComponentPaths } from "../io/component-paths.js";
import { createFigmaClient, type FigmaResult } from "../io/figma/client.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import {
	figmaAuthErrorMessage,
	missingFigmaTokenMessage,
} from "./figma-auth-help.js";

/**
 * Scan the code side via ts-morph. The import is deferred so ts-morph (whose
 * bundled TypeScript references the CJS globals `__filename`/`__dirname` during
 * its eager module init) is only evaluated by the `build` path — never at CLI
 * load, which would crash every command in the single-file ESM bundle. Before
 * resolving the import we backfill those globals from `import.meta.url`, which
 * the bundle's ESM scope otherwise leaves undefined.
 */
async function scanCode(
	targetDir: string,
	configuredPaths: string[] | undefined,
): Promise<{ code: CodeComponent[]; scope: ComponentPaths | undefined }> {
	const globals = globalThis as Record<string, unknown>;
	if (typeof globals.__filename !== "string") {
		const filename = fileURLToPath(import.meta.url);
		globals.__filename = filename;
		globals.__dirname = dirname(filename);
	}
	const [{ scanCodeComponents }, { resolveComponentPaths }] = await Promise.all(
		[
			import("../engines/registry/scan-code.js"),
			import("../io/component-paths.js"),
		],
	);
	const scope = resolveComponentPaths(targetDir, configuredPaths);
	if (scope === undefined) {
		// Screens and routes compose the design system; they are not part of it.
		const code = scanCodeComponents(targetDir).filter(
			(component) =>
				!component.importPath
					.split("/")
					.slice(0, -1)
					.some((segment) => PAGE_DIRS.has(segment)),
		);
		return { code, scope };
	}
	// Scan each design-system directory; import paths stay project-relative.
	const code = scope.paths.flatMap((dir) =>
		scanCodeComponents(join(targetDir, dir)).map((component) => ({
			...component,
			importPath: posix.join(dir.split(sep).join("/"), component.importPath),
		})),
	);
	code.sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : byPath(a, b),
	);
	return { code, scope };
}

/** Package components the project imports, named like a wanted Figma component. */
async function scanPackages(
	targetDir: string,
	wanted: ReadonlySet<string>,
): Promise<CodeComponent[]> {
	if (wanted.size === 0) return [];
	const { scanPackageComponents } = await import(
		"../engines/registry/scan-code.js"
	);
	return scanPackageComponents(targetDir, wanted);
}

function byPath(a: CodeComponent, b: CodeComponent): number {
	return a.importPath < b.importPath ? -1 : a.importPath > b.importPath ? 1 : 0;
}

const DEFAULT_FIGMA_API_BASE = "https://api.figma.com";

/**
 * Without component_paths, the folders Code Connect points at are the design
 * system: SDS connects `src/ui/**`, so its data providers, examples and app
 * pages are not reported as custom components. Unchanged without pins.
 */
function scopeByCodeConnect(
	code: CodeComponent[],
	pins: readonly PinnedPair[],
): { code: CodeComponent[]; scope: ComponentPaths | undefined } {
	if (pins.length === 0) return { code, scope: undefined };
	const pinned = new Set(pins.map((p) => p.codeName));
	const roots = [
		...new Set(
			code
				.filter((c) => pinned.has(c.name))
				.map((c) => {
					const dirs = c.importPath.split("/").slice(0, -1);
					return dirs.slice(0, Math.min(2, dirs.length)).join("/");
				}),
		),
	].sort();
	if (roots.length === 0) return { code, scope: undefined };
	const inRoot = (c: CodeComponent) =>
		roots.some((r) => r === "" || c.importPath.startsWith(`${r}/`));
	return {
		code: code.filter(inRoot),
		scope: { paths: roots, source: "code-connect" },
	};
}

/** App page folders a whole-project component scan leaves out. */
const PAGE_DIRS = new Set(["pages", "screens", "views", "routes"]);

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Guidance shown when no Figma PAT is configured (shared via figma-auth-help). */
function missingTokenMessage(): string {
	return missingFigmaTokenMessage([
		"The token needs the file_content:read and library_content:read scopes, and",
		"must come from a Dev or Full seat — a View seat is rate-limited and cannot",
		"be used here.",
	]);
}

/** Guidance shown when no Figma library file key is configured. */
function missingFileKeyMessage(): string {
	return [
		"No Figma library file key configured.",
		"",
		"Set the figma_file_key plugin option, or for standalone CLI use export it:",
		"",
		"  export CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY=<key>",
		"",
		"The key is the segment after /file/ or /design/ in the library file URL.",
	].join("\n");
}

/** Translate a non-ok Figma client result into an actionable stderr message. */
function clientErrorMessage(
	result: Exclude<FigmaResult<unknown>, { kind: "ok" }>,
): string {
	switch (result.kind) {
		case "auth-error":
			return figmaAuthErrorMessage(result);
		case "scope-error":
			return `Figma token is missing a required scope: ${result.message}. The token needs file_content:read and library_content:read.`;
		case "not-found":
			return "Figma could not find that file. Check figma_file_key is correct and the token's account can access the library.";
		case "rate-limited":
			return `Figma rate-limited the request (retry after ~${result.retryAfterSeconds}s). View-seat tokens are heavily limited — use a Dev/Full-seat PAT.`;
		case "network-error":
			return `Could not reach the Figma API: ${result.message}.`;
	}
}

interface BuildOptions {
	format: string;
}

/** Execute `registry build [path]`. */
async function runBuild(path: string, options: BuildOptions): Promise<void> {
	const format = options.format;
	if (format !== "json" && format !== "term") {
		fail(`Unknown --format "${options.format}". Expected "json" or "term".`);
		return;
	}

	const targetDir = resolvePath(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return;
	}

	const projectFileText = readProjectConfigText(targetDir);
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
	// PRIVILEGED: registry build binds to the singular `figma_file_key` home
	// library ONLY — it deliberately does NOT go through the generalized,
	// alias-aware --file-key resolver (M1.3). The registry is a stateful artifact
	// keyed to the DS library; a product `product_file_keys` alias must never
	// hijack it (SPEC-personas §6.3 — the library key stays privileged for
	// stateful ops; impact's version cursor keys on it for the same reason).
	if (config.figmaFileKey === undefined || config.figmaFileKey === "") {
		fail(missingFileKeyMessage());
		return;
	}

	// Code side: ts-morph scan (never throws; weird files are skipped).
	const scanned = await scanCode(targetDir, config.componentPaths);
	// Code Connect pairings the project declared: ground truth for the match,
	// and — when no component_paths narrow the scan — where the system lives.
	const pins = readCodeConnectPins(targetDir);
	const { code, scope } =
		scanned.scope === undefined
			? scopeByCodeConnect(scanned.code, pins)
			: scanned;

	// Figma side: published components + file document over REST.
	const baseUrl = process.env.FIGMA_API_BASE ?? DEFAULT_FIGMA_API_BASE;
	const client = createFigmaClient({
		token: config.figmaToken.value,
		baseUrl,
	});

	const componentsResult = await client.getComponents(config.figmaFileKey);
	if (componentsResult.kind !== "ok") {
		fail(clientErrorMessage(componentsResult));
		return;
	}

	const fileResult = await client.getFile(config.figmaFileKey);
	if (fileResult.kind !== "ok") {
		fail(clientErrorMessage(fileResult));
		return;
	}

	const figma = buildFigmaComponentModel({
		published: componentsResult.data,
		fileDocument: fileResult.data.document,
		...(fileResult.data.components !== undefined
			? { fileComponents: fileResult.data.components }
			: {}),
		...(fileResult.data.componentSets !== undefined
			? { fileComponentSets: fileResult.data.componentSets }
			: {}),
	});

	// Components consumed from a design-system package (`@primer/react`) are
	// the code side of Figma components no local file implements.
	const normalize = (name: string) =>
		name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
	const local = new Set(code.map((c) => normalize(c.name)));
	const wanted = new Set(
		figma.map((f) => normalize(f.name)).filter((n) => !local.has(n)),
	);
	const packaged = await scanPackages(targetDir, wanted);
	const matchResult = matchComponents([...code, ...packaged], figma, { pins });

	// The single io-edge clock read — the persist engine stays pure.
	const generatedAt = new Date().toISOString();
	const registry = toRegistryFile(matchResult, generatedAt);

	const stateDir = join(targetDir, ".ds-bridge");
	const registryPath = join(stateDir, "registry.json");
	try {
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(
			registryPath,
			`${JSON.stringify(registry, null, 2)}\n`,
			"utf8",
		);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not write registry to "${registryPath}": ${detail}`);
		return;
	}

	// Parity history line (C3, M2.1): the directory-scoped figma↔code match scored
	// into a dated `parity` line, reusing the io-edge `generatedAt` clock read.
	// Both formats append it; the term summary also names the score.
	const parityRecord = parityRecordFrom(registry, generatedAt);
	appendParityHistory(stateDir, parityRecord);

	if (format === "json") {
		process.stdout.write(`${JSON.stringify(registry, null, 2)}\n`);
	} else {
		process.stdout.write(
			`${renderBuildSummary(registry, registryPath, parityRecord, scope)}\n`,
		);
	}

	// Unmatched entries are informational — the build itself succeeded.
	process.exitCode = 0;
}

/** Project a registry into the parity counts + persisted pass pct (C3). */
function parityRecordFrom(
	registry: RegistryFile,
	generatedAt: string,
): ParityHistoryRecord {
	return parityHistoryRecord(buildParity(registry).summary, generatedAt);
}

/**
 * Append ONE parity history line to <stateDir>/history.jsonl (C3, M2.1). The
 * directory-scoped registry is the figma↔code match, so `registry build` is the
 * impure edge that owns the parity append (the `at` clock read happens at the
 * caller's io edge; this stays a plain write). Fail-quiet on a write error — a
 * built registry must not be undone by a history-append hiccup.
 */
function appendParityHistory(
	stateDir: string,
	record: ParityHistoryRecord,
): void {
	try {
		appendHistoryRecord(stateDir, record);
	} catch {
		// Non-fatal: the registry itself was already written successfully.
	}
}

/** The worst ambiguities: unmatched entries whose top candidate scored highest. */
function worstAmbiguities(registry: RegistryFile): string[] {
	const lines: string[] = [];
	const ranked = [...registry.unmatchedCode]
		.map((u) => ({
			name: u.name,
			top: u.candidates[0],
		}))
		.filter((u) => u.top !== undefined)
		.sort((a, b) => (b.top?.score ?? 0) - (a.top?.score ?? 0))
		.slice(0, 3);
	for (const entry of ranked) {
		const top = entry.top;
		if (top === undefined) continue;
		lines.push(
			`  ${entry.name} — closest: ${top.figmaName} (${top.nodeId}) @ ${top.score}`,
		);
	}
	return lines;
}

/** Human-readable terminal summary for a completed build. */
function renderBuildSummary(
	registry: RegistryFile,
	registryPath: string,
	parity: ParityHistoryRecord,
	scope: ComponentPaths | undefined,
): string {
	const lines = [
		`Registry written to ${registryPath}`,
		`  scanned:        ${
			scope === undefined
				? "the whole project, minus page folders (pages/, screens/, views/, routes/) — set component_paths in .ds-bridge.json to narrow it"
				: `${scope.paths.join(", ")} (${scope.source === "code-connect" ? "the folders your Code Connect files map" : scope.source})`
		}`,
		`  matched:        ${registry.matches.length}`,
		`  unmatched code: ${registry.unmatchedCode.length}`,
		`  unmatched figma:${registry.unmatchedFigma.length}`,
		`  parity score: ${parity.score} (${parity.ok}/${parity.total})`,
	];
	const ambiguities = worstAmbiguities(registry);
	if (ambiguities.length > 0) {
		lines.push("", "Closest near-misses:", ...ambiguities);
	}
	return lines.join("\n");
}

/** Read + parse the saved registry, or undefined with an exit code already set. */
function loadRegistry(targetDir: string): RegistryFile | undefined {
	const registryPath = join(targetDir, ".ds-bridge", "registry.json");
	if (!existsSync(registryPath)) {
		fail(
			`No registry found at "${registryPath}". Run "ds-bridge registry build" first.`,
		);
		return undefined;
	}
	let raw: string;
	try {
		raw = readFileSync(registryPath, "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not read registry "${registryPath}": ${detail}`);
		return undefined;
	}
	try {
		return JSON.parse(raw) as RegistryFile;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Registry "${registryPath}" is not valid JSON: ${detail}`);
		return undefined;
	}
}

/** Execute `registry resolve <nodeNameOrId> [path]`. */
function runResolve(nodeNameOrId: string, path: string): void {
	const targetDir = resolvePath(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return;
	}

	const registry = loadRegistry(targetDir);
	if (registry === undefined) return; // exit code + stderr already set

	const outcome = resolveEntry(registry, nodeNameOrId);
	switch (outcome.kind) {
		case "match":
			// A deprecated component resolved to the replacement its description
			// names: the entry plus `replaces` (deprecated name + variant hint).
			process.stdout.write(
				`${JSON.stringify(
					outcome.replaces === undefined
						? outcome.entry
						: { ...outcome.entry, replaces: outcome.replaces },
					null,
					2,
				)}\n`,
			);
			process.exitCode = 0;
			return;
		case "candidates":
			process.stdout.write(
				`${JSON.stringify(
					{
						kind: "candidates",
						node: nodeNameOrId,
						candidates: outcome.entries,
					},
					null,
					2,
				)}\n`,
			);
			process.exitCode = 1;
			return;
		case "not-found":
			process.stderr.write(
				`No registry entry found for "${nodeNameOrId}". It is neither a matched node nor an unmatched Figma component in the registry.\n`,
			);
			process.exitCode = 1;
			return;
	}
}

/** Register the `registry` command group on the program. Wiring entry for cli.ts. */
export function registerRegistryCommand(program: Command): void {
	const registry = program
		.command("registry")
		.description("Build and query the Figma↔code component registry");

	registry
		.command("build")
		.description(
			"Scan code components, fetch the Figma library, and write .ds-bridge/registry.json",
		)
		.argument("[path]", "project directory to scan", ".")
		.option("--format <format>", "output format: term | json", "term")
		.action((path: string, options: BuildOptions) => {
			void runBuild(path, options);
		});

	registry
		.command("resolve")
		.description("Resolve a Figma node id or name against the saved registry")
		.argument("<nodeNameOrId>", "Figma node id (e.g. 10:42) or component name")
		.argument(
			"[path]",
			"project directory holding .ds-bridge/registry.json",
			".",
		)
		.action((nodeNameOrId: string, path: string) => {
			runResolve(nodeNameOrId, path);
		});
}
