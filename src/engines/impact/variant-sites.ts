// Value-level migration sites. PURE: source text in, line numbers out.
//
// A Figma change that removes a variant value (`Avatar -Size=Large`) or a whole
// axis breaks the JSX that passes it — not every file importing Avatar.
// Figma axes and values compare to JSX props loosely (case, spaces, dashes):
// `Size=Large` is `size="large"`, `Value Type` is `valueType`.
import type { VariantChange } from "./component-diff.js";

export interface VariantUsageLine {
	/** 1-based line of the element's opening tag. */
	line: number;
	reason: string;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** `<Name …>` opening tags with their attribute text and starting offset. */
function openingTags(
	source: string,
	codeName: string,
): { index: number; attrs: string }[] {
	const out: { index: number; attrs: string }[] = [];
	const re = new RegExp(`<${codeName}(?=[\\s/>])`, "g");
	for (const match of source.matchAll(re)) {
		const start = (match.index ?? 0) + match[0].length;
		// Scan to the tag's closing `>`, skipping `{…}` expressions and strings.
		let depth = 0;
		let quote: string | undefined;
		let i = start;
		for (; i < source.length; i++) {
			const ch = source[i] as string;
			if (quote !== undefined) {
				if (ch === quote) quote = undefined;
				continue;
			}
			if (ch === '"' || ch === "'" || ch === "`") quote = ch;
			else if (ch === "{") depth += 1;
			else if (ch === "}") depth -= 1;
			else if (ch === ">" && depth === 0) break;
		}
		out.push({ index: match.index ?? 0, attrs: source.slice(start, i) });
	}
	return out;
}

/** The literal string props of an opening tag: `size="lg"`, `size={"lg"}`. */
function literalProps(
	attrs: string,
): Map<string, { name: string; value: string }> {
	const props = new Map<string, { name: string; value: string }>();
	const re =
		/([A-Za-z_$][\w$-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/g;
	for (const m of attrs.matchAll(re)) {
		const name = m[1] as string;
		props.set(norm(name), { name, value: m[2] ?? m[3] ?? m[4] ?? "" });
	}
	return props;
}

/** Every prop name an opening tag sets (literal or expression). */
function propNames(attrs: string): Map<string, string> {
	const names = new Map<string, string>();
	for (const m of attrs.matchAll(/([A-Za-z_$][\w$-]*)\s*=/g)) {
		names.set(norm(m[1] as string), m[1] as string);
	}
	return names;
}

/**
 * The lines where `codeName` elements use what the variant changes remove:
 * an element passing a removed value, or setting a removed axis. Additions
 * break nothing and never produce a line.
 */
export function variantUsageLines(
	source: string,
	codeName: string,
	changes: readonly VariantChange[],
): VariantUsageLine[] {
	const breaking = changes.filter(
		(c) => c.kind === "value-removed" || c.kind === "axis-removed",
	);
	if (breaking.length === 0) return [];
	const lines: VariantUsageLine[] = [];
	for (const tag of openingTags(source, codeName)) {
		const line = source.slice(0, tag.index).split("\n").length;
		const literals = literalProps(tag.attrs);
		const names = propNames(tag.attrs);
		for (const change of breaking) {
			const key = norm(change.axis);
			if (change.kind === "value-removed") {
				const prop = literals.get(key);
				if (prop !== undefined && norm(prop.value) === norm(change.value)) {
					lines.push({
						line,
						reason: `passes ${prop.name}="${prop.value}" (${change.axis}=${change.value} removed)`,
					});
				}
			} else {
				const name = names.get(key);
				if (name !== undefined) {
					lines.push({
						line,
						reason: `sets ${name} (axis ${change.axis} removed)`,
					});
				}
			}
		}
	}
	return lines;
}
