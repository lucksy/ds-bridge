// H12/H13 — pure `.gitattributes` edit for `ds-bridge history init`
// (SPEC-history-v2 §8.3–§8.4). `merge=union` lets git merge concurrent appends
// to the append-only history file line-by-line instead of conflicting. Opt-in
// only: nothing else in ds-bridge writes a user's .gitattributes.

/** The documented line (pattern + attribute). */
export const UNION_MERGE_LINE = ".ds-bridge/history.jsonl merge=union";

/** The history file, relative to the directory holding .gitattributes. */
const TARGET = ".ds-bridge/history.jsonl";
const TARGET_BASENAME = "history.jsonl";

/** Escape one literal character for a RegExp source. */
function escapeChar(ch: string): string {
	return /[.*+?^${}()|[\]\\/]/.test(ch) ? `\\${ch}` : ch;
}

/** Translate a gitattributes glob to an anchored RegExp (§8.4 subset). */
function globToRegExp(glob: string): RegExp {
	let source = "";
	let i = 0;
	while (i < glob.length) {
		const ch = glob[i] as string;
		if (ch === "*" && glob[i + 1] === "*") {
			if (glob[i + 2] === "/") {
				source += "(?:.*/)?";
				i += 3;
			} else {
				source += ".*";
				i += 2;
			}
		} else if (ch === "*") {
			source += "[^/]*";
			i += 1;
		} else if (ch === "?") {
			source += "[^/]";
			i += 1;
		} else if (ch === "[") {
			const end = glob.indexOf("]", i + 2);
			if (end === -1) {
				source += "\\[";
				i += 1;
			} else {
				let body = glob.slice(i + 1, end);
				if (body.startsWith("!")) body = `^${body.slice(1)}`;
				source += `[${body.replace(/\\/g, "\\\\")}]`;
				i = end + 1;
			}
		} else if (ch === "\\" && i + 1 < glob.length) {
			source += escapeChar(glob[i + 1] as string);
			i += 2;
		} else {
			source += escapeChar(ch);
			i += 1;
		}
	}
	return new RegExp(`^${source}$`);
}

/** True when a gitattributes pattern matches the history file. */
function patternMatchesTarget(pattern: string): boolean {
	if (pattern.endsWith("/")) return false; // directory-only: never a file
	if (!pattern.includes("/")) {
		return globToRegExp(pattern).test(TARGET_BASENAME);
	}
	const anchored = pattern.startsWith("/") ? pattern.slice(1) : pattern;
	return globToRegExp(anchored).test(TARGET);
}

/**
 * The value one attribute token gives `merge`, or undefined when the token
 * does not touch it. `binary` is git's built-in macro (`-diff -merge -text`).
 */
function mergeSetting(token: string): string | undefined {
	if (token === "merge" || token === "-merge" || token === "!merge") {
		return token;
	}
	if (token === "binary") return "-merge";
	if (token.startsWith("merge=")) return token;
	return undefined;
}

/**
 * The effective `merge` setting for the history file after the whole file
 * (last matching line / last token wins); undefined when nothing sets it.
 */
function effectiveMerge(text: string): string | undefined {
	let effective: string | undefined;
	for (const raw of text.split(/\r?\n/)) {
		const fields = raw.trim().split(/\s+/);
		const pattern = fields[0] ?? "";
		if (
			pattern === "" ||
			pattern.startsWith("#") ||
			pattern.startsWith("[attr]")
		) {
			continue;
		}
		if (!patternMatchesTarget(pattern)) continue;
		for (const token of fields.slice(1)) {
			const setting = mergeSetting(token);
			if (setting !== undefined) effective = setting;
		}
	}
	return effective;
}

/**
 * Ensure `text` (undefined = no file) leaves the history file with an
 * effective `merge=union`. Returns the text unchanged (byte-identical) when it
 * already does; otherwise appends the documented line (last line wins),
 * keeping the file's line ending. Never edits existing lines.
 */
export function ensureUnionMerge(text: string | undefined): {
	changed: boolean;
	text: string;
} {
	const current = text ?? "";
	const eol = current.includes("\r\n") ? "\r\n" : "\n";
	if (effectiveMerge(current) === "merge=union") {
		return { changed: false, text: current };
	}
	const separator = current === "" || current.endsWith("\n") ? "" : eol;
	return {
		changed: true,
		text: `${current}${separator}${UNION_MERGE_LINE}${eol}`,
	};
}
