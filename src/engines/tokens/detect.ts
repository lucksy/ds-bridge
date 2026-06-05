// T1.4 — design-token format auto-detection. Detects from SHAPE, never filename.
import type { TokenSourceFormat } from "./types.js";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when an object looks like a token leaf in any supported format. */
function hasW3cValue(node: JsonObject): boolean {
	return "$value" in node;
}

function hasPlainValue(node: JsonObject): boolean {
	return "value" in node;
}

interface ShapeScan {
	/** Any leaf carried a W3C `$value`. */
	hasW3c: boolean;
	/** Any leaf carried a plain `value`. */
	hasPlain: boolean;
	/** Any plain-value leaf also carried a sibling `type`. */
	hasPlainWithType: boolean;
	/** Any node carried a `$`-prefixed marker (e.g. `$value`, `$type`). */
	hasDollarMarker: boolean;
}

/** Recursively scan the tree, classifying leaves by the markers they carry. */
function scan(node: JsonObject, acc: ShapeScan): void {
	for (const key of Object.keys(node)) {
		if (key.startsWith("$")) acc.hasDollarMarker = true;
	}

	if (hasW3cValue(node)) {
		acc.hasW3c = true;
		// A W3C leaf's $value may be a composite object; do not descend into it.
		return;
	}

	if (hasPlainValue(node)) {
		acc.hasPlain = true;
		if ("type" in node) acc.hasPlainWithType = true;
		// A plain leaf is terminal; its `value` is the authored token value.
		return;
	}

	for (const child of Object.values(node)) {
		if (isObject(child)) scan(child, acc);
	}
}

/**
 * Detect the source format of a parsed token document by its shape.
 * Returns "unknown" for empty objects, arrays, primitives, or unmatched shapes.
 */
export function detectFormat(source: unknown): TokenSourceFormat | "unknown" {
	if (!isObject(source)) return "unknown";

	const hasThemes = "$themes" in source;
	const hasMetadata = "$metadata" in source;

	const acc: ShapeScan = {
		hasW3c: false,
		hasPlain: false,
		hasPlainWithType: false,
		hasDollarMarker: false,
	};
	scan(source, acc);

	// W3C wins whenever a $value marker appears anywhere in the tree.
	if (acc.hasW3c) return "w3c";

	// Tokens Studio: top-level $themes/$metadata, or value+type leaves.
	if (hasThemes || hasMetadata) return "tokens-studio";
	if (acc.hasPlainWithType) return "tokens-studio";

	// Style Dictionary: plain `value` leaves, no type, no $-markers.
	if (acc.hasPlain && !acc.hasDollarMarker) return "style-dictionary";

	return "unknown";
}
