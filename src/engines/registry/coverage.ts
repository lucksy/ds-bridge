// A3a — import-coverage engine. PURE: no fs/network/process; deterministic;
// NEVER throws. Given a saved registry and the project's ComponentUsage results
// (from mapUsage), answer: of every CODE component the registry knows, how many
// does the project actually import?
//
// HONEST SCOPE (mirrors the css/scss ratio note in SPEC §1): mapUsage scans
// resolved `.tsx` imports ONLY — `.ts`/`.jsx`/barrel re-exports may undercount,
// so the coverage number is a floor, not an exact census. This caveat must be
// surfaced wherever the number renders.
import type { ComponentUsage } from "../impact/usage.js";
import type { RegistryFile } from "./persist.js";

/** The import-coverage verdict for a project against its registry. */
export interface CoverageResult {
	/** CODE components with >=1 resolved import site. */
	imported: number;
	/** Every CODE component in the registry (matched + unmatched-code). */
	total: number;
	/** Not-yet-imported code-component names, alphabetical, capped at 20. */
	uncovered: string[];
	/** Full count of uncovered components, before the cap. */
	uncoveredTotal: number;
}

/** Cap on the rendered uncovered list (the full count lives in uncoveredTotal). */
const UNCOVERED_CAP = 20;

function byNameAsc(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compute import coverage: registry CODE component names (every matched
 * `codeName` plus every unmatched-code `name`) crossed with the ComponentUsage
 * results. A code component counts as IMPORTED when a usage carrying its code
 * name has at least one site (count >= 1). The join is on the code name, so a
 * usage's figmaName is irrelevant here. Uncovered names are sorted alphabetically
 * and capped at 20; uncoveredTotal carries the full count.
 */
export function computeCoverage(
	registry: RegistryFile,
	usage: readonly ComponentUsage[],
): CoverageResult {
	// Code names that the project imports (>=1 resolved .tsx site).
	const importedNames = new Set<string>();
	for (const u of usage) {
		if (u.codeName !== undefined && u.count >= 1) {
			importedNames.add(u.codeName);
		}
	}

	// Every CODE component the registry knows, de-duplicated by name.
	const codeNames = new Set<string>();
	for (const m of registry.matches) codeNames.add(m.codeName);
	for (const u of registry.unmatchedCode) codeNames.add(u.name);

	let imported = 0;
	const uncovered: string[] = [];
	for (const name of codeNames) {
		if (importedNames.has(name)) imported += 1;
		else uncovered.push(name);
	}
	uncovered.sort(byNameAsc);

	return {
		imported,
		total: codeNames.size,
		uncovered: uncovered.slice(0, UNCOVERED_CAP),
		uncoveredTotal: uncovered.length,
	};
}
