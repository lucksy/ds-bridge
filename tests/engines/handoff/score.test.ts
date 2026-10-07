// T4.4 — readiness scoring engine (pure, deterministic, never throws).
//
// The weights table below IS the spec. Each rule is exercised in isolation with
// a minimal synthetic tree, then the recorded fixture (tests/fixtures/figma/
// file.json) is scored and its exact number + top deduction snapshotted.
//
// WEIGHTS (total 100):
//   - Variable binding coverage      40 pts
//   - Auto-layout coverage           25 pts
//   - Component usage (attachment)   20 pts
//   - Naming convention              15 pts
//
// Definitions used by the rules:
//   - STYLEABLE node: has a non-empty `fills` OR non-empty `strokes` array.
//       binding "covered" = boundVariables binds at least one of fills/strokes.
//   - FRAME node: type === "FRAME". auto-layout ok = layoutMode is defined and
//       not "NONE".
//   - component-named node: name is PascalCase OR contains "/". Such a node that
//       is NOT type "INSTANCE" is a "detached suspect".
//   - default name: matches /^(Frame|Rectangle|Group|Ellipse|Vector|Text) \d+$/.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type HandoffNode,
	type ReadinessReport,
	scoreReadiness,
} from "../../../src/engines/handoff/score.js";

// ── Tiny builders for synthetic trees ──

function frame(props: Partial<HandoffNode> & { id: string }): HandoffNode {
	return { name: "Frame", type: "FRAME", ...props };
}

const solidFill = [{ type: "SOLID" }];
const boundFill = { fills: [{ type: "VARIABLE_ALIAS", id: "V:1" }] };

describe("scoreReadiness — degenerate trees", () => {
	it("scores an empty/childless root as 100 with empty stats", () => {
		const root: HandoffNode = { id: "0:0", name: "Document", type: "DOCUMENT" };
		const report = scoreReadiness(root);
		expect(report.score).toBe(100);
		expect(report.deductions).toEqual([]);
		expect(report.stats).toEqual({
			totalNodes: 1,
			boundCoverage: 1,
			autoLayoutCoverage: 1,
			instanceCount: 0,
			detachedSuspects: 0,
			deprecatedInstances: 0,
			badNames: 0,
		});
	});

	it("never throws on a deeply nested childless chain", () => {
		const root: HandoffNode = {
			id: "0:0",
			name: "A",
			type: "FRAME",
			layoutMode: "VERTICAL",
			children: [
				{ id: "0:1", name: "B", type: "FRAME", layoutMode: "HORIZONTAL" },
			],
		};
		expect(() => scoreReadiness(root)).not.toThrow();
	});
});

describe("scoreReadiness — perfect tree", () => {
	it("scores a fully-bound, auto-laid-out, attached, well-named tree as 100", () => {
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Page",
			type: "FRAME",
			layoutMode: "VERTICAL",
			children: [
				frame({
					id: "1:0",
					name: "Card",
					layoutMode: "VERTICAL",
					fills: solidFill,
					boundVariables: boundFill,
					children: [
						{
							id: "1:1",
							name: "Button / Primary",
							type: "INSTANCE",
							componentId: "9:9",
						},
					],
				}),
			],
		});
		const report = scoreReadiness(root);
		expect(report.score).toBe(100);
		expect(report.deductions).toEqual([]);
	});
});

describe("scoreReadiness — variable binding rule (40 pts) in isolation", () => {
	it("deducts the full 40 when no styleable node is bound", () => {
		// One frame (auto-laid-out, attached-or-neutral name) plus a styleable
		// unbound rectangle. Keep everything else perfect so only binding moves.
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Wrapper",
			layoutMode: "VERTICAL",
			children: [
				{
					id: "1:1",
					name: "Surface",
					type: "RECTANGLE",
					fills: solidFill,
				},
			],
		});
		const report = scoreReadiness(root);
		// 1 styleable node, 0 bound -> coverage 0 -> binding contributes 0 of 40.
		expect(report.stats.boundCoverage).toBe(0);
		expect(report.score).toBe(60);
		const binding = report.deductions.find((d) => d.rule === "var-binding");
		expect(binding).toBeDefined();
		expect(binding?.nodeId).toBe("1:1");
		expect(binding?.points).toBe(40);
		expect(binding?.fix.length).toBeGreaterThan(0);
	});

	it("counts strokes as styleable and credits a stroke binding", () => {
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Wrapper",
			layoutMode: "VERTICAL",
			children: [
				{
					id: "1:1",
					name: "Outline",
					type: "RECTANGLE",
					strokes: [{ type: "SOLID" }],
					boundVariables: { strokes: [{ type: "VARIABLE_ALIAS", id: "V:7" }] },
				},
			],
		});
		const report = scoreReadiness(root);
		expect(report.stats.boundCoverage).toBe(1);
	});

	it("caps the listed binding deductions at the 10 worst", () => {
		const children: HandoffNode[] = [];
		for (let i = 0; i < 15; i += 1) {
			children.push({
				id: `1:${i}`,
				name: `Surface ${i}`,
				type: "RECTANGLE",
				fills: solidFill,
			});
		}
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Wrapper",
			layoutMode: "VERTICAL",
			children,
		});
		const report = scoreReadiness(root);
		const binding = report.deductions.filter((d) => d.rule === "var-binding");
		expect(binding.length).toBe(10);
	});
});

describe("scoreReadiness — auto-layout rule (25 pts) in isolation", () => {
	it("deducts the full 25 when no frame uses auto layout", () => {
		const root: HandoffNode = {
			id: "0:1",
			name: "Wrapper",
			type: "FRAME",
			// layoutMode undefined -> not auto laid out
			children: [
				{ id: "1:1", name: "Inner", type: "FRAME", layoutMode: "NONE" },
			],
		};
		const report = scoreReadiness(root);
		// 2 frames, 0 with auto layout -> coverage 0 -> 0 of 25.
		expect(report.stats.autoLayoutCoverage).toBe(0);
		expect(report.score).toBe(75);
		const al = report.deductions.filter((d) => d.rule === "auto-layout");
		expect(al.length).toBeGreaterThan(0);
		expect(al[0]?.fix).toBe("Add auto layout");
	});

	it("treats layoutMode NONE the same as missing", () => {
		const root: HandoffNode = {
			id: "0:1",
			name: "Wrapper",
			type: "FRAME",
			layoutMode: "NONE",
		};
		const report = scoreReadiness(root);
		expect(report.stats.autoLayoutCoverage).toBe(0);
	});
});

describe("scoreReadiness — component usage rule (20 pts) in isolation", () => {
	it("flags a detached component-named node as a suspect", () => {
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Wrapper",
			layoutMode: "VERTICAL",
			children: [
				// PascalCase name, but a FRAME (not INSTANCE) -> detached suspect.
				{ id: "1:1", name: "Button", type: "FRAME", layoutMode: "VERTICAL" },
			],
		});
		const report = scoreReadiness(root);
		expect(report.stats.detachedSuspects).toBe(1);
		expect(report.stats.instanceCount).toBe(0);
		// suspects/(suspects+instances) = 1/1 -> component contributes 0 of 20.
		expect(report.score).toBe(80);
		const comp = report.deductions.find((d) => d.rule === "component");
		expect(comp?.nodeId).toBe("1:1");
		expect(comp?.fix).toBe("Reattach to the published component or rename");
	});

	it("does not flag an INSTANCE with a component-like name", () => {
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Wrapper",
			layoutMode: "VERTICAL",
			children: [
				{
					id: "1:1",
					name: "Button / Primary",
					type: "INSTANCE",
					componentId: "9:9",
				},
			],
		});
		const report = scoreReadiness(root);
		expect(report.stats.detachedSuspects).toBe(0);
		expect(report.stats.instanceCount).toBe(1);
		expect(
			report.deductions.find((d) => d.rule === "component"),
		).toBeUndefined();
	});

	it("treats a slash-named non-instance as a suspect", () => {
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Wrapper",
			layoutMode: "VERTICAL",
			children: [
				{
					id: "1:1",
					name: "Card / Header",
					type: "FRAME",
					layoutMode: "VERTICAL",
				},
			],
		});
		const report = scoreReadiness(root);
		expect(report.stats.detachedSuspects).toBe(1);
	});
});

describe("scoreReadiness — naming rule (15 pts) in isolation", () => {
	it("flags default-named nodes and deducts proportionally", () => {
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Wrapper",
			layoutMode: "VERTICAL",
			children: [
				{ id: "1:1", name: "Rectangle 1", type: "RECTANGLE" },
				{ id: "1:2", name: "Frame 12", type: "FRAME", layoutMode: "VERTICAL" },
			],
		});
		const report = scoreReadiness(root);
		expect(report.stats.badNames).toBe(2);
		// totalNodes = 3 (Wrapper + 2 children); badNames = 2.
		// naming contributes 15 * (1 - 2/3) = 5 -> lost 10.
		expect(report.score).toBe(90);
		const naming = report.deductions.filter((d) => d.rule === "naming");
		expect(naming.length).toBe(2);
		expect(naming[0]?.fix).toBe("Rename meaningfully");
	});

	it("does not flag a meaningful name that merely contains a digit", () => {
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Section 1 Hero",
			layoutMode: "VERTICAL",
		});
		const report = scoreReadiness(root);
		expect(report.stats.badNames).toBe(0);
	});
});

describe("scoreReadiness — deterministic ordering", () => {
	it("sorts deductions by points desc, then nodeId asc", () => {
		// A styleable unbound node (40 pts) and a default-named node (smaller).
		const root: HandoffNode = frame({
			id: "0:1",
			name: "Wrapper",
			layoutMode: "VERTICAL",
			children: [
				{ id: "1:9", name: "Rectangle 1", type: "RECTANGLE", fills: solidFill },
				{ id: "1:1", name: "Surface", type: "RECTANGLE", fills: solidFill },
			],
		});
		const report = scoreReadiness(root);
		const pts = report.deductions.map((d) => d.points);
		for (let i = 1; i < pts.length; i += 1) {
			expect(pts[i - 1]).toBeGreaterThanOrEqual(
				pts[i] ?? Number.POSITIVE_INFINITY,
			);
		}
		// Two binding deductions tie at 20 pts each (2 unbound of 2 styleable ->
		// 40 spread evenly); ties break by nodeId ascending.
		const binding = report.deductions.filter((d) => d.rule === "var-binding");
		expect(binding.map((d) => d.nodeId)).toEqual(["1:1", "1:9"]);
	});

	it("produces the same report for the same tree", () => {
		const make = (): HandoffNode =>
			frame({
				id: "0:1",
				name: "Wrapper",
				layoutMode: "VERTICAL",
				children: [{ id: "1:1", name: "Rectangle 1", type: "RECTANGLE" }],
			});
		const a: ReadinessReport = scoreReadiness(make());
		const b: ReadinessReport = scoreReadiness(make());
		expect(a).toEqual(b);
	});
});

describe("scoreReadiness — recorded fixture", () => {
	function loadFixtureRoot(): HandoffNode {
		const path = join(
			import.meta.dirname,
			"..",
			"..",
			"fixtures",
			"figma",
			"file.json",
		);
		const file = JSON.parse(readFileSync(path, "utf8")) as {
			document: HandoffNode;
		};
		return file.document;
	}

	it("scores the recorded fixture deterministically", () => {
		const report = scoreReadiness(loadFixtureRoot());
		// Fixture tree (DOCUMENT > CANVAS > Card/Primary FRAME > {Background RECT,
		//   Title TEXT, Button/Primary INSTANCE}). 6 nodes total.
		// binding: styleable = Card, Background, Title (3); all 3 bound -> cov 1.
		//   (Button INSTANCE has fills:[] -> not styleable.) => full 40.
		// auto-layout: frames = Card (VERTICAL). 1/1 -> full 25.
		// component: suspects = 0 (Card/Primary & Button/Primary are slash-named
		//   but Card is a FRAME -> suspect!). Card / Primary is a FRAME, not an
		//   INSTANCE -> detached suspect. Button/Primary is an INSTANCE.
		//   suspects=1, instances=1 -> 20 * (1 - 1/2) = 10.
		// naming: no default names -> full 15.
		// total = 40 + 25 + 10 + 15 = 90.
		expect(report.score).toBe(90);
		expect(report.stats).toEqual({
			totalNodes: 6,
			boundCoverage: 1,
			autoLayoutCoverage: 1,
			instanceCount: 1,
			detachedSuspects: 1,
			deprecatedInstances: 0,
			badNames: 0,
		});
		expect(report.deductions[0]).toEqual({
			nodeId: "1:2",
			nodeName: "Card / Primary",
			rule: "component",
			points: 10,
			fix: "Reattach to the published component or rename",
		});
	});
});

describe("scoreReadiness — deprecated component instances", () => {
	const tree: HandoffNode = frame({
		id: "1:1",
		name: "Settings",
		layoutMode: "VERTICAL",
		children: [
			{ id: "1:2", name: "Save", type: "INSTANCE", componentId: "C:1" },
			{ id: "1:3", name: "Close store", type: "INSTANCE", componentId: "C:2" },
		],
	});
	const components = {
		"C:1": { name: "variant=default, size=default" },
		"C:2": { name: "Legacy Button" },
	};

	it("counts an instance of a deprecated component against the component rule", () => {
		const report = scoreReadiness(tree, { components });
		expect(report.stats.deprecatedInstances).toBe(1);
		const deduction = report.deductions.find((d) => d.nodeId === "1:3");
		expect(deduction?.rule).toBe("component");
		expect(deduction?.fix).toContain("Legacy Button");
		expect(report.score).toBeLessThan(scoreReadiness(tree).score);
	});

	it("uses the set name for a variant (componentSetId)", () => {
		const report = scoreReadiness(tree, {
			components: {
				"C:1": { name: "variant=default" },
				"C:2": { name: "variant=old", componentSetId: "S:1" },
			},
			componentSets: { "S:1": { name: "Badge (deprecated)" } },
		});
		expect(report.stats.deprecatedInstances).toBe(1);
	});

	it("without a components map, nothing is deprecated", () => {
		expect(scoreReadiness(tree).stats.deprecatedInstances).toBe(0);
	});
});
