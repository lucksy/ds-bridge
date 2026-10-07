// T1.2 — W3C Design Tokens Community Group draft parser.
// Walks $value/$type/$description nodes, inherits group-level $type from the
// nearest ancestor, resolves {dot.path} aliases (transitively, with cycle
// detection), and emits the frozen normalized TokenMap. Never throws on bad
// input — returns a discriminated ParseOutcome instead.
import { formatHex, formatHex8, parse } from "culori";
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
	/** Primer's `alpha` beside `$value`: opacity applied to a color token. */
	alpha?: number;
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

/** DTCG color spaces → culori mode names (2025.10 color objects). */
const COLOR_SPACES: Readonly<Record<string, string>> = {
	srgb: "rgb",
	"srgb-linear": "lrgb",
	hsl: "hsl",
	hwb: "hwb",
	lab: "lab",
	lch: "lch",
	oklab: "oklab",
	oklch: "oklch",
	"display-p3": "p3",
	"a98-rgb": "a98",
	"prophoto-rgb": "prophoto",
	rec2020: "rec2020",
	"xyz-d65": "xyz65",
	"xyz-d50": "xyz50",
};

/** Hex of a DTCG 2025 color object: its `hex` when given, else computed. */
function colorObjectHex(value: Record<string, unknown>): string | undefined {
	const alpha = typeof value.alpha === "number" ? value.alpha : 1;
	if (typeof value.hex === "string" && /^#[0-9a-f]{6}$/i.test(value.hex)) {
		const hex = value.hex.toLowerCase();
		if (alpha >= 1) return hex;
		const a = Math.round(alpha * 255)
			.toString(16)
			.padStart(2, "0");
		return `${hex}${a}`;
	}
	const mode =
		typeof value.colorSpace === "string"
			? COLOR_SPACES[value.colorSpace]
			: undefined;
	const c = value.components;
	if (mode === undefined || !Array.isArray(c) || c.length !== 3)
		return undefined;
	if (!c.every((n) => typeof n === "number")) return undefined;
	const [x, y, z] = c as number[];
	const channels: Record<string, Record<string, number>> = {
		rgb: { r: x as number, g: y as number, b: z as number },
		lrgb: { r: x as number, g: y as number, b: z as number },
		p3: { r: x as number, g: y as number, b: z as number },
		a98: { r: x as number, g: y as number, b: z as number },
		prophoto: { r: x as number, g: y as number, b: z as number },
		rec2020: { r: x as number, g: y as number, b: z as number },
		hsl: { h: x as number, s: (y as number) / 100, l: (z as number) / 100 },
		hwb: { h: x as number, w: (y as number) / 100, b: (z as number) / 100 },
		lab: { l: x as number, a: y as number, b: z as number },
		lch: { l: x as number, c: y as number, h: z as number },
		oklab: { l: x as number, a: y as number, b: z as number },
		oklch: { l: x as number, c: y as number, h: z as number },
		xyz65: { x: x as number, y: y as number, z: z as number },
		xyz50: { x: x as number, y: y as number, z: z as number },
	};
	const color = { mode, ...channels[mode], alpha } as Parameters<
		typeof formatHex
	>[0];
	return alpha < 1 ? formatHex8(color) : formatHex(color);
}

/**
 * Collapse the DTCG 2025.10 structured values onto the flat forms every engine
 * compares: a color object becomes its hex, a `{value, unit}` dimension or
 * duration a CSS string (`4px`, `100ms`), a font stack a comma list and a
 * cubic-bezier array its CSS function. Other arrays (layered shadows) stay
 * composite. Anything already flat passes through.
 */
function flattenValue(type: unknown, value: unknown): TokenValue | undefined {
	if (typeof value === "string" || typeof value === "number") return value;
	if (Array.isArray(value)) {
		if (type === "fontFamily" && value.every((v) => typeof v === "string")) {
			return value.join(", ");
		}
		if (
			type === "cubicBezier" &&
			value.length === 4 &&
			value.every((v) => typeof v === "number")
		) {
			return `cubic-bezier(${value.join(", ")})`;
		}
		return value as unknown as Record<string, unknown>;
	}
	if (!isPlainObject(value)) return undefined;
	if (type === "color" && ("hex" in value || "components" in value)) {
		return colorObjectHex(value) ?? value;
	}
	if (
		(type === "dimension" || type === "duration") &&
		typeof value.value === "number" &&
		typeof value.unit === "string"
	) {
		return `${value.value}${value.unit}`;
	}
	return value;
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
		const value = flattenValue(ownType, node.$value);
		if (value === undefined) {
			errors.push({
				code: "invalid-shape",
				path,
				message: `${path}: $value must be a string, number, object, or array`,
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
			rawValue: value,
			group,
		};
		if (typeof node.$description === "string") {
			token.description = node.$description;
		}
		if (typeof node.alpha === "number" && node.alpha >= 0 && node.alpha < 1) {
			token.alpha = node.alpha;
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

const INLINE_REF_RE = /\{([^{}]+)\}/g;

/** `color` at opacity `alpha` — it replaces any alpha the color already has. */
function withAlpha(color: TokenValue, alpha: number | undefined): TokenValue {
	if (alpha === undefined || typeof color !== "string") return color;
	const parsed = parse(color);
	if (parsed === undefined) return color;
	return formatHex8({ ...parsed, alpha });
}

/**
 * Resolves every token's final value: `{dot.path}` aliases followed
 * transitively (cycles and dangling refs are errors), references embedded in a
 * string value (`inset 0 0 0 {borderWidth.thin}`) substituted, and a token's
 * `alpha` applied — so a token aliasing a translucent one inherits its alpha,
 * as the built CSS renders it.
 */
function makeResolver(
	byName: ReadonlyMap<string, RawToken>,
	errors: ParseError[],
): (raw: RawToken) => TokenValue | undefined {
	const memo = new Map<string, TokenValue | undefined>();
	const visiting = new Set<string>();
	const resolveToken = (raw: RawToken): TokenValue | undefined => {
		if (memo.has(raw.name)) return memo.get(raw.name);
		if (visiting.has(raw.name)) {
			errors.push({
				code: "alias-cycle",
				path: raw.name,
				message: `alias cycle involving "${raw.name}"`,
			});
			return undefined;
		}
		visiting.add(raw.name);
		const lookup = (target: string): TokenValue | undefined => {
			const ref = byName.get(target);
			if (ref === undefined) {
				errors.push({
					code: "unknown-alias",
					path: target,
					message: `${raw.name}: alias references unknown token "${target}"`,
				});
				return undefined;
			}
			return resolveToken(ref);
		};
		let value: TokenValue | undefined;
		const direct = aliasTarget(raw.rawValue);
		if (direct !== undefined) {
			value = lookup(direct);
		} else if (typeof raw.rawValue === "string" && raw.rawValue.includes("{")) {
			let failed = false;
			value = raw.rawValue.replace(INLINE_REF_RE, (whole, target: string) => {
				if (!byName.has(target)) return whole; // not a reference (e.g. JSON-ish text)
				const resolved = lookup(target);
				if (resolved === undefined || typeof resolved === "object") {
					failed = true;
					return whole;
				}
				return String(resolved);
			});
			if (failed) value = undefined;
		} else {
			value = raw.rawValue;
		}
		if (value !== undefined) value = withAlpha(value, raw.alpha);
		visiting.delete(raw.name);
		memo.set(raw.name, value);
		return value;
	};
	return resolveToken;
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
	const resolveToken = makeResolver(byName, errors);
	for (const raw of raws) {
		const value = resolveToken(raw);
		if (value === undefined) continue;
		const token: Token = {
			name: raw.name,
			type: raw.type,
			value,
			group: raw.group,
		};
		if (raw.description !== undefined) token.description = raw.description;
		const aliasOf = aliasTarget(raw.rawValue);
		if (aliasOf !== undefined) token.aliasOf = aliasOf;
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
