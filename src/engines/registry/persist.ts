// T5.4 — registry persistence model. PURE: no fs/network/process; deterministic;
// NEVER throws. It is the bridge between the matcher's rich ComponentMatchResult
// and the flat, on-disk registry.json the CLI writes and later reads back.
//
// Two responsibilities:
//   - toRegistryFile: project the match buckets into a stable, version-stamped
//     RegistryFile with every score rounded to 3 decimal places. Stable sort
//     (by name ascending) so two builds of identical inputs serialize to
//     byte-identical JSON modulo the io-edge `generatedAt` timestamp.
//   - resolveEntry: given a saved registry and a node name OR id, answer with a
//     confident match, the ranked candidates from an unmatched-figma entry, or
//     not-found. Lookup is by exact nodeId, exact figmaName, or normalized name
//     (strip non-alphanumeric + lowercase) — matches always win over candidates.
import type { ComponentMatchResult } from "./match.js";

// ── On-disk shape ──

/** One persisted, confident code↔figma pairing. */
export interface RegistryMatch {
	codeName: string;
	importPath: string;
	figmaName: string;
	nodeId: string;
	score: number;
	/** The Figma component's description; omitted when it has none. */
	description?: string;
	/** Variant axes that differ between code and Figma; omitted when none. */
	variantGaps?: string[];
}

/** A persisted code component with no confident match + its figma candidates. */
export interface RegistryUnmatchedCode {
	name: string;
	importPath: string;
	candidates: { figmaName: string; nodeId: string; score: number }[];
}

/** A persisted figma component with no confident match + its code candidates. */
export interface RegistryUnmatchedFigma {
	name: string;
	nodeId: string;
	/** The Figma component's description; omitted when it has none. */
	description?: string;
	candidates: { codeName: string; score: number }[];
}

/** The committed `.ds-bridge/registry.json` document. */
export interface RegistryFile {
	schemaVersion: 1;
	generatedAt: string;
	matches: RegistryMatch[];
	unmatchedCode: RegistryUnmatchedCode[];
	unmatchedFigma: RegistryUnmatchedFigma[];
}

// ── Helpers ──

/** Round to 3 decimal places (half-up), dropping the binary-float fuzz. */
function round3(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.round(value * 1000) / 1000;
}

/** Strip every non-alphanumeric and lowercase: the normalized identity key. */
function normalizeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** `{ description }` when non-empty, else nothing — keeps old registries byte-stable. */
function describedBy(description: string): { description?: string } {
	return description.length > 0 ? { description } : {};
}

function byNameAsc(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

// ── Projection ──

/**
 * Project a ComponentMatchResult into the flat, version-stamped RegistryFile.
 * `generatedAt` is supplied by the caller (read from the system clock at the io
 * edge — never inside this pure module). Scores are rounded to 3dp and every
 * array is sorted by name ascending for byte-stable output.
 */
export function toRegistryFile(
	result: ComponentMatchResult,
	generatedAt: string,
): RegistryFile {
	const matches: RegistryMatch[] = result.matches
		.map((m) => ({
			codeName: m.code.name,
			importPath: m.code.importPath,
			figmaName: m.figma.name,
			nodeId: m.figma.nodeId,
			score: round3(m.score),
			...describedBy(m.figma.description),
			...(m.variantGaps !== undefined && m.variantGaps.length > 0
				? { variantGaps: m.variantGaps }
				: {}),
		}))
		.sort((a, b) => byNameAsc(a.codeName, b.codeName));

	const unmatchedCode: RegistryUnmatchedCode[] = result.unmatchedCode
		.map((u) => ({
			name: u.code.name,
			importPath: u.code.importPath,
			candidates: u.candidates.map((c) => ({
				figmaName: c.figma.name,
				nodeId: c.figma.nodeId,
				score: round3(c.score),
			})),
		}))
		.sort((a, b) => byNameAsc(a.name, b.name));

	const unmatchedFigma: RegistryUnmatchedFigma[] = result.unmatchedFigma
		.map((u) => ({
			name: u.figma.name,
			nodeId: u.figma.nodeId,
			...describedBy(u.figma.description),
			candidates: u.candidates.map((c) => ({
				codeName: c.code.name,
				score: round3(c.score),
			})),
		}))
		.sort((a, b) => byNameAsc(a.name, b.name));

	return {
		schemaVersion: 1,
		generatedAt,
		matches,
		unmatchedCode,
		unmatchedFigma,
	};
}

// ── Resolution ──

export type ResolveOutcome =
	| { kind: "match"; entry: RegistryMatch }
	| { kind: "candidates"; entries: { codeName: string; score: number }[] }
	| { kind: "not-found" };

/**
 * Resolve a Figma node id OR (exact / normalized) name against a saved registry.
 *
 * A confident match always wins: it is checked first by exact nodeId, then exact
 * figmaName, then normalized name. Failing that, the same lookup is tried against
 * the unmatched-figma bucket, returning its ranked candidates. Anything else is
 * not-found. Never throws — odd queries (empty/whitespace) simply miss.
 */
export function resolveEntry(
	registry: RegistryFile,
	nodeNameOrId: string,
): ResolveOutcome {
	const query = nodeNameOrId;
	const normalizedQuery = normalizeName(query);

	for (const entry of registry.matches) {
		if (entry.nodeId === query) return { kind: "match", entry };
	}
	for (const entry of registry.matches) {
		if (entry.figmaName === query) return { kind: "match", entry };
	}
	if (normalizedQuery.length > 0) {
		for (const entry of registry.matches) {
			if (normalizeName(entry.figmaName) === normalizedQuery) {
				return { kind: "match", entry };
			}
		}
	}

	for (const entry of registry.unmatchedFigma) {
		if (entry.nodeId === query) {
			return { kind: "candidates", entries: entry.candidates };
		}
	}
	for (const entry of registry.unmatchedFigma) {
		if (entry.name === query) {
			return { kind: "candidates", entries: entry.candidates };
		}
	}
	if (normalizedQuery.length > 0) {
		for (const entry of registry.unmatchedFigma) {
			if (normalizeName(entry.name) === normalizedQuery) {
				return { kind: "candidates", entries: entry.candidates };
			}
		}
	}

	return { kind: "not-found" };
}
