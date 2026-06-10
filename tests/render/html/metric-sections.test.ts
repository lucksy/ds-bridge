// M4.1 — Persona-wave metric HTML sections (C1). The targets section is gated
// by the caller-supplied selection; an included-but-absent/empty section keeps
// its shared empty-state, a populated one renders its real RAG status grid +
// band-key legend. These tests assert both quadrants against the real renderer
// and types. (M4.2 adds the remaining ten sections to this file.)
import { describe, expect, it } from "vitest";
import type {
	ReportData,
	TargetVerdict,
} from "../../../src/engines/report/types.js";
import { renderDashboard } from "../../../src/render/html/dashboard.js";

// C1 — Targets / SLAs section: a RAG status grid (one row per verdict) + a
// band-key legend. Selection gates inclusion; an included-but-empty section
// keeps its empty-state. These tests assert both quadrants against the real
// renderer and types.
describe("targetsSection — Targets / SLAs", () => {
	const base: ReportData = {
		generatedAt: "2026-06-09T00:00:00.000Z",
		project: "demo",
	};

	it("renders the title with the empty-state when selected but absent", () => {
		const html = renderDashboard(base, ["targets"]);
		expect(html).toMatch(/<h2>Targets \/ SLAs<\/h2>/);
		expect(html).toMatch(/No data yet/i);
		expect(html).toMatch(/ds-bridge report/); // empty-state run hint command
	});

	it("renders the title with the empty-state when selected but empty", () => {
		const html = renderDashboard({ ...base, targets: [] }, ["targets"]);
		expect(html).toMatch(/<h2>Targets \/ SLAs<\/h2>/);
		expect(html).toMatch(/No data yet/i);
	});

	it("renders the status-grid svg and legend with no empty-state when populated", () => {
		const targets: TargetVerdict[] = [
			{ metric: "adoption", measured: 82, target: 80, op: ">=", band: "green" },
			{ metric: "drift", measured: 5, target: 0, op: "<=", band: "red" },
			{
				metric: "parity",
				measured: undefined,
				target: 100,
				op: "==",
				band: "unknown",
			},
		];
		const html = renderDashboard({ ...base, targets }, ["targets"]);

		expect(html).toMatch(/<h2>Targets \/ SLAs<\/h2>/);
		expect(html).not.toMatch(/No data yet/i);
		// the new statusGrid chart is present
		expect(html).toMatch(/<svg\b/);
		expect(html).toMatch(/Status grid:/);
		// one band-colored pill per band (green / amber / red constants + neutral)
		expect(html).toMatch(/fill="#16a34a"/); // green
		expect(html).toMatch(/fill="#dc2626"/); // red
		// the unmeasured verdict reads as a dash, target+op text present
		expect(html).toMatch(/&#8212;|—/);
		expect(html).toMatch(/&gt;= 80|>= 80/);
		// band-key legend table
		expect(html).toMatch(/<th>Band<\/th>/);
		expect(html).toMatch(/meets target/);
	});
});
