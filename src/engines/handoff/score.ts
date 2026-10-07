// T4.4 — handoff readiness scoring engine (PURE: no fs/network/process).
//
// Given a Figma node tree, produce a deterministic 0–100 "machine-readability"
// score with per-node deductions and rollup stats. The score answers: is this
// frame ready for clean design-to-code handoff? Four weighted rules, total 100:
//
//   - Variable binding coverage  (40): styleable nodes (with fills/strokes)
//       should bind those paints to variables, not hardcode them.
//   - Auto-layout coverage       (25): frames should use auto layout so the
//       generated code uses flex/stack instead of absolute positioning.
//   - Component usage            (20): component-named nodes should be live
//       instances of the published component, not detached copies — and those
//       instances should not be of deprecated components (when the caller
//       passes the file's components map).
//   - Naming convention          (15): default names ("Frame 12") carry no
//       semantic meaning for generated identifiers.
//
// The input is structural: any object shaped like a Figma node (the io client's
// FigmaNode satisfies it) works. The engine never throws — it walks whatever
// tree it is handed and divides defensively so an empty tree scores 100.

import { DEFAULT_DEPRECATED_PATTERN } from "../figma/library-health.js";

// ── Structural input type (the io FigmaNode satisfies this) ──

/** A bound-variable alias (only its presence matters here). */
interface BoundVariableAlias {
	type?: string;
	id?: string;
}

/** boundVariables maps paint properties to one or more variable aliases. */
interface HandoffBoundVariables {
	fills?: BoundVariableAlias[];
	strokes?: BoundVariableAlias[];
	[property: string]: BoundVariableAlias | BoundVariableAlias[] | undefined;
}

/** A paint entry (only its presence/count matters here). */
interface HandoffPaint {
	type?: string;
}

/**
 * Structural Figma node accepted by the scorer. The io client's `FigmaNode`
 * is assignable to this; tests build minimal literals.
 */
export interface HandoffNode {
	id: string;
	name: string;
	type: string;
	children?: HandoffNode[];
	boundVariables?: HandoffBoundVariables;
	layoutMode?: string;
	componentId?: string;
	fills?: HandoffPaint[];
	strokes?: HandoffPaint[];
}

/** The file's components / componentSets maps (GET /v1/files/:key/nodes). */
export interface ScoreReadinessOptions {
	components?: Record<string, { name: string; componentSetId?: string }>;
	componentSets?: Record<string, { name: string }>;
}

// ── Output types ──

/** Identifies which rule produced a deduction. */
export type RuleId = "var-binding" | "auto-layout" | "component" | "naming";

/** A single per-node deduction with a human-readable fix. */
export interface ReadinessDeduction {
	nodeId: string;
	nodeName: string;
	rule: RuleId;
	points: number;
	fix: string;
}

/** Rollup counts that explain the score. */
export interface ReadinessStats {
	totalNodes: number;
	/** Fraction [0,1] of styleable nodes with at least one bound paint. */
	boundCoverage: number;
	/** Fraction [0,1] of frames using auto layout. */
	autoLayoutCoverage: number;
	instanceCount: number;
	detachedSuspects: number;
	/** Instances of a component whose (set) name marks it deprecated. */
	deprecatedInstances: number;
	badNames: number;
}

/** The full readiness report for a frame. */
export interface ReadinessReport {
	score: number;
	deductions: ReadinessDeduction[];
	stats: ReadinessStats;
}

// ── Rule weights (total 100) ──

const WEIGHT_BINDING = 40;
const WEIGHT_AUTO_LAYOUT = 25;
const WEIGHT_COMPONENT = 20;
const WEIGHT_NAMING = 15;

/** Cap on how many binding deductions are listed (worst-first). */
const BINDING_DEDUCTION_LIMIT = 10;

const DEFAULT_NAME = /^(Frame|Rectangle|Group|Ellipse|Vector|Text) \d+$/;

/**
 * Multi-word PascalCase ("PrimaryButton") reads as a component name. A single
 * capitalized word does NOT — layers are routinely named "Card", "Page" or
 * "Wrapper" without being components, and flagging those would drown real
 * detachments in noise (spec'd in the test file's neutral-name cases).
 */
const MULTI_WORD_PASCAL = /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/;

/** Canonical design-system component nouns that signal a component by name alone. */
const COMPONENT_NOUNS = new Set([
	"Button",
	"Chip",
	"Input",
	"Checkbox",
	"Radio",
	"Select",
	"Badge",
	"Avatar",
	"Tooltip",
	"Modal",
	"Dialog",
	"Tab",
	"Tabs",
	"Tag",
	"Switch",
	"Toggle",
	"Dropdown",
	"Menu",
	"Toast",
	"Alert",
	"Accordion",
	"Breadcrumb",
	"Pagination",
	"Slider",
	"Stepper",
	"Spinner",
]);

const FIX_BINDING = "Bind fills/strokes to a variable";
const FIX_AUTO_LAYOUT = "Add auto layout";
const FIX_COMPONENT = "Reattach to the published component or rename";
const fixDeprecated = (name: string): string =>
	`Swap to the current component — "${name}" is deprecated`;
const FIX_NAMING = "Rename meaningfully";

// ── Predicates ──

function isStyleable(node: HandoffNode): boolean {
	const hasFills = Array.isArray(node.fills) && node.fills.length > 0;
	const hasStrokes = Array.isArray(node.strokes) && node.strokes.length > 0;
	return hasFills || hasStrokes;
}

/** True when the node binds at least one of its fills/strokes to a variable. */
function isPaintBound(node: HandoffNode): boolean {
	const bound = node.boundVariables;
	if (bound === undefined) return false;
	const fills = bound.fills;
	const strokes = bound.strokes;
	const boundFills = Array.isArray(fills) && fills.length > 0;
	const boundStrokes = Array.isArray(strokes) && strokes.length > 0;
	return boundFills || boundStrokes;
}

function isFrame(node: HandoffNode): boolean {
	return node.type === "FRAME";
}

function hasAutoLayout(node: HandoffNode): boolean {
	return node.layoutMode !== undefined && node.layoutMode !== "NONE";
}

/**
 * A name that looks like a design-system component: variant-path slashes
 * ("Card / Header"), multi-word PascalCase ("PrimaryButton"), or a canonical
 * component noun ("Button").
 */
function isComponentName(name: string): boolean {
	return (
		name.includes("/") ||
		MULTI_WORD_PASCAL.test(name) ||
		COMPONENT_NOUNS.has(name)
	);
}

function isDefaultName(name: string): boolean {
	return DEFAULT_NAME.test(name);
}

// ── Tree walk ──

function collect(root: HandoffNode): HandoffNode[] {
	const nodes: HandoffNode[] = [];
	const stack: HandoffNode[] = [root];
	while (stack.length > 0) {
		// Non-null: guarded by stack.length > 0 above.
		const node = stack.pop() as HandoffNode;
		nodes.push(node);
		const children = node.children;
		if (Array.isArray(children)) {
			// Push in reverse so children are visited in document order; ordering
			// of the flat list does not affect the score (deductions are sorted).
			for (let i = children.length - 1; i >= 0; i -= 1) {
				const child = children[i];
				if (child !== undefined) stack.push(child);
			}
		}
	}
	return nodes;
}

// ── Scoring ──

/** The deprecated (set) name an instance points at, or undefined. */
function deprecatedNameOf(
	node: HandoffNode,
	options: ScoreReadinessOptions,
): string | undefined {
	if (node.type !== "INSTANCE" || node.componentId === undefined) {
		return undefined;
	}
	const component = options.components?.[node.componentId];
	if (component === undefined) return undefined;
	const setName =
		component.componentSetId !== undefined
			? options.componentSets?.[component.componentSetId]?.name
			: undefined;
	const name = setName ?? component.name;
	return DEFAULT_DEPRECATED_PATTERN.test(name) ? name : undefined;
}

export function scoreReadiness(
	root: HandoffNode,
	options: ScoreReadinessOptions = {},
): ReadinessReport {
	const nodes = collect(root);
	const totalNodes = nodes.length;

	const styleable = nodes.filter(isStyleable);
	const unbound = styleable.filter((n) => !isPaintBound(n));
	const boundCoverage =
		styleable.length === 0 ? 1 : 1 - unbound.length / styleable.length;

	const frames = nodes.filter(isFrame);
	const framesWithoutAutoLayout = frames.filter((n) => !hasAutoLayout(n));
	const autoLayoutCoverage =
		frames.length === 0
			? 1
			: 1 - framesWithoutAutoLayout.length / frames.length;

	const instanceCount = nodes.filter((n) => n.type === "INSTANCE").length;
	const suspectNodes = nodes.filter(
		(n) => n.type !== "INSTANCE" && isComponentName(n.name),
	);
	const detachedSuspects = suspectNodes.length;
	const deprecated = nodes
		.map((node) => ({ node, name: deprecatedNameOf(node, options) }))
		.filter(
			(d): d is { node: HandoffNode; name: string } => d.name !== undefined,
		);
	const deprecatedInstances = deprecated.length;
	const componentDenominator = Math.max(1, detachedSuspects + instanceCount);
	const componentRatio =
		1 - (detachedSuspects + deprecatedInstances) / componentDenominator;

	const badNameNodes = nodes.filter((n) => isDefaultName(n.name));
	const badNames = badNameNodes.length;
	const namingRatio = totalNodes === 0 ? 1 : 1 - badNames / totalNodes;

	const deductions: ReadinessDeduction[] = [];

	// Binding (40): the lost weight is spread evenly across the unbound nodes;
	// only the 10 worst are listed (all carry equal points so "worst" reduces to
	// a stable nodeId-ascending selection).
	if (unbound.length > 0) {
		const lost = WEIGHT_BINDING * (unbound.length / styleable.length);
		const perNode = lost / unbound.length;
		const listed = [...unbound]
			.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
			.slice(0, BINDING_DEDUCTION_LIMIT);
		for (const node of listed) {
			deductions.push({
				nodeId: node.id,
				nodeName: node.name,
				rule: "var-binding",
				points: perNode,
				fix: FIX_BINDING,
			});
		}
	}

	// Auto-layout (25): the lost weight is spread evenly across frames missing
	// auto layout.
	if (framesWithoutAutoLayout.length > 0) {
		const lost =
			WEIGHT_AUTO_LAYOUT * (framesWithoutAutoLayout.length / frames.length);
		const perNode = lost / framesWithoutAutoLayout.length;
		for (const node of framesWithoutAutoLayout) {
			deductions.push({
				nodeId: node.id,
				nodeName: node.name,
				rule: "auto-layout",
				points: perNode,
				fix: FIX_AUTO_LAYOUT,
			});
		}
	}

	// Component (20): the lost weight is spread evenly across detached suspects
	// and instances of deprecated components.
	const componentOffenders = detachedSuspects + deprecatedInstances;
	if (componentOffenders > 0) {
		const lost = WEIGHT_COMPONENT * (1 - componentRatio);
		const perNode = lost / componentOffenders;
		for (const node of suspectNodes) {
			deductions.push({
				nodeId: node.id,
				nodeName: node.name,
				rule: "component",
				points: perNode,
				fix: FIX_COMPONENT,
			});
		}
		for (const { node, name } of deprecated) {
			deductions.push({
				nodeId: node.id,
				nodeName: node.name,
				rule: "component",
				points: perNode,
				fix: fixDeprecated(name),
			});
		}
	}

	// Naming (15): the lost weight is spread evenly across default-named nodes.
	if (badNames > 0) {
		const lost = WEIGHT_NAMING * (badNames / totalNodes);
		const perNode = lost / badNames;
		for (const node of badNameNodes) {
			deductions.push({
				nodeId: node.id,
				nodeName: node.name,
				rule: "naming",
				points: perNode,
				fix: FIX_NAMING,
			});
		}
	}

	deductions.sort((a, b) => {
		if (b.points !== a.points) return b.points - a.points;
		return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
	});

	const rawScore =
		WEIGHT_BINDING * boundCoverage +
		WEIGHT_AUTO_LAYOUT * autoLayoutCoverage +
		WEIGHT_COMPONENT * componentRatio +
		WEIGHT_NAMING * namingRatio;
	const score = Math.min(100, Math.max(0, Math.round(rawScore)));

	return {
		score,
		deductions,
		stats: {
			totalNodes,
			boundCoverage,
			autoLayoutCoverage,
			instanceCount,
			detachedSuspects,
			deprecatedInstances,
			badNames,
		},
	};
}
