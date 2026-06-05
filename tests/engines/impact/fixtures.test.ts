// T7.6 — smoke spec for the two-snapshot component fixtures.
//
// Guards the seeded deltas between components-before.json and components-after.json
// (the acceptance data for the T7.7 component-diff engine) so a fixture edit that
// silently drops/alters a seed breaks the build until reconciled. It loads both
// FigmaComponentsResponse files and asserts EXACTLY the documented deltas exist:
//   - 1 added        (Card / Default, node 10:90 — only in after)
//   - 1 removed      (Input / Text, node 10:58 — only in before)
//   - 1 renamed      (Avatar -> Avatar / User, node 10:70 kept, name changed)
//   - 1 variant-prop change (Badge set gains Size=lg, node 10:82, in after only)
//   - the rest unchanged (Button / Primary identical; Badge sm/md identical)
//
// It deliberately does NOT import the diff engine: this is a data contract test.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	FigmaComponent,
	FigmaComponentsResponse,
} from "../../../src/io/figma/client.js";

const fixturesDir = join(import.meta.dirname, "..", "..", "fixtures", "figma");

function load(name: string): FigmaComponent[] {
	const text = readFileSync(join(fixturesDir, name), "utf8");
	const parsed = JSON.parse(text) as FigmaComponentsResponse;
	return parsed.meta.components;
}

function byNodeId(components: FigmaComponent[]): Map<string, FigmaComponent> {
	const map = new Map<string, FigmaComponent>();
	for (const component of components) map.set(component.node_id, component);
	return map;
}

describe("impact two-snapshot fixtures (T7.6)", () => {
	const before = load("components-before.json");
	const after = load("components-after.json");

	it("both fixtures parse as FigmaComponentsResponse with components", () => {
		expect(before.length).toBeGreaterThan(0);
		expect(after.length).toBeGreaterThan(0);
		for (const component of [...before, ...after]) {
			expect(typeof component.key).toBe("string");
			expect(typeof component.node_id).toBe("string");
			expect(typeof component.name).toBe("string");
			expect(typeof component.description).toBe("string");
		}
	});

	it("seeds one ADDED standalone component (Card / Default, 10:90)", () => {
		// At the raw node level two ids are new: the standalone Card (10:90) and the
		// new Badge variant child (10:82). The added-COMPONENT seed is the one whose
		// containing_frame is itself new (Cards) — the Size=lg node belongs to the
		// pre-existing Badge set and is asserted as a variant-prop change below.
		const beforeIds = new Set(before.map((c) => c.node_id));
		const beforeFrames = new Set(
			before.map((c) => c.containing_frame?.name ?? ""),
		);
		const added = after.filter(
			(c) =>
				!beforeIds.has(c.node_id) &&
				!beforeFrames.has(c.containing_frame?.name ?? ""),
		);
		expect(added.map((c) => c.node_id)).toEqual(["10:90"]);
		expect(added[0]?.name).toBe("Card / Default");
	});

	it("seeds exactly one REMOVED component (Input / Text, 10:58)", () => {
		const afterIds = new Set(after.map((c) => c.node_id));
		const removed = before.filter((c) => !afterIds.has(c.node_id));
		expect(removed.map((c) => c.node_id)).toEqual(["10:58"]);
		expect(removed[0]?.name).toBe("Input / Text");
	});

	it("seeds one RENAMED component: node 10:70 kept, name Avatar -> Avatar / User", () => {
		const renamed = byNodeId(before).get("10:70");
		const renamedAfter = byNodeId(after).get("10:70");
		expect(renamed?.name).toBe("Avatar");
		expect(renamedAfter?.name).toBe("Avatar / User");
		// The names are clearly similar (share the "Avatar" token).
		expect(renamedAfter?.name).toContain("Avatar");
	});

	it("seeds a VARIANT-PROP change: Badge set gains a Size=lg variant (10:82)", () => {
		const badgeFrame = (c: FigmaComponent) =>
			c.containing_frame?.name === "Badge";
		const beforeBadge = before.filter(badgeFrame).map((c) => c.name);
		const afterBadge = after.filter(badgeFrame).map((c) => c.name);
		// Before: sm, md. After: sm, md, lg — one variant added to the set.
		expect(beforeBadge).toEqual(["Size=sm", "Size=md"]);
		expect(afterBadge).toEqual(["Size=sm", "Size=md", "Size=lg"]);
		expect(byNodeId(after).get("10:82")?.name).toBe("Size=lg");
	});

	it("leaves Button / Primary (10:42) unchanged across snapshots", () => {
		const beforeButton = byNodeId(before).get("10:42");
		const afterButton = byNodeId(after).get("10:42");
		expect(beforeButton).toBeDefined();
		expect(afterButton).toBeDefined();
		expect(afterButton?.name).toBe(beforeButton?.name);
		expect(afterButton?.description).toBe(beforeButton?.description);
	});
});
