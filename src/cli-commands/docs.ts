// T7.19 — `ds-bridge docs [component] [--out <dir>] [--format term|json]`.
// Impure edge: reads the saved .ds-bridge/registry.json, scans the code side for
// rich props/variants (ts-morph, via the deferred import that registry build
// also uses — see scanCode below), discovers a token source (graceful: docs are
// generated even with no tokens), then drives the pure docs engines (merge →
// render-mdx / render-llms) and writes the MDX pages + llms.txt to --out.
//
// All judgement lives in the pure engines; every bad-input path becomes an exit
// code + actionable stderr, never a thrown stack trace.
//
// The figma side stays offline: `registry build` persists each Figma component's
// description in registry.json, and docs reads it from there. A component with
// no description surfaces a `missing-figma-description` gap (informational).
//
// Exit codes:
//   0  success (any documentation gaps are informational, not failures)
//   2  operational error (missing registry → "run ds-bridge registry build",
//      bad path, invalid --format, or an unknown [component] filter)
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { mergeComponentDocs } from "../engines/docs/merge.js";
import { renderLlmsTxt } from "../engines/docs/render-llms.js";
import { renderComponentMdx } from "../engines/docs/render-mdx.js";
import type { RegistryFile } from "../engines/registry/persist.js";
import type { CodeComponent } from "../engines/registry/scan-code.js";
import type { FigmaComponentModel } from "../engines/registry/scan-figma.js";
import { parseStyleDictionary } from "../engines/tokens/parse-style-dictionary.js";
import { parseTokensStudio } from "../engines/tokens/parse-tokens-studio.js";
import { parseW3c } from "../engines/tokens/parse-w3c.js";
import type {
	ParseOutcome,
	TokenMap,
	TokenSourceFormat,
} from "../engines/tokens/types.js";
import { loadTokens } from "../io/load-tokens.js";
import { findTokenSource } from "../io/token-set.js";
import { renderTable } from "../render/terminal/index.js";

type DocsFormat = "json" | "term";

interface DocsOptions {
	out: string | undefined;
	format: string;
}

const EMPTY_TOKENS: TokenMap = { format: "w3c", tokens: [] };

const _PARSERS: Record<TokenSourceFormat, (source: unknown) => ParseOutcome> = {
	w3c: parseW3c,
	"tokens-studio": parseTokensStudio,
	"style-dictionary": parseStyleDictionary,
};

/** Print a fatal operational error and set exit code 2. */
function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Strip every non-alphanumeric and lowercase: the normalized identity key. */
function normalizeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/**
 * Scan the code side via ts-morph. The import is deferred so ts-morph (whose
 * bundled TypeScript references the CJS globals `__filename`/`__dirname` during
 * its eager module init) is only evaluated by this path — never at CLI load,
 * which would crash every command in the single-file ESM bundle. Mirrors the
 * pattern in registry.ts.
 */
async function scanCode(
	targetDir: string,
	registry: RegistryFile,
): Promise<CodeComponent[]> {
	shimCjsGlobals();
	const { scanCodeComponents, scanPackageComponents } = await import(
		"../engines/registry/scan-code.js"
	);
	// Components the registry matched to a package (`@primer/react`) read their
	// props from the package's typings.
	const packaged = new Set(
		registry.matches
			.filter((m) => !/\.(?:tsx?|jsx?)$/.test(m.importPath))
			.map((m) => normalizeName(m.codeName)),
	);
	return [
		...scanCodeComponents(targetDir),
		...scanPackageComponents(targetDir, packaged),
	];
}

/** Give the deferred ts-morph chunk the CJS globals its TypeScript expects. */
function shimCjsGlobals(): void {
	const globals = globalThis as Record<string, unknown>;
	if (typeof globals.__filename !== "string") {
		const filename = fileURLToPath(import.meta.url);
		globals.__filename = filename;
		globals.__dirname = dirname(filename);
	}
}

/**
 * The aliased import specifier per import path (`@/components/ui/button`), read
 * from the project's tsconfig. Deferred like scanCode: it parses via ts-morph's
 * bundled TypeScript.
 */
async function importSpecifiers(
	targetDir: string,
	importPaths: string[],
): Promise<Map<string, string>> {
	shimCjsGlobals();
	const { aliasSpecifier } = await import("../io/tsconfig-paths.js");
	const specifiers = new Map<string, string>();
	for (const importPath of importPaths) {
		if (importPath === "") continue;
		const specifier = aliasSpecifier(targetDir, importPath);
		if (specifier !== undefined) specifiers.set(importPath, specifier);
	}
	return specifiers;
}

/** Read + parse the saved registry, or undefined with an exit code already set. */
/**
 * The figma shapes docs can know offline: the descriptions `registry build`
 * persisted. Only described entries are returned, so everything else keeps the
 * merge's registry-only fallback.
 */
function figmaFromRegistry(registry: RegistryFile): FigmaComponentModel[] {
	const entries = [
		...(Array.isArray(registry.matches) ? registry.matches : []).map((m) => ({
			name: m.figmaName,
			nodeId: m.nodeId,
			description: m.description,
		})),
		...(Array.isArray(registry.unmatchedFigma) ? registry.unmatchedFigma : []),
	];
	const models: FigmaComponentModel[] = [];
	for (const { name, nodeId, description } of entries) {
		if (typeof description !== "string" || description === "") continue;
		models.push({
			name,
			nodeId,
			description,
			variantProps: {},
			source: "published",
		});
	}
	return models;
}

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

/**
 * Discover + parse the token source (file or folder) under `targetDir`. Graceful: any
 * miss (no source, unreadable, parse error) yields an empty TokenMap so docs
 * still generate. The token summary lives only in llms.txt.
 */
async function discoverTokens(targetDir: string): Promise<TokenMap> {
	const source = findTokenSource(targetDir);
	if (source === undefined) return EMPTY_TOKENS;
	const loaded = loadTokens(source);
	return loaded.kind === "ok" ? loaded.map : EMPTY_TOKENS;
}

/** A safe, deterministic MDX filename for a component (no path traversal). */
function mdxFileName(component: string): string {
	const safe = component.replace(/[^a-zA-Z0-9._-]/g, "_");
	return `${safe.length > 0 ? safe : "component"}.mdx`;
}

/** Does this directory hold a saved registry? */
function hasRegistry(candidate: string): boolean {
	return existsSync(
		join(resolvePath(candidate), ".ds-bridge", "registry.json"),
	);
}

/**
 * Disambiguate `[component] [path]`: both are optional, so a lone positional is
 * ambiguous. When `path` was left at its default and the supplied `component`
 * names a directory that holds a registry — while the cwd does not — treat it as
 * the path (the common `docs <dir>` call) and drop the filter. Mirrors parity.ts.
 */
function disambiguate(
	component: string | undefined,
	path: string,
): { component: string | undefined; path: string } {
	// A path-shaped argument (".", "..", "a/b") is never a component name.
	const pathShaped =
		component !== undefined && /^\.{1,2}$|[\\/]/.test(component);
	if (
		component !== undefined &&
		component !== "" &&
		path === "." &&
		(pathShaped || !hasRegistry(".")) &&
		hasRegistry(component)
	) {
		return { component: undefined, path: component };
	}
	return { component, path };
}

/** One emitted page: the component name and its typed gaps. */
interface PageResult {
	component: string;
	path: string;
	gaps: string[];
}

/** The whole docs run, for --format=json. */
interface DocsResult {
	outDir: string;
	llmsPath: string;
	pages: PageResult[];
}

/** Render the term summary: a per-component pages/gaps table + a footer line. */
function renderTerm(result: DocsResult): string {
	const rows = result.pages.map((page) => [
		page.component,
		page.gaps.length === 0 ? "—" : page.gaps.join(", "),
	]);
	const table = renderTable(["component", "gaps"], rows, { color: false });
	const gapTotal = result.pages.reduce((sum, p) => sum + p.gaps.length, 0);
	const heading = `${result.pages.length} pages written to ${result.outDir}`;
	const footer = `llms.txt: ${result.llmsPath} · ${gapTotal} gaps total`;
	return [heading, "", table, "", footer].join("\n");
}

/** Execute the `docs` command. */
async function runDocs(
	rawComponent: string | undefined,
	rawPath: string,
	options: DocsOptions,
): Promise<void> {
	const format = options.format as DocsFormat;
	if (format !== "json" && format !== "term") {
		fail(`Unknown --format "${options.format}". Expected "json" or "term".`);
		return;
	}

	const { component, path } = disambiguate(rawComponent, rawPath);

	const targetDir = resolvePath(path);
	if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
		fail(`Path "${targetDir}" is not a directory.`);
		return;
	}

	const registry = loadRegistry(targetDir);
	if (registry === undefined) return; // exit code + stderr already set

	const code = await scanCode(targetDir, registry);
	const tokens = await discoverTokens(targetDir);

	const merged = mergeComponentDocs({
		registry,
		code,
		figma: figmaFromRegistry(registry),
		tokens,
	});
	const specifiers = await importSpecifiers(
		targetDir,
		merged.map((doc) => doc.code.importPath),
	);
	const allDocs = merged.map((doc) => {
		const importSpecifier = specifiers.get(doc.code.importPath);
		return importSpecifier === undefined
			? doc
			: { ...doc, code: { ...doc.code, importSpecifier } };
	});

	let docs = allDocs;
	if (component !== undefined && component !== "") {
		const needle = normalizeName(component);
		docs = allDocs.filter((doc) => normalizeName(doc.name) === needle);
		if (docs.length === 0) {
			const candidates = allDocs.map((doc) => doc.name).join(", ");
			fail(
				`No component named "${component}" in the registry. ` +
					`Candidates: ${candidates.length > 0 ? candidates : "(none)"}.`,
			);
			return;
		}
	}

	const outDir =
		options.out !== undefined
			? resolvePath(options.out)
			: join(targetDir, ".ds-bridge", "docs");

	try {
		mkdirSync(outDir, { recursive: true });
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not create output directory "${outDir}": ${detail}`);
		return;
	}

	const pages: PageResult[] = [];
	for (const doc of docs) {
		const fileName = mdxFileName(doc.name);
		const pagePath = join(outDir, fileName);
		try {
			writeFileSync(pagePath, renderComponentMdx(doc), "utf8");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			fail(`Could not write "${pagePath}": ${detail}`);
			return;
		}
		pages.push({ component: doc.name, path: pagePath, gaps: doc.gaps });
	}

	const llmsPath = join(outDir, "llms.txt");
	try {
		writeFileSync(llmsPath, renderLlmsTxt(docs, tokens), "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`Could not write "${llmsPath}": ${detail}`);
		return;
	}

	const result: DocsResult = { outDir, llmsPath, pages };

	if (format === "json") {
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} else {
		process.stdout.write(`${renderTerm(result)}\n`);
	}

	// Gaps are informational — generating the docs is itself the success.
	process.exitCode = 0;
}

/** Register the `docs` command on the program. Wiring entry for cli.ts. */
export function registerDocsCommand(program: Command): void {
	program
		.command("docs")
		.description(
			"Generate component MDX docs + llms.txt from the saved registry and tokens",
		)
		.argument("[component]", "filter to a single component by normalized name")
		.argument(
			"[path]",
			"project directory holding .ds-bridge/registry.json",
			".",
		)
		.option("--out <dir>", "output directory (default .ds-bridge/docs)")
		.option("--format <format>", "output format: term | json", "term")
		.action(
			(component: string | undefined, path: string, options: DocsOptions) => {
				void runDocs(component, path, options);
			},
		);
}
