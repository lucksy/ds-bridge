// L1 — library-health assessment engine (pure, deterministic, never throws).
//
// Each SPEC §2 dimension is exercised against tiny synthetic trees, then the
// recorded fixture (tests/fixtures/figma/library-file.json) — hand-built from the
// live-confirmed getFile shape (capture 2026-06-09) — is asserted end to end.
//
// SPEC §2 contract under test:
//   - override-hotspots: every INSTANCE with overrides.length > 0, ranked desc by
//     count (ties by node name asc), cap 20; each {nodeId, name, componentName?,
//     overrideCount}; componentName resolved via file.components[componentId].name.
//   - deprecated-usage: INSTANCE whose componentId resolves to a component whose
//     name matches /deprecat|legacy|\[old\]|do[\s-]?not[\s-]?use|⚠/i (default;
//     opts.deprecatedPattern overrides); grouped by component name with counts, cap 20.
//   - detached-candidates (HEURISTIC, heuristic:true): FRAME/GROUP whose name
//     exactly equals a components-map name and type ≠ INSTANCE, cap 20.
//   - totals: pre-cap counts of all three.
//   - tolerant: no overrides → 0; no components map → empty deprecated/detached,
//     override-hotspots still work.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	assessLibraryHealth,
	capLibraryHealth,
} from "../../../src/engines/figma/library-health.js";
import type { FigmaFile, FigmaNode } from "../../../src/io/figma/client.js";

// ── Tiny synthetic builders ──

function doc(children: FigmaNode[]): FigmaNode {
	return { id: "0:0", name: "Document", type: "DOCUMENT", children };
}

function file(
	document: FigmaNode,
	components?: FigmaFile["components"],
): FigmaFile {
	return {
		name: "T",
		lastModified: "2026-06-09T00:00:00Z",
		version: "1",
		document,
		...(components !== undefined ? { components } : {}),
	};
}

function instance(props: Partial<FigmaNode> & { id: string }): FigmaNode {
	return { name: "Instance", type: "INSTANCE", ...props };
}

// ── override-hotspots ──

describe("assessLibraryHealth — override hotspots", () => {
	it("collects only INSTANCE nodes with overrides.length > 0", () => {
		const f = file(
			doc([
				instance({ id: "1:1", overrides: [{ id: "a" }, { id: "b" }] }),
				instance({ id: "1:2", overrides: [] }),
				instance({ id: "1:3" }),
				{ id: "1:4", name: "F", type: "FRAME", overrides: [{ id: "x" }] },
			]),
		);
		const r = assessLibraryHealth(f);
		expect(r.overrideHotspots).toHaveLength(1);
		expect(r.overrideHotspots[0]?.nodeId).toBe("1:1");
		expect(r.overrideHotspots[0]?.overrideCount).toBe(2);
	});

	it("ranks desc by override count, ties broken by node name asc", () => {
		const f = file(
			doc([
				instance({ id: "1:1", name: "Zebra", overrides: [{ id: "a" }] }),
				instance({ id: "1:2", name: "Apple", overrides: [{ id: "a" }] }),
				instance({
					id: "1:3",
					name: "Mango",
					overrides: [{ id: "a" }, { id: "b" }, { id: "c" }],
				}),
			]),
		);
		const r = assessLibraryHealth(f);
		expect(r.overrideHotspots.map((h) => h.nodeId)).toEqual([
			"1:3",
			"1:2",
			"1:1",
		]);
	});

	it("ignores size/position-only overrides (auto-layout resizing every placed instance)", () => {
		const f = file(
			doc([
				instance({
					id: "1:1",
					name: "Card",
					overrides: [{ id: "1:1", overriddenFields: ["width", "height"] }],
				}),
				instance({
					id: "1:2",
					name: "Legacy Button",
					overrides: [
						{ id: "1:2", overriddenFields: ["width", "height"] },
						{ id: "1:2", overriddenFields: ["fills"] },
					],
				}),
			]),
		);
		const r = assessLibraryHealth(f);
		expect(r.overrideHotspots.map((h) => [h.nodeId, h.overrideCount])).toEqual([
			["1:2", 1],
		]);
	});

	// Real-user finding (Primer testbed): 23 "hotspots", nearly all a renamed
	// layer or a value set through the component's own properties — the API the
	// component exposes, not drift. One real fill override was buried.
	it("ignores renames and component-property values (using the component's API)", () => {
		const f = file(
			doc([
				instance({
					id: "1:1",
					name: "Search",
					overrides: [{ id: "1:1", overriddenFields: ["name"] }],
				}),
				instance({
					id: "1:2",
					name: "Cancel",
					overrides: [
						{ id: "1:2", overriddenFields: ["name", "componentProperties"] },
					],
				}),
				instance({
					id: "1:3",
					name: "Delete",
					overrides: [
						{ id: "1:3", overriddenFields: ["componentProperties", "fills"] },
					],
				}),
			]),
		);
		const r = assessLibraryHealth(f);
		expect(r.overrideHotspots.map((h) => [h.nodeId, h.fields])).toEqual([
			["1:3", ["fills"]],
		]);
	});

	it("ignores text-content overrides (a label typed into a Chip is usage, not drift)", () => {
		const text = [
			"characters",
			"characterStyleOverrides",
			"styleOverrideTable",
			"lineTypes",
			"lineIndentations",
		];
		const f = file(
			doc([
				instance({
					id: "1:1",
					name: "Chip",
					overrides: [{ id: "I1:1;2:3", overriddenFields: text }],
				}),
				instance({
					id: "1:2",
					name: "Button",
					overrides: [
						{ id: "I1:2;2:3", overriddenFields: text },
						{ id: "1:2", overriddenFields: ["fills", "width"] },
					],
				}),
			]),
		);
		const r = assessLibraryHealth(f);
		expect(
			r.overrideHotspots.map((h) => [h.nodeId, h.overrideCount, h.fields]),
		).toEqual([["1:2", 1, ["fills"]]]);
	});

	it("resolves componentName via the components map when present", () => {
		const f = file(
			doc([
				instance({ id: "1:1", componentId: "10:1", overrides: [{ id: "a" }] }),
			]),
			{ "10:1": { name: "Button / Primary" } },
		);
		const r = assessLibraryHealth(f);
		expect(r.overrideHotspots[0]?.componentName).toBe("Button / Primary");
	});

	it("leaves componentName undefined when no map / no match", () => {
		const f = file(
			doc([
				instance({ id: "1:1", componentId: "10:1", overrides: [{ id: "a" }] }),
			]),
		);
		const r = assessLibraryHealth(f);
		expect(r.overrideHotspots[0]?.componentName).toBeUndefined();
	});

	it("caps hotspots at 20 but totals are pre-cap", () => {
		const kids: FigmaNode[] = [];
		for (let i = 0; i < 25; i += 1) {
			kids.push(
				instance({ id: `1:${i}`, overrides: [{ id: "a" }, { id: "b" }] }),
			);
		}
		const r = assessLibraryHealth(file(doc(kids)));
		expect(r.overrideHotspots).toHaveLength(20);
		expect(r.totals.overrideHotspots).toBe(25);
	});

	it("capLibraryHealth of an uncapped pass equals the capped assessment", () => {
		const kids: FigmaNode[] = [];
		for (let i = 0; i < 25; i += 1) {
			kids.push(
				instance({ id: `1:${i}`, overrides: [{ id: "a" }, { id: "b" }] }),
			);
		}
		const f = file(doc(kids));
		const full = assessLibraryHealth(f, { cap: Number.POSITIVE_INFINITY });
		expect(full.overrideHotspots).toHaveLength(25);
		expect(capLibraryHealth(full)).toEqual(assessLibraryHealth(f));
		expect(capLibraryHealth(full, 5)).toEqual(
			assessLibraryHealth(f, { cap: 5 }),
		);
	});
});

// ── deprecated-usage ──

describe("assessLibraryHealth — deprecated usage", () => {
	it("groups INSTANCE usage by deprecated component name with counts", () => {
		const f = file(
			doc([
				instance({ id: "1:1", componentId: "10:9" }),
				instance({ id: "1:2", componentId: "10:9" }),
				instance({ id: "1:3", componentId: "10:8" }),
			]),
			{
				"10:9": { name: "[deprecated] OldButton" },
				"10:8": { name: "Button / Primary" },
			},
		);
		const r = assessLibraryHealth(f);
		expect(r.deprecatedUsage).toEqual([
			{ componentName: "[deprecated] OldButton", count: 2 },
		]);
	});

	it("matches each default-pattern token (legacy, [old], do-not-use, ⚠)", () => {
		const f = file(
			doc([
				instance({ id: "1:1", componentId: "a" }),
				instance({ id: "1:2", componentId: "b" }),
				instance({ id: "1:3", componentId: "c" }),
				instance({ id: "1:4", componentId: "d" }),
			]),
			{
				a: { name: "Legacy Card" },
				b: { name: "Avatar [OLD]" },
				c: { name: "Do Not Use Banner" },
				d: { name: "⚠ Warning Chip" },
			},
		);
		const r = assessLibraryHealth(f);
		expect(r.deprecatedUsage.map((d) => d.componentName).sort()).toEqual([
			"Avatar [OLD]",
			"Do Not Use Banner",
			"Legacy Card",
			"⚠ Warning Chip",
		]);
	});

	it("honors an opts.deprecatedPattern override", () => {
		const f = file(
			doc([
				instance({ id: "1:1", componentId: "a" }),
				instance({ id: "1:2", componentId: "b" }),
			]),
			{ a: { name: "[deprecated] X" }, b: { name: "Sunset Widget" } },
		);
		const r = assessLibraryHealth(f, { deprecatedPattern: /sunset/i });
		expect(r.deprecatedUsage).toEqual([
			{ componentName: "Sunset Widget", count: 1 },
		]);
	});

	it("is empty when there is no components map", () => {
		const f = file(doc([instance({ id: "1:1", componentId: "10:9" })]));
		const r = assessLibraryHealth(f);
		expect(r.deprecatedUsage).toEqual([]);
	});
});

// ── detached-candidates (heuristic) ──

describe("assessLibraryHealth — detached candidates (heuristic)", () => {
	it("flags FRAME/GROUP whose name exactly equals a component name, type ≠ INSTANCE", () => {
		const f = file(
			doc([
				{ id: "1:1", name: "Button / Primary", type: "FRAME" },
				{ id: "1:2", name: "Card / Default", type: "GROUP" },
				// type IS INSTANCE → not a candidate even though the name matches.
				instance({ id: "1:3", name: "Button / Primary", componentId: "10:1" }),
				// name does not match any component → not a candidate.
				{ id: "1:4", name: "Some Random Frame", type: "FRAME" },
			]),
			{
				"10:1": { name: "Button / Primary" },
				"10:2": { name: "Card / Default" },
			},
		);
		const r = assessLibraryHealth(f);
		expect(r.detachedCandidates.map((d) => d.nodeId).sort()).toEqual([
			"1:1",
			"1:2",
		]);
		expect(r.detachedCandidates.every((d) => d.heuristic === true)).toBe(true);
	});

	it("flags a frame named after a component SET (a detached variant)", () => {
		// The components map only holds variant names ("variant=secondary");
		// the set name ("Badge") lives in componentSets.
		const f: FigmaFile = {
			...file(doc([{ id: "1:1", name: "Badge", type: "FRAME" }]), {
				"10:1": { name: "variant=secondary" },
			}),
			componentSets: { "10:0": { name: "Badge" } },
		};
		const r = assessLibraryHealth(f);
		expect(r.detachedCandidates.map((d) => d.nodeId)).toEqual(["1:1"]);
	});

	it("is empty when there is no components map", () => {
		const f = file(doc([{ id: "1:1", name: "Button", type: "FRAME" }]));
		const r = assessLibraryHealth(f);
		expect(r.detachedCandidates).toEqual([]);
	});
});

// ── tolerance / determinism ──

describe("assessLibraryHealth — tolerance & determinism", () => {
	it("never throws and yields zeroed totals on an empty document", () => {
		const f = file(doc([]));
		const r = assessLibraryHealth(f);
		expect(r.totals).toEqual({
			overrideHotspots: 0,
			deprecatedUsage: 0,
			detachedCandidates: 0,
			placedInstances: 0,
		});
	});

	it("is deterministic across repeated runs", () => {
		const f = file(
			doc([
				instance({ id: "1:1", componentId: "a", overrides: [{ id: "x" }] }),
			]),
			{ a: { name: "Legacy" } },
		);
		expect(assessLibraryHealth(f)).toEqual(assessLibraryHealth(f));
	});
});

// ── recorded fixture (live-confirmed shape, 2026-06-09) ──

describe("assessLibraryHealth — recorded fixture", () => {
	const fixture = JSON.parse(
		readFileSync(
			join(__dirname, "../../fixtures/figma/library-file.json"),
			"utf8",
		),
	) as FigmaFile;

	it("ranks the three override hotspots with resolved component names", () => {
		const r = assessLibraryHealth(fixture);
		// Secondary CTA only had its label typed (`characters`): usage, not drift.
		expect(r.overrideHotspots).toEqual([
			{
				nodeId: "1:10",
				name: "Primary CTA",
				componentName: "Button / Primary",
				overrideCount: 2,
				fields: ["fills", "visible"],
			},
			{
				nodeId: "1:20",
				name: "Old Button A",
				componentName: "[deprecated] OldButton",
				overrideCount: 1,
				fields: ["fills"],
			},
		]);
	});

	it("groups deprecated usage by the [deprecated] and ⚠ components", () => {
		const r = assessLibraryHealth(fixture);
		// 1:20 + 1:21 → "[deprecated] OldButton" (2); 1:22 → "⚠ Banner (do not use)" (1).
		const byName = Object.fromEntries(
			r.deprecatedUsage.map((d) => [d.componentName, d.count]),
		);
		expect(byName).toEqual({
			"[deprecated] OldButton": 2,
			"⚠ Banner (do not use)": 1,
		});
	});

	it("flags the three detached heuristic candidates and excludes the INSTANCE", () => {
		const r = assessLibraryHealth(fixture);
		const ids = r.detachedCandidates.map((d) => d.nodeId).sort();
		// 1:30 (Button / Primary FRAME — a TRUE detached positive),
		// 1:31 (Card / Default GROUP),
		// 1:32 ("Button" FRAME — a FALSE positive: a hand-built frame that merely
		//   shares the name of the "Button" component; the heuristic cannot tell it
		//   apart from a real detached instance — this documents the heuristic limit),
		// 1:33 ("Button / Primary" INSTANCE) is excluded because type === INSTANCE.
		expect(ids).toEqual(["1:30", "1:31", "1:32"]);
		expect(r.detachedCandidates.every((d) => d.heuristic === true)).toBe(true);
	});

	it("reports pre-cap totals for the fixture", () => {
		const r = assessLibraryHealth(fixture);
		expect(r.totals).toEqual({
			overrideHotspots: 2,
			deprecatedUsage: 3,
			detachedCandidates: 3,
			placedInstances: 7,
		});
	});
});

// ── Real library files (Figma's Simple Design System, 2026-10-08) ──
// A published library is full of instances that are not usage: the
// compositions inside its own components, nested instances whose overrides the
// outer instance already lists, and private helpers (`_Component Note`).

describe("assessLibraryHealth — a real library's own structure", () => {
	const fill = (id: string) => ({ id, overriddenFields: ["fills"] });
	const components = {
		"c:btn": { key: "k1", name: "Button", description: "" },
		"c:note": { key: "k2", name: "_Component Note", description: "" },
		"c:list": { key: "k3", name: "Pill List", description: "" },
		"c:pill": { key: "k4", name: "Pill", description: "" },
	};
	const page = (children: FigmaNode[]): FigmaNode => ({
		id: "p",
		name: "Page",
		type: "CANVAS",
		children,
	});

	it("skips instances inside component definitions, private helpers and non-visual fields", () => {
		const f = file(
			doc([
				page([
					{
						id: "def",
						name: "Card",
						type: "COMPONENT",
						children: [
							instance({
								id: "in-def",
								componentId: "c:btn",
								overrides: [fill("x")],
							}),
						],
					},
					instance({
						id: "note",
						componentId: "c:note",
						overrides: [fill("y")],
					}),
					instance({
						id: "proto",
						componentId: "c:btn",
						overrides: [
							{
								id: "p1",
								overriddenFields: [
									"annotations",
									"transitionNodeID",
									"explicitVariableModes",
								],
							},
						],
					}),
					instance({
						id: "used",
						componentId: "c:btn",
						overrides: [fill("z")],
					}),
				]),
			]),
			components,
		);
		const report = assessLibraryHealth(f);
		expect(report.overrideHotspots.map((h) => h.nodeId)).toEqual(["used"]);
	});

	it("reports nested instances once, on the placed instance, counting unique layers", () => {
		const f = file(
			doc([
				page([
					instance({
						id: "list",
						componentId: "c:list",
						overrides: [fill("I1;a"), fill("I1;b")],
						children: [
							instance({
								id: "I1;pill",
								componentId: "c:pill",
								overrides: [fill("I1;a"), fill("I1;c")],
							}),
						],
					}),
				]),
			]),
			components,
		);
		const report = assessLibraryHealth(f);
		expect(report.overrideHotspots).toEqual([
			expect.objectContaining({ nodeId: "list", overrideCount: 3 }),
		]);
	});

	it("never calls a top-level screen or a component's own layer a detached instance", () => {
		const f = file(
			doc([
				page([
					{
						id: "screen",
						name: "Button",
						type: "FRAME",
						children: [{ id: "detached", name: "Button", type: "FRAME" }],
					},
					{
						id: "def",
						name: "Card",
						type: "COMPONENT",
						children: [{ id: "inner", name: "Button", type: "FRAME" }],
					},
				]),
			]),
			components,
		);
		const report = assessLibraryHealth(f);
		expect(report.detachedCandidates.map((d) => d.nodeId)).toEqual([
			"detached",
		]);
	});
});

describe("assessLibraryHealth — detached candidates keep their component's layers", () => {
	it("flags a same-named frame only when its layers look like the component's", () => {
		const page: FigmaNode = {
			id: "p",
			name: "Page",
			type: "CANVAS",
			children: [
				{
					id: "c:1",
					name: "Text",
					type: "COMPONENT",
					children: [{ id: "c:1a", name: "Label", type: "TEXT" }],
				},
				{
					id: "screen",
					name: "Screen",
					type: "FRAME",
					children: [
						// A layout wrapper that happens to be called "Text".
						{
							id: "wrap",
							name: "Text",
							type: "FRAME",
							children: [
								{ id: "w1", name: "Heading", type: "TEXT" },
								{ id: "w2", name: "Body", type: "TEXT" },
							],
						},
						// A real detached copy: same layer names as the component.
						{
							id: "det",
							name: "Text",
							type: "FRAME",
							children: [{ id: "d1", name: "Label", type: "TEXT" }],
						},
					],
				},
			],
		};
		const report = assessLibraryHealth(
			file(doc([page]), { "c:1": { name: "Text", description: "" } }),
		);
		expect(report.detachedCandidates.map((d) => d.nodeId)).toEqual(["det"]);
	});
});

describe("assessLibraryHealth — a renamed detached copy", () => {
	it("is found by its component's exact layers, whatever its name", () => {
		const page: FigmaNode = {
			id: "p",
			name: "Page",
			type: "CANVAS",
			children: [
				{
					id: "c:1",
					name: "Button",
					type: "COMPONENT",
					children: [
						{ id: "c:1a", name: "Star", type: "INSTANCE" },
						{ id: "c:1b", name: "Button", type: "TEXT" },
					],
				},
				{
					id: "screen",
					name: "Settings",
					type: "FRAME",
					children: [
						{
							id: "arch",
							name: "Archive",
							type: "FRAME",
							children: [
								{ id: "a1", name: "Star", type: "INSTANCE" },
								{ id: "a2", name: "Button", type: "TEXT" },
							],
						},
					],
				},
			],
		};
		const report = assessLibraryHealth(
			file(doc([page]), { "c:1": { name: "Button", description: "" } }),
		);
		expect(report.detachedCandidates.map((d) => d.nodeId)).toEqual(["arch"]);
	});
});

describe("assessLibraryHealth — instance-only components", () => {
	it("never call a layout row of instances a detached Button Group", () => {
		const page: FigmaNode = {
			id: "p",
			name: "Page",
			type: "CANVAS",
			children: [
				{
					id: "g:1",
					name: "Button Group",
					type: "COMPONENT",
					children: [
						{ id: "g1", name: "Button", type: "INSTANCE" },
						{ id: "g2", name: "Button", type: "INSTANCE" },
					],
				},
				{
					id: "screen",
					name: "Account",
					type: "FRAME",
					children: [
						{
							id: "row",
							name: "Actions",
							type: "FRAME",
							children: [
								{ id: "r1", name: "Button", type: "INSTANCE" },
								{ id: "r2", name: "Button", type: "INSTANCE" },
							],
						},
					],
				},
			],
		};
		const report = assessLibraryHealth(
			file(doc([page]), { "g:1": { name: "Button Group", description: "" } }),
		);
		expect(report.detachedCandidates).toEqual([]);
	});
});

describe("assessLibraryHealth — wrapper-only components", () => {
	it("never call frames sharing only wrapper layers a detached copy", () => {
		const page: FigmaNode = {
			id: "p",
			name: "Page",
			type: "CANVAS",
			children: [
				{
					id: "k:1",
					name: "Card Grid",
					type: "COMPONENT",
					children: [
						{ id: "k1", name: "Block", type: "FRAME" },
						{ id: "k2", name: "Block", type: "FRAME" },
					],
				},
				{
					id: "screen",
					name: "Docs",
					type: "FRAME",
					children: [
						{
							id: "blk",
							name: "Layout",
							type: "FRAME",
							children: [
								{ id: "b1", name: "Block", type: "FRAME" },
								{ id: "b2", name: "Block", type: "FRAME" },
							],
						},
					],
				},
			],
		};
		const report = assessLibraryHealth(
			file(doc([page]), { "k:1": { name: "Card Grid", description: "" } }),
		);
		expect(report.detachedCandidates).toEqual([]);
	});
});
