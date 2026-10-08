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

/**
 * A Figma component that Code Connect builds from a code component it is not
 * the 1:1 counterpart of — SDS's "Page Accordion" is a recipe over `Section`.
 */
export interface ComposedFigma {
	figma: FigmaComponentModel;
	codeName: string;
}

export interface ComponentMatchResult {
	matches: ComponentMatch[];
	unmatchedCode: UnmatchedCode[];
	unmatchedFigma: UnmatchedFigma[];
	/** Figma components implemented as recipes over a code component. */
	composed?: ComposedFigma[];
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
	const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
	// `lines: one | two | three` in code is Figma's `Lines: 1 | 2 | 3`.
	return NUMBER_WORDS[key] ?? key;
}

/** Number words a variant value may spell out, as their digits. */
const NUMBER_WORDS: Readonly<Record<string, string>> = {
	zero: "0",
	one: "1",
	two: "2",
	three: "3",
	four: "4",
	five: "5",
	six: "6",
	seven: "7",
	eight: "8",
	nine: "9",
	ten: "10",
};

/**
 * Values with a namespace every one of them shares dropped: `danger-primary`,
 * `danger-subtle` → `primary`, `subtle` (Figma names them inside the Button
 * Danger set). Unchanged for fewer than two values or no shared word.
 */
function unprefixed(values: readonly string[]): string[] {
	if (values.length < 2) return [...values];
	const first = /^([a-z0-9]+)[-_ ]/i.exec(values[0] as string)?.[1];
	if (first === undefined) return [...values];
	const prefix = new RegExp(`^${first}[-_ ]`, "i");
	if (!values.every((v) => prefix.test(v))) return [...values];
	return values.map((v) => v.replace(prefix, ""));
}

/** Value-set Jaccard over normalized values: |A∩B| / |A∪B|. Empty/empty -> 0. */
function valueJaccard(a: readonly string[], b: readonly string[]): number {
	const plain = jaccardOf(a, b);
	return plain === 1
		? 1
		: Math.max(plain, jaccardOf(unprefixed(a), unprefixed(b)));
}

function jaccardOf(a: readonly string[], b: readonly string[]): number {
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

/** Two-state values Figma uses where code has a boolean prop. */
const BOOLEAN_VALUE =
	/^(?:true|false|on|off|yes|no|checked|unchecked|indeterminate|enabled|disabled|selected|unselected|open|closed|active|inactive|expanded|collapsed)$/i;
/** Axes that model the viewport — code answers them with CSS, not a prop. */
const RESPONSIVE_AXIS = new Set([
	"platform",
	"device",
	"breakpoint",
	"viewport",
	"screen",
	"screensize",
]);
const RESPONSIVE_VALUE = /^(?:desktop|mobile|tablet|web|ios|android|phone)$/i;
/**
 * Values that model content presence (an empty field vs. a filled one). An
 * axis is content state when it has a Placeholder value, or only these —
 * `Style: Filled|Tonal` is a real style axis.
 */
const CONTENT_VALUE = /^(?:placeholder|filled|empty|default)$/i;
/**
 * Code string unions that are HTML attributes or the rendered element, not
 * design variants (`type: "button" | "submit"`, `elementType: "section"`).
 */
const HTML_ATTRIBUTE_AXIS = new Set([
	"type",
	"as",
	"elementtype",
	"tag",
	"component",
	"dir",
	"target",
	"rel",
	"method",
	"enctype",
	"autocomplete",
	"autocapitalize",
	"inputmode",
	"enterkeyhint",
	"loading",
	"decoding",
	"wrap",
]);

/**
 * A Figma-only axis that is a modelling convention, not a prop code owes:
 * a boolean pair (`Checked|Unchecked`), a value naming a code boolean
 * (`Shape: Circle|Square` beside `square: boolean`), the viewport
 * (`Platform: Desktop|Mobile`) or content presence (`Default|Placeholder`).
 */
function isConventionAxis(
	key: string,
	values: readonly string[],
	codeBooleans: ReadonlySet<string>,
	inherited: ReadonlyMap<string, readonly string[]> = new Map(),
): boolean {
	if (STATE_AXIS.has(key)) return true;
	// An inherited library prop with the same name AND overlapping values
	// (react-aria's `placement: top | bottom …`) answers the axis; the HTML
	// `style` / `type` never answer `Style: Filled | Tonal`.
	const inheritedValues = inherited.get(key);
	if (
		inheritedValues !== undefined &&
		valueJaccard(values, inheritedValues) > 0
	)
		return true;
	if (values.length > 0 && values.every((v) => BOOLEAN_VALUE.test(v.trim())))
		return true;
	if (values.some((v) => codeBooleans.has(normalizeName(v)))) return true;
	if (codeBooleans.has(key)) return true;
	if (
		RESPONSIVE_AXIS.has(key) ||
		(values.length > 0 && values.every((v) => RESPONSIVE_VALUE.test(v.trim())))
	)
		return true;
	return (
		values.some((v) => /^placeholder$/i.test(v.trim())) ||
		(values.length > 0 &&
			values.every((v) => CONTENT_VALUE.test(v.trim())) &&
			!values.every((v) => /^default$/i.test(v.trim())))
	);
}

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
	codeBooleans: ReadonlySet<string> = new Set(),
	inherited: ReadonlyMap<string, readonly string[]> = new Map(),
): { pairs: AxisPair[]; codeEmpty: boolean; figmaEmpty: boolean } {
	const codeIndex = normalizedKeyIndex(codeVariants);
	const figmaIndex = normalizedKeyIndex(figmaVariants);
	for (const [key, axis] of [...codeIndex]) {
		if (figmaIndex.has(key)) continue;
		// HTML attributes, and spacing-scale steps (`padding: 600|800`), are
		// layout / platform API, not design variants.
		const scaleSteps = axis.values.every((v) => /^(?:negative-)?\d+$/.test(v));
		if (HTML_ATTRIBUTE_AXIS.has(key) || scaleSteps) codeIndex.delete(key);
	}
	// A Figma axis that is a modelling convention (a boolean pair, a state,
	// the viewport, content presence) carries no shape signal unless code has
	// a string axis of that name.
	for (const [key, axis] of figmaIndex) {
		if (
			!codeIndex.has(key) &&
			isConventionAxis(key, axis.values, codeBooleans, inherited)
		) {
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
	codeBooleans: ReadonlySet<string> = new Set(),
	inherited: ReadonlyMap<string, readonly string[]> = new Map(),
): number {
	const { pairs, codeEmpty, figmaEmpty } = pairAxes(
		codeVariants,
		figmaVariants,
		codeBooleans,
		inherited,
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
	codeBooleans: ReadonlySet<string> = new Set(),
	inherited: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
	const { pairs } = pairAxes(
		codeVariants,
		figmaVariants,
		codeBooleans,
		inherited,
	);
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
			const plain =
				missingFrom(figma.values, code.values).length +
					missingFrom(code.values, figma.values).length ===
				0;
			const codeValues = plain ? code.values : unprefixed(code.values);
			const figmaValues = plain ? figma.values : unprefixed(figma.values);
			const extraFigma = missingFrom(figmaValues, codeValues);
			const extraCode = missingFrom(codeValues, figmaValues);
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

/** A code component's inherited string-union props, keyed by normalized name. */
function inheritedAxes(component: CodeComponent): Map<string, string[]> {
	return new Map(
		Object.entries(component.inherited ?? {}).map(([name, values]) => [
			normalizeName(name),
			values,
		]),
	);
}

/**
 * A code component's boolean props, normalized, with any `is` / `has` /
 * `show` prefix dropped too (`isSelected` → `isselected` and `selected`).
 */
function booleanProps(component: CodeComponent): Set<string> {
	const out = new Set<string>();
	for (const prop of component.props ?? []) {
		if (prop.type !== "boolean") continue;
		const key = normalizeName(prop.name);
		out.add(key);
		const bare = key.replace(/^(?:is|has|show|default)/, "");
		if (bare !== "" && bare !== key) out.add(bare);
	}
	return out;
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

/**
 * Whether a code component may pair with an icon-library component at all:
 * an `Icon<Name>` / `<Name>Icon` export, or one living in an icons folder
 * (lucide-style `Activity`). A `Table` component is never the `Table` icon.
 */
function iconCompatible(
	codeComponent: CodeComponent,
	figmaModel: FigmaComponentModel,
): boolean {
	if (figmaModel.kind !== "icon") return true;
	return (
		isIconName(codeComponent.name, figmaModel) ||
		/(^|\/)icons?\//i.test(codeComponent.importPath)
	);
}

function scorePair(
	codeComponent: CodeComponent,
	figmaModel: FigmaComponentModel,
): ScoreParts {
	const name = isIconName(codeComponent.name, figmaModel)
		? 1
		: nameScore(codeComponent.name, figmaModel.name);
	const shape = shapeScore(
		codeComponent.variants,
		figmaModel.variantProps,
		booleanProps(codeComponent),
		inheritedAxes(codeComponent),
	);
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
	return (
		figma
			// An icon is never the closest Figma component of a non-icon component.
			.filter(
				(figmaModel) =>
					figmaModel.kind !== "icon" ||
					isIconName(codeComponent.name, figmaModel),
			)
			.map((figmaModel) => ({
				figma: figmaModel,
				score: scorePair(codeComponent, figmaModel).score,
			}))
			.sort((a, b) =>
				a.score !== b.score
					? b.score - a.score
					: byNameAsc(a.figma.name, b.figma.name),
			)
			.slice(0, MAX_CANDIDATES)
	);
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
	// A code component several Figma components pin to is a recipe base (SDS
	// builds 14 page sections with <Section>): the 1:1 match is only the pinned
	// Figma component whose name corresponds; the rest are composed in code.
	const composed: ComposedFigma[] = [];
	const pinsByCode = new Map<string, number[]>();
	for (const pin of options.pins ?? []) {
		const f = figmaIndexById.get(pin.nodeId.replace(/-/g, ":"));
		if (f === undefined) continue;
		const list = pinsByCode.get(pin.codeName) ?? [];
		if (!list.includes(f)) list.push(f);
		pinsByCode.set(pin.codeName, list);
	}
	for (const [codeName, figmaIndexes] of pinsByCode) {
		const c = code.findIndex((comp) => comp.name === codeName);
		if (c === -1 || matchedCode.has(c)) continue;
		const codeComponent = code[c] as CodeComponent;
		const free = figmaIndexes.filter((f) => !matchedFigma.has(f));
		if (free.length === 0) continue;
		let primary: number | undefined = free.length === 1 ? free[0] : undefined;
		if (primary === undefined) {
			let best = MATCH_THRESHOLD;
			for (const f of free) {
				const score = nameScore(
					codeName,
					(figma[f] as FigmaComponentModel).name,
				);
				if (score >= best) {
					if (score > best || primary === undefined) primary = f;
					best = score;
				}
			}
		}
		for (const f of free) {
			if (f === primary) continue;
			matchedFigma.add(f);
			composed.push({ figma: figma[f] as FigmaComponentModel, codeName });
		}
		if (primary === undefined) continue;
		const figmaModel = figma[primary] as FigmaComponentModel;
		const booleans = booleanProps(codeComponent);
		const shape = shapeScore(
			codeComponent.variants,
			figmaModel.variantProps,
			booleans,
			inheritedAxes(codeComponent),
		);
		matchedCode.add(c);
		matchedFigma.add(primary);
		matches.push({
			code: codeComponent,
			figma: figmaModel,
			// The pairing is declared, so the name is certain; the shape is not.
			score: NAME_WEIGHT + SHAPE_WEIGHT * shape,
			nameScore: 1,
			shapeScore: shape,
			variantGaps: variantGaps(
				codeComponent.variants,
				figmaModel.variantProps,
				booleans,
				inheritedAxes(codeComponent),
			),
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
			if (!iconCompatible(codeComponent, figmaModel)) continue;
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
			if (!iconCompatible(codeComponent, figmaModel)) continue;
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
			variantGaps: variantGaps(
				codeComponent.variants,
				figmaModel.variantProps,
				booleanProps(codeComponent),
				inheritedAxes(codeComponent),
			),
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

	return {
		matches,
		unmatchedCode,
		unmatchedFigma,
		...(composed.length > 0
			? {
					composed: composed.sort((a, b) =>
						byNameAsc(a.figma.name, b.figma.name),
					),
				}
			: {}),
	};
}
