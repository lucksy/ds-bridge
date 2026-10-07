// L1 — library-health assessment engine. PURE: no fs/network/process. Given a
// recorded `getFile` response (the `/v1/files/:key` shape), surface three
// design-system hygiene signals by walking the document tree once:
//
//   - override-hotspots: INSTANCE nodes carrying design overrides (size/position-
//     only overrides from auto layout do not count) — instances that have
//     drifted from their main component. Ranked so the worst offenders surface first.
//   - deprecated-usage: instances of components whose name is marked deprecated
//     (default pattern, overridable) — usage of components that should be retired.
//   - detached-candidates: a HEURISTIC. A detached instance is indistinguishable
//     from a hand-built frame over REST (SPEC §1.3), so this flags FRAME/GROUP
//     nodes whose name exactly matches a known component name. It WILL produce
//     false positives (a frame coincidentally named like a component) — every
//     entry carries `heuristic: true` so the renderer can caveat the number.
//
// The engine is deterministic and tolerant of missing fields: no `overrides` → 0
// hotspots; no `components` map → empty deprecated/detached, hotspots still work.
// It never throws.
//
// Source shapes: see src/io/figma/client.ts (FigmaNode.overrides + FigmaFile.components,
// both grown for this engine and verified live 2026-06-09).

import type { FigmaFile, FigmaNode } from "../../io/figma/client.js";

// ── Output model ──

export interface OverrideHotspot {
	nodeId: string;
	name: string;
	componentName?: string;
	overrideCount: number;
}

export interface DeprecatedUsageGroup {
	componentName: string;
	count: number;
}

export interface DetachedCandidate {
	nodeId: string;
	name: string;
	/** Always true — surfaces the heuristic caveat at every render site. */
	heuristic: true;
}

export interface LibraryHealthTotals {
	overrideHotspots: number;
	deprecatedUsage: number;
	detachedCandidates: number;
}

export interface LibraryHealthReport {
	overrideHotspots: OverrideHotspot[];
	deprecatedUsage: DeprecatedUsageGroup[];
	detachedCandidates: DetachedCandidate[];
	totals: LibraryHealthTotals;
}

export interface AssessLibraryHealthOptions {
	/** Overrides the default deprecation name pattern. */
	deprecatedPattern?: RegExp;
	/**
	 * Display cap per list (default 20). `Number.POSITIVE_INFINITY` returns every
	 * entry — the top-N history lists (SPEC-figma-trends §1.2) group from that.
	 */
	cap?: number;
}

// Default deprecation pattern: deprecated/deprecation, legacy, [old], do not use
// (any space/hyphen joining), and the ⚠ warning sign. Case-insensitive.
/**
 * Fields an instance overrides just by being placed: auto layout resizes it
 * (FILL/HUG) and moves it. They are not drift from the main component, so an
 * override touching only these is not a hotspot.
 */
const LAYOUT_ONLY_FIELDS = new Set([
	"width",
	"height",
	"x",
	"y",
	"size",
	"relativeTransform",
	"constraints",
	"layoutAlign",
	"layoutGrow",
	"layoutPositioning",
	"layoutSizingHorizontal",
	"layoutSizingVertical",
	"primaryAxisSizingMode",
	"counterAxisSizingMode",
	"minWidth",
	"maxWidth",
	"minHeight",
	"maxHeight",
]);

/** An override that changes how the instance looks or reads (not just its size). */
function isDesignOverride(override: { overriddenFields?: string[] }): boolean {
	const fields = override.overriddenFields;
	// No field list: count it, as before (older payloads omit the fields).
	if (!Array.isArray(fields) || fields.length === 0) return true;
	return fields.some((field) => !LAYOUT_ONLY_FIELDS.has(field));
}

export const DEFAULT_DEPRECATED_PATTERN =
	/deprecat|legacy|\[old\]|do[\s-]?not[\s-]?use|⚠/i;

const CAP = 20;

/** Resolve a component name from the file's top-level components map, if present. */
function componentNameOf(
	file: FigmaFile,
	componentId: string | undefined,
): string | undefined {
	if (componentId === undefined) return undefined;
	const components = file.components;
	if (components === undefined) return undefined;
	return components[componentId]?.name;
}

/**
 * Walk the document tree depth-first, invoking `visit` on every node. Iterative
 * (explicit stack) so a deep tree never overflows the call stack.
 */
function walk(root: FigmaNode, visit: (node: FigmaNode) => void): void {
	const stack: FigmaNode[] = [root];
	while (stack.length > 0) {
		// Non-null: guarded by stack.length > 0.
		const node = stack.pop() as FigmaNode;
		visit(node);
		const children = node.children;
		if (Array.isArray(children)) {
			for (const child of children) {
				if (child !== undefined) stack.push(child);
			}
		}
	}
}

/** Compare strings ascending, stable. */
function compareStrings(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function assessLibraryHealth(
	file: FigmaFile,
	opts?: AssessLibraryHealthOptions,
): LibraryHealthReport {
	const deprecatedPattern =
		opts?.deprecatedPattern ?? DEFAULT_DEPRECATED_PATTERN;
	const cap = opts?.cap ?? CAP;
	const hasComponents = file.components !== undefined;

	// The set of component names — for the detached heuristic's exact-name match.
	const componentNames = new Set<string>();
	// Set names come from componentSets: `components` names only the variants.
	for (const map of [file.components, file.componentSets]) {
		if (map === undefined) continue;
		for (const entry of Object.values(map)) componentNames.add(entry.name);
	}

	const hotspots: OverrideHotspot[] = [];
	// component name -> usage count, in first-seen order for determinism.
	const deprecatedCounts = new Map<string, number>();
	const detached: DetachedCandidate[] = [];

	walk(file.document, (node) => {
		const isInstance = node.type === "INSTANCE";

		if (isInstance) {
			const overrides = node.overrides;
			const overrideCount = Array.isArray(overrides)
				? overrides.filter(isDesignOverride).length
				: 0;
			if (overrideCount > 0) {
				const componentName = componentNameOf(file, node.componentId);
				hotspots.push({
					nodeId: node.id,
					name: node.name,
					...(componentName !== undefined ? { componentName } : {}),
					overrideCount,
				});
			}

			if (hasComponents) {
				const componentName = componentNameOf(file, node.componentId);
				if (
					componentName !== undefined &&
					deprecatedPattern.test(componentName)
				) {
					deprecatedCounts.set(
						componentName,
						(deprecatedCounts.get(componentName) ?? 0) + 1,
					);
				}
			}
		} else if (
			hasComponents &&
			(node.type === "FRAME" || node.type === "GROUP") &&
			componentNames.has(node.name)
		) {
			detached.push({ nodeId: node.id, name: node.name, heuristic: true });
		}
	});

	// totals are pre-cap: hotspots count, total deprecated usages (sum of counts),
	// detached-candidate count.
	let deprecatedUsageTotal = 0;
	for (const count of deprecatedCounts.values()) deprecatedUsageTotal += count;

	const totals: LibraryHealthTotals = {
		overrideHotspots: hotspots.length,
		deprecatedUsage: deprecatedUsageTotal,
		detachedCandidates: detached.length,
	};

	// override-hotspots: rank desc by override count, ties by node name asc; cap 20.
	hotspots.sort((a, b) => {
		if (a.overrideCount !== b.overrideCount) {
			return b.overrideCount - a.overrideCount;
		}
		return compareStrings(a.name, b.name);
	});

	// deprecated-usage: groups in deterministic name order; cap 20.
	const deprecatedUsage: DeprecatedUsageGroup[] = [
		...deprecatedCounts.entries(),
	]
		.map(([componentName, count]) => ({ componentName, count }))
		.sort((a, b) => compareStrings(a.componentName, b.componentName))
		.slice(0, cap);

	// detached-candidates: deterministic node-id order; cap 20.
	const detachedCandidates = [...detached]
		.sort((a, b) => compareStrings(a.nodeId, b.nodeId))
		.slice(0, cap);

	return {
		overrideHotspots: hotspots.slice(0, cap),
		deprecatedUsage,
		detachedCandidates,
		totals,
	};
}

/**
 * The display view of an assessment: each list cut to `cap` (default 20),
 * totals untouched (they are pre-cap). Equal to assessing with `{ cap }`, so a
 * caller that needs the full lists AND the display report walks the file once.
 */
export function capLibraryHealth(
	report: LibraryHealthReport,
	cap: number = CAP,
): LibraryHealthReport {
	return {
		overrideHotspots: report.overrideHotspots.slice(0, cap),
		deprecatedUsage: report.deprecatedUsage.slice(0, cap),
		detachedCandidates: report.detachedCandidates.slice(0, cap),
		totals: report.totals,
	};
}
