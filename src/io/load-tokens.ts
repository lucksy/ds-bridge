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
		for (const { mode, doc } of read.modeDocs) {
			const parsed = parse(doc);
			if (parsed.kind === "error") {
				return parseFailure(`mode "${mode}" of "${path}"`, format, parsed);
			}
			modes.push({ mode, map: parsed.map });
		}
		return { ...base, modes };
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
