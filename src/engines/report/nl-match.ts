// M9.2 — deterministic natural-language → artifact matching for the
// conversational dashboard builder (SPEC-personas §7, Mode 3). PURE: a free-text
// phrase in → ranked catalog matches out. No I/O, no LLM, never throws. The
// vocabulary is exactly the catalog — the model (or `dashboard suggest`) maps a
// phrase to ids here, and the `dashboard save` CLI re-validates every id, so a
// hallucinated id can never be persisted.
//
// Scoring: each ≥3-char phrase token that appears (substring) in an artifact's
// `<id> <title>` scores 2; a token that instead fuzzy-matches the id (via the
// shared `suggestArtifactIds` edit-distance) scores 1 (typo recovery). Artifacts
// with a positive score are returned, strongest first, catalog order breaking
// ties (a stable sort over the catalog-ordered scan).
import { type ArtifactId, CATALOG, suggestArtifactIds } from "./catalog.js";

/** One NL match: the artifact, its title, and its relevance score (higher = better). */
export interface NlMatch {
	id: ArtifactId;
	title: string;
	score: number;
}

/** Lowercase alphanumeric tokens of length ≥ 3 (drops "to"/"of"/punctuation noise). */
function tokenize(phrase: string): string[] {
	return (phrase.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
		(t) => t.length >= 3,
	);
}

/**
 * Rank the catalog against a free-text phrase. Returns only artifacts with a
 * positive score, strongest first (catalog order on ties). An empty / all-noise
 * phrase → []. Deterministic and side-effect-free.
 */
export function matchPhrase(phrase: string): NlMatch[] {
	const tokens = tokenize(phrase);
	if (tokens.length === 0) return [];

	const matches: NlMatch[] = [];
	for (const meta of CATALOG) {
		const haystack = `${meta.id} ${meta.title}`.toLowerCase();
		let score = 0;
		for (const token of tokens) {
			if (haystack.includes(token)) {
				score += 2;
			} else if (suggestArtifactIds(token, 3).includes(meta.id)) {
				score += 1; // fuzzy id recovery (typo)
			}
		}
		if (score > 0) matches.push({ id: meta.id, title: meta.title, score });
	}
	// Stable sort by score desc keeps the catalog-order scan as the tie-break.
	return matches.sort((a, b) => b.score - a.score);
}
