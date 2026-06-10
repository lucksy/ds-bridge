// C13 / M3.7 — release-readiness engine. Test-first: a pure composition of the
// latest persisted signals (impact / drift / parity) into a go/no-go rollup with
// a per-gate checklist. Pure: signals in → ReleaseReadiness out. No
// fs/clock/network; deterministic; never throws. A gate whose signal is ABSENT
// is an insufficient-data check (pass:false) — `go` is NEVER true when a required
// signal is missing.
import { describe, expect, it } from "vitest";
import {
	evaluateReleaseReadiness,
	type ReleaseSignals,
} from "../../../src/engines/report/release-readiness.js";

/** A fully-clean signal set (all gates would pass). */
const allClean: ReleaseSignals = {
	impact: { breaking: 0 },
	drift: { stale: 0, missing: 0 },
	parity: { missingInCode: 0, missingInFigma: 0, total: 4 },
};

describe("evaluateReleaseReadiness", () => {
	it("all gates present and clean → go", () => {
		const r = evaluateReleaseReadiness(allClean);
		expect(r.go).toBe(true);
		expect(r.checks.map((c) => c.name)).toEqual(["impact", "drift", "parity"]);
		expect(r.checks.every((c) => c.pass)).toBe(true);
	});

	it("a breaking impact change fails the impact gate → no-go", () => {
		const r = evaluateReleaseReadiness({
			...allClean,
			impact: { breaking: 2 },
		});
		expect(r.go).toBe(false);
		const impact = r.checks.find((c) => c.name === "impact");
		expect(impact?.pass).toBe(false);
		expect(impact?.detail).toContain("2");
	});

	it("a stale token fails the drift gate → no-go", () => {
		const r = evaluateReleaseReadiness({
			...allClean,
			drift: { stale: 3, missing: 0 },
		});
		expect(r.go).toBe(false);
		expect(r.checks.find((c) => c.name === "drift")?.pass).toBe(false);
	});

	it("a missing token fails the drift gate → no-go", () => {
		const r = evaluateReleaseReadiness({
			...allClean,
			drift: { stale: 0, missing: 5 },
		});
		expect(r.go).toBe(false);
		expect(r.checks.find((c) => c.name === "drift")?.pass).toBe(false);
	});

	it("a missing-in-code component fails the parity gate → no-go", () => {
		const r = evaluateReleaseReadiness({
			...allClean,
			parity: { missingInCode: 1, missingInFigma: 0, total: 4 },
		});
		expect(r.go).toBe(false);
		expect(r.checks.find((c) => c.name === "parity")?.pass).toBe(false);
	});

	it("a missing-in-figma component fails the parity gate → no-go", () => {
		const r = evaluateReleaseReadiness({
			...allClean,
			parity: { missingInCode: 0, missingInFigma: 2, total: 4 },
		});
		expect(r.go).toBe(false);
		expect(r.checks.find((c) => c.name === "parity")?.pass).toBe(false);
	});

	it("a parity signal with total 0 is insufficient → its gate fails → no-go", () => {
		const r = evaluateReleaseReadiness({
			...allClean,
			parity: { missingInCode: 0, missingInFigma: 0, total: 0 },
		});
		expect(r.go).toBe(false);
		const parity = r.checks.find((c) => c.name === "parity");
		expect(parity?.pass).toBe(false);
		expect(parity?.detail).toContain("no parity data");
	});

	it("an ABSENT impact signal is an insufficient-data check → no-go", () => {
		const { impact, ...rest } = allClean;
		void impact;
		const r = evaluateReleaseReadiness(rest);
		expect(r.go).toBe(false);
		const check = r.checks.find((c) => c.name === "impact");
		expect(check?.pass).toBe(false);
		expect(check?.detail).toContain("no impact data");
	});

	it("an ABSENT drift signal is an insufficient-data check → no-go", () => {
		const { drift, ...rest } = allClean;
		void drift;
		const r = evaluateReleaseReadiness(rest);
		expect(r.go).toBe(false);
		expect(r.checks.find((c) => c.name === "drift")?.detail).toContain(
			"no drift data",
		);
	});

	it("an ABSENT parity signal is an insufficient-data check → no-go", () => {
		const { parity, ...rest } = allClean;
		void parity;
		const r = evaluateReleaseReadiness(rest);
		expect(r.go).toBe(false);
		expect(r.checks.find((c) => c.name === "parity")?.detail).toContain(
			"no parity data",
		);
	});

	it("an empty signal set → all gates insufficient → no-go with three checks", () => {
		const r = evaluateReleaseReadiness({});
		expect(r.go).toBe(false);
		expect(r.checks).toHaveLength(3);
		expect(r.checks.every((c) => !c.pass)).toBe(true);
	});

	it("never throws and stays deterministic on a partial signal set", () => {
		expect(() =>
			evaluateReleaseReadiness({ impact: { breaking: 0 } }),
		).not.toThrow();
		const r = evaluateReleaseReadiness({ impact: { breaking: 0 } });
		// impact passes, drift + parity insufficient → no-go.
		expect(r.checks.find((c) => c.name === "impact")?.pass).toBe(true);
		expect(r.go).toBe(false);
	});
});
