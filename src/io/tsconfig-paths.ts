// The project's tsconfig import aliases (`paths` + `baseUrl`). shadcn and most
// Vite/Next apps import components as `@/components/ui/button`; without these
// settings import resolution sees nothing and generated docs show file paths
// no one can import. Reads `<root>/tsconfig.json` and, when it declares no
// paths (Vite's solution-style root), its `references` in order; `extends`
// chains are followed by TypeScript itself. Never throws.
import { existsSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { ts } from "ts-morph";

/** Parsed compiler options of one tsconfig file, or undefined when unreadable. */
function readTsconfig(
	configPath: string,
): { options: ts.CompilerOptions; references: string[] } | undefined {
	const read = ts.readConfigFile(configPath, ts.sys.readFile);
	if (read.error !== undefined) return undefined;
	const parsed = ts.parseJsonConfigFileContent(
		read.config,
		ts.sys,
		dirname(configPath),
		undefined,
		configPath,
	);
	const references = (parsed.projectReferences ?? []).map((ref) =>
		ref.path.endsWith(".json") ? ref.path : resolve(ref.path, "tsconfig.json"),
	);
	return { options: parsed.options, references };
}

/**
 * `{ paths, baseUrl }` for a ts-morph / TypeScript project rooted at `root`, or
 * `{}` when the project declares no aliases. `baseUrl` is absolute: without one
 * in the config, paths resolve against the declaring tsconfig's directory.
 */
export function readPathAliases(root: string): {
	paths?: ts.MapLike<string[]>;
	baseUrl?: string;
} {
	const rootConfig = resolve(root, "tsconfig.json");
	if (!existsSync(rootConfig)) return {};
	const queue = [rootConfig];
	const seen = new Set<string>();
	try {
		while (queue.length > 0) {
			const configPath = queue.shift() as string;
			if (seen.has(configPath) || !existsSync(configPath)) continue;
			seen.add(configPath);
			const config = readTsconfig(configPath);
			if (config === undefined) continue;
			const { paths, baseUrl } = config.options;
			if (paths !== undefined) {
				return { paths, baseUrl: baseUrl ?? dirname(configPath) };
			}
			queue.push(...config.references);
		}
	} catch {
		// Unparseable config: no aliases.
	}
	return {};
}

const SOURCE_EXTENSION = /\.(?:tsx|ts|jsx|js|mjs|cjs)$/;

/**
 * The aliased import specifier for a project file, e.g.
 * `src/components/ui/button.tsx` → `@/components/ui/button` under
 * `"@/*": ["./src/*"]`. Undefined when no alias covers the file.
 */
export function aliasSpecifier(
	root: string,
	relPath: string,
): string | undefined {
	const { paths, baseUrl } = readPathAliases(root);
	if (paths === undefined || baseUrl === undefined) return undefined;
	const target = resolve(root, relPath)
		.replace(SOURCE_EXTENSION, "")
		.replace(/[\\/]index$/, "");
	for (const [pattern, mappings] of Object.entries(paths)) {
		for (const mapping of mappings) {
			const base = resolve(baseUrl, mapping);
			if (!pattern.includes("*")) {
				if (base.replace(SOURCE_EXTENSION, "") === target) return pattern;
				continue;
			}
			const [prefix = "", suffix = ""] = base.split("*");
			if (!target.startsWith(prefix) || !target.endsWith(suffix)) continue;
			const middle = target.slice(prefix.length, target.length - suffix.length);
			return pattern.replace("*", middle.split(sep).join("/"));
		}
	}
	return undefined;
}

/**
 * The project-relative directory an aliased specifier names, e.g.
 * `@/components/ui` → `src/components/ui` under `"@/*": ["./src/*"]`.
 * Undefined when no alias covers it.
 */
export function resolveAliasDir(
	root: string,
	specifier: string,
): string | undefined {
	const { paths, baseUrl } = readPathAliases(root);
	if (paths === undefined || baseUrl === undefined) return undefined;
	for (const [pattern, mappings] of Object.entries(paths)) {
		const mapping = mappings[0];
		if (mapping === undefined) continue;
		let target: string | undefined;
		if (pattern.includes("*")) {
			const [prefix = "", suffix = ""] = pattern.split("*");
			if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
				continue;
			}
			const middle = specifier.slice(
				prefix.length,
				specifier.length - suffix.length,
			);
			target = resolve(baseUrl, mapping.replace("*", middle));
		} else if (pattern === specifier) {
			target = resolve(baseUrl, mapping);
		}
		if (target !== undefined) {
			return relative(root, target).split(sep).join("/");
		}
	}
	return undefined;
}
