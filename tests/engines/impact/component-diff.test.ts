// T7.7 — component-diff engine (breaking-change radar core). TDD: this test is
// the contract, written before the implementation.
//
// diffComponents(before, after) takes two component inventories (the
// FigmaComponentModel shape from scan-figma — already merges variant children
// into sets, so each entry has a stable nodeId + variantProps) and returns
//   { added, removed, renamed, changed }
// where each entry carries an `impact` classification.
//
// ── Identity ──
// A component's identity is its nodeId. Same nodeId on both sides => the same
// component (possibly renamed/changed). A nodeId only in `after` is a candidate
// addition; only in `before` is a candidate removal. Among those candidates, a
// RENAME is detected by name similarity: an added+removed pair whose names are
// clearly similar (normalized-token Dice >= RENAME_THRESHOLD) and which is the
// mutual best match is reclassified as a rename rather than add+remove.
//
// ── Classification rules table (the pinned contract) ──
//
//   category | trigger                                  | impact
//   ---------|------------------------------------------|----------
//   removed  | component gone from `after`              | breaking
//   renamed  | same component, name changed (by id, or  | breaking
//            |   similarity-matched add/remove pair)    |
//   changed  | a variant AXIS removed                   | breaking
//   changed  | a variant VALUE removed (axis kept)      | breaking
//   changed  | a variant AXIS or VALUE added only       | additive
//   changed  | description changed only                 | cosmetic
//   added    | new component in `after`                 | additive
//
//   When a single `changed` entry has BOTH breaking and additive variant deltas
//   (e.g. a value removed AND a value added), the most severe wins: breaking.
//   A description change combined with a variant change takes the variant
//   impact (breaking > additive > cosmetic); description-only is cosmetic.
//
// Pure: no fs/network/process; deterministic ordering (by name asc).
import { describe, expect, it } from "vitest";
import {
	type ComponentDiff,
	diffComponents,
} from "../../../src/engines/impact/component-diff.js";
import type { FigmaComponentModel } from "../../../src/engines/registry/scan-figma.js";

function model(
	partial: Partial<FigmaComponentModel> &
		Pick<FigmaComponentModel, "name" | "nodeId">,
): FigmaComponentModel {
	return {
		description: "",
		variantProps: {},
		source: "published",
		...partial,
	};
}

describe("diffComponents (T7.7)", () => {
	it("returns empty buckets for identical inventories", () => {
		const inv = [
			model({ name: "Button", nodeId: "1:1" }),
			model({ name: "Card", nodeId: "1:2" }),
		];
		const diff = diffComponents(inv, inv);
		expect(diff.added).toEqual([]);
		expect(diff.removed).toEqual([]);
		expect(diff.renamed).toEqual([]);
		expect(diff.changed).toEqual([]);
	});

	it("classifies a new component as added/additive", () => {
		const before = [model({ name: "Button", nodeId: "1:1" })];
		const after = [
			model({ name: "Button", nodeId: "1:1" }),
			model({ name: "Card", nodeId: "1:2" }),
		];
		const diff = diffComponents(before, after);
		expect(diff.added).toHaveLength(1);
		expect(diff.added[0]?.name).toBe("Card");
		expect(diff.added[0]?.nodeId).toBe("1:2");
		expect(diff.added[0]?.impact).toBe("additive");
		expect(diff.removed).toEqual([]);
		expect(diff.renamed).toEqual([]);
	});

	it("classifies a vanished component as removed/breaking", () => {
		const before = [
			model({ name: "Button", nodeId: "1:1" }),
			model({ name: "LegacyTabs", nodeId: "1:9" }),
		];
		const after = [model({ name: "Button", nodeId: "1:1" })];
		const diff = diffComponents(before, after);
		expect(diff.removed).toHaveLength(1);
		expect(diff.removed[0]?.name).toBe("LegacyTabs");
		expect(diff.removed[0]?.nodeId).toBe("1:9");
		expect(diff.removed[0]?.impact).toBe("breaking");
		expect(diff.added).toEqual([]);
	});

	it("detects a rename by SAME nodeId, name changed => renamed/breaking", () => {
		const before = [model({ name: "Avatar", nodeId: "10:70" })];
		const after = [model({ name: "Avatar / User", nodeId: "10:70" })];
		const diff = diffComponents(before, after);
		expect(diff.renamed).toHaveLength(1);
		expect(diff.renamed[0]?.nodeId).toBe("10:70");
		expect(diff.renamed[0]?.fromName).toBe("Avatar");
		expect(diff.renamed[0]?.toName).toBe("Avatar / User");
		expect(diff.renamed[0]?.impact).toBe("breaking");
		// A same-id rename is NOT also an add or remove.
		expect(diff.added).toEqual([]);
		expect(diff.removed).toEqual([]);
		expect(diff.changed).toEqual([]);
	});

	it("detects a rename by name similarity across DIFFERENT nodeIds", () => {
		// The id changed but the name is clearly similar — a re-created component.
		const before = [model({ name: "Dropdown Menu", nodeId: "2:1" })];
		const after = [model({ name: "Dropdown / Menu", nodeId: "2:99" })];
		const diff = diffComponents(before, after);
		expect(diff.renamed).toHaveLength(1);
		expect(diff.renamed[0]?.fromName).toBe("Dropdown Menu");
		expect(diff.renamed[0]?.toName).toBe("Dropdown / Menu");
		expect(diff.renamed[0]?.impact).toBe("breaking");
		expect(diff.added).toEqual([]);
		expect(diff.removed).toEqual([]);
	});

	it("does NOT treat unrelated add+remove as a rename", () => {
		const before = [model({ name: "Tooltip", nodeId: "3:1" })];
		const after = [model({ name: "Accordion", nodeId: "3:2" })];
		const diff = diffComponents(before, after);
		expect(diff.renamed).toEqual([]);
		expect(diff.added.map((c) => c.name)).toEqual(["Accordion"]);
		expect(diff.removed.map((c) => c.name)).toEqual(["Tooltip"]);
		expect(diff.added[0]?.impact).toBe("additive");
		expect(diff.removed[0]?.impact).toBe("breaking");
	});

	it("classifies an added variant VALUE as changed/additive", () => {
		const before = [
			model({
				name: "Badge",
				nodeId: "1:4",
				variantProps: { Size: ["md", "sm"] },
			}),
		];
		const after = [
			model({
				name: "Badge",
				nodeId: "1:4",
				variantProps: { Size: ["lg", "md", "sm"] },
			}),
		];
		const diff = diffComponents(before, after);
		expect(diff.changed).toHaveLength(1);
		const change = diff.changed[0];
		expect(change?.nodeId).toBe("1:4");
		expect(change?.impact).toBe("additive");
		expect(change?.variantChanges).toContainEqual({
			axis: "Size",
			kind: "value-added",
			value: "lg",
		});
	});

	it("classifies a removed variant VALUE as changed/breaking", () => {
		const before = [
			model({
				name: "Badge",
				nodeId: "1:4",
				variantProps: { Size: ["lg", "md", "sm"] },
			}),
		];
		const after = [
			model({
				name: "Badge",
				nodeId: "1:4",
				variantProps: { Size: ["md", "sm"] },
			}),
		];
		const diff = diffComponents(before, after);
		expect(diff.changed).toHaveLength(1);
		const change = diff.changed[0];
		expect(change?.impact).toBe("breaking");
		expect(change?.variantChanges).toContainEqual({
			axis: "Size",
			kind: "value-removed",
			value: "lg",
		});
	});

	it("classifies a removed variant AXIS as changed/breaking", () => {
		const before = [
			model({
				name: "Button",
				nodeId: "1:1",
				variantProps: { Size: ["md", "sm"], Tone: ["info"] },
			}),
		];
		const after = [
			model({
				name: "Button",
				nodeId: "1:1",
				variantProps: { Size: ["md", "sm"] },
			}),
		];
		const diff = diffComponents(before, after);
		expect(diff.changed[0]?.impact).toBe("breaking");
		expect(diff.changed[0]?.variantChanges).toContainEqual({
			axis: "Tone",
			kind: "axis-removed",
		});
	});

	it("classifies an added variant AXIS as changed/additive", () => {
		const before = [
			model({
				name: "Button",
				nodeId: "1:1",
				variantProps: { Size: ["md", "sm"] },
			}),
		];
		const after = [
			model({
				name: "Button",
				nodeId: "1:1",
				variantProps: { Size: ["md", "sm"], Tone: ["info"] },
			}),
		];
		const diff = diffComponents(before, after);
		expect(diff.changed[0]?.impact).toBe("additive");
		expect(diff.changed[0]?.variantChanges).toContainEqual({
			axis: "Tone",
			kind: "axis-added",
		});
	});

	it("classifies a description-only change as changed/cosmetic", () => {
		const before = [
			model({ name: "Button", nodeId: "1:1", description: "Old desc." }),
		];
		const after = [
			model({
				name: "Button",
				nodeId: "1:1",
				description: "New, clearer desc.",
			}),
		];
		const diff = diffComponents(before, after);
		expect(diff.changed).toHaveLength(1);
		expect(diff.changed[0]?.impact).toBe("cosmetic");
		expect(diff.changed[0]?.descriptionChanged).toBe(true);
		expect(diff.changed[0]?.variantChanges).toEqual([]);
	});

	it("takes the MOST SEVERE impact when a change mixes breaking + additive", () => {
		const before = [
			model({
				name: "Badge",
				nodeId: "1:4",
				variantProps: { Size: ["md", "sm"] },
			}),
		];
		const after = [
			model({
				name: "Badge",
				nodeId: "1:4",
				// "sm" removed (breaking) AND "lg" added (additive) AND desc changed.
				description: "tweaked",
				variantProps: { Size: ["lg", "md"] },
			}),
		];
		const diff = diffComponents(before, after);
		expect(diff.changed[0]?.impact).toBe("breaking");
		expect(diff.changed[0]?.variantChanges).toContainEqual({
			axis: "Size",
			kind: "value-removed",
			value: "sm",
		});
		expect(diff.changed[0]?.variantChanges).toContainEqual({
			axis: "Size",
			kind: "value-added",
			value: "lg",
		});
		expect(diff.changed[0]?.descriptionChanged).toBe(true);
	});

	it("orders every bucket by name ascending (deterministic)", () => {
		const before = [
			model({ name: "Zeta", nodeId: "9:1" }),
			model({ name: "Alpha", nodeId: "9:2" }),
		];
		const after = [
			model({ name: "Yankee", nodeId: "9:3" }),
			model({ name: "Bravo", nodeId: "9:4" }),
		];
		const diff = diffComponents(before, after);
		expect(diff.added.map((c) => c.name)).toEqual(["Bravo", "Yankee"]);
		expect(diff.removed.map((c) => c.name)).toEqual(["Alpha", "Zeta"]);
	});

	it("exposes a stable ComponentDiff type shape", () => {
		const diff: ComponentDiff = diffComponents([], []);
		expect(diff).toEqual({
			added: [],
			removed: [],
			renamed: [],
			changed: [],
		});
	});
});
