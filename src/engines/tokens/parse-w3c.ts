// T1.2 — W3C Design Tokens Community Group draft parser.
// Walks $value/$type/$description nodes, inherits group-level $type from the
// nearest ancestor, resolves {dot.path} aliases (transitively, with cycle
// detection), and emits the frozen normalized TokenMap. Never throws on bad
// input — returns a discriminated ParseOutcome instead.
import type {
	ParseError,
	ParseOutcome,
	Token,
	TokenType,
	TokenValue,
} from "./types.js";

/** W3C $type strings that map 1:1 onto TokenType. */
const KNOWN_TYPES: ReadonlySet<TokenType> = new Set<TokenType>([
	"color",
	"dimension",
	"fontFamily",
	"fontWeight",
	"duration",
	"number",
	"shadow",
	"typography",
]);

/** A token as collected from the tree, before alias resolution. */
interface RawToken {
	name: string;
	type: TokenType;
	rawValue: TokenValue;
	description?: string;
	group: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the {dot.path} target when `value` is a single alias reference. */
function aliasTarget(value: TokenValue): string | undefined {
	if (typeof value !== "string") return undefined;
	const match = /^\{([^}]+)\}$/.exec(value.trim());
	return match ? match[1] : undefined;
}

function mapType(raw: unknown, path: string, warnings: string[]): TokenType {
	if (typeof raw !== "string") return "other";
	if (KNOWN_TYPES.has(raw as TokenType)) return raw as TokenType;
	warnings.push(`${path}: unrecognized $type "${raw}" — treated as "other"`);
	return "other";
}

/**
 * Depth-first walk collecting raw tokens. Any malformed node pushes an
 * `invalid-shape` error and aborts the subtree (errors short-circuit later).
 */
function collect(
	node: Record<string, unknown>,
	pathSegments: readonly string[],
	inheritedType: unknown,
	warnings: string[],
	errors: ParseError[],
	out: RawToken[],
): void {
	const path = pathSegments.join(".");
	const ownType =
		"$type" in node && node.$type !== undefined ? node.$type : inheritedType;

	if ("$value" in node) {
		const value = node.$value;
		if (
			typeof value !== "string" &&
			typeof value !== "number" &&
			!isPlainObject(value)
		) {
			errors.push({
				code: "invalid-shape",
				path,
				message: `${path}: $value must be a string, number, or object`,
			});
			return;
		}
		const group = pathSegments[0];
		if (group === undefined) {
			errors.push({
				code: "invalid-shape",
				path,
				message: "token must live under a top-level group",
			});
			return;
		}
		const token: RawToken = {
			name: path,
			type: mapType(ownType, path, warnings),
			rawValue: value as TokenValue,
			group,
		};
		if (typeof node.$description === "string") {
			token.description = node.$description;
		}
		out.push(token);
		return;
	}

	for (const [key, child] of Object.entries(node)) {
		if (key.startsWith("$")) continue;
		const childPath = [...pathSegments, key];
		if (!isPlainObject(child)) {
			errors.push({
				code: "invalid-shape",
				path: childPath.join("."),
				message: `${childPath.join(".")}: expected a group or token object`,
			});
			continue;
		}
		collect(child, childPath, ownType, warnings, errors, out);
	}
}

/**
 * Resolves a raw value to its final value and direct alias name. Follows
 * transitive aliases through `byName`; detects cycles and dangling refs.
 */
function resolve(
	raw: RawToken,
	byName: ReadonlyMap<string, RawToken>,
	errors: ParseError[],
): { value: TokenValue; aliasOf?: string } | undefined {
	const direct = aliasTarget(raw.rawValue);
	if (direct === undefined) return { value: raw.rawValue };

	const seen = new Set<string>([raw.name]);
	let currentTarget = direct;
	for (;;) {
		const target = byName.get(currentTarget);
		if (target === undefined) {
			errors.push({
				code: "unknown-alias",
				path: currentTarget,
				message: `${raw.name}: alias references unknown token "${currentTarget}"`,
			});
			return undefined;
		}
		if (seen.has(currentTarget)) {
			errors.push({
				code: "alias-cycle",
				path: raw.name,
				message: `alias cycle involving "${raw.name}"`,
			});
			return undefined;
		}
		seen.add(currentTarget);
		const next = aliasTarget(target.rawValue);
		if (next === undefined) {
			return { value: target.rawValue, aliasOf: direct };
		}
		currentTarget = next;
	}
}

export function parseW3c(source: unknown): ParseOutcome {
	if (!isPlainObject(source)) {
		return {
			kind: "error",
			errors: [
				{
					code: "invalid-shape",
					message: "root must be a JSON object",
				},
			],
		};
	}

	const warnings: string[] = [];
	const errors: ParseError[] = [];
	const raws: RawToken[] = [];
	collect(source, [], undefined, warnings, errors, raws);

	if (errors.length > 0) {
		return { kind: "error", errors };
	}

	const byName = new Map<string, RawToken>(raws.map((r) => [r.name, r]));
	const tokens: Token[] = [];
	for (const raw of raws) {
		const resolved = resolve(raw, byName, errors);
		if (resolved === undefined) continue;
		const token: Token = {
			name: raw.name,
			type: raw.type,
			value: resolved.value,
			group: raw.group,
		};
		if (raw.description !== undefined) token.description = raw.description;
		if (resolved.aliasOf !== undefined) token.aliasOf = resolved.aliasOf;
		tokens.push(token);
	}

	if (errors.length > 0) {
		return { kind: "error", errors };
	}

	tokens.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

	return {
		kind: "ok",
		map: { format: "w3c", tokens },
		warnings,
	};
}
