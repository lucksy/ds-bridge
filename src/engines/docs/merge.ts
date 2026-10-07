// T7.17 — docs merge engine. PURE: no fs/network/process; deterministic; NEVER
// throws. It joins the saved RegistryFile's match topology (what is matched vs.
// unmatched on each side) with the RICH source shapes the registry does not
// persist — code props/variants (scan-code's CodeComponent) and figma
// descriptions (scan-figma's FigmaComponentModel) — into a flat ComponentDoc[]
// the MDX/llms renderers (T7.18) consume.
//
// Why the rich shapes are re-joined here: the persisted registry carries only
// names, importPaths, nodeIds and scores — neither props/variants nor figma
// descriptions. The docs need both, so the merge re-attaches them by joining
// the registry's code entries (by name) to the CodeComponent list and its figma
// entries (by nodeId) to the FigmaComponentModel list. When a rich shape is
// absent (e.g. the registry was built against a since-changed tree) the doc
// still appears, carrying only what the registry preserved.
//
// Gaps are the doc's call-to-action list: an unmatched side, or a matched figma
// component with no authored description. Unmatched components from BOTH sides
// are emitted as docs-with-gaps so nothing is silently dropped.
import type { RegistryFile } from "../registry/persist.js";
import type { CodeComponent } from "../registry/scan-code.js";
import type { FigmaComponentModel } from "../registry/scan-figma.js";
import type { TokenMap } from "../tokens/types.js";

// ── Output model ──

/** A documentation gap: something a reader/maintainer should act on. */
export type DocGap =
	| "missing-figma-description"
	| "unmatched-in-figma"
	| "unmatched-in-code";

/** The code side of a documented component (importPath + resolved shape). */
export interface ComponentDocCode {
	/** Path relative to the scan root, forward slashes; "" when code is absent. */
	importPath: string;
	/**
	 * What a consumer writes in an import (`@/components/ui/button`), when the
	 * project's tsconfig aliases cover the file. Set at the io edge.
	 */
	importSpecifier?: string;
	props: CodeComponent["props"];
	variants: CodeComponent["variants"];
}

/** The figma side of a documented component, when one exists. */
export interface ComponentDocFigma {
	nodeId: string;
	description: string;
}

/** One component's merged documentation model. */
export interface ComponentDoc {
	name: string;
	code: ComponentDocCode;
	figma?: ComponentDocFigma;
	/** Typed, deterministically ordered gaps for this component. */
	gaps: DocGap[];
}

// ── Input ──

export interface MergeInput {
	registry: RegistryFile;
	/** Rich code shapes (props/variants), joined back by component name. */
	code: CodeComponent[];
	/** Rich figma shapes (descriptions/variantProps), joined back by nodeId. */
	figma: FigmaComponentModel[];
	/**
	 * The repo's token model. Carried through the merge contract so the docs
	 * pipeline has a single entry point; the per-component docs are token-agnostic
	 * (the token summary lives in the llms.txt renderer), so it is unused here.
	 */
	tokens: TokenMap;
}

// ── Helpers ──

function byNameAsc(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Index the rich code shapes by component name for O(1) join. */
function indexCode(code: CodeComponent[]): Map<string, CodeComponent> {
	const byName = new Map<string, CodeComponent>();
	for (const component of code) {
		if (!byName.has(component.name)) byName.set(component.name, component);
	}
	return byName;
}

/** Index the rich figma shapes by nodeId for O(1) join. */
function indexFigma(
	figma: FigmaComponentModel[],
): Map<string, FigmaComponentModel> {
	const byId = new Map<string, FigmaComponentModel>();
	for (const model of figma) {
		if (!byId.has(model.nodeId)) byId.set(model.nodeId, model);
	}
	return byId;
}

/** Resolve the code side: rich shape when present, else registry-only fallback. */
function resolveCode(
	importPath: string,
	rich: CodeComponent | undefined,
	figmaFallbackVariants?: CodeComponent["variants"],
): ComponentDocCode {
	if (rich !== undefined) {
		return {
			importPath: rich.importPath,
			props: rich.props,
			variants: rich.variants,
		};
	}
	return {
		importPath,
		props: [],
		variants: figmaFallbackVariants ?? {},
	};
}

// ── Entry point ──

/**
 * Merge the registry topology with the rich code/figma shapes into a
 * name-sorted ComponentDoc[]. Defensive against a malformed registry (missing
 * arrays degrade to empty buckets) — it never throws.
 */
export function mergeComponentDocs(input: MergeInput): ComponentDoc[] {
	const { registry } = input;
	const matches = Array.isArray(registry?.matches) ? registry.matches : [];
	const unmatchedCode = Array.isArray(registry?.unmatchedCode)
		? registry.unmatchedCode
		: [];
	const unmatchedFigma = Array.isArray(registry?.unmatchedFigma)
		? registry.unmatchedFigma
		: [];

	const codeByName = indexCode(input.code);
	const figmaById = indexFigma(input.figma);

	const docs: ComponentDoc[] = [];

	// Matched: both sides exist. The doc name is the code name (the import target).
	for (const match of matches) {
		const richCode = codeByName.get(match.codeName);
		const richFigma = figmaById.get(match.nodeId);
		const description = richFigma?.description ?? "";
		const gaps: DocGap[] = [];
		if (description.length === 0) gaps.push("missing-figma-description");
		docs.push({
			name: match.codeName,
			code: resolveCode(match.importPath, richCode),
			figma: { nodeId: match.nodeId, description },
			gaps,
		});
	}

	// Code-only: the codebase has it, Figma does not publish a match.
	for (const entry of unmatchedCode) {
		const richCode = codeByName.get(entry.name);
		docs.push({
			name: entry.name,
			code: resolveCode(entry.importPath, richCode),
			gaps: ["unmatched-in-figma"],
		});
	}

	// Figma-only: Figma publishes it, the codebase has no matching component.
	for (const entry of unmatchedFigma) {
		const richFigma = figmaById.get(entry.nodeId);
		const description = richFigma?.description ?? "";
		const gaps: DocGap[] = ["unmatched-in-code"];
		if (description.length === 0) gaps.push("missing-figma-description");
		docs.push({
			name: entry.name,
			// No code side: surface the figma variant axes so the doc is not empty.
			code: resolveCode("", undefined, richFigma?.variantProps),
			figma: { nodeId: entry.nodeId, description },
			gaps,
		});
	}

	docs.sort((a, b) => byNameAsc(a.name, b.name));
	return docs;
}
