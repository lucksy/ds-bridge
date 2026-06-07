// M0.2 — Persona presets + view resolution. Pure: the five frozen wave-1
// views (SPEC-measure §3) and `resolveView`, which collapses the
// flags > project > default-`everything` precedence chain into one ordered
// ArtifactId selection or a typed error. No I/O, no throws — every domain
// outcome (conflict, unknown view, unknown artifact) is a discriminated union,
// and a deduped custom list reports its dedup via a notice rather than failing.
import {
	ALL_ARTIFACT_IDS,
	type ArtifactId,
	lookupArtifact,
} from "./catalog.js";

/** The five view names — four personas plus the default `everything`. */
export type PresetName =
	| "owner"
	| "engineering"
	| "design"
	| "consumer"
	| "everything";

/**
 * The preset contents, each an ordered ArtifactId list. `system-score` leads
 * every view (SPEC-score §3 — the score tops every view); the wave-1 contents
 * follow in their frozen order (ids stay the stable contract). `everything`
 * mirrors the catalog order (system-score already at catalog index 0) so the
 * no-config default stays identical to the catalog.
 */
export const PRESETS = {
	owner: [
		"system-score",
		"adoption-trend",
		"import-coverage",
		"leaderboard",
		"drift-trend",
		"parity",
		"a11y",
	],
	engineering: ["system-score", "lint-summary", "impact", "drift-trend"],
	design: ["system-score", "readiness", "a11y", "parity"],
	consumer: ["system-score", "parity", "impact"],
	everything: [...ALL_ARTIFACT_IDS],
} as const satisfies Record<PresetName, readonly ArtifactId[]>;

/** Every preset name (the view-resolution lookup surface). */
export const PRESET_NAMES = Object.keys(PRESETS) as readonly PresetName[];

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

/** Levenshtein edit distance — tiny and sufficient for the fixed five-name set. */
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
 * five view names — catalog's `suggestArtifactIds` is for artifact ids only.
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
