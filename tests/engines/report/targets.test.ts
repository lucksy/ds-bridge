// C1 / M3.1 — targets RAG engine. Test-first: a pure derivation that compares
// each configured metric's measured scalar against its {op, value, warn?} goal
// and bands it green/amber/red — or `unknown` when the metric was never measured
// (NEVER a misleading red). Absent config → empty []. No fs/clock/network.
import { describe, expect, it } from "vitest";
import type { MetricTargets } from "../../../src/config.js";
import { evaluateTargets } from "../../../src/engines/report/targets.js";

describe("evaluateTargets", () => {
	it("returns [] when no targets are configured", () => {
		expect(evaluateTargets({}, {})).toEqual([]);
		expect(evaluateTargets({ "on-system": 90 }, {})).toEqual([]);
	});

	it("bands a satisfied >= target green", () => {
		const targets: MetricTargets = { "on-system": { op: ">=", value: 90 } };
		expect(evaluateTargets({ "on-system": 95 }, targets)).toEqual([
			{
				metric: "on-system",
				measured: 95,
				target: 90,
				op: ">=",
				band: "green",
			},
		]);
	});

	it("bands a >= target exactly at the boundary green (>= is inclusive)", () => {
		const targets: MetricTargets = { "on-system": { op: ">=", value: 90 } };
		const [verdict] = evaluateTargets({ "on-system": 90 }, targets);
		expect(verdict?.band).toBe("green");
	});

	it("bands a satisfied <= target green and a violated one red", () => {
		const targets: MetricTargets = { drift: { op: "<=", value: 0 } };
		expect(evaluateTargets({ drift: 0 }, targets)[0]?.band).toBe("green");
		expect(evaluateTargets({ drift: 5 }, targets)[0]?.band).toBe("red");
	});

	it("bands an == target green only on an exact match", () => {
		const targets: MetricTargets = { drift: { op: "==", value: 0 } };
		expect(evaluateTargets({ drift: 0 }, targets)[0]?.band).toBe("green");
		// value 0 → 10% margin collapses to 0, so any non-zero is red (not amber).
		expect(evaluateTargets({ drift: 1 }, targets)[0]?.band).toBe("red");
	});

	it("bands an == target within the default 10% margin amber, outside it red", () => {
		const targets: MetricTargets = { parity: { op: "==", value: 100 } };
		// 10% of 100 = 10 → within [90, 110] but not exactly 100 → amber.
		expect(evaluateTargets({ parity: 95 }, targets)[0]?.band).toBe("amber");
		expect(evaluateTargets({ parity: 105 }, targets)[0]?.band).toBe("amber");
		// Outside the margin → red.
		expect(evaluateTargets({ parity: 80 }, targets)[0]?.band).toBe("red");
	});

	it("bands a >= target within the default 10% margin on the failing side amber", () => {
		const targets: MetricTargets = { parity: { op: ">=", value: 100 } };
		// 10% of 100 = 10 → amber floor 90. 92 fails >= 100 but >= 90 → amber.
		expect(evaluateTargets({ parity: 92 }, targets)[0]?.band).toBe("amber");
		// At the amber floor exactly → still amber (inclusive).
		expect(evaluateTargets({ parity: 90 }, targets)[0]?.band).toBe("amber");
		// Below the amber floor → red.
		expect(evaluateTargets({ parity: 89 }, targets)[0]?.band).toBe("red");
	});

	it("bands a <= target within the default 10% margin on the failing side amber", () => {
		const targets: MetricTargets = { drift: { op: "<=", value: 10 } };
		// 10% of 10 = 1 → amber ceiling 11. 11 fails <= 10 but <= 11 → amber.
		expect(evaluateTargets({ drift: 11 }, targets)[0]?.band).toBe("amber");
		// Above the amber ceiling → red.
		expect(evaluateTargets({ drift: 12 }, targets)[0]?.band).toBe("red");
	});

	it("honors an explicit warn threshold over the default margin (>=)", () => {
		const targets: MetricTargets = {
			"on-system": { op: ">=", value: 90, warn: 80 },
		};
		// green at/above 90, amber in [80, 90), red below 80.
		expect(evaluateTargets({ "on-system": 90 }, targets)[0]?.band).toBe(
			"green",
		);
		expect(evaluateTargets({ "on-system": 85 }, targets)[0]?.band).toBe(
			"amber",
		);
		expect(evaluateTargets({ "on-system": 80 }, targets)[0]?.band).toBe(
			"amber",
		);
		expect(evaluateTargets({ "on-system": 79 }, targets)[0]?.band).toBe("red");
	});

	it("honors an explicit warn threshold over the default margin (<=)", () => {
		const targets: MetricTargets = { drift: { op: "<=", value: 0, warn: 3 } };
		// green at/below 0, amber in (0, 3], red above 3.
		expect(evaluateTargets({ drift: 0 }, targets)[0]?.band).toBe("green");
		expect(evaluateTargets({ drift: 3 }, targets)[0]?.band).toBe("amber");
		expect(evaluateTargets({ drift: 4 }, targets)[0]?.band).toBe("red");
	});

	it("bands an absent measured value unknown — NEVER red", () => {
		const targets: MetricTargets = {
			parity: { op: ">=", value: 100 },
			drift: { op: "==", value: 0 },
		};
		const verdicts = evaluateTargets({ parity: undefined }, targets);
		const byMetric = new Map(verdicts.map((v) => [v.metric, v]));
		expect(byMetric.get("parity")?.band).toBe("unknown");
		expect(byMetric.get("parity")?.measured).toBeUndefined();
		// drift was never supplied at all → also unknown, never red.
		expect(byMetric.get("drift")?.band).toBe("unknown");
		expect(byMetric.get("drift")?.measured).toBeUndefined();
	});

	it("emits one verdict per configured metric, carrying op + target verbatim", () => {
		const targets: MetricTargets = {
			"system-score": { op: ">=", value: 80 },
			contrast: { op: ">=", value: 100 },
		};
		const verdicts = evaluateTargets(
			{ "system-score": 76, contrast: 100 },
			targets,
		);
		expect(verdicts).toHaveLength(2);
		const score = verdicts.find((v) => v.metric === "system-score");
		expect(score).toEqual({
			metric: "system-score",
			measured: 76,
			target: 80,
			op: ">=",
			band: "amber",
		});
		const contrast = verdicts.find((v) => v.metric === "contrast");
		expect(contrast?.band).toBe("green");
	});
});
