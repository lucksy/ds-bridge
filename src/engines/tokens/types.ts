// T1.1 — FROZEN CONTRACT for the parser trio (T1.2 W3C, T1.3 Tokens Studio,
// T1.4 Style Dictionary). All three parsers emit this normalized model.
// Changing this file mid-trio breaks parallel work — coordinate via TASKS.md.

/** Token categories the engines reason about. Parsers map source types onto these. */
export type TokenType =
	| "color"
	| "dimension"
	| "fontFamily"
	| "fontWeight"
	| "duration"
	| "number"
	| "shadow"
	| "typography"
	| "other";

/**
 * Simple token values stay as authored (post alias-resolution): "#3b82f6", "16px", 1.5.
 * Composite tokens (shadow, typography) keep their object shape.
 */
export type TokenValue = string | number | Record<string, unknown>;

export interface Token {
	/**
	 * Canonical dot-separated path addressing the token in its source format,
	 * e.g. "color.brand.primary". Tokens Studio set names are NOT part of the
	 * name (sets merge by order); the set lives in `group`.
	 */
	name: string;
	type: TokenType;
	/** Value with aliases fully resolved. */
	value: TokenValue;
	description?: string;
	/** When the source value was an alias, the name of the referenced token. */
	aliasOf?: string;
	/**
	 * Provenance bucket: W3C/Style Dictionary → first path segment;
	 * Tokens Studio → source set name.
	 */
	group?: string;
}

export type TokenSourceFormat = "w3c" | "tokens-studio" | "style-dictionary";

export interface TokenMap {
	format: TokenSourceFormat;
	/** Sorted by `name` for stable diffs. */
	tokens: Token[];
}

export type ParseErrorCode =
	| "alias-cycle"
	| "unknown-alias"
	| "invalid-shape"
	| "unsupported-type";

export interface ParseError {
	code: ParseErrorCode;
	/** Dot path of the offending node, when known. */
	path?: string;
	message: string;
}

/** Parsers never throw on bad input — they return a typed outcome. */
export type ParseOutcome =
	| { kind: "ok"; map: TokenMap; warnings: string[] }
	| { kind: "error"; errors: ParseError[] };
