// C5 / M3.3 — component-health engine. Test-first: a pure cross-engine JOIN over
// already-persisted signals — registry/parity status ⋈ library-health lists
// (override / deprecated / detached that NAME the component) ⋈ name-heuristic
// readiness/a11y (raised to an EXACT join when component_aliases supplies the
// frameName/contrastMode). Pure: signals in → ComponentHealthRow[] out (worst
// health first). Never throws on malformed input; empty → [].
import { describe, expect, it } from "vitest";
import type { ParityRow } from "../../../src/engines/registry/parity.js";
import { buildComponentHealth } from "../../../src/engines/report/component-health.js";

/** A parity row for `component` with `status` (detail is unused by the join). */
function parity(component: string, status: ParityRow["status"]): ParityRow {
	return { component, status, detail: "" };
}

/** Find a row by component name. */
function row(rows: ReturnType<typeof buildComponentHealth>, name: string) {
	return rows.find((r) => r.component === name);
}

describe("buildComponentHealth", () => {
	it("returns [] for empty / no-signal input", () => {
		expect(buildComponentHealth({})).toEqual([]);
		expect(buildComponentHealth({ parityRows: [] })).toEqual([]);
	});

	it("rolls up one row per component from parity, full health when ok", () => {
		const rows = buildComponentHealth({
			parityRows: [parity("Button", "ok")],
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			component: "Button",
			healthScore: 100,
			issues: [],
		});
	});

	it("deducts for a parity gap and records an issue", () => {
		const rows = buildComponentHealth({
			parityRows: [
				parity("Button", "ok"),
				parity("Spinner", "missing-in-figma"),
				parity("Chip", "prop-mismatch"),
			],
		});
		// missing-in-figma (−30) is worse than prop-mismatch (−15) is worse than ok.
		expect(rows.map((r) => r.component)).toEqual(["Spinner", "Chip", "Button"]);
		expect(row(rows, "Spinner")?.healthScore).toBe(70);
		expect(row(rows, "Spinner")?.issues.join(" ")).toMatch(/parity/i);
		expect(row(rows, "Chip")?.healthScore).toBe(85);
		expect(row(rows, "Button")?.healthScore).toBe(100);
	});

	it("joins library-health override/deprecated/detached lists by component name", () => {
		const rows = buildComponentHealth({
			parityRows: [parity("Button", "ok")],
			libraryHealth: {
				overrideHotspots: [
					{
						nodeId: "1:1",
						name: "Button instance",
						componentName: "Button",
						overrideCount: 4,
					},
				],
				deprecatedUsage: [{ componentName: "Button", count: 2 }],
				detachedCandidates: [
					{ nodeId: "2:2", name: "Button", heuristic: true },
				],
			},
		});
		const button = row(rows, "Button");
		// override (−10) + deprecated (−20) + detached (−10) = 60.
		expect(button?.healthScore).toBe(60);
		const joined = button?.issues.join(" ") ?? "";
		expect(joined).toMatch(/override/i);
		expect(joined).toMatch(/deprecated/i);
		expect(joined).toMatch(/detached/i);
	});

	it("surfaces a component that ONLY appears in a library-health list (not parity)", () => {
		const rows = buildComponentHealth({
			parityRows: [parity("Button", "ok")],
			libraryHealth: {
				overrideHotspots: [],
				deprecatedUsage: [{ componentName: "LegacyCard", count: 5 }],
				detachedCandidates: [],
			},
		});
		expect(row(rows, "LegacyCard")).toBeDefined();
		expect(row(rows, "LegacyCard")?.healthScore).toBe(80);
	});

	it("parity-only data degrades gracefully (no library-health, no readiness/a11y)", () => {
		const rows = buildComponentHealth({
			parityRows: [
				parity("Button", "ok"),
				parity("Spinner", "missing-in-code"),
			],
		});
		expect(rows).toHaveLength(2);
		expect(row(rows, "Spinner")?.healthScore).toBe(70);
		expect(row(rows, "Button")?.healthScore).toBe(100);
	});

	it("name-heuristic joins readiness/a11y when a frame/mode name matches a component", () => {
		const rows = buildComponentHealth({
			parityRows: [parity("Button", "ok")],
			readiness: { frameName: "Button", score: 60 },
			a11y: { modes: [{ mode: "Button", passed: 8, failed: 2 }] },
		});
		const button = row(rows, "Button");
		// readiness deficit (100−60)*0.3 = 12; contrast failed 2 → −min(20, 2*5)= −10.
		// 100 − 12 − 10 = 78.
		expect(button?.healthScore).toBe(78);
		const joined = button?.issues.join(" ") ?? "";
		expect(joined).toMatch(/readiness/i);
		expect(joined).toMatch(/contrast/i);
	});

	it("does NOT heuristically join when the frame/mode name does not match a component", () => {
		const rows = buildComponentHealth({
			parityRows: [parity("Button", "ok")],
			readiness: { frameName: "Some Other Frame", score: 10 },
			a11y: { modes: [{ mode: "dark", passed: 1, failed: 9 }] },
		});
		// No name match → no readiness/contrast deduction on Button.
		expect(row(rows, "Button")?.healthScore).toBe(100);
	});

	it("raises readiness/a11y to an EXACT join via component_aliases", () => {
		const rows = buildComponentHealth({
			parityRows: [parity("Button", "ok")],
			readiness: { frameName: "Button / Primary", score: 60 },
			a11y: { modes: [{ mode: "light", passed: 8, failed: 2 }] },
			aliases: {
				Button: { frameName: "Button / Primary", contrastMode: "light" },
			},
		});
		const button = row(rows, "Button");
		// Same deductions as the heuristic case but joined by the explicit keys:
		// 100 − 12 − 10 = 78.
		expect(button?.healthScore).toBe(78);
	});

	it("sorts worst-health first, then component name ascending", () => {
		const rows = buildComponentHealth({
			parityRows: [
				parity("Zeta", "ok"), // 100
				parity("Alpha", "ok"), // 100
				parity("Beta", "missing-in-code"), // 70
			],
		});
		// Beta (70) first; then the two 100s tie-broken by name (Alpha < Zeta).
		expect(rows.map((r) => r.component)).toEqual(["Beta", "Alpha", "Zeta"]);
	});

	it("clamps healthScore to the 0–100 range", () => {
		const rows = buildComponentHealth({
			parityRows: [parity("Button", "missing-in-code")],
			libraryHealth: {
				overrideHotspots: [
					{ nodeId: "a", name: "x", componentName: "Button", overrideCount: 9 },
					{ nodeId: "b", name: "y", componentName: "Button", overrideCount: 9 },
					{ nodeId: "c", name: "z", componentName: "Button", overrideCount: 9 },
				],
				deprecatedUsage: [{ componentName: "Button", count: 9 }],
				detachedCandidates: [{ nodeId: "d", name: "Button", heuristic: true }],
			},
			readiness: { frameName: "Button", score: 0 },
			a11y: { modes: [{ mode: "Button", passed: 0, failed: 20 }] },
		});
		expect(row(rows, "Button")?.healthScore).toBe(0);
	});

	it("never throws on malformed input (skips bad rows)", () => {
		expect(() =>
			buildComponentHealth({
				parityRows: [
					// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
					{ component: 123, status: "ok" } as any,
					// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
					null as any,
					parity("Button", "ok"),
				],
				// biome-ignore lint/suspicious/noExplicitAny: malformed-tolerance test
				libraryHealth: { deprecatedUsage: [null] } as any,
			}),
		).not.toThrow();
		// The one valid row still rolls up.
		const rows = buildComponentHealth({
			parityRows: [parity("Button", "ok")],
		});
		expect(row(rows, "Button")).toBeDefined();
	});
});
