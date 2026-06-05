// T1.3 — Tokens Studio for Figma parser. Pure engine: no I/O, never throws on
// bad input; returns a typed ParseOutcome per the frozen contract in types.js.
import type {
	ParseError,
	ParseOutcome,
	Token,
	TokenType,
	TokenValue,
} from "./types.js";

/** Top-level keys that are NOT token sets. */
const RESERVED_KEYS = new Set(["$themes", "$metadata"]);

/** Tokens Studio source `type` → normalized TokenType. */
function mapType(sourceType: string): TokenType {
	switch (sourceType) {
		case "spacing":
		case "sizing":
		case "borderRadius":
		case "borderWidth":
		case "dimension":
			return "dimension";
		case "fontWeights":
			return "fontWeight";
		case "fontFamilies":
			return "fontFamily";
		case "color":
			return "color";
		case "opacity":
		case "number":
			return "number";
		case "boxShadow":
			return "shadow";
		case "typography":
			return "typography";
		default:
			return "other";
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A leaf token as authored within a set, before alias resolution. */
interface RawToken {
	name: string;
	type: TokenType;
	rawValue: TokenValue;
	description?: string;
	group: string;
}

/** A leaf has either value/type (classic) or $value/$type (newer). */
function readLeaf(
	node: Record<string, unknown>,
): { value: unknown; type: unknown; description?: unknown } | undefined {
	const hasClassic = "value" in node;
	const hasModern = "$value" in node;
	if (!hasClassic && !hasModern) return undefined;
	const value = hasModern ? node.$value : node.value;
	const type = hasModern ? node.$type : node.type;
	const description = node.$description ?? node.description;
	return { value, type, description };
}

/** Single full-string alias reference, e.g. "{colors.blue.500}". */
const ALIAS_RE = /^\{([^}]+)\}$/;

function aliasTarget(value: TokenValue): string | undefined {
	if (typeof value !== "string") return undefined;
	const match = ALIAS_RE.exec(value);
	return match ? match[1] : undefined;
}

/**
 * Walk a token set tree, collecting leaf tokens. Returns the leaves keyed by
 * their dot path within the set, or a ParseError on a malformed leaf.
 */
function collectSet(
	setName: string,
	tree: Record<string, unknown>,
	out: Map<string, RawToken>,
	errors: ParseError[],
): void {
	const walk = (node: Record<string, unknown>, pathParts: string[]): void => {
		const leaf = readLeaf(node);
		if (leaf !== undefined) {
			const path = pathParts.join(".");
			if (leaf.value === undefined) {
				errors.push({
					code: "invalid-shape",
					path: `${setName}.${path}`,
					message: `Token "${path}" in set "${setName}" has no value.`,
				});
				return;
			}
			const valueOk =
				typeof leaf.value === "string" ||
				typeof leaf.value === "number" ||
				isPlainObject(leaf.value);
			if (!valueOk) {
				errors.push({
					code: "invalid-shape",
					path: `${setName}.${path}`,
					message: `Token "${path}" in set "${setName}" has an unsupported value type.`,
				});
				return;
			}
			const sourceType = typeof leaf.type === "string" ? leaf.type : "other";
			const raw: RawToken = {
				name: path,
				type: mapType(sourceType),
				rawValue: leaf.value as TokenValue,
				group: setName,
			};
			if (typeof leaf.description === "string") {
				raw.description = leaf.description;
			}
			out.set(path, raw);
			return;
		}
		for (const [key, child] of Object.entries(node)) {
			if (!isPlainObject(child)) {
				errors.push({
					code: "invalid-shape",
					path: `${setName}.${[...pathParts, key].join(".")}`,
					message: `Expected a group or token object at "${[...pathParts, key].join(".")}" in set "${setName}".`,
				});
				continue;
			}
			walk(child, [...pathParts, key]);
		}
	};
	walk(tree, []);
}

/**
 * Determine the order in which token sets are merged. Later sets override
 * earlier ones on name collision.
 */
function resolveSetOrder(
	root: Record<string, unknown>,
	setNames: string[],
): string[] {
	const metadata = root.$metadata;
	if (
		isPlainObject(metadata) &&
		Array.isArray(metadata.tokenSetOrder) &&
		metadata.tokenSetOrder.every((s): s is string => typeof s === "string")
	) {
		const ordered = metadata.tokenSetOrder.filter((s) => setNames.includes(s));
		// Append any sets absent from tokenSetOrder, preserving key order.
		for (const name of setNames) {
			if (!ordered.includes(name)) ordered.push(name);
		}
		return ordered;
	}
	return setNames;
}

export function parseTokensStudio(source: unknown): ParseOutcome {
	if (!isPlainObject(source)) {
		return {
			kind: "error",
			errors: [
				{
					code: "invalid-shape",
					message: "Tokens Studio source must be a JSON object.",
				},
			],
		};
	}

	const errors: ParseError[] = [];
	const setNames = Object.keys(source).filter((k) => !RESERVED_KEYS.has(k));
	const order = resolveSetOrder(source, setNames);

	// Merge sets in order; later sets override earlier ones by name.
	const merged = new Map<string, RawToken>();
	for (const setName of order) {
		const tree = source[setName];
		if (!isPlainObject(tree)) {
			errors.push({
				code: "invalid-shape",
				path: setName,
				message: `Token set "${setName}" must be an object.`,
			});
			continue;
		}
		collectSet(setName, tree, merged, errors);
	}

	if (errors.length > 0) {
		return { kind: "error", errors };
	}

	// Resolve aliases against the merged view, with cycle detection.
	const resolved = new Map<string, { value: TokenValue; aliasOf?: string }>();

	const resolve = (
		name: string,
		seen: Set<string>,
	): { value: TokenValue; aliasOf?: string } | undefined => {
		const cached = resolved.get(name);
		if (cached !== undefined) return cached;

		const raw = merged.get(name);
		if (raw === undefined) {
			errors.push({
				code: "unknown-alias",
				path: name,
				message: `Alias target "${name}" was not found.`,
			});
			return undefined;
		}

		const target = aliasTarget(raw.rawValue);
		if (target === undefined) {
			const result = { value: raw.rawValue };
			resolved.set(name, result);
			return result;
		}

		if (seen.has(target)) {
			errors.push({
				code: "alias-cycle",
				path: name,
				message: `Alias cycle detected at "${name}" → "${target}".`,
			});
			return undefined;
		}

		const downstream = resolve(target, new Set(seen).add(target));
		if (downstream === undefined) return undefined;
		const result = { value: downstream.value, aliasOf: target };
		resolved.set(name, result);
		return result;
	};

	const tokens: Token[] = [];
	for (const [name, raw] of merged) {
		const res = resolve(name, new Set([name]));
		if (res === undefined) continue;
		const token: Token = {
			name,
			type: raw.type,
			value: res.value,
			group: raw.group,
		};
		if (raw.description !== undefined) token.description = raw.description;
		if (res.aliasOf !== undefined) token.aliasOf = res.aliasOf;
		tokens.push(token);
	}

	if (errors.length > 0) {
		return { kind: "error", errors };
	}

	tokens.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

	return {
		kind: "ok",
		map: { format: "tokens-studio", tokens },
		warnings: [],
	};
}
