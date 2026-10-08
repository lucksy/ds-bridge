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
	/** Variant axes that still differ (see {@link variantGaps}); empty when none. */
	variantGaps: string[];
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

/** Compare variant values case- and punctuation-insensitively (`Filled` = `filled`). */
function normValue(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Value-set Jaccard over normalized values: |A∩B| / |A∪B|. Empty/empty -> 0. */
function valueJaccard(a: readonly string[], b: readonly string[]): number {
	const setA = new Set(a.map(normValue));
	const setB = new Set(b.map(normValue));
	if (setA.size === 0 && setB.size === 0) return 0;
	let intersection = 0;
	for (const value of setA) {
		if (setB.has(value)) intersection += 1;
	}
	const union = setA.size + setB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

/** One variant axis as declared: its display key and raw values. */
interface Axis {
	key: string;
	values: string[];
}

/** Index a variant record by normalized key, keeping the first display key. */
function normalizedKeyIndex(
	variants: Record<string, string[]>,
): Map<string, Axis> {
	const index = new Map<string, Axis>();
	for (const key of Object.keys(variants)) {
		const values = variants[key] ?? [];
		const norm = normalizeName(key);
		const existing = index.get(norm);
		if (existing === undefined) {
			index.set(norm, { key, values: [...values] });
		} else {
			existing.values.push(...values);
		}
	}
	return index;
}

/** A Figma axis naming interaction state, which code expresses as booleans / CSS. */
const STATE_AXIS = new Set([
	"state",
	"states",
	"interaction",
	"interactionstate",
]);

/** Below this value agreement two differently named axes are not the same axis. */
const AXIS_PAIR_THRESHOLD = 0.5;

/** A code axis, a Figma axis, or both when they describe the same dimension. */
interface AxisPair {
	code?: Axis;
	figma?: Axis;
	agreement: number;
}

/**
 * Pair the two sides' variant axes: same normalized key first, then remaining
 * axes whose VALUES agree (Figma's `Style=Filled` is code's `variant: filled`).
 * Figma true/false axes and a `State` axis without a same-named code axis are
 * dropped first. Undefined when both sides end up empty.
 */
function pairAxes(
	codeVariants: Record<string, string[]>,
	figmaVariants: Record<string, string[]>,
): { pairs: AxisPair[]; codeEmpty: boolean; figmaEmpty: boolean } {
	const codeIndex = normalizedKeyIndex(codeVariants);
	const figmaIndex = normalizedKeyIndex(figmaVariants);
	// A Figma axis of only true/false (`checked=true`) is how Figma models a
	// boolean; in code it is a boolean prop, which is never a string variant —
	// so it carries no shape signal unless code has a string axis of that name.
	for (const [key, axis] of figmaIndex) {
		const boolean = axis.values.every((v) => /^(?:true|false)$/i.test(v));
		if ((boolean || STATE_AXIS.has(key)) && !codeIndex.has(key)) {
			figmaIndex.delete(key);
		}
	}

	const pairs: AxisPair[] = [];
	const codeLeft = new Map(codeIndex);
	const figmaLeft = new Map(figmaIndex);
	for (const [key, codeAxis] of codeIndex) {
		const figmaAxis = figmaIndex.get(key);
		if (figmaAxis === undefined) continue;
		pairs.push({
			code: codeAxis,
			figma: figmaAxis,
			agreement: valueJaccard(codeAxis.values, figmaAxis.values),
		});
		codeLeft.delete(key);
		figmaLeft.delete(key);
	}

	const candidates: { c: string; f: string; agreement: number }[] = [];
	for (const [c, codeAxis] of codeLeft) {
		for (const [f, figmaAxis] of figmaLeft) {
			const agreement = valueJaccard(codeAxis.values, figmaAxis.values);
			if (agreement >= AXIS_PAIR_THRESHOLD)
				candidates.push({ c, f, agreement });
		}
	}
	candidates.sort((a, b) =>
		a.agreement !== b.agreement
			? b.agreement - a.agreement
			: byNameAsc(`${a.c}\u0000${a.f}`, `${b.c}\u0000${b.f}`),
	);
	for (const { c, f, agreement } of candidates) {
		const codeAxis = codeLeft.get(c);
		const figmaAxis = figmaLeft.get(f);
		if (codeAxis === undefined || figmaAxis === undefined) continue;
		pairs.push({ code: codeAxis, figma: figmaAxis, agreement });
		codeLeft.delete(c);
		figmaLeft.delete(f);
	}
	for (const axis of codeLeft.values())
		pairs.push({ code: axis, agreement: 0 });
	for (const axis of figmaLeft.values())
		pairs.push({ figma: axis, agreement: 0 });

	return {
		pairs,
		codeEmpty: codeIndex.size === 0,
		figmaEmpty: figmaIndex.size === 0,
	};
}

/**
 * shapeScore: overlap of variant dimensions. Both empty -> 0.5 (neutral, no
 * signal); exactly one empty -> 0.25; otherwise average the per-axis value
 * Jaccard across the paired axes (an axis on only one side scores 0).
 */
function shapeScore(
	codeVariants: Record<string, string[]>,
	figmaVariants: Record<string, string[]>,
): number {
	const { pairs, codeEmpty, figmaEmpty } = pairAxes(
		codeVariants,
		figmaVariants,
	);
	if (codeEmpty && figmaEmpty) return 0.5;
	if (codeEmpty || figmaEmpty) return 0.25;
	let total = 0;
	for (const pair of pairs) total += pair.agreement;
	return total / pairs.length;
}

/** Raw values of `a` whose normalized form `b` lacks, in declared order. */
function missingFrom(a: readonly string[], b: readonly string[]): string[] {
	const have = new Set(b.map(normValue));
	return a.filter((v) => !have.has(normValue(v)));
}

/**
 * The variant axes that still differ after pairing, as short readable lines:
 * `size: Figma also has Extended`, `color: code only (primary|surface)`,
 * `lines: code one|two|three ≠ Figma Lines 1|2|3`. Code-keyed lines first
 * (by code key), then Figma-only axes (by Figma key).
 */
export function variantGaps(
	codeVariants: Record<string, string[]>,
	figmaVariants: Record<string, string[]>,
): string[] {
	const { pairs } = pairAxes(codeVariants, figmaVariants);
	const codeKeyed: { key: string; line: string }[] = [];
	const figmaOnly: { key: string; line: string }[] = [];
	for (const { code, figma } of pairs) {
		if (code !== undefined && figma === undefined) {
			codeKeyed.push({
				key: code.key,
				line: `${code.key}: code only (${code.values.join("|")})`,
			});
		} else if (code === undefined && figma !== undefined) {
			figmaOnly.push({
				key: figma.key,
				line: `${figma.key}: Figma only (${figma.values.join("|")})`,
			});
		} else if (code !== undefined && figma !== undefined) {
			const extraFigma = missingFrom(figma.values, code.values);
			const extraCode = missingFrom(code.values, figma.values);
			if (extraFigma.length === 0 && extraCode.length === 0) continue;
			const line =
				extraCode.length === 0
					? `${code.key}: Figma also has ${extraFigma.join("|")}`
					: extraFigma.length === 0
						? `${code.key}: code also has ${extraCode.join("|")}`
						: `${code.key}: code ${code.values.join("|")} ≠ Figma ${figma.key} ${figma.values.join("|")}`;
			codeKeyed.push({ key: code.key, line });
		}
	}
	const byKey = (a: { key: string }, b: { key: string }) =>
		byNameAsc(a.key.toLowerCase(), b.key.toLowerCase());
	return [...codeKeyed.sort(byKey), ...figmaOnly.sort(byKey)].map(
		(g) => g.line,
	);
}

// ── Combined scoring ──

interface ScoreParts {
	score: number;
	nameScore: number;
	shapeScore: number;
}

/**
 * An icon-library component (`Activity` on the Icons page) is implemented as
 * `IconActivity` / `ActivityIcon` in code — the same name, exactly.
 */
function isIconName(
	codeName: string,
	figmaModel: FigmaComponentModel,
): boolean {
	if (figmaModel.kind !== "icon") return false;
	const c = normalizeName(codeName);
	const f = normalizeName(figmaModel.name);
	return c === `icon${f}` || c === `${f}icon`;
}

function scorePair(
	codeComponent: CodeComponent,
	figmaModel: FigmaComponentModel,
): ScoreParts {
	const name = isIconName(codeComponent.name, figmaModel)
		? 1
		: nameScore(codeComponent.name, figmaModel.name);
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

/** A pairing the project declared itself (Code Connect): code name ↔ node id. */
export interface PinnedPair {
	codeName: string;
	nodeId: string;
}

export interface MatchOptions {
	/** Declared pairings, applied before any name guess (score 1). */
	pins?: readonly PinnedPair[];
}

export function matchComponents(
	code: readonly CodeComponent[],
	figma: readonly FigmaComponentModel[],
	options: MatchOptions = {},
): ComponentMatchResult {
	const matchedCode = new Set<number>();
	const matchedFigma = new Set<number>();
	const matches: ComponentMatch[] = [];

	// Declared pairings first: the project said which code implements which
	// Figma component (Code Connect), so no name heuristic overrides it.
	const figmaIndexById = new Map<string, number>();
	figma.forEach((model, i) => {
		for (const id of [model.nodeId, ...(model.aliasNodeIds ?? [])]) {
			const key = id.replace(/-/g, ":");
			if (!figmaIndexById.has(key)) figmaIndexById.set(key, i);
		}
	});
	for (const pin of options.pins ?? []) {
		const f = figmaIndexById.get(pin.nodeId.replace(/-/g, ":"));
		const c = code.findIndex((comp) => comp.name === pin.codeName);
		if (f === undefined || c === -1) continue;
		if (matchedCode.has(c) || matchedFigma.has(f)) continue;
		const codeComponent = code[c] as CodeComponent;
		const figmaModel = figma[f] as FigmaComponentModel;
		matchedCode.add(c);
		matchedFigma.add(f);
		matches.push({
			code: codeComponent,
			figma: figmaModel,
			score: 1,
			nameScore: 1,
			shapeScore: shapeScore(codeComponent.variants, figmaModel.variantProps),
			variantGaps: variantGaps(codeComponent.variants, figmaModel.variantProps),
		});
	}

	// Build every scored edge, kept only when it could ever be a match.
	const edges: Edge[] = [];
	for (let c = 0; c < code.length; c += 1) {
		if (matchedCode.has(c)) continue;
		const codeComponent = code[c];
		if (codeComponent === undefined) continue;
		for (let f = 0; f < figma.length; f += 1) {
			if (matchedFigma.has(f)) continue;
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
			variantGaps: variantGaps(codeComponent.variants, figmaModel.variantProps),
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
