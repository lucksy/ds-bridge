// M0.1 — Artifact catalog. Pure: the frozen ArtifactId contract for the
// dashboard composer (SPEC-measure §3), one entry per optional ReportData
// section, plus a typed nearest-match lookup. No I/O, no throws — unknown ids
// surface as a typed outcome carrying suggestions.
import type { ReportData } from "./types.js";

/**
 * The artifact ids (kebab-case — the user-facing contract). `system-score`
 * leads (wave-2, S2); the six wave-1 ids follow in dashboard order.
 */
export type ArtifactId =
	| "system-score"
	| "drift-trend"
	| "lint-summary"
	| "readiness"
	| "parity"
	| "a11y"
	| "impact"
	| "adoption-trend"
	| "import-coverage"
	| "leaderboard"
	| "library-health"
	| "breaking-calendar"
	| "change-frequency"
	// Persona-wave metric artifacts (C1–C13):
	| "targets"
	| "parity-trend"
	| "component-health"
	| "library-health-trend"
	| "migration-checklist"
	| "score-velocity"
	| "ownership-leaderboard"
	| "audience-changelog"
	| "frame-implementability"
	| "release-readiness"
	| "data-freshness"
	// Executive layer (AN5, SPEC-exec-report §2):
	| "consistency"
	| "design-debt"
	| "executive"
	// Figma + per-frame trends (F5, SPEC-figma-trends §3):
	| "library-hotspots-trend"
	| "frame-readiness-trend"
	| "handoff-pass-rate";

/**
 * Persona tags used by presets and `dashboard list` — the six clean roles
 * across the DS-producer ⇄ product-consumer bridge. `Persona == PresetName`
 * (the preset names are widened to match in presets.ts, M6). Advisory display
 * metadata only — `resolveView` does NOT consult these tags.
 */
export type Persona =
	| "ds-designer"
	| "ds-manager"
	| "ds-engineer"
	| "product-designer"
	| "product-manager"
	| "product-engineer";

/** The optional section keys of ReportData (everything but the header pair). */
export type ReportSectionKey = Exclude<
	keyof ReportData,
	"generatedAt" | "project"
>;

/** One catalog entry: the id↔ReportData bridge plus display metadata. */
export interface ArtifactMeta {
	id: ArtifactId;
	/** Human title, as rendered in the dashboard section header. */
	title: string;
	personas: readonly Persona[];
	/** The ReportData key this artifact renders (camelCase side of the bridge). */
	reportDataKey: ReportSectionKey;
}

/**
 * The catalog, in dashboard render order. `satisfies` gives the compile-time
 * half of the completeness check (every id present, every key a real optional
 * section); `AssertEverySectionRendered` below closes the other direction
 * (no ReportData section without an artifact). The runtime half lives in the
 * spec.
 */
const ALL_PERSONAS = [
	"ds-designer",
	"ds-manager",
	"ds-engineer",
	"product-designer",
	"product-manager",
	"product-engineer",
] as const satisfies readonly Persona[];

export const CATALOG = [
	{
		id: "system-score",
		title: "System score",
		personas: ALL_PERSONAS,
		reportDataKey: "systemScore",
	},
	{
		id: "drift-trend",
		title: "Token drift",
		personas: ["ds-manager", "ds-engineer"],
		reportDataKey: "driftTrend",
	},
	{
		id: "lint-summary",
		title: "Lint violations",
		personas: ["ds-engineer", "product-engineer"],
		reportDataKey: "lintSummary",
	},
	{
		id: "readiness",
		title: "Handoff readiness",
		personas: ["ds-designer", "product-designer", "product-manager"],
		reportDataKey: "readiness",
	},
	{
		id: "parity",
		title: "Component parity",
		personas: ALL_PERSONAS,
		reportDataKey: "parity",
	},
	{
		id: "a11y",
		title: "Contrast (a11y)",
		personas: ["ds-designer", "ds-manager", "ds-engineer", "product-designer"],
		reportDataKey: "a11y",
	},
	{
		id: "impact",
		title: "Change impact",
		personas: ["ds-engineer", "product-engineer"],
		reportDataKey: "impact",
	},
	{
		id: "adoption-trend",
		title: "Adoption trend",
		personas: ["ds-manager", "product-manager", "product-engineer"],
		reportDataKey: "adoptionTrend",
	},
	{
		id: "import-coverage",
		title: "Import coverage",
		personas: ["ds-manager", "product-manager", "product-engineer"],
		reportDataKey: "importCoverage",
	},
	{
		id: "leaderboard",
		title: "Adoption leaderboard",
		personas: ["ds-manager", "product-engineer"],
		reportDataKey: "leaderboard",
	},
	{
		id: "library-health",
		title: "Library health",
		personas: ["ds-designer", "ds-manager", "ds-engineer", "product-designer"],
		reportDataKey: "libraryHealth",
	},
	{
		id: "breaking-calendar",
		title: "Breaking calendar",
		personas: [
			"ds-manager",
			"product-designer",
			"product-manager",
			"product-engineer",
		],
		reportDataKey: "breakingCalendar",
	},
	{
		id: "change-frequency",
		title: "Change frequency",
		personas: ["product-designer", "product-manager"],
		reportDataKey: "changeFrequency",
	},
	// ─── Persona-wave metric artifacts (C1–C13) ─────────────────────────────
	{
		id: "targets",
		title: "Targets / SLAs",
		personas: [
			"ds-manager",
			"ds-engineer",
			"product-manager",
			"product-engineer",
		],
		reportDataKey: "targets",
	},
	{
		id: "parity-trend",
		title: "Parity trend",
		personas: ALL_PERSONAS,
		reportDataKey: "parityTrend",
	},
	{
		id: "component-health",
		title: "Component health",
		personas: ["ds-designer", "ds-engineer", "product-designer"],
		reportDataKey: "componentHealth",
	},
	{
		id: "library-health-trend",
		title: "Library health trend",
		personas: ["ds-designer", "ds-manager"],
		reportDataKey: "libraryHealthTrend",
	},
	{
		id: "migration-checklist",
		title: "Migration checklist",
		personas: ["ds-engineer", "product-engineer"],
		reportDataKey: "migrationChecklist",
	},
	{
		id: "score-velocity",
		title: "Score velocity",
		personas: ["ds-manager", "product-manager"],
		reportDataKey: "scoreVelocity",
	},
	{
		id: "ownership-leaderboard",
		title: "Ownership leaderboard",
		personas: ["ds-manager"],
		reportDataKey: "ownershipLeaderboard",
	},
	{
		id: "audience-changelog",
		title: "Changelog by audience",
		personas: ["product-designer", "product-manager", "product-engineer"],
		reportDataKey: "audienceChangelog",
	},
	{
		id: "frame-implementability",
		title: "Frame implementability",
		personas: ["product-designer", "product-engineer"],
		reportDataKey: "frameImplementability",
	},
	{
		id: "release-readiness",
		title: "Release readiness",
		personas: ["ds-engineer"],
		reportDataKey: "releaseReadiness",
	},
	{
		id: "data-freshness",
		title: "Data freshness",
		personas: ALL_PERSONAS,
		reportDataKey: "dataFreshness",
	},
	// ─── Executive layer (AN5) — appended so `everything` keeps catalog order ──
	{
		id: "consistency",
		title: "Consistency",
		personas: ["ds-designer", "ds-manager", "ds-engineer", "product-manager"],
		reportDataKey: "consistency",
	},
	{
		id: "design-debt",
		title: "Design debt",
		personas: ["ds-designer", "ds-manager", "ds-engineer"],
		reportDataKey: "debt",
	},
	{
		id: "executive",
		title: "Executive summary",
		personas: ["ds-manager", "product-manager"],
		reportDataKey: "executive",
	},
	// ─── Figma + per-frame trends (F5) — appended (everything keeps catalog order) ──
	{
		id: "library-hotspots-trend",
		title: "Library hotspots trend",
		personas: ["ds-designer", "ds-manager"],
		reportDataKey: "libraryHotspotsTrend",
	},
	{
		id: "frame-readiness-trend",
		title: "Frame readiness trend",
		personas: ["ds-designer", "product-designer", "product-manager"],
		reportDataKey: "frameReadinessTrend",
	},
	{
		id: "handoff-pass-rate",
		title: "Handoff pass rate",
		personas: [
			"ds-designer",
			"ds-manager",
			"product-designer",
			"product-manager",
		],
		reportDataKey: "handoffPassRate",
	},
] as const satisfies readonly ArtifactMeta[];

/** Compile-time: every optional ReportData section has a catalog entry. */
type RenderedKeys = (typeof CATALOG)[number]["reportDataKey"];
type AssertEverySectionRendered =
	Exclude<ReportSectionKey, RenderedKeys> extends never ? true : never;
const _everySectionRendered: AssertEverySectionRendered = true;
void _everySectionRendered;

/** Every artifact id, in catalog (dashboard) order. */
export const ALL_ARTIFACT_IDS: readonly ArtifactId[] = CATALOG.map((a) => a.id);

/** Result of resolving a user-supplied artifact id. */
export type LookupOutcome =
	| { kind: "found"; artifact: ArtifactMeta }
	| { kind: "unknown"; id: string; suggestions: ArtifactId[] };

/** Levenshtein edit distance — tiny and sufficient for the fixed artifact-id set. */
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
 * Nearest catalog ids for a user-supplied string: prefix matches rank first,
 * then ascending edit distance (catalog order breaks ties). Case-insensitive.
 * Nothing within distance 4 → no suggestions (better silent than misleading).
 */
export function suggestArtifactIds(input: string, limit = 3): ArtifactId[] {
	const needle = input.toLowerCase();
	const MAX_DISTANCE = 4;
	return ALL_ARTIFACT_IDS.map((id, index) => ({
		id,
		index,
		prefix: id.startsWith(needle),
		distance: editDistance(needle, id),
	}))
		.filter((c) => c.prefix || c.distance <= MAX_DISTANCE)
		.sort(
			(a, b) =>
				Number(b.prefix) - Number(a.prefix) ||
				a.distance - b.distance ||
				a.index - b.index,
		)
		.slice(0, limit)
		.map((c) => c.id);
}

/** Resolve an id to its catalog entry, or a typed unknown outcome. */
export function lookupArtifact(id: string): LookupOutcome {
	const artifact = CATALOG.find((a) => a.id === id);
	if (artifact !== undefined) {
		return { kind: "found", artifact };
	}
	return { kind: "unknown", id, suggestions: suggestArtifactIds(id) };
}
