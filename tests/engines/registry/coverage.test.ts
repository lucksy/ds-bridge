// A3a — import-coverage engine test. TDD: the contract first.
//
// computeCoverage(registry, usage) answers: of every CODE component the registry
// knows (matched `codeName`s + unmatchedCode `name`s), how many does the project
// actually import? A component counts as IMPORTED when a ComponentUsage carrying
// its code name has at least one usage site (count >= 1). The result is:
//   { imported, total, uncovered: string[] (alphabetical, CAP 20), uncoveredTotal }
// where `uncovered` lists the not-yet-imported code-component names (capped at 20)
// and `uncoveredTotal` is the full count before the cap.
//
// PURE: no fs/network/process; deterministic; never throws. Mirrors persist.ts.
import { describe, expect, it } from "vitest";
import type { ComponentUsage } from "../../../src/engines/impact/usage.js";
import { computeCoverage } from "../../../src/engines/registry/coverage.js";
import type {
	RegistryFile,
	RegistryMatch,
	RegistryUnmatchedCode,
} from "../../../src/engines/registry/persist.js";

// ── Tiny builders ──

function match(partial: Partial<RegistryMatch>): RegistryMatch {
	return {
		codeName: "Button",
		importPath: "components/button.tsx",
		figmaName: "Button / Primary",
		nodeId: "10:42",
		score: 0.95,
		...partial,
	};
}

function unmatchedCode(name: string): RegistryUnmatchedCode {
	return {
		name,
		importPath: `components/${name.toLowerCase()}.tsx`,
		candidates: [],
	};
}

function registry(
	matches: RegistryMatch[],
	unmatched: RegistryUnmatchedCode[] = [],
): RegistryFile {
	return {
		schemaVersion: 1,
		generatedAt: "2026-06-07T00:00:00.000Z",
		matches,
		unmatchedCode: unmatched,
		unmatchedFigma: [],
	};
}

function usage(partial: Partial<ComponentUsage>): ComponentUsage {
	return {
		figmaName: "Button / Primary",
		codeName: "Button",
		importPath: "components/button.tsx",
		resolution: "matched",
		usages: [],
		count: 0,
		...partial,
	};
}

function siteFor(codeName: string, count: number): ComponentUsage {
	const usages = Array.from({ length: count }, (_, i) => ({
		file: `app/File${i}.tsx`,
		line: i + 1,
		importName: codeName,
	}));
	return usage({
		figmaName: codeName,
		codeName,
		resolution: "matched",
		usages,
		count,
	});
}

describe("computeCoverage (A3a)", () => {
	it("counts a matched code component as imported when it has >=1 usage site", () => {
		const reg = registry([match({ codeName: "Button" })]);
		const result = computeCoverage(reg, [siteFor("Button", 2)]);
		expect(result.total).toBe(1);
		expect(result.imported).toBe(1);
		expect(result.uncovered).toEqual([]);
		expect(result.uncoveredTotal).toBe(0);
	});

	it("counts a matched code component as NOT imported when it has zero sites", () => {
		const reg = registry([match({ codeName: "Button" })]);
		const result = computeCoverage(reg, [siteFor("Button", 0)]);
		expect(result.total).toBe(1);
		expect(result.imported).toBe(0);
		expect(result.uncovered).toEqual(["Button"]);
		expect(result.uncoveredTotal).toBe(1);
	});

	it("counts a code component with no usage entry at all as uncovered", () => {
		const reg = registry([match({ codeName: "Button" })]);
		const result = computeCoverage(reg, []);
		expect(result.total).toBe(1);
		expect(result.imported).toBe(0);
		expect(result.uncovered).toEqual(["Button"]);
		expect(result.uncoveredTotal).toBe(1);
	});

	it("includes unmatchedCode components in the denominator (they are CODE components)", () => {
		const reg = registry(
			[match({ codeName: "Button" })],
			[unmatchedCode("Spinner"), unmatchedCode("Tooltip")],
		);
		// Only Button is imported; the two unmatched-code components are uncovered.
		const result = computeCoverage(reg, [siteFor("Button", 1)]);
		expect(result.total).toBe(3);
		expect(result.imported).toBe(1);
		expect(result.uncovered).toEqual(["Spinner", "Tooltip"]);
		expect(result.uncoveredTotal).toBe(2);
	});

	it("sorts the uncovered list alphabetically", () => {
		const reg = registry(
			[],
			[unmatchedCode("Zeta"), unmatchedCode("Alpha"), unmatchedCode("Mu")],
		);
		const result = computeCoverage(reg, []);
		expect(result.uncovered).toEqual(["Alpha", "Mu", "Zeta"]);
		expect(result.uncoveredTotal).toBe(3);
		expect(result.imported).toBe(0);
		expect(result.total).toBe(3);
	});

	it("caps the uncovered list at 20 but reports the full uncoveredTotal", () => {
		const unmatched = Array.from({ length: 25 }, (_, i) =>
			// Zero-pad so alphabetical order is the numeric order.
			unmatchedCode(`Comp${String(i).padStart(2, "0")}`),
		);
		const reg = registry([], unmatched);
		const result = computeCoverage(reg, []);
		expect(result.total).toBe(25);
		expect(result.imported).toBe(0);
		expect(result.uncovered).toHaveLength(20);
		expect(result.uncoveredTotal).toBe(25);
		// The cap keeps the alphabetically-first 20.
		expect(result.uncovered[0]).toBe("Comp00");
		expect(result.uncovered[19]).toBe("Comp19");
	});

	it("returns zeros for an empty registry and never throws", () => {
		const reg = registry([], []);
		const result = computeCoverage(reg, []);
		expect(result).toEqual({
			imported: 0,
			total: 0,
			uncovered: [],
			uncoveredTotal: 0,
		});
	});

	it("matches usage to code component by codeName, ignoring figmaName", () => {
		// The usage's figmaName differs from the code name; the join is on codeName.
		const reg = registry([
			match({ codeName: "IconButton", figmaName: "Icon Button / Default" }),
		]);
		const result = computeCoverage(reg, [
			usage({
				figmaName: "Icon Button / Default",
				codeName: "IconButton",
				resolution: "matched",
				usages: [{ file: "app/A.tsx", line: 1, importName: "IconButton" }],
				count: 1,
			}),
		]);
		expect(result.imported).toBe(1);
		expect(result.uncovered).toEqual([]);
	});
});

describe("computeCoverage — compound components", () => {
	const cardFile = "src/components/ui/card.tsx";
	const part = (name: string): RegistryUnmatchedCode => ({
		name,
		importPath: cardFile,
		candidates: [],
	});

	it("counts Card and its parts as ONE component, imported when any member is", () => {
		const reg = registry(
			[match({ codeName: "Card", importPath: cardFile })],
			[part("CardHeader"), part("CardTitle"), unmatchedCode("Dialog")],
		);
		const result = computeCoverage(reg, [siteFor("CardTitle", 2)]);
		expect(result.total).toBe(2); // Card (+parts), Dialog
		expect(result.imported).toBe(1);
		expect(result.uncovered).toEqual(["Dialog"]);
	});
});
