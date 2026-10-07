// Token sources that span several files. A W3C (DTCG) or Style Dictionary set
// is often split by layer and mode — Material 3 ships primitives in one file
// and its colour roles in `*.light.*` / `*.dark.*` files that alias into them.
// This io edge reads such a set as ONE document (deep-merged, so cross-file
// aliases resolve) plus one document per mode. A single file reads as before.
//
// The pure engines never see more than one JSON document; everything here is
// filesystem work, kept synchronous to match the CLI commands that call it.
import type { Dirent } from "node:fs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { detectFormat } from "../engines/tokens/detect.js";
import type { TokenSourceFormat } from "../engines/tokens/types.js";

/** Directory names never walked for token sources. */
const EXCLUDED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"coverage",
	"out",
	".next",
	".ds-bridge",
]);

/**
 * The mode a token file belongs to, read from its path relative to the set
 * root: a `light` / `dark` segment (Material's `-medium-contrast` /
 * `-high-contrast` variants kept whole) in a file or folder name. Undefined
 * for files every mode shares.
 */
export function modeOfTokenFile(relPath: string): string | undefined {
	const match = relPath
		.toLowerCase()
		.replace(/\\/g, "/")
		.match(
			/(?:^|[/._-])((?:light|dark)(?:-(?:medium|high)-contrast)?)(?=$|[/._-])/,
		);
	return match?.[1];
}

function isConventionalTokenFile(name: string): boolean {
	return (
		name === "tokens.json" ||
		name === "design-tokens.json" ||
		name.endsWith(".tokens.json")
	);
}

function isTokenDir(name: string): boolean {
	return name === "tokens" || name === "design-tokens";
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

/** The detected token format of a JSON file, or undefined for anything else. */
function formatOf(path: string): TokenSourceFormat | undefined {
	const parsed = readJson(path);
	if (parsed === undefined) return undefined;
	const format = detectFormat(parsed);
	return format === "unknown" ? undefined : format;
}

/** Conventional token files under `dir` (any *.json inside a tokens/ folder). */
function collectCandidates(
	dir: string,
	insideTokenDir: boolean,
	acc: string[],
): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (EXCLUDED_DIRS.has(entry.name)) continue;
			collectCandidates(full, insideTokenDir || isTokenDir(entry.name), acc);
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		if (insideTokenDir || isConventionalTokenFile(entry.name)) acc.push(full);
	}
}

/** Every *.json file under `dir` (recursively), sorted. */
function jsonFilesUnder(dir: string): string[] {
	const acc: string[] = [];
	const walk = (current: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				if (!EXCLUDED_DIRS.has(entry.name)) walk(full);
			} else if (
				entry.isFile() &&
				entry.name.endsWith(".json") &&
				!entry.name.startsWith("$")
			) {
				acc.push(full);
			}
		}
	};
	walk(dir);
	return acc.sort();
}

const depthOf = (path: string): number => path.split(sep).length;

/**
 * The project's token source: the shallowest conventional, shape-verified
 * token file — or, when that file's folder holds two or more W3C / Style
 * Dictionary token files, the folder itself (a multi-file set).
 */
export function findTokenSource(root: string): string | undefined {
	const candidates: string[] = [];
	collectCandidates(root, false, candidates);
	const verified = candidates
		.map((path) => ({ path, format: formatOf(path) }))
		.filter(
			(c): c is { path: string; format: TokenSourceFormat } =>
				c.format !== undefined,
		)
		.sort((a, b) => {
			const depth = depthOf(a.path) - depthOf(b.path);
			return depth !== 0 ? depth : a.path < b.path ? -1 : 1;
		});
	const first = verified[0];
	if (first === undefined) return undefined;
	if (first.format === "tokens-studio") return first.path;
	const dir = dirname(first.path);
	const siblings = verified.filter(
		(c) => c.format === first.format && c.path.startsWith(dir + sep),
	);
	return siblings.length >= 2 ? dir : first.path;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursive object merge; later documents win on leaves. */
function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = { ...target };
	for (const [key, value] of Object.entries(source)) {
		const existing = out[key];
		out[key] =
			isPlainObject(existing) && isPlainObject(value)
				? deepMerge(existing, value)
				: value;
	}
	return out;
}

/** One mode's merged document. */
export interface ModeDocument {
	mode: string;
	doc: unknown;
}

export type TokenDocumentOutcome =
	| {
			kind: "ok";
			/** The default document: the whole file, or the merged set's default mode. */
			doc: unknown;
			/** For a set with mode files: every mode, default first. */
			modeDocs?: ModeDocument[];
			/** The token files read, sorted. */
			files: string[];
	  }
	| { kind: "error"; message: string };

/** Mode order: light first, then dark, then the rest alphabetically. */
function modeRank(mode: string): string {
	if (mode === "light") return "0";
	if (mode === "dark") return "1";
	return `2${mode}`;
}

/**
 * Read a token source — a JSON file, or a folder of token files read as one
 * set. In a folder, files that name no mode are shared by every mode; files
 * naming a mode (`*.light.*`, `dark/…`) are overlaid on them per mode.
 */
export function readTokenDocument(path: string): TokenDocumentOutcome {
	let isDirectory: boolean;
	try {
		isDirectory = statSync(path).isDirectory();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Could not read token source "${path}": ${detail}`,
		};
	}

	if (!isDirectory) {
		let raw: string;
		try {
			raw = readFileSync(path, "utf8");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return {
				kind: "error",
				message: `Could not read token source "${path}": ${detail}`,
			};
		}
		try {
			return { kind: "ok", doc: JSON.parse(raw), files: [path] };
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return {
				kind: "error",
				message: `Token source "${path}" is not valid JSON: ${detail}`,
			};
		}
	}

	const docs: { file: string; doc: Record<string, unknown>; format: string }[] =
		[];
	for (const file of jsonFilesUnder(path)) {
		const doc = readJson(file);
		if (!isPlainObject(doc)) continue;
		const format = detectFormat(doc);
		if (format === "unknown") continue;
		docs.push({ file, doc, format });
	}
	if (docs.length === 0) {
		return {
			kind: "error",
			message: `No token files found in "${path}". Expected W3C (DTCG), Tokens Studio, or Style Dictionary JSON.`,
		};
	}
	const formats = [...new Set(docs.map((d) => d.format))];
	if (formats.length > 1) {
		return {
			kind: "error",
			message: `Token files in "${path}" mix formats (${formats.sort().join(", ")}); point token_source at one set.`,
		};
	}

	let shared: Record<string, unknown> = {};
	const byMode = new Map<string, Record<string, unknown>[]>();
	for (const { file, doc } of docs) {
		const mode = modeOfTokenFile(relative(path, file));
		if (mode === undefined) {
			shared = deepMerge(shared, doc);
		} else {
			byMode.set(mode, [...(byMode.get(mode) ?? []), doc]);
		}
	}
	const files = docs.map((d) => d.file);
	if (byMode.size === 0) return { kind: "ok", doc: shared, files };

	const modeDocs: ModeDocument[] = [...byMode.keys()]
		.sort((a, b) => (modeRank(a) < modeRank(b) ? -1 : 1))
		.map((mode) => ({
			mode,
			doc: (byMode.get(mode) ?? []).reduce(deepMerge, shared),
		}));
	return {
		kind: "ok",
		doc: (modeDocs[0] as ModeDocument).doc,
		...(modeDocs.length > 1 ? { modeDocs } : {}),
		files,
	};
}
