// T5.2 — Figma component model (the registry's design side). PURE: no
// fs/network/process. Given the recorded published-components list (the REST
// `/v1/files/:key/components` `meta.components` shape) and/or the file
// `document` tree (the `/v1/files/:key` document shape), produce a
// deterministic, deduped list of component models.
//
// Two sources feed the model:
//   - "published": entries from the REST components endpoint. Plain names map
//     straight through with empty variantProps; variant names ("Size=sm,
//     Tone=info") parse into variantProps and merge — by their shared
//     `containing_frame` name — into a single model per component set.
//   - "inline": unpublished COMPONENT / COMPONENT_SET nodes walked out of the
//     file document tree, EXCLUDING any node id already published. A
//     COMPONENT_SET's variant children supply its variantProps.
//
// Dedup is by nodeId with published winning. The result is sorted by name. The
// engine never throws — malformed/missing inputs degrade to [].
//
// SPEC §1 caveat: the REST `/components` endpoint lists PUBLISHED components
// only; inline (unpublished) components only ever appear in the file tree.

// ── Output model ──

export interface FigmaComponentModel {
	name: string;
	nodeId: string;
	description: string;
	/** Variant axis -> sorted, deduped values, e.g. { Size: ["md", "sm"] }. */
	variantProps: Record<string, string[]>;
	source: "published" | "inline";
	/**
	 * Other components of the same name collapsed into this one — an icon's
	 * copies per size section (16, 20, 24 …). Code Connect may point at any.
	 */
	aliasNodeIds?: string[];
	/** "icon" when it lives in an icon library (a page / section named Icons). */
	kind?: "icon";
	/**
	 * The component's direct layers as `name:TYPE` (a set's first variant):
	 * a detached copy keeps them, whatever it is renamed. Two or more only.
	 */
	layers?: string[];
}

// ── Structural input shapes (only the fields we reason about) ──

/** A published component as listed by GET /v1/files/:key/components. */
interface PublishedComponent {
	node_id?: unknown;
	name?: unknown;
	description?: unknown;
	containing_frame?: {
		name?: unknown;
		pageName?: unknown;
		containingStateGroup?: unknown;
	} | null;
}

/** The `meta.components` envelope of the components endpoint. */
interface PublishedComponentsInput {
	meta?: { components?: PublishedComponent[] };
}

/** A node in the file document tree (the io FigmaNode is assignable to this). */
interface DocumentNode {
	id?: unknown;
	name?: unknown;
	type?: unknown;
	description?: unknown;
	children?: DocumentNode[];
}

/** A component node's layer signature (`name:TYPE` per direct child), ≥2 layers. */
export function layerSignature(node: DocumentNode): string[] | undefined {
	const owner =
		node.type === "COMPONENT_SET"
			? node.children?.find((c) => c.type === "COMPONENT")
			: node;
	const layers = (owner?.children ?? []).map(
		(c) => `${asString(c.name)}:${asString(c.type)}`,
	);
	// A component built only of instances (Button Group) has the signature of
	// any layout row of those instances — never evidence of a detached copy.
	return layers.length >= 2 && layers.some((l) => !l.endsWith(":INSTANCE"))
		? layers
		: undefined;
}

/** Every component (set) id in the document → its layer signature. */
function layerSignatures(
	document: DocumentNode | undefined,
): Map<string, string[]> {
	const out = new Map<string, string[]>();
	if (document === undefined) return out;
	const stack: DocumentNode[] = [document];
	while (stack.length > 0) {
		const node = stack.pop() as DocumentNode;
		if (node.type === "COMPONENT_SET" || node.type === "COMPONENT") {
			const layers = layerSignature(node);
			if (layers !== undefined) out.set(asString(node.id), layers);
			if (node.type === "COMPONENT_SET") continue;
		}
		for (const child of node.children ?? []) stack.push(child);
	}
	return out;
}

/** A file-level `components` / `componentSets` map (GET /v1/files/:key). */
type FileComponentMap = Record<
	string,
	{ name?: unknown; description?: unknown }
>;

export interface BuildFigmaComponentModelInput {
	published?: PublishedComponentsInput;
	fileDocument?: DocumentNode;
	/**
	 * The file's top-level maps. Document nodes carry no `description`; these
	 * do, so inline (unpublished) components read their description here.
	 */
	fileComponents?: FileComponentMap;
	fileComponentSets?: FileComponentMap;
}

// ── Helpers ──

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function asString(value: unknown): string {
	return isString(value) ? value : "";
}

/**
 * Parse a variant name like "Size=sm, Tone=info" into { Size: ["sm"], Tone:
 * ["info"] }. Keys/values are trimmed. A name with no "=" pair yields {} (the
 * caller treats such a name as a plain, non-variant name).
 */
function parseVariantName(name: string): Record<string, string[]> {
	const props: Record<string, string[]> = {};
	if (!name.includes("=")) return props;
	for (const pair of name.split(",")) {
		const eq = pair.indexOf("=");
		if (eq === -1) continue;
		const key = pair.slice(0, eq).trim();
		const value = pair.slice(eq + 1).trim();
		if (key.length === 0) continue;
		const existing = props[key];
		if (existing === undefined) {
			props[key] = [value];
		} else {
			existing.push(value);
		}
	}
	return props;
}

/** Sort + dedup each axis's values; return a fresh record (deterministic). */
function normalizeVariantProps(
	props: Record<string, string[]>,
): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const key of Object.keys(props).sort()) {
		const values = props[key] ?? [];
		out[key] = [...new Set(values)].sort();
	}
	return out;
}

/** Merge `from` into `into`, accumulating values per axis. */
function mergeVariantProps(
	into: Record<string, string[]>,
	from: Record<string, string[]>,
): void {
	for (const key of Object.keys(from)) {
		const incoming = from[key] ?? [];
		const existing = into[key];
		if (existing === undefined) {
			into[key] = [...incoming];
		} else {
			existing.push(...incoming);
		}
	}
}

/** Compare two node ids as strings (stable ascending). */
function compareIds(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

// ── Published side ──

interface PublishedAccumulator {
	name: string;
	nodeId: string;
	description: string;
	variantProps: Record<string, string[]>;
	icon?: boolean;
}

/**
 * Example screens and templates — a page called Examples, or a component named
 * `Examples/Shop` — show the system in use; they are not library components.
 */
const EXAMPLE_NAME = /^(?:examples?|templates?)\s*\//i;
const EXAMPLE_PAGE = /^(?:examples?|templates?|playground|sandbox)$/i;

/** A page / section / frame name that marks an icon library. */
const ICON_CONTEXT = /(^|[^a-z])icons?([^a-z]|$)/i;

function buildPublished(input: PublishedComponentsInput | undefined): {
	models: FigmaComponentModel[];
	ids: Set<string>;
} {
	const components = input?.meta?.components;
	const ids = new Set<string>();
	if (!Array.isArray(components)) return { models: [], ids };

	// Group entries by their merge key: the containing_frame name when the entry
	// is a variant child of a set, otherwise a unique key per standalone entry.
	const sets = new Map<string, PublishedAccumulator>();
	const standalone: PublishedAccumulator[] = [];

	for (const component of components) {
		const nodeId = asString(component.node_id);
		if (nodeId.length === 0) continue;
		ids.add(nodeId);

		const rawName = asString(component.name);
		const description = asString(component.description);
		const variantProps = parseVariantName(rawName);
		const isVariant = Object.keys(variantProps).length > 0;
		const setName = isString(component.containing_frame?.name)
			? component.containing_frame.name
			: undefined;

		if (isVariant && setName !== undefined) {
			const existing = sets.get(setName);
			if (existing === undefined) {
				sets.set(setName, {
					name: setName,
					nodeId,
					description,
					variantProps: { ...variantProps },
				});
			} else {
				mergeVariantProps(existing.variantProps, variantProps);
				// Keep the lowest child nodeId as the set's representative id.
				if (compareIds(nodeId, existing.nodeId) < 0) existing.nodeId = nodeId;
				if (existing.description.length === 0 && description.length > 0) {
					existing.description = description;
				}
			}
		} else {
			const frame = component.containing_frame;
			if (EXAMPLE_PAGE.test(asString(frame?.pageName).trim())) continue;
			const icon =
				ICON_CONTEXT.test(asString(frame?.pageName)) ||
				ICON_CONTEXT.test(asString(frame?.name));
			standalone.push({
				name: rawName,
				nodeId,
				description,
				variantProps,
				...(icon ? { icon } : {}),
			});
		}
	}

	const models: FigmaComponentModel[] = [];
	for (const acc of [...sets.values(), ...standalone]) {
		models.push({
			name: acc.name,
			nodeId: acc.nodeId,
			description: acc.description,
			variantProps: normalizeVariantProps(acc.variantProps),
			source: "published",
			...(acc.icon === true ? { kind: "icon" as const } : {}),
		});
	}
	return { models, ids };
}

// ── Inline side ──

function variantPropsFromChildren(
	children: DocumentNode[] | undefined,
): Record<string, string[]> {
	const props: Record<string, string[]> = {};
	if (!Array.isArray(children)) return props;
	for (const child of children) {
		if (child.type !== "COMPONENT") continue;
		mergeVariantProps(props, parseVariantName(asString(child.name)));
	}
	return props;
}

function buildInline(
	document: DocumentNode | undefined,
	publishedIds: Set<string>,
	descriptions: (nodeId: string) => string,
): FigmaComponentModel[] {
	if (document === undefined) return [];

	const byId = new Map<string, FigmaComponentModel>();
	const stack: { node: DocumentNode; icon: boolean }[] = [
		{ node: document, icon: false },
	];

	while (stack.length > 0) {
		// Non-null: guarded by stack.length > 0.
		const { node, icon } = stack.pop() as { node: DocumentNode; icon: boolean };
		const type = node.type;
		// An Examples / Templates page shows the system in use: not the library.
		if (type === "CANVAS" && EXAMPLE_PAGE.test(asString(node.name).trim())) {
			continue;
		}

		if (type === "COMPONENT_SET" || type === "COMPONENT") {
			const nodeId = asString(node.id);
			if (nodeId.length > 0 && !publishedIds.has(nodeId) && !byId.has(nodeId)) {
				const variantProps =
					type === "COMPONENT_SET"
						? variantPropsFromChildren(node.children)
						: {};
				byId.set(nodeId, {
					name: asString(node.name),
					nodeId,
					description: asString(node.description) || descriptions(nodeId),
					variantProps: normalizeVariantProps(variantProps),
					source: "inline",
					...(icon ? { kind: "icon" as const } : {}),
				});
			}
			// A COMPONENT_SET's COMPONENT children describe variants of the set, not
			// standalone components — do NOT descend into a set's children.
			if (type === "COMPONENT_SET") continue;
		}

		const children = node.children;
		const childIcon =
			icon ||
			((type === "CANVAS" || type === "SECTION" || type === "FRAME") &&
				ICON_CONTEXT.test(asString(node.name)));
		if (Array.isArray(children)) {
			for (let i = children.length - 1; i >= 0; i -= 1) {
				const child = children[i];
				if (child !== undefined) stack.push({ node: child, icon: childIcon });
			}
		}
	}

	return [...byId.values()];
}

// ── Entry point ──

export function buildFigmaComponentModel(
	input: BuildFigmaComponentModelInput,
): FigmaComponentModel[] {
	const { models: publishedModels, ids } = buildPublished(input.published);
	const descriptions = (nodeId: string): string =>
		asString(input.fileComponentSets?.[nodeId]?.description) ||
		asString(input.fileComponents?.[nodeId]?.description);
	const inlineModels = buildInline(input.fileDocument, ids, descriptions);

	// Dedup by nodeId: published already populated `ids`, so inline never
	// collides with a published id. Within published, set merging already
	// collapsed variant children; standalone published ids are unique by source.
	const byId = new Map<string, FigmaComponentModel>();
	for (const model of publishedModels) {
		if (!byId.has(model.nodeId)) byId.set(model.nodeId, model);
	}
	for (const model of inlineModels) {
		if (!byId.has(model.nodeId)) byId.set(model.nodeId, model);
	}

	const signatures = layerSignatures(input.fileDocument);
	const withLayers = [...byId.values()].map((model) => {
		const layers = signatures.get(model.nodeId);
		return layers === undefined ? model : { ...model, layers };
	});
	return normalizeComponentModels(withLayers);
}

/**
 * The component inventory as every command compares it: private components
 * (`.Slot`, `_Component Note` — a library's own building blocks and
 * documentation helpers, never published, never code) left out, same-name
 * copies collapsed, sorted. Idempotent, so a snapshot saved by an earlier
 * version (impact's baseline) reads like a fresh fetch.
 */
export function normalizeComponentModels(
	models: readonly FigmaComponentModel[],
): FigmaComponentModel[] {
	const visible = models.filter(
		(m) => !/^[._]/.test(m.name.trim()) && !EXAMPLE_NAME.test(m.name.trim()),
	);
	return collapseSameName(visible).sort((a, b) => {
		if (a.name !== b.name) return a.name < b.name ? -1 : 1;
		return compareIds(a.nodeId, b.nodeId);
	});
}

/**
 * Same-name plain components are one component drawn several times — an icon
 * per size section (`16`, `20` … `48`). Keep one (the lowest id), remember the
 * others so a Code Connect link to any copy still resolves.
 */
function collapseSameName(
	models: readonly FigmaComponentModel[],
): FigmaComponentModel[] {
	const groups = new Map<string, FigmaComponentModel[]>();
	const out: FigmaComponentModel[] = [];
	for (const model of models) {
		if (Object.keys(model.variantProps).length > 0) {
			out.push(model);
			continue;
		}
		const group = groups.get(model.name) ?? [];
		group.push(model);
		groups.set(model.name, group);
	}
	for (const group of groups.values()) {
		const sorted = [...group].sort((a, b) => compareIds(a.nodeId, b.nodeId));
		const [first, ...rest] = sorted;
		if (first === undefined) continue;
		const description =
			sorted.find((m) => m.description !== "")?.description ?? "";
		const aliases = [
			...new Set([
				...sorted.flatMap((m) => m.aliasNodeIds ?? []),
				...rest.map((m) => m.nodeId),
			]),
		]
			.filter((id) => id !== first.nodeId)
			.sort(compareIds);
		out.push({
			...first,
			description,
			...(aliases.length > 0 ? { aliasNodeIds: aliases } : {}),
			...(sorted.some((m) => m.kind === "icon")
				? { kind: "icon" as const }
				: {}),
		});
	}
	return out;
}
