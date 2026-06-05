// T7.7 — component-diff engine: the breaking-change radar's core. PURE — no
// fs/network/process; deterministic; NEVER throws (it operates on already-built
// FigmaComponentModel inventories from scan-figma and degrades to empty buckets
// rather than guessing).
//
// Diffs two component inventories into { added, removed, renamed, changed } and
// classifies each entry's downstream impact as `breaking | additive | cosmetic`.
//
// Identity is the nodeId. A rename is either a same-id name change, or a
// similarity-matched pair drawn from the leftover add/remove candidates (an id
// that was re-created). See tests/engines/impact/component-diff.test.ts for the
// pinned classification rules table.
import type { FigmaComponentModel } from "../registry/scan-figma.js";

/** Downstream impact of a single component change. */
export type ImpactLevel = "breaking" | "additive" | "cosmetic";

/** One per-axis variant delta within a `changed` entry. */
export type VariantChange =
	| { axis: string; kind: "axis-added" }
	| { axis: string; kind: "axis-removed" }
	| { axis: string; kind: "value-added"; value: string }
	| { axis: string; kind: "value-removed"; value: string };

/** A component present only in `after`. */
export interface AddedComponent {
	name: string;
	nodeId: string;
	impact: ImpactLevel;
}

/** A component present only in `before`. */
export interface RemovedComponent {
	name: string;
	nodeId: string;
	impact: ImpactLevel;
}

/** A component whose name changed (same id, or a similarity-matched re-create). */
export interface RenamedComponent {
	fromName: string;
	toName: string;
	/** The `after` nodeId (the live one). */
	nodeId: string;
	/** The `before` nodeId, when the rename crossed ids (else equal to nodeId). */
	fromNodeId: string;
	impact: ImpactLevel;
}

/** A component kept (same id, same-ish name) whose shape/description changed. */
export interface ChangedComponent {
	name: string;
	nodeId: string;
	descriptionChanged: boolean;
	variantChanges: VariantChange[];
	impact: ImpactLevel;
}

export interface ComponentDiff {
	added: AddedComponent[];
	removed: RemovedComponent[];
	renamed: RenamedComponent[];
	changed: ChangedComponent[];
}

// ── Tuning constants (mirror the test contract) ──

/** Min normalized-token similarity to treat a leftover add/remove pair as a rename. */
const RENAME_THRESHOLD = 0.5;

// ── Name normalization + similarity (local; match.ts's helpers are not exported) ──

/**
 * Split a raw name into lowercase word tokens by PascalCase boundaries,
 * slashes, dashes, underscores and whitespace. "Dropdown / Menu" ->
 * ["dropdown", "menu"]; "DropdownMenu" -> ["dropdown", "menu"].
 */
function tokenize(name: string): string[] {
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
function nameSimilarity(a: string, b: string): number {
	const setA = new Set(tokenize(a));
	const setB = new Set(tokenize(b));
	if (setA.size === 0 || setB.size === 0) return 0;
	let intersection = 0;
	for (const token of setA) {
		if (setB.has(token)) intersection += 1;
	}
	return (2 * intersection) / (setA.size + setB.size);
}

// ── Ordering ──

function byNameAsc<T extends { name: string }>(a: T, b: T): number {
	return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

// ── Impact ranking (most severe wins) ──

const IMPACT_RANK: Record<ImpactLevel, number> = {
	breaking: 2,
	additive: 1,
	cosmetic: 0,
};

function moreSevere(a: ImpactLevel, b: ImpactLevel): ImpactLevel {
	return IMPACT_RANK[a] >= IMPACT_RANK[b] ? a : b;
}

// ── Variant diffing ──

/**
 * Compute the per-axis variant deltas between two variantProps records. Axes are
 * compared by exact key (scan-figma already normalizes axis keys + sorts values).
 * Returns the changes in a deterministic order: axis ascending, then kind, then
 * value.
 */
function diffVariants(
	before: Record<string, string[]>,
	after: Record<string, string[]>,
): VariantChange[] {
	const changes: VariantChange[] = [];
	const axes = new Set<string>([...Object.keys(before), ...Object.keys(after)]);

	for (const axis of [...axes].sort()) {
		const beforeValues = before[axis];
		const afterValues = after[axis];

		if (beforeValues === undefined && afterValues !== undefined) {
			changes.push({ axis, kind: "axis-added" });
			continue;
		}
		if (beforeValues !== undefined && afterValues === undefined) {
			changes.push({ axis, kind: "axis-removed" });
			continue;
		}
		if (beforeValues === undefined || afterValues === undefined) continue;

		const beforeSet = new Set(beforeValues);
		const afterSet = new Set(afterValues);
		const added: string[] = [];
		const removed: string[] = [];
		for (const value of afterSet) {
			if (!beforeSet.has(value)) added.push(value);
		}
		for (const value of beforeSet) {
			if (!afterSet.has(value)) removed.push(value);
		}
		for (const value of removed.sort()) {
			changes.push({ axis, kind: "value-removed", value });
		}
		for (const value of added.sort()) {
			changes.push({ axis, kind: "value-added", value });
		}
	}

	return changes;
}

/** A removal of an axis or value is breaking; an addition is additive. */
function variantChangeImpact(change: VariantChange): ImpactLevel {
	switch (change.kind) {
		case "axis-removed":
		case "value-removed":
			return "breaking";
		case "axis-added":
		case "value-added":
			return "additive";
	}
}

/**
 * Classify a kept (same-id, same-name) component as a `changed` entry, or
 * undefined when nothing material changed. Description-only is cosmetic; any
 * variant delta dominates per the most-severe rule.
 */
function classifyChanged(
	before: FigmaComponentModel,
	after: FigmaComponentModel,
): ChangedComponent | undefined {
	const variantChanges = diffVariants(before.variantProps, after.variantProps);
	const descriptionChanged = before.description !== after.description;

	if (variantChanges.length === 0 && !descriptionChanged) return undefined;

	// Baseline is cosmetic (covers description-only); variant deltas escalate.
	let impact: ImpactLevel = "cosmetic";
	for (const change of variantChanges) {
		impact = moreSevere(impact, variantChangeImpact(change));
	}

	return {
		name: after.name,
		nodeId: after.nodeId,
		descriptionChanged,
		variantChanges,
		impact,
	};
}

// ── Rename detection over leftover add/remove candidates ──

interface RenameMatch {
	beforeIndex: number;
	afterIndex: number;
	score: number;
}

/**
 * Greedily pair leftover removed (before-only) and added (after-only) candidates
 * into renames by name similarity. Each side is used at most once; the highest
 * similarity pairs win first, with deterministic tie-breaking by name. Only pairs
 * at or above RENAME_THRESHOLD are accepted.
 */
function matchRenames(
	removedCandidates: FigmaComponentModel[],
	addedCandidates: FigmaComponentModel[],
): RenameMatch[] {
	const edges: RenameMatch[] = [];
	for (let b = 0; b < removedCandidates.length; b += 1) {
		const beforeModel = removedCandidates[b];
		if (beforeModel === undefined) continue;
		for (let a = 0; a < addedCandidates.length; a += 1) {
			const afterModel = addedCandidates[a];
			if (afterModel === undefined) continue;
			const score = nameSimilarity(beforeModel.name, afterModel.name);
			if (score >= RENAME_THRESHOLD) {
				edges.push({ beforeIndex: b, afterIndex: a, score });
			}
		}
	}

	edges.sort((x, y) => {
		if (x.score !== y.score) return y.score - x.score;
		const bx = removedCandidates[x.beforeIndex]?.name ?? "";
		const by = removedCandidates[y.beforeIndex]?.name ?? "";
		if (bx !== by) return bx < by ? -1 : 1;
		const ax = addedCandidates[x.afterIndex]?.name ?? "";
		const ay = addedCandidates[y.afterIndex]?.name ?? "";
		return ax < ay ? -1 : ax > ay ? 1 : 0;
	});

	const usedBefore = new Set<number>();
	const usedAfter = new Set<number>();
	const matches: RenameMatch[] = [];
	for (const edge of edges) {
		if (usedBefore.has(edge.beforeIndex) || usedAfter.has(edge.afterIndex)) {
			continue;
		}
		usedBefore.add(edge.beforeIndex);
		usedAfter.add(edge.afterIndex);
		matches.push(edge);
	}
	return matches;
}

// ── Entry point ──

/**
 * Diff two component inventories (before -> after). Pure, deterministic, total.
 *
 * Algorithm:
 *   1. Index both sides by nodeId.
 *   2. Shared ids: name changed => rename (breaking); else classify shape/desc
 *      changes via classifyChanged.
 *   3. Leftover before-only / after-only ids: attempt similarity rename matching;
 *      matched pairs become cross-id renames, the rest become removed/added.
 */
export function diffComponents(
	before: readonly FigmaComponentModel[],
	after: readonly FigmaComponentModel[],
): ComponentDiff {
	const beforeById = new Map<string, FigmaComponentModel>();
	for (const model of before) {
		if (!beforeById.has(model.nodeId)) beforeById.set(model.nodeId, model);
	}
	const afterById = new Map<string, FigmaComponentModel>();
	for (const model of after) {
		if (!afterById.has(model.nodeId)) afterById.set(model.nodeId, model);
	}

	const renamed: RenamedComponent[] = [];
	const changed: ChangedComponent[] = [];

	// Shared ids.
	for (const [nodeId, beforeModel] of beforeById) {
		const afterModel = afterById.get(nodeId);
		if (afterModel === undefined) continue;
		if (beforeModel.name !== afterModel.name) {
			renamed.push({
				fromName: beforeModel.name,
				toName: afterModel.name,
				nodeId,
				fromNodeId: nodeId,
				impact: "breaking",
			});
			continue;
		}
		const change = classifyChanged(beforeModel, afterModel);
		if (change !== undefined) changed.push(change);
	}

	// Leftover candidates: ids on only one side.
	const removedCandidates = [...beforeById.entries()]
		.filter(([id]) => !afterById.has(id))
		.map(([, model]) => model);
	const addedCandidates = [...afterById.entries()]
		.filter(([id]) => !beforeById.has(id))
		.map(([, model]) => model);

	const renameMatches = matchRenames(removedCandidates, addedCandidates);
	const matchedBefore = new Set<number>();
	const matchedAfter = new Set<number>();
	for (const match of renameMatches) {
		matchedBefore.add(match.beforeIndex);
		matchedAfter.add(match.afterIndex);
		const beforeModel = removedCandidates[match.beforeIndex];
		const afterModel = addedCandidates[match.afterIndex];
		if (beforeModel === undefined || afterModel === undefined) continue;
		renamed.push({
			fromName: beforeModel.name,
			toName: afterModel.name,
			nodeId: afterModel.nodeId,
			fromNodeId: beforeModel.nodeId,
			impact: "breaking",
		});
	}

	const removed: RemovedComponent[] = [];
	for (let b = 0; b < removedCandidates.length; b += 1) {
		if (matchedBefore.has(b)) continue;
		const model = removedCandidates[b];
		if (model === undefined) continue;
		removed.push({
			name: model.name,
			nodeId: model.nodeId,
			impact: "breaking",
		});
	}

	const added: AddedComponent[] = [];
	for (let a = 0; a < addedCandidates.length; a += 1) {
		if (matchedAfter.has(a)) continue;
		const model = addedCandidates[a];
		if (model === undefined) continue;
		added.push({ name: model.name, nodeId: model.nodeId, impact: "additive" });
	}

	added.sort(byNameAsc);
	removed.sort(byNameAsc);
	renamed.sort((x, y) =>
		x.toName < y.toName ? -1 : x.toName > y.toName ? 1 : 0,
	);
	changed.sort(byNameAsc);

	return { added, removed, renamed, changed };
}
