// T5.3 — Figma<->code component matcher: the registry's brain. PURE — no
// fs/network/process; deterministic; NEVER throws on bad input (it operates on
// already-validated models from scan-code/scan-figma and degrades to empty
// buckets rather than guessing). Its CRITICAL safety property is zero silent
// wrong matches: an ambiguous best candidate is surfaced as unmatched-with-
// candidates, never auto-picked.
//
// See tests/engines/registry/match.test.ts for the pinned scoring table.
import type { CodeComponent } from "./scan-code.js";
import type { FigmaComponentModel } from "./scan-figma.js";

/** A confident, 1:1 pairing of a code component to a Figma component model. */
export interface ComponentMatch {
	code: CodeComponent;
	figma: FigmaComponentModel;
	/** Combined score in [0, 1]: 0.7*nameScore + 0.3*shapeScore. */
	score: number;
	/** Name similarity in [0, 1]. */
	nameScore: number;
	/** Variant-shape similarity in [0, 1]. */
	shapeScore: number;
}

/** A code component with no confident match, plus its ranked top candidates. */
export interface UnmatchedCode {
	code: CodeComponent;
	/** Up to 3 best Figma candidates, descending score then name ascending. */
	candidates: { figma: FigmaComponentModel; score: number }[];
}

/** A Figma model with no confident match, plus its ranked top candidates. */
export interface UnmatchedFigma {
	figma: FigmaComponentModel;
	/** Up to 3 best code candidates, descending score then name ascending. */
	candidates: { code: CodeComponent; score: number }[];
}

export interface ComponentMatchResult {
	matches: ComponentMatch[];
	unmatchedCode: UnmatchedCode[];
	unmatchedFigma: UnmatchedFigma[];
}

// ── Tuning constants (mirror the scoring contract in the test header) ──

const MATCH_THRESHOLD = 0.6;
const AMBIGUITY_GAP = 0.1;
const TOKEN_SCORE_FLOOR = 0.3;
const NAME_WEIGHT = 0.7;
const SHAPE_WEIGHT = 0.3;
const MAX_CANDIDATES = 3;

// ── Name scoring ──

/** Strip every non-alphanumeric and lowercase: the normalized identity key. */
function normalizeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/**
 * Split a raw name into lowercase word tokens by PascalCase boundaries,
 * slashes, dashes, underscores and whitespace. "Button / Primary" ->
 * ["button", "primary"]; "PrimaryButton" -> ["primary", "button"].
 */
function tokenize(name: string): string[] {
	// Insert a space at lower->Upper and at letter->digit / digit->letter
	// boundaries so camelCase and alnum runs split into words.
	const spaced = name
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Za-z])([0-9])/g, "$1 $2")
		.replace(/([0-9])([A-Za-z])/g, "$1 $2");
	const tokens: string[] = [];
	for (const part of spaced.split(/[^a-zA-Z0-9]+/)) {
		const token = part.toLowerCase();
		if (token.length > 0) tokens.push(token);
	}
	return tokens;
}

/** Distinct-token Dice coefficient: 2*|A∩B| / (|A|+|B|). */
function tokenSetScore(a: string, b: string): number {
	const setA = new Set(tokenize(a));
	const setB = new Set(tokenize(b));
	if (setA.size === 0 || setB.size === 0) return 0;
	let intersection = 0;
	for (const token of setA) {
		if (setB.has(token)) intersection += 1;
	}
	return (2 * intersection) / (setA.size + setB.size);
}

/**
 * nameScore: 1.0 on exact normalized equality, else the token-set Dice score,
 * with scores below the floor collapsed to 0 (treated as unrelated).
 */
function nameScore(codeName: string, figmaName: string): number {
	if (normalizeName(codeName) === normalizeName(figmaName)) return 1;
	const score = tokenSetScore(codeName, figmaName);
	return score < TOKEN_SCORE_FLOOR ? 0 : score;
}

// ── Shape scoring ──

/** Value-set Jaccard: |A∩B| / |A∪B|. Empty/empty -> 0 (no contribution). */
function valueJaccard(a: readonly string[], b: readonly string[]): number {
	const setA = new Set(a);
	const setB = new Set(b);
	if (setA.size === 0 && setB.size === 0) return 0;
	let intersection = 0;
	for (const value of setA) {
		if (setB.has(value)) intersection += 1;
	}
	const union = setA.size + setB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

/** Index a variant record by normalized key for case-insensitive key matching. */
function normalizedKeyIndex(
	variants: Record<string, string[]>,
): Map<string, string[]> {
	const index = new Map<string, string[]>();
	for (const key of Object.keys(variants)) {
		const values = variants[key] ?? [];
		const norm = normalizeName(key);
		const existing = index.get(norm);
		if (existing === undefined) {
			index.set(norm, [...values]);
		} else {
			existing.push(...values);
		}
	}
	return index;
}

/**
 * shapeScore: overlap of variant dimensions. Both empty -> 0.5 (neutral, no
 * signal); exactly one empty -> 0.25; otherwise average the per-key value
 * Jaccard across the UNION of normalized keys (a key on only one side scores 0).
 * Figma true/false axes without a same-named code axis are ignored first.
 */
function shapeScore(
	codeVariants: Record<string, string[]>,
	figmaVariants: Record<string, string[]>,
): number {
	const codeIndex = normalizedKeyIndex(codeVariants);
	const figmaIndex = normalizedKeyIndex(figmaVariants);
	// A Figma axis of only true/false (`checked=true`) is how Figma models a
	// boolean; in code it is a boolean prop, which is never a string variant —
	// so it carries no shape signal unless code has a string axis of that name.
	for (const [key, values] of figmaIndex) {
		const boolean = values.every((v) => /^(?:true|false)$/i.test(v));
		if (boolean && !codeIndex.has(key)) figmaIndex.delete(key);
	}
	const codeEmpty = codeIndex.size === 0;
	const figmaEmpty = figmaIndex.size === 0;

	if (codeEmpty && figmaEmpty) return 0.5;
	if (codeEmpty || figmaEmpty) return 0.25;

	const keys = new Set<string>([...codeIndex.keys(), ...figmaIndex.keys()]);
	let total = 0;
	for (const key of keys) {
		total += valueJaccard(codeIndex.get(key) ?? [], figmaIndex.get(key) ?? []);
	}
	return total / keys.size;
}

// ── Combined scoring ──

interface ScoreParts {
	score: number;
	nameScore: number;
	shapeScore: number;
}

function scorePair(
	codeComponent: CodeComponent,
	figmaModel: FigmaComponentModel,
): ScoreParts {
	const name = nameScore(codeComponent.name, figmaModel.name);
	const shape = shapeScore(codeComponent.variants, figmaModel.variantProps);
	return {
		nameScore: name,
		shapeScore: shape,
		score: NAME_WEIGHT * name + SHAPE_WEIGHT * shape,
	};
}

// ── Ordering helpers (determinism) ──

function byNameAsc(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

// ── Candidate ranking against the FULL (unfiltered) other side ──

function rankFigmaCandidates(
	codeComponent: CodeComponent,
	figma: readonly FigmaComponentModel[],
): { figma: FigmaComponentModel; score: number }[] {
	return figma
		.map((figmaModel) => ({
			figma: figmaModel,
			score: scorePair(codeComponent, figmaModel).score,
		}))
		.sort((a, b) =>
			a.score !== b.score
				? b.score - a.score
				: byNameAsc(a.figma.name, b.figma.name),
		)
		.slice(0, MAX_CANDIDATES);
}

function rankCodeCandidates(
	figmaModel: FigmaComponentModel,
	code: readonly CodeComponent[],
): { code: CodeComponent; score: number }[] {
	return code
		.map((codeComponent) => ({
			code: codeComponent,
			score: scorePair(codeComponent, figmaModel).score,
		}))
		.sort((a, b) =>
			a.score !== b.score
				? b.score - a.score
				: byNameAsc(a.code.name, b.code.name),
		)
		.slice(0, MAX_CANDIDATES);
}

// ── Core greedy assignment ──

interface Edge {
	codeIndex: number;
	figmaIndex: number;
	parts: ScoreParts;
}

export function matchComponents(
	code: readonly CodeComponent[],
	figma: readonly FigmaComponentModel[],
): ComponentMatchResult {
	// Build every scored edge, kept only when it could ever be a match.
	const edges: Edge[] = [];
	for (let c = 0; c < code.length; c += 1) {
		const codeComponent = code[c];
		if (codeComponent === undefined) continue;
		for (let f = 0; f < figma.length; f += 1) {
			const figmaModel = figma[f];
			if (figmaModel === undefined) continue;
			const parts = scorePair(codeComponent, figmaModel);
			if (parts.score >= MATCH_THRESHOLD) {
				edges.push({ codeIndex: c, figmaIndex: f, parts });
			}
		}
	}

	// Greedy descending by score; ties broken by code name then figma name so
	// the assignment order is fully deterministic regardless of input order.
	edges.sort((a, b) => {
		if (a.parts.score !== b.parts.score) return b.parts.score - a.parts.score;
		const codeA = code[a.codeIndex]?.name ?? "";
		const codeB = code[b.codeIndex]?.name ?? "";
		const byCode = byNameAsc(codeA, codeB);
		if (byCode !== 0) return byCode;
		const figmaA = figma[a.figmaIndex]?.name ?? "";
		const figmaB = figma[b.figmaIndex]?.name ?? "";
		return byNameAsc(figmaA, figmaB);
	});

	const matchedCode = new Set<number>();
	const matchedFigma = new Set<number>();
	const matches: ComponentMatch[] = [];

	for (const edge of edges) {
		if (matchedCode.has(edge.codeIndex)) continue;
		if (matchedFigma.has(edge.figmaIndex)) continue;

		// Ambiguity guard: among the still-available figma candidates for THIS
		// code component, if the runner-up is within AMBIGUITY_GAP of the best and
		// both clear the threshold, refuse to pick — surface as unmatched instead.
		const codeComponent = code[edge.codeIndex];
		if (codeComponent === undefined) continue;

		let best = -1;
		let second = -1;
		for (let f = 0; f < figma.length; f += 1) {
			if (matchedFigma.has(f)) continue;
			const figmaModel = figma[f];
			if (figmaModel === undefined) continue;
			const s = scorePair(codeComponent, figmaModel).score;
			if (s > best) {
				second = best;
				best = s;
			} else if (s > second) {
				second = s;
			}
		}

		const ambiguous =
			second >= MATCH_THRESHOLD &&
			best >= MATCH_THRESHOLD &&
			best - second < AMBIGUITY_GAP;
		if (ambiguous) {
			// Leave this code component unmatched; it will fall into unmatchedCode
			// below with its full ranked candidate list. Its top figma stays
			// available for other (non-ambiguous) code components to claim.
			continue;
		}

		matchedCode.add(edge.codeIndex);
		matchedFigma.add(edge.figmaIndex);
		const figmaModel = figma[edge.figmaIndex];
		if (figmaModel === undefined) continue;
		matches.push({
			code: codeComponent,
			figma: figmaModel,
			score: edge.parts.score,
			nameScore: edge.parts.nameScore,
			shapeScore: edge.parts.shapeScore,
		});
	}

	matches.sort((a, b) => byNameAsc(a.code.name, b.code.name));

	// Everything not consumed becomes an unmatched bucket entry, each carrying
	// its top-3 candidates ranked against the FULL opposite side (so a user sees
	// even the candidate that another component ultimately claimed).
	const unmatchedCode: UnmatchedCode[] = [];
	for (let c = 0; c < code.length; c += 1) {
		if (matchedCode.has(c)) continue;
		const codeComponent = code[c];
		if (codeComponent === undefined) continue;
		unmatchedCode.push({
			code: codeComponent,
			candidates: rankFigmaCandidates(codeComponent, figma),
		});
	}
	unmatchedCode.sort((a, b) => byNameAsc(a.code.name, b.code.name));

	const unmatchedFigma: UnmatchedFigma[] = [];
	for (let f = 0; f < figma.length; f += 1) {
		if (matchedFigma.has(f)) continue;
		const figmaModel = figma[f];
		if (figmaModel === undefined) continue;
		unmatchedFigma.push({
			figma: figmaModel,
			candidates: rankCodeCandidates(figmaModel, code),
		});
	}
	unmatchedFigma.sort((a, b) => byNameAsc(a.figma.name, b.figma.name));

	return { matches, unmatchedCode, unmatchedFigma };
}
