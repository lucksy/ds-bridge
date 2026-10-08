// A3a — import-coverage engine. PURE: no fs/network/process; deterministic;
// NEVER throws. Given a saved registry and the project's ComponentUsage results
// (from mapUsage), answer: of every CODE component the registry knows, how many
// does the project actually import?
//
// HONEST SCOPE (mirrors the css/scss ratio note in SPEC §1): mapUsage scans
// resolved `.tsx` imports ONLY — `.ts`/`.jsx`/barrel re-exports may undercount,
// so the coverage number is a floor, not an exact census. This caveat must be
// surfaced wherever the number renders.
import { codeExports, componentOf } from "./parts.js";
import type { RegistryFile } from "./persist.js";

/** The import-coverage verdict for a project against its registry. */
export interface CoverageResult {
	/** CODE components with >=1 resolved import site. */
	imported: number;
	/**
	 * Every CODE component in the registry (matched + unmatched-code), with
	 * compound parts folded into their component.
	 */
	total: number;
	/** Not-yet-imported code-component names, alphabetical, capped at 20. */
	uncovered: string[];
	/** Full count of uncovered components, before the cap. */
	uncoveredTotal: number;
	/**
	 * Icon-library components (matched to Figma's icon pages), counted apart:
	 * a few hundred unused icons are not a component adoption gap.
	 */
	icons?: { imported: number; total: number };
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
	usage: readonly { codeName?: string; count: number }[],
): CoverageResult {
	// Code names that the project imports (>=1 resolved .tsx site).
	const importedNames = new Set<string>();
	for (const u of usage) {
		if (u.codeName !== undefined && u.count >= 1) {
			importedNames.add(u.codeName);
		}
	}

	// Every CODE component the registry knows, de-duplicated by name. Compound
	// parts fold into their component (Card + CardHeader + CardTitle is one),
	// which counts as imported when any member is.
	const iconNames = new Set(
		(Array.isArray(registry?.matches) ? registry.matches : [])
			.filter((m) => m.kind === "icon")
			.map((m) => m.codeName),
	);
	const exports = codeExports(registry).filter((e) => !iconNames.has(e.name));
	const members = new Map<string, string[]>();
	for (const entry of exports) {
		const component = componentOf(entry, exports);
		members.set(component, [...(members.get(component) ?? []), entry.name]);
	}

	let imported = 0;
	const uncovered: string[] = [];
	for (const [component, names] of members) {
		if (names.some((name) => importedNames.has(name))) imported += 1;
		else uncovered.push(component);
	}
	uncovered.sort(byNameAsc);

	return {
		imported,
		total: members.size,
		uncovered: uncovered.slice(0, UNCOVERED_CAP),
		uncoveredTotal: uncovered.length,
		...(iconNames.size > 0
			? {
					icons: {
						imported: [...iconNames].filter((n) => importedNames.has(n)).length,
						total: iconNames.size,
					},
				}
			: {}),
	};
}
