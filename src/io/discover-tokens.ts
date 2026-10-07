// T1.9 — token source discovery. This is the impure io edge: it touches the
// real filesystem (node:fs/promises) so the pure engines never have to. Every
// candidate JSON file is shape-verified through the pure `detectFormat` engine;
// discovery never decides format from a filename.
import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { detectFormat } from "../engines/tokens/detect.js";
import type { TokenSourceFormat } from "../engines/tokens/types.js";
import { isTokenFileName, parseTokenText } from "./token-json.js";

export interface DiscoveredSource {
	/** Absolute path to the token file. */
	path: string;
	/** Format as verified by the pure detector (never "unknown" here). */
	format: TokenSourceFormat;
}

/**
 * Discovery outcome. A missing (or non-token) explicit source is a typed
 * problem, not an exception — callers branch on `kind`.
 */
export type DiscoverOutcome =
	| { kind: "ok"; sources: DiscoveredSource[] }
	| { kind: "explicit-not-found"; path: string };

export interface DiscoverOptions {
	/** Explicit token source. Wins over scanning. Resolved against rootDir. */
	explicit?: string;
}

/** Directory names that are never scanned for token sources. */
const EXCLUDED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"coverage",
	"out",
	".next",
]);

/**
 * Read + parse a JSON file and return its detected token format, or `undefined`
 * when the file is missing, unparseable, or not token-shaped. Never throws on
 * bad input — that is the whole point of the io edge.
 */
async function detectFileFormat(
	absPath: string,
): Promise<TokenSourceFormat | undefined> {
	let raw: string;
	try {
		raw = await readFile(absPath, "utf8");
	} catch {
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = parseTokenText(raw, absPath);
	} catch {
		return undefined;
	}

	const format = detectFormat(parsed);
	return format === "unknown" ? undefined : format;
}

/** True when a JSON filename matches the well-known token conventions. */
function isConventionalTokenFile(fileName: string): boolean {
	if (!isTokenFileName(fileName)) return false;
	return (
		fileName === "tokens.json" ||
		fileName === "design-tokens.json" ||
		fileName.endsWith(".tokens.json") ||
		fileName === "tokens.json5" ||
		fileName.endsWith(".tokens.json5")
	);
}

/** True for directory names that signal a token home (any *.json inside). */
function isTokenDir(dirName: string): boolean {
	return dirName === "tokens" || dirName === "design-tokens";
}

/**
 * Recursively collect candidate JSON file paths. A file is a candidate when it
 * matches a filename convention OR lives anywhere beneath a tokens/ or
 * design-tokens/ directory. Excluded directories are pruned entirely.
 */
async function collectCandidates(
	dir: string,
	insideTokenDir: boolean,
	acc: Set<string>,
): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (EXCLUDED_DIRS.has(entry.name)) continue;
			await collectCandidates(
				full,
				insideTokenDir || isTokenDir(entry.name),
				acc,
			);
			continue;
		}
		if (!entry.isFile()) continue;
		if (!isTokenFileName(entry.name)) continue;
		if (insideTokenDir || isConventionalTokenFile(entry.name)) {
			acc.add(full);
		}
	}
}

/** Path-segment count of an absolute path, used for shallow-first ordering. */
function depthOf(absPath: string): number {
	return absPath.split(sep).filter((segment) => segment.length > 0).length;
}

/** Deterministic order: shallower paths first, then alphabetical by full path. */
function compareSources(a: DiscoveredSource, b: DiscoveredSource): number {
	const depthDelta = depthOf(a.path) - depthOf(b.path);
	if (depthDelta !== 0) return depthDelta;
	return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * Discover token sources beneath `rootDir`.
 *
 * - When `options.explicit` is set it wins over scanning: the file must exist
 *   and be token-shaped, otherwise the outcome is `explicit-not-found`.
 * - Otherwise scan for conventional token files (excluding node_modules, .git,
 *   dist, coverage, out, .next), shape-verify each, and return them ordered
 *   shallow-first then alphabetically.
 */
export async function discoverTokenSources(
	rootDir: string,
	options?: DiscoverOptions,
): Promise<DiscoverOutcome> {
	const root = resolve(rootDir);

	if (options?.explicit !== undefined) {
		const explicitPath = isAbsolute(options.explicit)
			? options.explicit
			: resolve(root, options.explicit);

		let isFile = false;
		try {
			isFile = (await stat(explicitPath)).isFile();
		} catch {
			isFile = false;
		}
		if (!isFile) return { kind: "explicit-not-found", path: explicitPath };

		const format = await detectFileFormat(explicitPath);
		if (format === undefined) {
			return { kind: "explicit-not-found", path: explicitPath };
		}
		return { kind: "ok", sources: [{ path: explicitPath, format }] };
	}

	const candidatePaths = new Set<string>();
	await collectCandidates(root, false, candidatePaths);

	const sources: DiscoveredSource[] = [];
	for (const candidate of candidatePaths) {
		const format = await detectFileFormat(candidate);
		if (format !== undefined) sources.push({ path: candidate, format });
	}

	sources.sort(compareSources);
	return { kind: "ok", sources };
}
