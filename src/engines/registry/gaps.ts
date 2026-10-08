// T6.1 — the gaps engine: the anti-invention safety net for /ds-bridge:figma-impl.
// PURE: no fs/network/process; deterministic; NEVER throws on bad input.
//
// When the model implements a Figma frame, every thing the design needs is a
// FrameRequirement. findGaps resolves each requirement against the SYSTEM — the
// committed component registry (resolveEntry) and the parsed design tokens
// (TokenIndex) — and partitions them into:
//   - resolved: a confident registry match OR an exact token, the only inputs
//     the model is permitted to write code from.
//   - gaps: anything the system cannot provide. A gap is a STOP sign, not a
//     suggestion to approximate — the model surfaces it and never invents UI.
//
// Requirement order is preserved within each bucket so the report is stable and
// reviewable. Token resolution mirrors the lint matcher (T2.3): exact value via
// TokenIndex.byValue (preferring the alias-bearing semantic token), near-only
// (color deltaE<=2.5 / dimension +-1px) as ranked candidates, nothing as a hard
// no-token-match.
import { normalizeColor, normalizeDimension } from "../tokens/normalize.js";
import { buildTokenIndex, type TokenIndex } from "../tokens/token-index.js";
import type { Token } from "../tokens/types.js";
import { type RegistryFile, resolveEntry } from "./persist.js";

// ── Requirement model (discriminated union, extensible) ──

/** One thing a Figma frame needs from the design system. */
export type FrameRequirement =
	| {
			kind: "component";
			nodeId: string;
			/** The layer name in the frame. */
			name: string;
			/** The instance's main component (set) name, when known. */
			componentName?: string;
	  }
	| {
			kind: "token";
			property: string;
			rawValue: string;
			valueKind: "color" | "dimension";
	  };

export interface GapsInput {
	requirements: FrameRequirement[];
	registry: RegistryFile;
	tokens: readonly Token[];
}

// ── Resolution / gap outcomes ──

/** How a satisfied requirement maps onto the system. */
export type Resolution =
	| {
			kind: "registry-match";
			codeName: string;
			importPath: string;
			/** The deprecated component this replaces, and its variant hint. */
			replaces?: { name: string; hint?: string };
	  }
	| { kind: "token-exact"; tokenName: string };

export interface ResolvedRequirement {
	requirement: FrameRequirement;
	resolution: Resolution;
}

/** Why the system cannot satisfy a requirement. */
export type GapReason =
	| "no-registry-match"
	| "ambiguous-registry-match"
	| "no-token-match"
	| "near-token-only";

export interface Gap {
	requirement: FrameRequirement;
	reason: GapReason;
	/** Candidate names (component code names or token names), possibly empty. */
	candidates: string[];
	/** A human action: what to do instead of inventing UI. */
	suggestion: string;
}

export interface GapsReport {
	resolved: ResolvedRequirement[];
	gaps: Gap[];
}

// ── Token matching tuning (mirrors src/engines/lint/match.ts) ──

const COLOR_NEAR_DELTA_E = 2.5;
const DIMENSION_NEAR_PX = 1;
const NEAR_LIMIT = 3;

/**
 * Among tokens that share an exact value, prefer the semantic alias (a token
 * whose `aliasOf` points at another token in the same bucket) over the primitive
 * it dereferences — the token a system-aware suggestion should name. Falls back
 * to the first token when no alias is present. (Mirrors the lint matcher.)
 */
function pickPreferred(tokens: readonly Token[]): Token | undefined {
	if (tokens.length === 0) return undefined;
	const names = new Set(tokens.map((t) => t.name));
	const semantic = tokens.find(
		(t) => t.aliasOf !== undefined && names.has(t.aliasOf),
	);
	return semantic ?? tokens[0];
}

// ── Component resolution ──

function resolveComponent(
	requirement: Extract<FrameRequirement, { kind: "component" }>,
	registry: RegistryFile,
): ResolvedRequirement | Gap {
	// Prefer the main component (an instance renamed "Cancel" is still a
	// Button), then the node id, then the layer name.
	const byComponent =
		requirement.componentName !== undefined
			? resolveEntry(registry, requirement.componentName)
			: undefined;
	const byId =
		byComponent !== undefined && byComponent.kind !== "not-found"
			? byComponent
			: resolveEntry(registry, requirement.nodeId);
	const outcome =
		byId.kind === "not-found" ? resolveEntry(registry, requirement.name) : byId;

	if (outcome.kind === "match") {
		return {
			requirement,
			resolution: {
				kind: "registry-match",
				codeName: outcome.entry.codeName,
				importPath: outcome.entry.importPath,
				...(outcome.replaces !== undefined
					? { replaces: outcome.replaces }
					: {}),
			},
		};
	}

	if (outcome.kind === "candidates") {
		const candidates = outcome.entries.map((c) => c.codeName);
		const list = candidates.length > 0 ? ` (${candidates.join(", ")})` : "";
		return {
			requirement,
			reason: "ambiguous-registry-match",
			candidates,
			suggestion: `Multiple code components could match "${requirement.name}"${list} — pick one with a designer/engineer, don't guess.`,
		};
	}

	return {
		requirement,
		reason: "no-registry-match",
		candidates: [],
		suggestion: `No code component matches "${requirement.name}" — build it or publish the Figma component, then rebuild the registry. Do not invent UI.`,
	};
}

// ── Token resolution ──

function resolveColor(
	requirement: Extract<FrameRequirement, { kind: "token" }>,
	index: TokenIndex,
): ResolvedRequirement | Gap {
	const canonical = normalizeColor(requirement.rawValue);
	if (canonical === undefined) return noTokenMatch(requirement);

	const exact = index.byValue.get(canonical);
	const preferred = pickPreferred(exact ?? []);
	if (preferred !== undefined) {
		return tokenExact(requirement, preferred.name);
	}

	const near = index.nearest(canonical, {
		maxDeltaE: COLOR_NEAR_DELTA_E,
		limit: NEAR_LIMIT,
	});
	if (near.length > 0) {
		return nearTokenOnly(
			requirement,
			near.map((m) => m.token.name),
		);
	}

	return noTokenMatch(requirement);
}

function resolveDimension(
	requirement: Extract<FrameRequirement, { kind: "token" }>,
	index: TokenIndex,
): ResolvedRequirement | Gap {
	const dim = normalizeDimension(requirement.rawValue);
	if (dim === undefined) return noTokenMatch(requirement);

	const bucket = index.byValue.get(`${dim.px}px`);
	const exact = bucket?.find((t) => t.type === "dimension");
	if (exact !== undefined) return tokenExact(requirement, exact.name);

	// Nearest dimension tokens within the absolute-px threshold, ascending
	// distance then name (deterministic).
	const near: { name: string; distance: number }[] = [];
	for (const token of index.byName.values()) {
		if (token.type !== "dimension") continue;
		const tokenDim = normalizeDimension(
			typeof token.value === "number" || typeof token.value === "string"
				? token.value
				: Number.NaN,
		);
		if (tokenDim === undefined) continue;
		const distance = Math.abs(dim.px - tokenDim.px);
		if (distance === 0 || distance > DIMENSION_NEAR_PX) continue;
		near.push({ name: token.name, distance });
	}
	if (near.length === 0) return noTokenMatch(requirement);

	near.sort((a, b) =>
		a.distance !== b.distance
			? a.distance - b.distance
			: a.name < b.name
				? -1
				: a.name > b.name
					? 1
					: 0,
	);
	return nearTokenOnly(
		requirement,
		near.slice(0, NEAR_LIMIT).map((n) => n.name),
	);
}

function tokenExact(
	requirement: Extract<FrameRequirement, { kind: "token" }>,
	tokenName: string,
): ResolvedRequirement {
	return { requirement, resolution: { kind: "token-exact", tokenName } };
}

function nearTokenOnly(
	requirement: Extract<FrameRequirement, { kind: "token" }>,
	candidates: string[],
): Gap {
	const nearest = candidates[0] ?? "";
	return {
		requirement,
		reason: "near-token-only",
		candidates,
		suggestion: `No exact token for "${requirement.rawValue}" — nearest is ${nearest}; use it only with designer sign-off, otherwise add a token.`,
	};
}

function noTokenMatch(
	requirement: Extract<FrameRequirement, { kind: "token" }>,
): Gap {
	return {
		requirement,
		reason: "no-token-match",
		candidates: [],
		suggestion: `No token matches "${requirement.rawValue}" — add a token for it; never approximate with a raw value.`,
	};
}

function isResolved(
	outcome: ResolvedRequirement | Gap,
): outcome is ResolvedRequirement {
	return "resolution" in outcome;
}

// ── Entry point ──

/**
 * Partition every frame requirement into resolved (registry match / exact token)
 * or gap (anything the system cannot provide). Requirement order is preserved
 * within each bucket. Pure and total — never throws.
 */
export function findGaps(input: GapsInput): GapsReport {
	const index = buildTokenIndex(input.tokens);
	const resolved: ResolvedRequirement[] = [];
	const gaps: Gap[] = [];

	for (const requirement of input.requirements) {
		const outcome =
			requirement.kind === "component"
				? resolveComponent(requirement, input.registry)
				: requirement.valueKind === "color"
					? resolveColor(requirement, index)
					: resolveDimension(requirement, index);

		if (isResolved(outcome)) {
			resolved.push(outcome);
		} else {
			gaps.push(outcome);
		}
	}

	return { resolved, gaps };
}
