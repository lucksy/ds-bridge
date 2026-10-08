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
	/** The design fields overridden (fills, strokes…), sorted; omitted when unknown. */
	fields?: string[];
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
	/** Placed instances checked (the hotspots' denominator). */
	placedInstances?: number;
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

/**
 * Fields an instance overrides when someone types its text: the content and
 * Figma's bookkeeping for it. A label typed into a Chip is using the
 * component, not drifting from it.
 */
const TEXT_CONTENT_FIELDS = new Set([
	"characters",
	"characterStyleOverrides",
	"styleOverrideTable",
	"lineTypes",
	"lineIndentations",
]);

/**
 * Fields an instance overrides by being used as designed: a layer renamed in
 * the screen, and values set through the properties the component exposes
 * (a Button's label, variant, a boolean toggle) — its API, not drift.
 */
const USAGE_FIELDS = new Set([
	"name",
	"componentProperties",
	"componentPropertyReferences",
]);

/**
 * Fields that never change how an instance looks: prototype wiring,
 * annotations, export settings, plugin data, and the variable mode an
 * instance is set to (theming it is API usage, not drift).
 */
const NON_VISUAL_FIELDS = new Set([
	"annotations",
	"reactions",
	"transitionNodeID",
	"transitionDuration",
	"transitionEasing",
	"exportSettings",
	"pluginData",
	"sharedPluginData",
	"explicitVariableModes",
	"devStatus",
]);

/** The fields of an override that are drift: not layout, text or API usage. */
function designFields(override: { overriddenFields?: string[] }): string[] {
	const fields = override.overriddenFields ?? [];
	return fields.filter(
		(field) =>
			!LAYOUT_ONLY_FIELDS.has(field) &&
			!TEXT_CONTENT_FIELDS.has(field) &&
			!USAGE_FIELDS.has(field) &&
			!NON_VISUAL_FIELDS.has(field),
	);
}

/** A private / documentation-only component (`_Component Note`, `.Slot`). */
function isPrivateName(name: string | undefined): boolean {
	return name !== undefined && /^[._]/.test(name.trim());
}

/** An override that changes how the instance looks (not its size or its text). */
function isDesignOverride(override: { overriddenFields?: string[] }): boolean {
	const fields = override.overriddenFields;
	// No field list: count it, as before (older payloads omit the fields).
	if (!Array.isArray(fields) || fields.length === 0) return true;
	return designFields(override).length > 0;
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

/** Where a node sits: what a library's own structure says about it. */
interface WalkContext {
	/** Inside a COMPONENT / COMPONENT_SET: the library's own definition. */
	inDefinition: boolean;
	/** Inside an instance: owned by its main component. */
	inInstance: boolean;
	/** A direct child of a page or section: a screen / board, not a layer. */
	topLevel: boolean;
}

/**
 * Walk the document tree depth-first, invoking `visit` on every node with its
 * context. Iterative (explicit stack) so a deep tree never overflows.
 */
function walk(
	root: FigmaNode,
	visit: (node: FigmaNode, ctx: WalkContext) => void,
): void {
	const stack: { node: FigmaNode; ctx: WalkContext }[] = [
		{
			node: root,
			ctx: { inDefinition: false, inInstance: false, topLevel: false },
		},
	];
	while (stack.length > 0) {
		// Non-null: guarded by stack.length > 0.
		const { node, ctx } = stack.pop() as { node: FigmaNode; ctx: WalkContext };
		visit(node, ctx);
		const children = node.children;
		if (!Array.isArray(children)) continue;
		const childCtx: WalkContext = {
			inDefinition:
				ctx.inDefinition ||
				node.type === "COMPONENT" ||
				node.type === "COMPONENT_SET",
			inInstance: ctx.inInstance || node.type === "INSTANCE",
			topLevel: node.type === "CANVAS" || node.type === "SECTION",
		};
		for (const child of children) {
			if (child !== undefined) stack.push({ node: child, ctx: childCtx });
		}
	}
}

/** Every override on an instance and the instances nested in it, one per layer. */
function subtreeOverrides(
	node: FigmaNode,
): { id?: string; overriddenFields?: string[] }[] {
	const byId = new Map<string, { id?: string; overriddenFields?: string[] }>();
	const anonymous: { id?: string; overriddenFields?: string[] }[] = [];
	const stack: FigmaNode[] = [node];
	while (stack.length > 0) {
		const current = stack.pop() as FigmaNode;
		if (current.type === "INSTANCE" && Array.isArray(current.overrides)) {
			for (const override of current.overrides) {
				const id = (override as { id?: string }).id;
				if (id === undefined) {
					anonymous.push(override);
					continue;
				}
				const prior = byId.get(id);
				const fields = [
					...new Set([
						...(prior?.overriddenFields ?? []),
						...(override.overriddenFields ?? []),
					]),
				];
				byId.set(id, {
					id,
					...(fields.length > 0 ? { overriddenFields: fields } : {}),
				});
			}
		}
		for (const child of current.children ?? []) {
			if (child !== undefined) stack.push(child);
		}
	}
	return [...byId.values(), ...anonymous];
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

	// Each component's own layer names: a detached copy keeps them, a layout
	// frame that merely shares the component's name ("Text") does not.
	const layersByName = new Map<string, Set<string>>();
	walk(file.document, (node) => {
		if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") return;
		const layers = layersByName.get(node.name) ?? new Set<string>();
		const variants =
			node.type === "COMPONENT_SET" ? (node.children ?? []) : [node];
		for (const variant of variants) {
			for (const child of variant?.children ?? []) {
				if (child !== undefined) layers.add(`${child.name}:${child.type}`);
			}
		}
		layersByName.set(node.name, layers);
	});
	// Exact `name:TYPE` layer signatures: a renamed detached copy ("Archive"
	// detached from Button) still carries its component's layers.
	const signatures = new Set<string>();
	walk(file.document, (node) => {
		if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") return;
		const owner =
			node.type === "COMPONENT_SET"
				? node.children?.find((c) => c?.type === "COMPONENT")
				: node;
		const layers = (owner?.children ?? []).filter(
			(c): c is FigmaNode => c !== undefined,
		);
		// Wrapper- or instance-only components (Button Group, `Block | Block`)
		// look like any layout: a signature needs a content layer.
		if (
			layers.length >= 2 &&
			layers.some(
				(c) => !["INSTANCE", "FRAME", "GROUP", "SECTION"].includes(c.type),
			)
		) {
			signatures.add(layers.map((c) => `${c.name}:${c.type}`).join("|"));
		}
	});
	const signatureOf = (node: FigmaNode): string | undefined => {
		const children = (node.children ?? []).filter(
			(c): c is FigmaNode => c !== undefined,
		);
		return children.length >= 2
			? children.map((c) => `${c.name}:${c.type}`).join("|")
			: undefined;
	};
	const looksDetached = (node: FigmaNode): boolean => {
		const layers = layersByName.get(node.name);
		// The component's layers are not in this file: the name is all we have.
		if (layers === undefined || layers.size === 0) return true;
		const children = (node.children ?? []).filter(
			(c): c is FigmaNode => c !== undefined,
		);
		if (children.length === 0) return false;
		// Same name AND type (a "Text" frame is not the "Text" label), at least
		// half of the layers, one of them content (a label, a vector).
		const shared = children.filter((c) => layers.has(`${c.name}:${c.type}`));
		return (
			shared.length / children.length >= 0.5 &&
			shared.some(
				(c) => !["INSTANCE", "FRAME", "GROUP", "SECTION"].includes(c.type),
			)
		);
	};

	const hotspots: OverrideHotspot[] = [];
	let placedInstances = 0;
	// component name -> usage count, in first-seen order for determinism.
	const deprecatedCounts = new Map<string, number>();
	const detached: DetachedCandidate[] = [];

	/** The (set) name of the component an instance points at. */
	const mainNameOf = (componentId: string | undefined): string | undefined => {
		if (componentId === undefined) return undefined;
		const component = file.components?.[componentId];
		const setId = component?.componentSetId;
		return (
			(setId !== undefined ? file.componentSets?.[setId]?.name : undefined) ??
			component?.name
		);
	};

	walk(file.document, (node, ctx) => {
		const isInstance = node.type === "INSTANCE";

		// Placed usage only: an instance inside a component definition is the
		// library composing itself, a nested instance is reported on the
		// instance it sits in, and a private helper (`_Component Note`) is
		// documentation, not the system.
		const placed =
			isInstance &&
			!ctx.inDefinition &&
			!ctx.inInstance &&
			!isPrivateName(mainNameOf(node.componentId));

		if (placed) placedInstances += 1;
		if (placed) {
			const drifted = subtreeOverrides(node).filter(isDesignOverride);
			const overrideCount = drifted.length;
			if (overrideCount > 0) {
				// The component (set) — "Footer", not its variant "Platform=Desktop".
				const componentName = mainNameOf(node.componentId);
				const fields = [...new Set(drifted.flatMap(designFields))].sort();
				hotspots.push({
					nodeId: node.id,
					name: node.name,
					...(componentName !== undefined ? { componentName } : {}),
					overrideCount,
					...(fields.length > 0 ? { fields } : {}),
				});
			}
		}

		if (isInstance && !ctx.inInstance) {
			if (hasComponents) {
				// A deprecated SET marks every variant ("Legacy Button" with
				// `Size=Small` variants); a single deprecated variant counts too.
				const setName = mainNameOf(node.componentId);
				const variantName = componentNameOf(file, node.componentId);
				const componentName = [setName, variantName].find(
					(n) => n !== undefined && deprecatedPattern.test(n),
				);
				if (componentName !== undefined) {
					deprecatedCounts.set(
						componentName,
						(deprecatedCounts.get(componentName) ?? 0) + 1,
					);
				}
			}
		} else if (
			hasComponents &&
			(node.type === "FRAME" || node.type === "GROUP") &&
			!ctx.topLevel &&
			!ctx.inDefinition &&
			!ctx.inInstance &&
			!isPrivateName(node.name) &&
			((componentNames.has(node.name) && looksDetached(node)) ||
				signatures.has(signatureOf(node) ?? "\u0000"))
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
		placedInstances,
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
