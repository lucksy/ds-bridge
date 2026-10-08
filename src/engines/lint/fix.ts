// T2.4 — fix planner for the lint engine (PURE: no fs/network/process).
// Turns a set of (literal, match) findings into deterministic TextEdits and
// applies them. Only `exact` findings are fixable, and only when they resolve to
// a SIMPLE token (a composite shadow/typography token has no single var() for
// its inner color — those are reported but unfixable in v1). Replacements are
// chosen by the literal's surrounding context so the rewrite is syntactically
// valid wherever it lands (bare var() in CSS, a quoted var() string in JSX
// inline-style objects). Never throws.

import type { Token } from "../tokens/types.js";
import type { ExtractedLiteral } from "./extract.js";
import type { LiteralMatch } from "./match.js";

/** A pending in-place text replacement, addressed by 1-based line/col + char length. */
export interface TextEdit {
	/** Source-relative path, as carried by the literal. */
	file: string;
	/** 1-based line of the raw literal being replaced. */
	line: number;
	/** 1-based column of the first char of the raw literal. */
	col: number;
	/** Number of characters of the raw literal to replace. */
	length: number;
	/** Text to insert in place of those characters. */
	replacement: string;
}

/** One linter finding: an extracted literal paired with its match outcome. */
export interface Finding {
	literal: ExtractedLiteral;
	match: LiteralMatch;
}

/** A token is composite (and thus unfixable here) when its value is an object. */
function isCompositeToken(token: Token): boolean {
	return typeof token.value === "object" && token.value !== null;
}

/**
 * The custom property a token is emitted as when the build is unknown:
 * `color.brand.primary` → `color-brand-primary`. Collection markers (`@`, `$`)
 * and spaces never reach CSS — `--@size-space-400` is not a valid name.
 */
export function defaultCssVarName(token: Token): string {
	return token.name
		.split(".")
		.map((segment) => segment.replace(/^[@$]/, "").trim().replace(/\s+/g, "-"))
		.join("-");
}

/** CSS custom-property reference for a token: the emitted name when known. */
function toCssVar(
	token: Token,
	emittedName?: (token: Token) => string | undefined,
): string {
	return `var(--${emittedName?.(token) ?? defaultCssVarName(token)})`;
}

/** The surrounding quote char of a quote-wrapped raw value, or undefined if bare. */
function quoteOf(raw: string): '"' | "'" | undefined {
	const first = raw[0];
	const last = raw[raw.length - 1];
	if (raw.length >= 2 && (first === '"' || first === "'") && first === last) {
		return first;
	}
	return undefined;
}

/**
 * Build the replacement text for one exact, simple-token finding, chosen by the
 * literal's context:
 *   - css-declaration / styled-template / style-string (a value inside a JSX
 *     style string, whose quotes stay) → bare var(...)
 *   - style-object, quoted value         → var(...) wrapped in the original quotes
 *   - style-object, bare number          → "var(...)" (a quoted string; CSS custom
 *     properties are valid JSX inline-style values)
 */
function replacementFor(
	literal: ExtractedLiteral,
	token: Token,
	emittedName?: (token: Token) => string | undefined,
): string {
	const cssVar = toCssVar(token, emittedName);
	if (literal.context !== "style-object") return cssVar;

	const quote = quoteOf(literal.raw);
	if (quote !== undefined) return `${quote}${cssVar}${quote}`;
	// Bare style-object value (a dimension number) — wrap so it stays a string.
	return `"${cssVar}"`;
}

/** Compare two edits for the deterministic order: file asc, then line/col DESC. */
function compareEdits(a: TextEdit, b: TextEdit): number {
	if (a.file !== b.file) return a.file < b.file ? -1 : 1;
	if (a.line !== b.line) return b.line - a.line;
	return b.col - a.col;
}

/**
 * Plan in-place fixes for a set of findings. Only `exact` matches to simple
 * (non-composite) tokens produce edits; `near`, `off-system`, and composite
 * exacts produce none. The returned edits are deterministic, sorted by file
 * ascending then line/col descending within each file so they can be applied
 * from the end of each file without invalidating earlier positions.
 */
export function planFixes(
	findings: readonly Finding[],
	/** The custom property the build emits a token as (`sds-size-space-400`). */
	emittedName?: (token: Token) => string | undefined,
): TextEdit[] {
	const edits: TextEdit[] = [];
	for (const { literal, match } of findings) {
		if (match.kind !== "exact") continue;
		if (isCompositeToken(match.token)) continue;
		edits.push({
			file: literal.file,
			line: literal.line,
			col: literal.col,
			length: literal.raw.length,
			replacement: replacementFor(literal, match.token, emittedName),
		});
	}
	return edits.sort(compareEdits);
}

/**
 * Apply a single file's edits to its content via line/col/length, returning the
 * new content. Edits may arrive in any order — they are applied per line from the
 * rightmost column first so earlier columns on the same line stay valid. Out-of-
 * range edits are skipped (best-effort; never throws).
 */
export function applyEdits(
	content: string,
	edits: readonly TextEdit[],
): string {
	if (edits.length === 0) return content;
	const lines = content.split("\n");
	// Group edits by line, applying highest column first within each line.
	const byLine = new Map<number, TextEdit[]>();
	for (const edit of edits) {
		const bucket = byLine.get(edit.line);
		if (bucket === undefined) byLine.set(edit.line, [edit]);
		else bucket.push(edit);
	}
	for (const [line, lineEdits] of byLine) {
		const index = line - 1;
		const text = lines[index];
		if (text === undefined) continue;
		let next = text;
		for (const edit of [...lineEdits].sort((a, b) => b.col - a.col)) {
			const start = edit.col - 1;
			if (start < 0 || start > next.length) continue;
			next =
				next.slice(0, start) +
				edit.replacement +
				next.slice(start + edit.length);
		}
		lines[index] = next;
	}
	return lines.join("\n");
}
