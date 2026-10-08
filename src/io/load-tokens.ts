// One token loader for every command. Reads a token source — a file, or a
// folder of token files read as one set (see token-set.ts) — detects its
// format, parses it, and derives its modes: Tokens Studio `$themes`, or a
// set's per-mode files. Never throws: every failure is a typed outcome whose
// message the command prints.
import { detectFormat } from "../engines/tokens/detect.js";
import { parseStyleDictionary } from "../engines/tokens/parse-style-dictionary.js";
import { parseTokensStudio } from "../engines/tokens/parse-tokens-studio.js";
import { parseW3c } from "../engines/tokens/parse-w3c.js";
import { readThemes, themeSubDocument } from "../engines/tokens/themes.js";
import type {
	ParseOutcome,
	TokenMap,
	TokenSourceFormat,
} from "../engines/tokens/types.js";
import { readTokenDocument } from "./token-set.js";

const PARSERS: Record<TokenSourceFormat, (source: unknown) => ParseOutcome> = {
	w3c: parseW3c,
	"tokens-studio": parseTokensStudio,
	"style-dictionary": parseStyleDictionary,
};

/** One mode's parsed tokens. */
export interface LoadedMode {
	mode: string;
	map: TokenMap;
}

export type LoadTokensOutcome =
	| {
			kind: "ok";
			format: TokenSourceFormat;
			/** The default mode's tokens (the whole source when it has no modes). */
			map: TokenMap;
			/** Two or more modes, default first; absent for a single-mode source. */
			modes?: LoadedMode[];
			warnings: string[];
			/** The token files read, sorted. */
			files: string[];
	  }
	| { kind: "error"; message: string };

function parseFailure(
	what: string,
	format: string,
	outcome: Extract<ParseOutcome, { kind: "error" }>,
): { kind: "error"; message: string } {
	const lines = outcome.errors.map((e) => {
		const where = e.path !== undefined ? ` (${e.path})` : "";
		return `  ${e.code}${where}: ${e.message}`;
	});
	return {
		kind: "error",
		message: `Failed to parse ${what} as ${format}:\n${lines.join("\n")}`,
	};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A mode document with each token an `unknown-alias` error names reverted to
 * its default-mode node. Undefined when an error names no token (nothing to
 * revert) or a token cannot be found in both documents.
 */
function repairMode(
	doc: unknown,
	defaultDoc: unknown,
	errors: readonly { code: string; message: string }[],
):
	| { doc: unknown; reverted: { token: string; message: string }[] }
	| undefined {
	if (!isPlainObject(doc) || !isPlainObject(defaultDoc)) return undefined;
	const reverted: { token: string; message: string }[] = [];
	const copy = structuredClone(doc) as Record<string, unknown>;
	for (const error of errors) {
		if (error.code !== "unknown-alias") return undefined;
		const match = /^(.+?): (alias references unknown token .*)$/.exec(
			error.message,
		);
		if (match === null) return undefined;
		const [, token, message] = match as unknown as [string, string, string];
		const path = token.split(".");
		const fallback = path.reduce<unknown>(
			(node, key) => (isPlainObject(node) ? node[key] : undefined),
			defaultDoc,
		);
		const parentPath = path.slice(0, -1);
		const parent = parentPath.reduce<unknown>(
			(node, key) => (isPlainObject(node) ? node[key] : undefined),
			copy,
		);
		const last = path[path.length - 1];
		if (!isPlainObject(parent) || last === undefined || fallback === undefined)
			return undefined;
		parent[last] = structuredClone(fallback);
		if (!reverted.some((r) => r.token === token))
			reverted.push({ token, message });
	}
	return reverted.length > 0 ? { doc: copy, reverted } : undefined;
}

/** Load and parse the token source at `path` (file or folder). */
export function loadTokens(path: string): LoadTokensOutcome {
	const read = readTokenDocument(path);
	if (read.kind === "error") return read;

	const format = detectFormat(read.doc);
	if (format === "unknown") {
		return {
			kind: "error",
			message: `Could not detect a supported token format for "${path}". Expected W3C, Tokens Studio, or Style Dictionary.`,
		};
	}
	const parse = PARSERS[format];
	const outcome = parse(read.doc);
	if (outcome.kind === "error") {
		return parseFailure(`token source "${path}"`, format, outcome);
	}
	const base = {
		kind: "ok" as const,
		format,
		map: outcome.map,
		warnings: outcome.warnings,
		files: read.files,
	};

	if (read.modeDocs !== undefined) {
		const modes: LoadedMode[] = [];
		const warnings = [...base.warnings];
		const defaultDoc = read.modeDocs[0]?.doc;
		for (const [index, { mode, doc }] of read.modeDocs.entries()) {
			let parsed = parse(doc);
			if (parsed.kind === "error" && index > 0) {
				// One broken value (an alias into a palette the export never wrote)
				// must not cost the whole mode: those tokens keep their default
				// value in it, each named in a warning; every other value stays.
				const repaired = repairMode(doc, defaultDoc, parsed.errors);
				if (repaired !== undefined) {
					const retry = parse(repaired.doc);
					if (retry.kind === "ok") {
						for (const { token, message } of repaired.reverted) {
							warnings.push(
								`mode "${mode}": ${token} keeps its default value — ${message}`,
							);
						}
						parsed = retry;
					}
				}
			}
			if (parsed.kind === "error") {
				if (index === 0) {
					return parseFailure(`mode "${mode}" of "${path}"`, format, parsed);
				}
				const first = parsed.errors[0];
				const more =
					parsed.errors.length > 1
						? ` (+${parsed.errors.length - 1} more)`
						: "";
				warnings.push(
					`mode "${mode}" skipped: ${first?.message ?? "parse error"}${more}`,
				);
				continue;
			}
			modes.push({ mode, map: parsed.map });
		}
		if (modes.length < 2) return { ...base, warnings };
		return { ...base, warnings, modes };
	}

	const themes =
		format === "tokens-studio" && isPlainObject(read.doc)
			? readThemes(read.doc)
			: undefined;
	if (themes === undefined || themes.length < 2 || !isPlainObject(read.doc)) {
		return base;
	}
	const modes: LoadedMode[] = [];
	for (const theme of themes) {
		const themed = parseTokensStudio(themeSubDocument(read.doc, theme));
		if (themed.kind === "error") {
			return parseFailure(`theme "${theme.name}" of "${path}"`, format, themed);
		}
		modes.push({ mode: theme.name, map: themed.map });
	}
	return { ...base, modes };
}
