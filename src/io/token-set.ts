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
import { isTokenFileName, parseTokenText } from "./token-json.js";

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

/** Theme-variant suffixes a mode name may carry (Material, Primer). */
const MODE_VARIANT =
	"(?:medium|high|low)-contrast|dimmed|colorblind|tritanopia|protanopia-deuteranopia";
const MODE_RE = new RegExp(
	`(?:^|[/._-])((?:light|dark)(?:[-.](?:${MODE_VARIANT}))*)(?=$|[/._-])`,
	"g",
);

/**
 * The mode a token file belongs to, read from its path relative to the set
 * root: a `light` / `dark` segment in a file or folder name, with any theme
 * variant kept whole — Material's `light-high-contrast`, Primer's
 * `light.high-contrast` / `dark.dimmed` (dots read as dashes). The most
 * specific (last) segment wins, so `light/light.high-contrast.json5` is
 * `light-high-contrast`. Undefined for files every mode shares.
 */
export function modeOfTokenFile(relPath: string): string | undefined {
	const path = relPath.toLowerCase().replace(/\\/g, "/");
	const matches = [...path.matchAll(MODE_RE)];
	const last = matches[matches.length - 1]?.[1];
	return last?.replace(/\./g, "-");
}

function isConventionalTokenFile(name: string): boolean {
	return (
		name === "tokens.json" ||
		name === "design-tokens.json" ||
		name.endsWith(".tokens.json") ||
		name === "tokens.json5" ||
		name.endsWith(".tokens.json5")
	);
}

function isTokenDir(name: string): boolean {
	return name === "tokens" || name === "design-tokens";
}

function readJson(path: string): unknown {
	try {
		return parseTokenText(readFileSync(path, "utf8"), path);
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

/** Conventional token files under `dir` (any *.json / *.json5 inside a tokens/ folder). */
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
		if (!entry.isFile() || !isTokenFileName(entry.name)) continue;
		if (insideTokenDir || isConventionalTokenFile(entry.name)) acc.push(full);
	}
}

/** Every *.json / *.json5 file under `dir` (recursively), sorted. */
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
				isTokenFileName(entry.name) &&
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

/** The outermost `tokens/` / `design-tokens/` folder holding `path`, if any. */
function tokenDirOf(root: string, path: string): string | undefined {
	const parts = relative(root, path).split(sep);
	const index = parts.findIndex(
		(part, i) => i < parts.length - 1 && isTokenDir(part),
	);
	return index === -1 ? undefined : join(root, ...parts.slice(0, index + 1));
}

/**
 * The project's token source: the shallowest conventional, shape-verified
 * token file — or, when that file's folder holds two or more W3C / Style
 * Dictionary token files, the folder itself (a multi-file set). A file nested
 * inside a `tokens/` folder (Primer's tokens/base/size/…) reads as that whole
 * folder when it holds several token files.
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
	const sameFormatUnder = (dir: string) =>
		verified.filter(
			(c) => c.format === first.format && c.path.startsWith(dir + sep),
		);
	const tokenDir = tokenDirOf(root, first.path);
	if (tokenDir !== undefined && sameFormatUnder(tokenDir).length >= 2) {
		return tokenDir;
	}
	const dir = dirname(first.path);
	return sameFormatUnder(dir).length >= 2 ? dir : first.path;
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

/**
 * Per-mode values a token carries in its `$extensions` — Primer's
 * `"org.primer.overrides": { dark: "{…}", "dark-dimmed": "{…}" }` — replace its
 * `$value` in that mode (an override written `{ $value, alpha }` sets both).
 * Any vendor key ending in `overrides` counts.
 */
function applyModeOverrides(
	node: Record<string, unknown>,
	chain: readonly string[],
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		out[key] =
			isPlainObject(value) && !key.startsWith("$")
				? applyModeOverrides(value, chain)
				: value;
	}
	const extensions = node.$extensions;
	if ("$value" in node && isPlainObject(extensions)) {
		for (const [key, ext] of Object.entries(extensions)) {
			if (!key.endsWith("overrides") || !isPlainObject(ext)) continue;
			// The most specific mode wins outright: dark-dimmed's own override,
			// else dark's.
			const mode = [...chain].reverse().find((m) => m in ext);
			if (mode === undefined) continue;
			const override = ext[mode];
			// `{ $value, alpha }` (Primer) sets both; a bare value replaces $value.
			if (isPlainObject(override) && "$value" in override) {
				out.$value = override.$value;
				if ("alpha" in override) out.alpha = override.alpha;
			} else {
				out.$value = override;
			}
		}
	}
	return out;
}

/** A mode name as ds-bridge reports it: `SDS Dark` / `sds_dark` → `sds-dark`. */
function modeKey(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-");
}

/** A token's per-mode values from any `$extensions.<vendor>.modes` object. */
function extensionModeValues(
	node: Record<string, unknown>,
): Record<string, unknown> | undefined {
	const extensions = node.$extensions;
	if (!isPlainObject(extensions)) return undefined;
	for (const ext of Object.values(extensions)) {
		if (isPlainObject(ext) && isPlainObject(ext.modes)) return ext.modes;
	}
	return undefined;
}

/** A collection's declared mode list (`$extensions.<vendor>.modes: [...]`). */
function declaredModes(node: Record<string, unknown>): string[] | undefined {
	const extensions = node.$extensions;
	if (!isPlainObject(extensions)) return undefined;
	for (const ext of Object.values(extensions)) {
		if (
			isPlainObject(ext) &&
			Array.isArray(ext.modes) &&
			ext.modes.every((m) => typeof m === "string")
		)
			return ext.modes as string[];
	}
	return undefined;
}

/**
 * Figma variable exports (Figma's Simple Design System) keep every mode in ONE
 * file: each collection lists its modes, each token carries a value per mode
 * in `$extensions.<vendor>.modes`, and `$value` is the collection's first
 * mode. Read that as one document per mode: the default (every collection's
 * first mode) first, then each other mode, where only the collection that
 * owns it changes. Undefined when no collection has two modes.
 */
function extensionModeDocs(
	doc: Record<string, unknown>,
): ModeDocument[] | undefined {
	const collections: { modes: string[]; tokens: number }[] = [];
	for (const group of Object.values(doc)) {
		if (!isPlainObject(group)) continue;
		let modes = declaredModes(group);
		let tokens = 0;
		const walk = (node: Record<string, unknown>): void => {
			if ("$value" in node) {
				const values = extensionModeValues(node);
				if (values !== undefined) {
					tokens += 1;
					modes ??= Object.keys(values);
				}
				return;
			}
			for (const [key, child] of Object.entries(node)) {
				if (!key.startsWith("$") && isPlainObject(child)) walk(child);
			}
		};
		walk(group);
		if (modes !== undefined && modes.length >= 2 && tokens > 0) {
			collections.push({ modes, tokens });
		}
	}
	if (collections.length === 0) return undefined;
	const primary = [...collections].sort((a, b) => b.tokens - a.tokens)[0];
	const defaultMode = modeKey(
		(primary as { modes: string[] }).modes[0] as string,
	);
	const others = [
		...new Set(collections.flatMap((c) => c.modes.slice(1).map(modeKey))),
	]
		.filter((m) => m !== defaultMode)
		.sort();

	const withMode = (
		node: Record<string, unknown>,
		mode: string,
	): Record<string, unknown> => {
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(node)) {
			out[key] =
				isPlainObject(value) && !key.startsWith("$")
					? withMode(value, mode)
					: value;
		}
		if ("$value" in node) {
			const values = extensionModeValues(node);
			const hit =
				values === undefined
					? undefined
					: Object.keys(values).find((k) => modeKey(k) === mode);
			if (hit !== undefined && values !== undefined) out.$value = values[hit];
		}
		return out;
	};
	return [
		{ mode: defaultMode, doc },
		...others.map((mode) => ({ mode, doc: withMode(doc, mode) })),
	];
}

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
			const doc = parseTokenText(raw, path);
			const modeDocs = isPlainObject(doc) ? extensionModeDocs(doc) : undefined;
			return {
				kind: "ok",
				doc,
				...(modeDocs !== undefined ? { modeDocs } : {}),
				files: [path],
			};
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return {
				kind: "error",
				message: `Token source "${path}" is not valid ${path.endsWith(".json5") ? "JSON5" : "JSON"}: ${detail}`,
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
			message: `No token files found in "${path}". Expected W3C (DTCG), Tokens Studio, or Style Dictionary JSON / JSON5.`,
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
	if (byMode.size === 0) {
		const modeDocs = extensionModeDocs(shared);
		return {
			kind: "ok",
			doc: shared,
			...(modeDocs !== undefined ? { modeDocs } : {}),
			files,
		};
	}

	const modeNames = [...byMode.keys()];
	/** A variant mode (`dark-dimmed`) builds on its base mode (`dark`). */
	const baseOf = (mode: string): string | undefined =>
		modeNames
			.filter((m) => m !== mode && mode.startsWith(`${m}-`))
			.sort((a, b) => b.length - a.length)[0];
	const layered = (mode: string): Record<string, unknown> => {
		const base = baseOf(mode);
		const under = base === undefined ? shared : layered(base);
		return (byMode.get(mode) ?? []).reduce(deepMerge, under);
	};
	const modeDocs: ModeDocument[] = modeNames
		.sort((a, b) => (modeRank(a) < modeRank(b) ? -1 : 1))
		.map((mode) => {
			// A variant falls back to its base mode's overrides: Primer's
			// dark-dimmed is dark's values unless dark-dimmed says otherwise.
			const chain: string[] = [];
			for (let m: string | undefined = mode; m !== undefined; m = baseOf(m)) {
				chain.unshift(m);
			}
			return { mode, doc: applyModeOverrides(layered(mode), chain) };
		});
	return {
		kind: "ok",
		doc: (modeDocs[0] as ModeDocument).doc,
		...(modeDocs.length > 1 ? { modeDocs } : {}),
		files,
	};
}
