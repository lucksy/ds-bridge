// T7.18 — llms.txt renderer. PURE: no fs/network/process; deterministic; NEVER
// throws. Builds a single, machine-readable system description string the docs
// CLI writes as `llms.txt`. Sections, in order:
//   - header + one-line purpose blockquote
//   - Tokens: source format, total count, and a per-type breakdown (or a note)
//   - Components: a one-line signature per component, with its import target (or
//     figma node ref when code-only is absent) and a documented/gaps tag
//
// One-line signature shape: `Name(prop: type, opt?: type)`. Required props read
// `prop: type`; optional props read `prop?: type`. The TokenType union drives a
// stable, declaration-ordered type breakdown (only non-zero types are listed).
//
// See tests/engines/docs/render-llms.test.ts for the pinned golden output.
import type { TokenMap, TokenType } from "../tokens/types.js";
import type { ComponentDoc } from "./merge.js";

/** TokenType order for the breakdown — mirrors the union in tokens/types.ts. */
const TOKEN_TYPE_ORDER: TokenType[] = [
	"color",
	"dimension",
	"fontFamily",
	"fontWeight",
	"duration",
	"number",
	"shadow",
	"typography",
	"other",
];

/** One-line prop signature, e.g. `(label: string, variant?: "primary" | …)`. */
function signature(doc: ComponentDoc): string {
	const parts = doc.code.props.map(
		(prop) => `${prop.name}${prop.required ? "" : "?"}: ${prop.type}`,
	);
	return `(${parts.join(", ")})`;
}

/** The location tag: the import path, or a `figma:<nodeId>` ref when code-only. */
function locationOf(doc: ComponentDoc): string {
	if (doc.code.importPath.length > 0) return doc.code.importPath;
	if (doc.figma !== undefined) return `figma:${doc.figma.nodeId}`;
	return "(no source)";
}

/** The status/gaps tag, e.g. `[documented]` or `[gaps: unmatched-in-code]`. */
function statusTag(doc: ComponentDoc): string {
	if (doc.gaps.length === 0) return "[documented]";
	return `[gaps: ${doc.gaps.join(", ")}]`;
}

/** The Tokens section: format, total, and a non-zero per-type breakdown. */
function renderTokens(tokens: TokenMap): string {
	const total = tokens.tokens.length;
	const head = ["## Tokens", "", `Format: ${tokens.format}`, `Total: ${total}`];
	if (total === 0) {
		return [...head, "", "_No tokens._"].join("\n");
	}

	const counts = new Map<TokenType, number>();
	for (const token of tokens.tokens) {
		counts.set(token.type, (counts.get(token.type) ?? 0) + 1);
	}
	const lines: string[] = [];
	for (const type of TOKEN_TYPE_ORDER) {
		const count = counts.get(type);
		if (count !== undefined && count > 0) lines.push(`- ${type}: ${count}`);
	}
	return [...head, "", ...lines].join("\n");
}

/** The Components inventory: one signature line each, or an empty-state note. */
function renderComponents(docs: ComponentDoc[]): string {
	const head = ["## Components"];
	if (docs.length === 0) {
		return [...head, "", "_No components._"].join("\n");
	}
	const lines = docs.map(
		(doc) =>
			`- ${doc.name}${signature(doc)} — ${locationOf(doc)} ${statusTag(doc)}`,
	);
	return [...head, "", ...lines].join("\n");
}

/**
 * Render the whole system as a single `llms.txt`-style string. Components are
 * emitted in the order given (the merge engine already name-sorts them). The
 * output ends with a trailing newline.
 */
export function renderLlmsTxt(docs: ComponentDoc[], tokens: TokenMap): string {
	const sections = [
		"# Design System",
		"> Machine-readable summary of the design system: tokens and components.",
		renderTokens(tokens),
		renderComponents(docs),
	];
	return `${sections.join("\n\n")}\n`;
}
