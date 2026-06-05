// T2.2 — value extractors for the lint engine (PURE: no fs/network/process).
// Reverse-engineered from tests/fixtures/sample-project: makes every seeded
// violation reachable while extracting nothing from clean (var()-referencing)
// lines or the negative-control component. An in-house tokenizer/regex walk —
// no parser dependencies. Never throws; best-effort on malformed input.

/** Where a literal was found, for downstream messaging. */
export type LiteralContext =
	| "css-declaration"
	| "style-object"
	| "styled-template";

/** A raw color/dimension literal a linter should consider replacing with a token. */
export interface ExtractedLiteral {
	/** Source-relative path, as supplied by the caller. */
	file: string;
	/** 1-based line of the raw literal. */
	line: number;
	/** 1-based column of the first char of the raw literal. */
	col: number;
	/** The literal exactly as written (JSX color strings include their quotes). */
	raw: string;
	/** The CSS/style property the literal was assigned to. */
	property: string;
	valueKind: "color" | "dimension";
	context: LiteralContext;
}

/** A pending literal before file/context are attached, with line/col already absolute. */
interface RawHit {
	line: number;
	col: number;
	raw: string;
	property: string;
	valueKind: "color" | "dimension";
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN_RE = /\b(?:rgba?|hsla?)\([^)]*\)/i;
const DIM_RE = /-?\d+(?:\.\d+)?(?:px)?/;

// Spacing-ish CSS properties (kebab) and style-object props (camel) — dimensions
// are only flagged for these. Longhands match by prefix (padding-top, inset-block…).
const SPACING_PREFIXES = ["padding", "margin", "inset"];
const SPACING_EXACT = new Set([
	"gap",
	"row-gap",
	"column-gap",
	"rowGap",
	"columnGap",
	"top",
	"right",
	"bottom",
	"left",
]);

function isSpacingProperty(property: string): boolean {
	const lower = property.toLowerCase();
	if (SPACING_EXACT.has(property) || SPACING_EXACT.has(lower)) return true;
	for (const prefix of SPACING_PREFIXES) {
		if (lower === prefix || lower.startsWith(prefix)) return true;
	}
	return false;
}

/**
 * Replace /* *​/ comment spans with equal-length spaces so column offsets are
 * preserved while the commented content becomes invisible to extraction.
 */
function blankComments(text: string): string {
	let out = "";
	let i = 0;
	while (i < text.length) {
		if (text[i] === "/" && text[i + 1] === "*") {
			const end = text.indexOf("*/", i + 2);
			const stop = end === -1 ? text.length : end + 2;
			for (let j = i; j < stop; j++) out += text[j] === "\n" ? "\n" : " ";
			i = stop;
		} else {
			out += text[i];
			i += 1;
		}
	}
	return out;
}

/**
 * Walk a property value string, emitting color/dimension hits with columns
 * relative to the value's start. `var(...)` spans are skipped wholesale so token
 * references never surface. Dimensions emit only for spacing-ish properties and
 * only when nonzero.
 */
function* scanValue(
	value: string,
	property: string,
): Generator<{
	offset: number;
	raw: string;
	valueKind: "color" | "dimension";
}> {
	const spacing = isSpacingProperty(property);
	let i = 0;
	while (i < value.length) {
		const rest = value.slice(i);

		// Skip var(...) references entirely (token names are never literals).
		if (/^var\s*\(/i.test(rest)) {
			const close = value.indexOf(")", i);
			i = close === -1 ? value.length : close + 1;
			continue;
		}

		// Color functions: rgb()/rgba()/hsl()/hsla().
		const fn = COLOR_FN_RE.exec(rest);
		if (fn !== null && fn.index === 0) {
			yield { offset: i, raw: fn[0], valueKind: "color" };
			i += fn[0].length;
			continue;
		}

		// Hex colors.
		if (value[i] === "#") {
			const hex = HEX_RE.exec(rest);
			if (hex !== null && hex.index === 0) {
				yield { offset: i, raw: hex[0], valueKind: "color" };
				i += hex[0].length;
				continue;
			}
		}

		// Dimensions (only for spacing properties; skip identifiers/numbers in
		// function args by only matching at token boundaries below).
		if (spacing && (value[i] === "-" || /\d/.test(value[i] ?? ""))) {
			const prev = value[i - 1] ?? " ";
			// Only treat as a dimension at a value-token boundary, not mid-identifier.
			if (!/[a-zA-Z0-9.#-]/.test(prev)) {
				const dim = DIM_RE.exec(rest);
				if (dim !== null && dim.index === 0) {
					const px = Number.parseFloat(dim[0]);
					if (Number.isFinite(px) && px !== 0) {
						yield { offset: i, raw: dim[0], valueKind: "dimension" };
					}
					i += dim[0].length;
					continue;
				}
			}
		}

		i += 1;
	}
}

/**
 * Extract literals from CSS text. `lineBase` and `colBase` translate the local
 * coordinates into the host file (used when CSS lives inside a styled template).
 * `colBase` applies only to the first text line; later lines start at column 1.
 */
function extractCss(text: string, lineBase: number, colBase: number): RawHit[] {
	const hits: RawHit[] = [];
	const cleaned = blankComments(text);
	const lines = cleaned.split("\n");

	for (let li = 0; li < lines.length; li++) {
		const line = lines[li] ?? "";
		const colShift = li === 0 ? colBase : 0;
		// Match a `property: value` declaration. Value runs to ; } or EOL.
		const decl = /([\w-]+)\s*:\s*([^;}]*)/g;
		let m: RegExpExecArray | null = decl.exec(line);
		while (m !== null) {
			const property = m[1] ?? "";
			const value = m[2] ?? "";
			const valueStart = m.index + m[0].length - value.length;
			for (const hit of scanValue(value, property)) {
				hits.push({
					line: lineBase + li,
					col: colShift + valueStart + hit.offset + 1,
					raw: hit.raw,
					property,
					valueKind: hit.valueKind,
				});
			}
			m = decl.exec(line);
		}
	}
	return hits;
}

/** Convert an absolute string index into 1-based {line, col} for the given source. */
function indexToLineCol(
	source: string,
	index: number,
): { line: number; col: number } {
	let line = 1;
	let lineStart = 0;
	for (let i = 0; i < index; i++) {
		if (source[i] === "\n") {
			line += 1;
			lineStart = i + 1;
		}
	}
	return { line, col: index - lineStart + 1 };
}

const STYLE_OBJ_PROP_RE =
	/([A-Za-z][A-Za-z0-9]*)\s*:\s*("[^"]*"|'[^']*'|[^,}]*)/g;

/**
 * Extract literals from JSX/TSX: inline `style={{ ... }}` objects and
 * `styled.tag` template literals. Best-effort string scanning, no AST.
 */
function extractTsx(source: string, file: string): ExtractedLiteral[] {
	const out: ExtractedLiteral[] = [];

	// 1. Inline style objects: style={{ ... }}.
	const styleOpen = /style\s*=\s*\{\{/g;
	let so: RegExpExecArray | null = styleOpen.exec(source);
	while (so !== null) {
		const bodyStart = so.index + so[0].length;
		// Find the matching }} that closes the object literal.
		const close = source.indexOf("}}", bodyStart);
		const body = source.slice(bodyStart, close === -1 ? source.length : close);
		STYLE_OBJ_PROP_RE.lastIndex = 0;
		let pm: RegExpExecArray | null = STYLE_OBJ_PROP_RE.exec(body);
		while (pm !== null) {
			const property = pm[1] ?? "";
			const valueCapture = pm[2] ?? "";
			const rawValue = valueCapture.trim();
			// `\s*:\s*` consumes whitespace before the value, so pm[2] starts at
			// the value. Its body offset is where the whole match ends minus its
			// length, plus any leading whitespace the capture itself retained.
			const leading = valueCapture.length - valueCapture.trimStart().length;
			const valueIndexInBody =
				pm.index + pm[0].length - valueCapture.length + leading;
			const absValueIndex = bodyStart + valueIndexInBody;

			const quoted = /^(["'])(.*)\1$/.exec(rawValue);
			if (quoted !== null) {
				const inner = quoted[2] ?? "";
				if (isColorLiteral(inner)) {
					const pos = indexToLineCol(source, absValueIndex);
					out.push({
						file,
						line: pos.line,
						col: pos.col,
						raw: rawValue,
						property,
						valueKind: "color",
						context: "style-object",
					});
				}
			} else if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
				if (isSpacingProperty(property)) {
					const num = Number.parseFloat(rawValue);
					if (Number.isFinite(num) && num !== 0) {
						const pos = indexToLineCol(source, absValueIndex);
						out.push({
							file,
							line: pos.line,
							col: pos.col,
							raw: rawValue,
							property,
							valueKind: "dimension",
							context: "style-object",
						});
					}
				}
			}
			pm = STYLE_OBJ_PROP_RE.exec(body);
		}
		so = styleOpen.exec(source);
	}

	// 2. styled.tag`...` / styled(Comp)`...` template literals.
	const styledOpen = /\bstyled(?:\.[A-Za-z][\w]*|\([^)]*\))\s*`/g;
	let st: RegExpExecArray | null = styledOpen.exec(source);
	while (st !== null) {
		const backtickIndex = st.index + st[0].length - 1;
		const bodyStart = backtickIndex + 1;
		const close = source.indexOf("`", bodyStart);
		const body = source.slice(bodyStart, close === -1 ? source.length : close);
		const pos = indexToLineCol(source, bodyStart);
		// colBase is the column of the char after the backtick on its line.
		const cssHits = extractCss(body, pos.line, pos.col - 1);
		for (const hit of cssHits) {
			out.push({
				file,
				line: hit.line,
				col: hit.col,
				raw: hit.raw,
				property: hit.property,
				valueKind: hit.valueKind,
				context: "styled-template",
			});
		}
		st = styledOpen.exec(source);
	}

	return out;
}

const HEX_FULL_RE = /^#[0-9a-fA-F]{3,8}$/;
const COLOR_FN_FULL_RE = /^(?:rgba?|hsla?)\([^)]*\)$/i;

/** Does a bare (unquoted) value string read as a color literal? */
function isColorLiteral(value: string): boolean {
	const v = value.trim();
	return HEX_FULL_RE.test(v) || COLOR_FN_FULL_RE.test(v);
}

function extensionOf(path: string): string {
	const dot = path.lastIndexOf(".");
	return dot === -1 ? "" : path.slice(dot).toLowerCase();
}

function byLineThenCol(a: ExtractedLiteral, b: ExtractedLiteral): number {
	if (a.line !== b.line) return a.line - b.line;
	return a.col - b.col;
}

/**
 * Extract raw color/dimension literals from a source file. Files the extractor
 * does not understand (.json, .md, …) yield an empty array. Results are ordered
 * by line, then column (single-file deterministic order).
 */
export function extractLiterals(file: {
	path: string;
	content: string;
}): ExtractedLiteral[] {
	const ext = extensionOf(file.path);
	let result: ExtractedLiteral[] = [];

	try {
		if (ext === ".css" || ext === ".scss") {
			result = extractCss(file.content, 1, 0).map((hit) => ({
				file: file.path,
				line: hit.line,
				col: hit.col,
				raw: hit.raw,
				property: hit.property,
				valueKind: hit.valueKind,
				context: "css-declaration" as const,
			}));
		} else if (ext === ".tsx" || ext === ".jsx") {
			result = extractTsx(file.content, file.path);
		}
	} catch {
		// Best-effort: malformed input yields whatever was gathered before failure.
		return [];
	}

	return result.sort(byLineThenCol);
}
