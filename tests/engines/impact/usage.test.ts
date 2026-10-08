// T7.8 — usage mapper (blast-radius) test. TDD: the contract first.
//
// mapUsage({ registry, changedFigmaNames, projectDir }) answers: for each changed
// Figma component name, which code component does the registry map it to, and
// where in the project is that code component imported? It returns one entry per
// requested Figma name, in the input order de-duplicated, each carrying:
//   { figmaName, codeName?, importPath?, resolution, usages: [{file, line, importName}], count }
// where `resolution` is "matched" | "unmatched" | "not-in-registry".
//
// Usage sites are discovered by ts-morph: an import declaration in any project
// .tsx whose module resolves to the matched component's file, capturing the
// imported identifier (importName) and the 1-based line. Paths are relative to
// projectDir with forward slashes. Ordering is deterministic (file asc, line asc).
//
// Acceptance data: tests/fixtures/sample-project (components/** + the additive
// app/** importers added by this task). Impure edge (reads .tsx), never throws.
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	type ComponentUsage,
	mapCodeUsage,
	mapUsage,
} from "../../../src/engines/impact/usage.js";
import type {
	RegistryFile,
	RegistryMatch,
} from "../../../src/engines/registry/persist.js";

// ts-morph's first project load is slow under coverage + parallel load.
vi.setConfig({ testTimeout: 60_000 });

const projectDir = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"sample-project",
);

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

function registry(matches: RegistryMatch[]): RegistryFile {
	return {
		schemaVersion: 1,
		generatedAt: "2026-06-06T00:00:00.000Z",
		matches,
		unmatchedCode: [],
		unmatchedFigma: [],
	};
}

function find(
	usages: ComponentUsage[],
	figmaName: string,
): ComponentUsage | undefined {
	return usages.find((u) => u.figmaName === figmaName);
}

describe("mapUsage (T7.8)", () => {
	it("maps a changed Figma name to its code component's import sites", () => {
		const reg = registry([match({})]);
		const result = mapUsage({
			registry: reg,
			changedFigmaNames: ["Button / Primary"],
			projectDir,
		});
		expect(result).toHaveLength(1);
		const button = find(result, "Button / Primary");
		expect(button?.resolution).toBe("matched");
		expect(button?.codeName).toBe("Button");
		expect(button?.importPath).toBe("components/button.tsx");
		// Button is imported in app/PrimaryCta.tsx and app/Dashboard.tsx.
		const files = button?.usages.map((u) => u.file) ?? [];
		expect(files).toContain("app/PrimaryCta.tsx");
		expect(files).toContain("app/Dashboard.tsx");
	});

	it("counts each import declaration once and records importName + line", () => {
		const reg = registry([match({})]);
		const button = find(
			mapUsage({
				registry: reg,
				changedFigmaNames: ["Button / Primary"],
				projectDir,
			}),
			"Button / Primary",
		);
		// Two importing files => two usage sites (one import decl per file).
		expect(button?.count).toBe(2);
		expect(button?.usages.length).toBe(2);
		for (const usage of button?.usages ?? []) {
			expect(usage.importName).toBe("Button");
			expect(usage.line).toBeGreaterThan(0);
			expect(Number.isInteger(usage.line)).toBe(true);
		}
	});

	it("returns usages ordered by file asc, then line asc (deterministic)", () => {
		const reg = registry([match({})]);
		const button = find(
			mapUsage({
				registry: reg,
				changedFigmaNames: ["Button / Primary"],
				projectDir,
			}),
			"Button / Primary",
		);
		const files = button?.usages.map((u) => u.file) ?? [];
		const sorted = [...files].sort();
		expect(files).toEqual(sorted);
		// Dashboard sorts before PrimaryCta.
		expect(files).toEqual(["app/Dashboard.tsx", "app/PrimaryCta.tsx"]);
	});

	it("resolves a different changed component (Card) to its own sites", () => {
		const reg = registry([
			match({}),
			match({
				codeName: "Card",
				importPath: "components/card.tsx",
				figmaName: "Card / Default",
				nodeId: "10:90",
			}),
		]);
		const card = find(
			mapUsage({
				registry: reg,
				changedFigmaNames: ["Card / Default"],
				projectDir,
			}),
			"Card / Default",
		);
		expect(card?.resolution).toBe("matched");
		expect(card?.codeName).toBe("Card");
		// Card is only used in app/Dashboard.tsx.
		expect(card?.usages.map((u) => u.file)).toEqual(["app/Dashboard.tsx"]);
		expect(card?.count).toBe(1);
	});

	it("reports zero usages for a matched component nobody imports", () => {
		const reg = registry([
			match({
				codeName: "IconButton",
				importPath: "components/icon-button.tsx",
				figmaName: "Icon Button",
				nodeId: "10:99",
			}),
		]);
		const entry = find(
			mapUsage({
				registry: reg,
				changedFigmaNames: ["Icon Button"],
				projectDir,
			}),
			"Icon Button",
		);
		expect(entry?.resolution).toBe("matched");
		expect(entry?.usages).toEqual([]);
		expect(entry?.count).toBe(0);
	});

	it("flags a changed name absent from the registry as not-in-registry", () => {
		const reg = registry([match({})]);
		const entry = find(
			mapUsage({
				registry: reg,
				changedFigmaNames: ["Ghost / Unknown"],
				projectDir,
			}),
			"Ghost / Unknown",
		);
		expect(entry?.resolution).toBe("not-in-registry");
		expect(entry?.codeName).toBeUndefined();
		expect(entry?.usages).toEqual([]);
		expect(entry?.count).toBe(0);
	});

	it("flags an unmatched-figma changed name as unmatched (no code to scan)", () => {
		const reg: RegistryFile = {
			schemaVersion: 1,
			generatedAt: "2026-06-06T00:00:00.000Z",
			matches: [],
			unmatchedCode: [],
			unmatchedFigma: [{ name: "Toolbar", nodeId: "10:50", candidates: [] }],
		};
		const entry = find(
			mapUsage({
				registry: reg,
				changedFigmaNames: ["Toolbar"],
				projectDir,
			}),
			"Toolbar",
		);
		expect(entry?.resolution).toBe("unmatched");
		expect(entry?.usages).toEqual([]);
		expect(entry?.count).toBe(0);
	});

	it("dedups repeated changed names and preserves first-seen order", () => {
		const reg = registry([
			match({}),
			match({
				codeName: "Card",
				importPath: "components/card.tsx",
				figmaName: "Card / Default",
				nodeId: "10:90",
			}),
		]);
		const result = mapUsage({
			registry: reg,
			changedFigmaNames: [
				"Card / Default",
				"Button / Primary",
				"Card / Default",
			],
			projectDir,
		});
		expect(result.map((u) => u.figmaName)).toEqual([
			"Card / Default",
			"Button / Primary",
		]);
	});

	it("never throws on a missing project dir (empty usages)", () => {
		const reg = registry([match({})]);
		const result = mapUsage({
			registry: reg,
			changedFigmaNames: ["Button / Primary"],
			projectDir: join(projectDir, "does-not-exist-xyz"),
		});
		expect(result[0]?.resolution).toBe("matched");
		expect(result[0]?.usages).toEqual([]);
		expect(result[0]?.count).toBe(0);
	});
});

describe("mapUsage — tsconfig path aliases", () => {
	const aliasProject = join(
		import.meta.dirname,
		"..",
		"..",
		"fixtures",
		"alias-project",
	);

	it("resolves `@/…` imports through paths declared in a referenced tsconfig", () => {
		const [usage] = mapUsage({
			registry: registry([
				match({
					codeName: "Button",
					importPath: "src/components/ui/button.tsx",
					figmaName: "Button",
				}),
			]),
			changedFigmaNames: ["Button"],
			projectDir: aliasProject,
		});
		expect(usage?.resolution).toBe("matched");
		expect(usage?.usages).toEqual([
			{ file: "src/pages/Home.tsx", line: 1, importName: "Button" },
		]);
	});
});

// Real-user finding (Material 3 testbed): a design system is usually imported
// through a barrel (`components/m3/index.ts` re-exporting every component), so
// the import path never equals the component's own file. Follow the barrel.
describe("mapUsage — barrel re-exports", () => {
	const m3Dir = join(import.meta.dirname, "..", "..", "fixtures", "m3-project");

	it("counts an import through `export *` and a named re-export", () => {
		const result = mapUsage({
			registry: registry([
				match({
					codeName: "Button",
					importPath: "src/components/m3/Button.tsx",
					figmaName: "Button",
				}),
				match({
					codeName: "Chip",
					importPath: "src/components/m3/Chip.tsx",
					figmaName: "Chip",
				}),
			]),
			changedFigmaNames: ["Button", "Chip"],
			projectDir: m3Dir,
		});
		expect(result.map((r) => [r.codeName, r.usages])).toEqual([
			[
				"Button",
				[{ file: "src/screens/Home.tsx", line: 1, importName: "Button" }],
			],
			["Chip", [{ file: "src/screens/Home.tsx", line: 1, importName: "Chip" }]],
		]);
	});
});

// Import coverage's denominator is every code component in the registry, so
// its numerator must scan every one too — not only the Figma-matched ones.
describe("mapCodeUsage — every registry code component", () => {
	const m3Dir = join(import.meta.dirname, "..", "..", "fixtures", "m3-project");

	it("scans matched and unmatched code components alike", () => {
		const result = mapCodeUsage({
			registry: {
				...registry([
					match({
						codeName: "Button",
						importPath: "src/components/m3/Button.tsx",
						figmaName: "Button",
					}),
				]),
				unmatchedCode: [
					{
						name: "Chip",
						importPath: "src/components/m3/Chip.tsx",
						candidates: [],
					},
					{ name: "Home", importPath: "src/screens/Home.tsx", candidates: [] },
				],
			},
			projectDir: m3Dir,
		});
		expect(result.map((r) => [r.codeName, r.count])).toEqual([
			["Button", 1],
			["Chip", 1],
			["Home", 0],
		]);
	});
});

describe("mapCodeUsage — documentation files are not adoption", () => {
	it("leaves Storybook stories and Code Connect files out of import coverage", async () => {
		const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join: j } = await import("node:path");
		const dir = mkdtempSync(j(tmpdir(), "usage-docs-"));
		mkdirSync(j(dir, "src", "ui"), { recursive: true });
		writeFileSync(
			j(dir, "src", "ui", "Tooltip.tsx"),
			"export function Tooltip() { return null; }",
		);
		writeFileSync(
			j(dir, "src", "Tooltip.stories.tsx"),
			'import { Tooltip } from "./ui/Tooltip";\nexport const A = () => <Tooltip />;',
		);
		writeFileSync(
			j(dir, "src", "Tooltip.figma.tsx"),
			'import { Tooltip } from "./ui/Tooltip";\nexport const B = Tooltip;',
		);
		const [usage] = mapCodeUsage({
			registry: {
				schemaVersion: 1,
				generatedAt: "2026-10-08T00:00:00.000Z",
				matches: [],
				unmatchedCode: [
					{ name: "Tooltip", importPath: "src/ui/Tooltip.tsx", candidates: [] },
				],
				unmatchedFigma: [],
			},
			projectDir: dir,
		});
		expect(usage?.count).toBe(0);
	});
});
