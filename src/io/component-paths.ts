// Where the design-system components live — the directories `registry build`
// scans. Scanning the whole project makes every page and app component a
// "component missing in Figma"; the registry is about the design system.
//   1. `component_paths` in .ds-bridge.json (explicit, wins);
//   2. shadcn/ui's components.json: `aliases.ui` (default `<components>/ui`)
//      resolved through the tsconfig aliases;
//   3. undefined — the caller scans the whole project (previous behaviour).
// Never throws. Imports ts-morph transitively: load it deferred.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveAliasDir } from "./tsconfig-paths.js";

export interface ComponentPaths {
	/** Project-relative directories, forward slashes. */
	paths: string[];
	source: "component_paths" | "components.json" | "code-connect";
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** shadcn's ui alias from components.json, or undefined. */
function shadcnUiAlias(root: string): string | undefined {
	const file = join(root, "components.json");
	if (!existsSync(file)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as {
			aliases?: { ui?: unknown; components?: unknown };
		};
		const { ui, components } = parsed.aliases ?? {};
		if (typeof ui === "string" && ui !== "") return ui;
		if (typeof components === "string" && components !== "") {
			return `${components}/ui`;
		}
	} catch {
		// Not JSON / not shadcn: no detection.
	}
	return undefined;
}

export function resolveComponentPaths(
	root: string,
	configured: string[] | undefined,
): ComponentPaths | undefined {
	if (configured !== undefined && configured.length > 0) {
		return { paths: configured, source: "component_paths" };
	}
	const alias = shadcnUiAlias(root);
	if (alias === undefined) return undefined;
	const dir = resolveAliasDir(root, alias);
	if (dir === undefined || !isDirectory(join(root, dir))) return undefined;
	return { paths: [dir], source: "components.json" };
}
