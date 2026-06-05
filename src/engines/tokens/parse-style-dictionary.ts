// T1.4 — Style Dictionary v3 adapter. Pure: no I/O, never throws on bad input.
import type {
	ParseError,
	ParseOutcome,
	Token,
	TokenType,
	TokenValue,
} from "./types.js";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** First-path-segment → TokenType heuristic (SD has no explicit types). */
function inferType(firstSegment: string): TokenType {
	switch (firstSegment) {
		case "color":
			return "color";
		case "size":
		case "space":
		case "spacing":
			return "dimension";
		case "time":
			return "duration";
		default:
			// asset, content, and anything unknown bucket to "other".
			return "other";
	}
}

const ALIAS_PATTERN = /^\{(.+)\}$/;

/** Returns the referenced canonical name for an SD alias, or undefined. */
function aliasTarget(value: TokenValue): string | undefined {
	if (typeof value !== "string") return undefined;
	const match = ALIAS_PATTERN.exec(value);
	if (match === null) return undefined;
	const inner = match[1];
	if (inner === undefined) return undefined;
	// SD references address the leaf's `.value`; strip it for the canonical name.
	return inner.endsWith(".value") ? inner.slice(0, -".value".length) : inner;
}

/** A leaf collected from the source tree before alias resolution. */
interface RawToken {
	name: string;
	type: TokenType;
	group: string;
	rawValue: TokenValue;
	description: string | undefined;
	aliasOf: string | undefined;
}

function collect(
	node: JsonObject,
	path: readonly string[],
	raws: RawToken[],
	errors: ParseError[],
): void {
	if ("value" in node) {
		const name = path.join(".");
		const firstSegment = path[0] ?? "";
		const value = node.value;

		if (typeof value !== "string" && typeof value !== "number") {
			errors.push({
				code: "invalid-shape",
				path: name,
				message: `Token "${name}" has a non-scalar value; Style Dictionary leaves must be a string or number.`,
			});
			return;
		}

		const comment = node.comment;
		const description = typeof comment === "string" ? comment : undefined;

		raws.push({
			name,
			type: inferType(firstSegment),
			group: firstSegment,
			rawValue: value,
			description,
			aliasOf: aliasTarget(value),
		});
		return;
	}

	for (const [key, child] of Object.entries(node)) {
		if (isObject(child)) {
			collect(child, [...path, key], raws, errors);
		} else {
			const name = [...path, key].join(".");
			errors.push({
				code: "invalid-shape",
				path: name,
				message: `Node "${name}" is neither a token leaf (with a "value") nor a group object.`,
			});
		}
	}
}

type ResolveResult =
	| { ok: true; value: TokenValue }
	| { ok: false; error: ParseError };

/**
 * Resolve an alias chain to its terminal value, detecting cycles and missing
 * targets. Returns the resolved value or a ParseError describing the failure.
 */
function resolve(
	start: RawToken,
	byName: ReadonlyMap<string, RawToken>,
): ResolveResult {
	const seen = new Set<string>([start.name]);
	let current = start;

	while (current.aliasOf !== undefined) {
		const targetName = current.aliasOf;
		if (seen.has(targetName)) {
			return {
				ok: false,
				error: {
					code: "alias-cycle",
					path: start.name,
					message: `Alias cycle detected resolving "${start.name}" (revisited "${targetName}").`,
				},
			};
		}
		const next = byName.get(targetName);
		if (next === undefined) {
			return {
				ok: false,
				error: {
					code: "unknown-alias",
					path: current.name,
					message: `Alias "${current.name}" references unknown token "${targetName}".`,
				},
			};
		}
		seen.add(targetName);
		current = next;
	}

	return { ok: true, value: current.rawValue };
}

/** Parse a Style Dictionary v3 source into the normalized TokenMap contract. */
export function parseStyleDictionary(source: unknown): ParseOutcome {
	if (!isObject(source)) {
		return {
			kind: "error",
			errors: [
				{
					code: "invalid-shape",
					message:
						"Style Dictionary source must be a JSON object at the top level.",
				},
			],
		};
	}

	const raws: RawToken[] = [];
	const errors: ParseError[] = [];
	collect(source, [], raws, errors);

	if (errors.length > 0) {
		return { kind: "error", errors };
	}

	if (raws.length === 0) {
		return {
			kind: "error",
			errors: [
				{
					code: "invalid-shape",
					message:
						'Style Dictionary source contains no tokens (no leaves with a "value").',
				},
			],
		};
	}

	const byName = new Map<string, RawToken>(raws.map((r) => [r.name, r]));
	const tokens: Token[] = [];
	const resolveErrors: ParseError[] = [];

	for (const raw of raws) {
		const resolved = resolve(raw, byName);
		if (!resolved.ok) {
			resolveErrors.push(resolved.error);
			continue;
		}

		const token: Token = {
			name: raw.name,
			type: raw.type,
			value: resolved.value,
			...(raw.description !== undefined
				? { description: raw.description }
				: {}),
			...(raw.aliasOf !== undefined ? { aliasOf: raw.aliasOf } : {}),
			group: raw.group,
		};
		tokens.push(token);
	}

	if (resolveErrors.length > 0) {
		return { kind: "error", errors: resolveErrors };
	}

	tokens.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

	return {
		kind: "ok",
		map: { format: "style-dictionary", tokens },
		warnings: [],
	};
}
