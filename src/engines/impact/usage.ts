// T7.8 — usage mapper (blast-radius). Given a saved registry, a set of CHANGED
// Figma component names, and a project directory, answer: which code component
// does each changed Figma name map to, and where is it imported across the
// project? This is the bridge from a Figma diff to concrete code call sites
// ("touches N call sites").
//
// Like scan-code.ts (and unlike the pure engines), this module reads .tsx files
// via ts-morph — the AST IS the domain logic. It is still side-effect-free beyond
// reading the supplied project dir, and NEVER throws: a missing dir or unparseable
// file degrades to empty usages, never a fatal error.
import { isAbsolute, relative, resolve, sep } from "node:path";
import { type Node, Project, type SourceFile } from "ts-morph";
import { readPathAliases } from "../../io/tsconfig-paths.js";
import type { RegistryFile, RegistryMatch } from "../registry/persist.js";

/** A single import site of a tracked code component. */
export interface UsageSite {
	/** Path relative to the project dir, forward slashes, e.g. "app/Dashboard.tsx". */
	file: string;
	/** 1-based line of the import declaration. */
	line: number;
	/** The imported identifier as written, e.g. "Button". */
	importName: string;
	/** Set for a value-level site: what this element does that the change breaks. */
	reason?: string;
}

/** How a changed Figma name resolved against the registry. */
export type UsageResolution = "matched" | "unmatched" | "not-in-registry";

/** The blast radius for one changed Figma component. */
export interface ComponentUsage {
	figmaName: string;
	/** Set only when resolution is "matched". */
	codeName?: string;
	/** Set only when resolution is "matched"; the registry's importPath. */
	importPath?: string;
	resolution: UsageResolution;
	/** Import sites, ordered by file asc then line asc. */
	usages: UsageSite[];
	/** Convenience: usages.length. */
	count: number;
}

export interface MapUsageInput {
	registry: RegistryFile;
	/** Changed Figma component names (e.g. from the component-diff engine). */
	changedFigmaNames: readonly string[];
	/** Project directory to scan for import sites. */
	projectDir: string;
	/** The node id each changed name came from: resolves before the name. */
	nodeIdsByName?: Record<string, string>;
}

// ── Name normalization (local; persist.ts's helper is not exported) ──

/** Strip every non-alphanumeric and lowercase: the normalized identity key. */
function normalizeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Convert an OS path to forward-slash form for stable, portable relative paths. */
function toForwardSlashes(path: string): string {
	return sep === "/" ? path : path.split(sep).join("/");
}

// ── Registry resolution ──

type Resolution =
	| { kind: "matched"; match: RegistryMatch }
	| { kind: "unmatched" }
	| { kind: "not-in-registry" };

/**
 * Resolve a changed Figma name against the registry: a confident match (by exact
 * then normalized figmaName), an unmatched-figma entry (no code to scan), or
 * not-in-registry. Matches always win.
 */
function resolveFigmaName(
	registry: RegistryFile,
	figmaName: string,
	nodeId?: string,
): Resolution {
	if (nodeId !== undefined) {
		const byId = registry.matches.find(
			(m) => m.nodeId === nodeId || m.aliasNodeIds?.includes(nodeId),
		);
		if (byId !== undefined) return { kind: "matched", match: byId };
	}
	const normalized = normalizeName(figmaName);
	// A component and an icon may share a name (SDS: the Tag component and the
	// Tag icon): a library change names the component, so it wins; the icon
	// only answers when nothing else has that name.
	const byPreference = [
		...registry.matches.filter((m) => m.kind !== "icon"),
		...registry.matches.filter((m) => m.kind === "icon"),
	];
	for (const match of byPreference) {
		if (match.figmaName === figmaName) return { kind: "matched", match };
	}
	if (normalized.length > 0) {
		for (const match of byPreference) {
			if (normalizeName(match.figmaName) === normalized) {
				return { kind: "matched", match };
			}
		}
	}
	for (const entry of registry.unmatchedFigma) {
		if (entry.name === figmaName) return { kind: "unmatched" };
	}
	if (normalized.length > 0) {
		for (const entry of registry.unmatchedFigma) {
			if (normalizeName(entry.name) === normalized)
				return { kind: "unmatched" };
		}
	}
	return { kind: "not-in-registry" };
}

// ── ts-morph scan ──

/**
 * Build a ts-morph project over the directory's .tsx files. Mirrors scan-code's
 * config (jsx: Preserve, allowJs) so the same fixtures resolve. Returns an empty
 * project (no files) when the directory is missing or unreadable.
 */
function buildProject(root: string): Project {
	const project = new Project({
		skipAddingFilesFromTsConfig: true,
		compilerOptions: {
			jsx: 4,
			allowJs: true,
			strict: true,
			noEmit: true,
			...readPathAliases(root),
		},
	});
	try {
		// .ts too: a barrel (`components/index.ts`) must be in the project for
		// imports through it to resolve.
		project.addSourceFilesAtPaths([
			toForwardSlashes(`${root}/**/*.{ts,tsx}`),
			`!${toForwardSlashes(`${root}/**/*.d.ts`)}`,
			`!${toForwardSlashes(`${root}/**/node_modules/**`)}`,
		]);
	} catch {
		// Leave the project empty; callers degrade to zero usages.
	}
	return project;
}

/** The absolute, normalized path the import resolves to, or undefined. */
function resolveImportTarget(importLine: {
	getModuleSpecifierSourceFile(): SourceFile | undefined;
}): string | undefined {
	let target: SourceFile | undefined;
	try {
		target = importLine.getModuleSpecifierSourceFile();
	} catch {
		return undefined;
	}
	return target?.getFilePath();
}

/**
 * Whether a named import's symbol, followed through re-exports (`export *`,
 * `export { X } from`), is declared in `targetImportPath` (root-relative).
 */
function declaredIn(
	named: { getNameNode(): Node },
	root: string,
	targetImportPath: string,
): boolean {
	try {
		const symbol = named.getNameNode().getSymbol();
		const resolved = symbol?.getAliasedSymbol() ?? symbol;
		for (const decl of resolved?.getDeclarations() ?? []) {
			const file = decl.getSourceFile().getFilePath();
			if (toForwardSlashes(relative(root, file)) === targetImportPath) {
				return true;
			}
		}
	} catch {
		// Unresolvable symbol: not a usage of the target.
	}
	return false;
}

/**
 * A registry importPath naming an installed package (`@primer/react`) rather
 * than a project file (`src/components/button.tsx`).
 */
function isPackageSpecifier(importPath: string): boolean {
	return (
		!/\.(?:tsx?|jsx?|mjs|cjs)$/.test(importPath) && !importPath.startsWith(".")
	);
}

/**
 * Find every import declaration across the project whose module resolves to
 * `targetImportPath` (relative to root) AND that imports `codeName`, returning a
 * usage site per matching import declaration (deduped per declaration).
 */
function scanUsages(
	project: Project,
	root: string,
	codeName: string,
	targetImportPath: string,
): UsageSite[] {
	const sites: UsageSite[] = [];
	// A package component (`@primer/react`) is imported by specifier, not by
	// a resolved project file.
	const fromPackage = isPackageSpecifier(targetImportPath);

	for (const sourceFile of project.getSourceFiles()) {
		const absPath = sourceFile.getFilePath();
		const relPath = isAbsolute(absPath) ? relative(root, absPath) : absPath;
		const file = toForwardSlashes(relPath);

		let imports: ReturnType<SourceFile["getImportDeclarations"]>;
		try {
			imports = sourceFile.getImportDeclarations();
		} catch {
			continue;
		}

		for (const importDecl of imports) {
			if (fromPackage) {
				const specifier = importDecl.getModuleSpecifierValue();
				if (specifier !== targetImportPath) continue;
				const named = importDecl
					.getNamedImports()
					.find((n) => n.getName() === codeName);
				if (named === undefined) continue;
				sites.push({
					file,
					line: importDecl.getStartLineNumber(),
					importName: named.getAliasNode()?.getText() ?? codeName,
				});
				continue;
			}
			const resolvedTarget = resolveImportTarget(importDecl);
			if (resolvedTarget === undefined) continue;
			const resolvedRel = toForwardSlashes(relative(root, resolvedTarget));
			const direct = resolvedRel === targetImportPath;

			// Match the imported identifier: named import or default import equal to
			// the code component name (covers `import { Button }` and `import Button`).
			// Through a barrel, the named import must lead back to the target file.
			let importName: string | undefined;
			for (const named of importDecl.getNamedImports()) {
				const alias = named.getAliasNode()?.getText();
				const local = alias ?? named.getName();
				if (local !== codeName && named.getName() !== codeName) continue;
				if (!direct && !declaredIn(named, root, targetImportPath)) continue;
				importName = local;
				break;
			}
			if (!direct && importName === undefined) continue;
			if (importName === undefined) {
				const def = importDecl.getDefaultImport()?.getText();
				if (def === codeName) importName = def;
			}
			if (importName === undefined) continue;

			sites.push({
				file,
				line: importDecl.getStartLineNumber(),
				importName,
			});
		}
	}

	sites.sort((a, b) =>
		a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.line - b.line,
	);
	return sites;
}

// ── Entry point ──

/**
 * Map changed Figma component names to their code-side blast radius. One entry
 * per distinct changed name, in first-seen order. The ts-morph project is built
 * ONCE and reused across every matched name. Never throws.
 */
export function mapUsage(input: MapUsageInput): ComponentUsage[] {
	const { registry, changedFigmaNames, projectDir } = input;
	const root = resolve(projectDir);

	// Dedup names, preserving first-seen order.
	const seen = new Set<string>();
	const names: string[] = [];
	for (const name of changedFigmaNames) {
		if (seen.has(name)) continue;
		seen.add(name);
		names.push(name);
	}

	// Build the project lazily: only if at least one name resolves to a match.
	let project: Project | undefined;
	const results: ComponentUsage[] = [];

	for (const figmaName of names) {
		const resolution = resolveFigmaName(
			registry,
			figmaName,
			input.nodeIdsByName?.[figmaName],
		);
		if (resolution.kind !== "matched") {
			results.push({
				figmaName,
				resolution: resolution.kind,
				usages: [],
				count: 0,
			});
			continue;
		}

		if (project === undefined) project = buildProject(root);
		const usages = scanUsages(
			project,
			root,
			resolution.match.codeName,
			resolution.match.importPath,
		);
		results.push({
			figmaName,
			codeName: resolution.match.codeName,
			importPath: resolution.match.importPath,
			resolution: "matched",
			usages,
			count: usages.length,
		});
	}

	return results;
}

/** One code component's import sites, for import coverage. */
/** Storybook stories and Code Connect templates (`*.stories.tsx`, `*.figma.ts`). */
const DOCS_FILE = /\.(?:stories|story|figma)\.[cm]?[jt]sx?$/i;

export interface CodeUsage {
	codeName: string;
	importPath: string;
	usages: UsageSite[];
	count: number;
}

/**
 * Import sites of EVERY code component the registry knows — matched to Figma
 * or not — in registry order (matches, then unmatched code). Import coverage
 * divides by all of them, so it must count all of them. Never throws.
 */
export function mapCodeUsage(input: {
	registry: RegistryFile;
	projectDir: string;
}): CodeUsage[] {
	const { registry, projectDir } = input;
	const root = resolve(projectDir);
	const entries = [
		...(Array.isArray(registry?.matches) ? registry.matches : []).map((m) => ({
			codeName: m.codeName,
			importPath: m.importPath,
		})),
		...(Array.isArray(registry?.unmatchedCode)
			? registry.unmatchedCode
			: []
		).map((u) => ({ codeName: u.name, importPath: u.importPath })),
	];
	if (entries.length === 0) return [];
	const project = buildProject(root);
	return entries.map(({ codeName, importPath }) => {
		// Stories and Code Connect templates document the system: an import
		// there is not adoption (SDS imports every primitive in a story).
		const usages = scanUsages(project, root, codeName, importPath).filter(
			(site) => !DOCS_FILE.test(site.file),
		);
		return { codeName, importPath, usages, count: usages.length };
	});
}
