// M6.1 — Persona presets + view resolution. Pure: the seven views — the SIX
// clean persona names (`Persona == PresetName`) plus the default `everything` —
// and `resolveView`, which collapses the flags > project > default-`everything`
// precedence chain into one ordered ArtifactId selection or a typed error. No
// I/O, no throws — every domain outcome (conflict, unknown view, unknown
// artifact) is a discriminated union, and a deduped custom list reports its
// dedup via a notice rather than failing.
//
// Each persona preset is its FULL intended set (SPEC-personas §3.2), derived as
// the single source of truth from the catalog's per-artifact persona tags, in
// catalog render order. So `system-score` (catalog index 0, every persona) leads
// every view automatically, and a preset can never drift from the tags.
import {
	ALL_ARTIFACT_IDS,
	type ArtifactId,
	CATALOG,
	lookupArtifact,
	type Persona,
} from "./catalog.js";

/** The seven view names — the six clean personas plus the default `everything`. */
export type PresetName = Persona | "everything";

/** A persona's full set: the catalog artifacts tagged for it, in catalog order. */
function presetFor(persona: Persona): ArtifactId[] {
	return CATALOG.filter((meta) =>
		(meta.personas as readonly Persona[]).includes(persona),
	).map((meta) => meta.id);
}

/**
 * The preset contents, each an ordered ArtifactId list projected from the catalog
 * persona tags. The six persona keys are listed explicitly (DS producers →
 * product consumers) so the `satisfies Record<PresetName,…>` gate proves every
 * view name has an entry; `everything` mirrors the full catalog order.
 */
export const PRESETS = {
	"ds-designer": presetFor("ds-designer"),
	"ds-manager": presetFor("ds-manager"),
	"ds-engineer": presetFor("ds-engineer"),
	"product-designer": presetFor("product-designer"),
	"product-manager": presetFor("product-manager"),
	"product-engineer": presetFor("product-engineer"),
	everything: [...ALL_ARTIFACT_IDS],
} satisfies Record<PresetName, readonly ArtifactId[]>;

/** Every preset name (the view-resolution lookup surface). */
export const PRESET_NAMES = Object.keys(PRESETS) as readonly PresetName[];

/**
 * One-line lens per preset (SPEC-personas §1 / §2), the single source of truth
 * for the persona wizard's data-driven options (M7): `dashboard list
 * --format=json` projects these so `commands/dashboard.md`'s `AskUserQuestion`
 * never hand-authors prose that could drift from the shipped presets.
 */
export const PRESET_DESCRIPTIONS = {
	"ds-designer":
		"Authors the Figma library; needs it clean, handoff-ready, accessible, and in parity with code.",
	"ds-manager":
		"DesignOps governance: health, adoption, targets, ownership, and release comms across teams.",
	"ds-engineer":
		"Owns tokens↔code and Figma↔code parity; source of breaking changes; pre-publish gatekeeper.",
	"product-designer":
		"Designs product screens by consuming the library; tracks what is safe to build on and when it breaks.",
	"product-manager":
		"Delivery/risk owner; tracks adoption and upstream breakage against targets.",
	"product-engineer":
		"Builds product UI from the DS-code package; works a migration queue of breaking changes.",
	everything:
		"The full 24-artifact catalog — the no-setup escape for an unconfigured repo.",
} satisfies Record<PresetName, string>;

/** Which layer of the precedence chain produced a successful selection. */
export type ResolveSource = "flags" | "project" | "default";

/**
 * One selection source — flags or project config. Decoupled on purpose: the
 * config schema (M1.1) is built in parallel, so this shape is owned here, not
 * imported. `view` and `artifacts` are mutually exclusive within a source.
 */
export interface ViewSelection {
	view?: string;
	artifacts?: readonly string[];
}

/** Resolving a view succeeds with an ordered selection or yields a typed error. */
export type ResolveOutcome =
	| {
			kind: "ok";
			artifacts: ArtifactId[];
			source: ResolveSource;
			viewName?: PresetName;
			notices: string[];
	  }
	| { kind: "conflicting-selection"; source: "flags" | "project" }
	| { kind: "unknown-view"; view: string; suggestions: PresetName[] }
	| { kind: "unknown-artifact"; id: string; suggestions: ArtifactId[] };

/** Levenshtein edit distance — tiny and sufficient for the fixed seven-name set. */
function editDistance(a: string, b: string): number {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const dist: number[] = Array.from({ length: rows * cols }, () => 0);
	for (let i = 0; i < rows; i++) {
		dist[i * cols] = i;
	}
	for (let j = 0; j < cols; j++) {
		dist[j] = j;
	}
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
			dist[i * cols + j] = Math.min(
				(dist[(i - 1) * cols + j] ?? 0) + 1,
				(dist[i * cols + j - 1] ?? 0) + 1,
				(dist[(i - 1) * cols + j - 1] ?? 0) + substitution,
			);
		}
	}
	return dist[rows * cols - 1] ?? 0;
}

/**
 * Nearest preset names for a user-supplied view string: prefix matches rank
 * first, then ascending edit distance (PRESET_NAMES order breaks ties).
 * Case-insensitive; nothing within distance 4 → no suggestions. Scoped to the
 * seven view names — catalog's `suggestArtifactIds` is for artifact ids only.
 */
function suggestViewNames(input: string, limit = 3): PresetName[] {
	const needle = input.toLowerCase();
	const MAX_DISTANCE = 4;
	return PRESET_NAMES.map((name, index) => ({
		name,
		index,
		prefix: name.startsWith(needle),
		distance: editDistance(needle, name),
	}))
		.filter((c) => c.prefix || c.distance <= MAX_DISTANCE)
		.sort(
			(a, b) =>
				Number(b.prefix) - Number(a.prefix) ||
				a.distance - b.distance ||
				a.index - b.index,
		)
		.slice(0, limit)
		.map((c) => c.name);
}

function isPresetName(value: string): value is PresetName {
	return Object.hasOwn(PRESETS, value);
}

/**
 * Resolve a single source's selection into an ordered ArtifactId list, or a
 * typed error. Returns `undefined` when the source selects nothing, signalling
 * the caller to fall through to the next precedence layer.
 */
function resolveSource(
	selection: ViewSelection,
	source: "flags" | "project",
): ResolveOutcome | undefined {
	const view = selection.view;
	const requested =
		selection.artifacts !== undefined && selection.artifacts.length > 0
			? selection.artifacts
			: undefined;

	if (view !== undefined && requested !== undefined) {
		return { kind: "conflicting-selection", source };
	}

	if (view !== undefined) {
		if (!isPresetName(view)) {
			return {
				kind: "unknown-view",
				view,
				suggestions: suggestViewNames(view),
			};
		}
		return {
			kind: "ok",
			artifacts: [...PRESETS[view]],
			source,
			viewName: view,
			notices: [],
		};
	}

	if (requested !== undefined) {
		const seen = new Set<ArtifactId>();
		const ordered: ArtifactId[] = [];
		let duplicates = 0;
		for (const id of requested) {
			const outcome = lookupArtifact(id);
			if (outcome.kind === "unknown") {
				return {
					kind: "unknown-artifact",
					id: outcome.id,
					suggestions: outcome.suggestions,
				};
			}
			const resolved = outcome.artifact.id;
			if (seen.has(resolved)) {
				duplicates += 1;
				continue;
			}
			seen.add(resolved);
			ordered.push(resolved);
		}
		const notices =
			duplicates > 0
				? [
						`Removed ${duplicates} duplicate artifact id${
							duplicates === 1 ? "" : "s"
						} from the selection.`,
					]
				: [];
		// No viewName: a custom artifact list is not a named preset.
		return { kind: "ok", artifacts: ordered, source, notices };
	}

	return undefined;
}

/**
 * Resolve the active artifact selection from CLI flags and project config.
 * Precedence (highest wins): flags → project → default `everything`. Within a
 * single source, `view` + `artifacts` together is a `conflicting-selection`
 * error. Unknown view names and unknown artifact ids surface as typed errors
 * carrying nearest-match suggestions; duplicate ids in a custom list are
 * deduped (first-seen order) and reported via `notices`.
 */
export function resolveView(
	flags: ViewSelection,
	projectConfig: ViewSelection,
): ResolveOutcome {
	const fromFlags = resolveSource(flags, "flags");
	if (fromFlags !== undefined) {
		return fromFlags;
	}
	const fromProject = resolveSource(projectConfig, "project");
	if (fromProject !== undefined) {
		return fromProject;
	}
	return {
		kind: "ok",
		artifacts: [...PRESETS.everything],
		source: "default",
		viewName: "everything",
		notices: [],
	};
}
