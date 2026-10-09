// M6.1 — Presets + view resolution. The SEVEN views — the six clean persona
// names (`Persona == PresetName`) plus the default `everything` — each closing
// over its full intended set (SPEC-personas §3.2), projected from the catalog
// persona tags in catalog order. resolveView's full precedence lattice
// (flags > project > default everything), both typed error shapes
// (conflicting-selection, unknown-view, unknown-artifact), and dedup notices.
import { describe, expect, it } from "vitest";
import { ALL_ARTIFACT_IDS } from "../../../src/engines/report/catalog.js";
import {
	PRESET_NAMES,
	PRESETS,
	type PresetName,
	type ResolveSource,
	resolveView,
} from "../../../src/engines/report/presets.js";

describe("PRESETS", () => {
	it("declares the seven views with system-score FIRST in each", () => {
		for (const name of PRESET_NAMES) {
			expect(PRESETS[name][0]).toBe("system-score");
		}
	});

	it("ds-designer is its full §3.2 set in catalog order", () => {
		expect(PRESETS["ds-designer"]).toEqual([
			"system-score",
			"readiness",
			"parity",
			"a11y",
			"library-health",
			"parity-trend",
			"component-health",
			"library-health-trend",
			"data-freshness",
			"consistency",
			"design-debt",
			"library-hotspots-trend",
			"frame-readiness-trend",
			"handoff-pass-rate",
			"exceptions-review",
		]);
	});

	it("ds-manager is its full §3.2 set in catalog order", () => {
		expect(PRESETS["ds-manager"]).toEqual([
			"system-score",
			"drift-trend",
			"parity",
			"a11y",
			"adoption-trend",
			"import-coverage",
			"leaderboard",
			"library-health",
			"breaking-calendar",
			"targets",
			"parity-trend",
			"library-health-trend",
			"score-velocity",
			"ownership-leaderboard",
			"data-freshness",
			"consistency",
			"design-debt",
			"executive",
			"library-hotspots-trend",
			"handoff-pass-rate",
			"exceptions-review",
		]);
	});

	it("ds-engineer is its full §3.2 set in catalog order", () => {
		expect(PRESETS["ds-engineer"]).toEqual([
			"system-score",
			"drift-trend",
			"lint-summary",
			"parity",
			"a11y",
			"impact",
			"library-health",
			"targets",
			"parity-trend",
			"component-health",
			"migration-checklist",
			"release-readiness",
			"data-freshness",
			"consistency",
			"design-debt",
		]);
	});

	it("product-designer is its full §3.2 set in catalog order", () => {
		expect(PRESETS["product-designer"]).toEqual([
			"system-score",
			"readiness",
			"parity",
			"a11y",
			"library-health",
			"breaking-calendar",
			"change-frequency",
			"parity-trend",
			"component-health",
			"audience-changelog",
			"frame-implementability",
			"data-freshness",
			"frame-readiness-trend",
			"handoff-pass-rate",
		]);
	});

	it("product-manager is its full §3.2 set in catalog order", () => {
		expect(PRESETS["product-manager"]).toEqual([
			"system-score",
			"readiness",
			"parity",
			"adoption-trend",
			"import-coverage",
			"breaking-calendar",
			"change-frequency",
			"targets",
			"parity-trend",
			"score-velocity",
			"audience-changelog",
			"data-freshness",
			"consistency",
			"executive",
			"frame-readiness-trend",
			"handoff-pass-rate",
		]);
	});

	it("product-engineer is its full §3.2 set in catalog order", () => {
		expect(PRESETS["product-engineer"]).toEqual([
			"system-score",
			"lint-summary",
			"parity",
			"impact",
			"adoption-trend",
			"import-coverage",
			"leaderboard",
			"breaking-calendar",
			"targets",
			"parity-trend",
			"migration-checklist",
			"audience-changelog",
			"frame-implementability",
			"data-freshness",
		]);
	});

	it("defines `everything` as all thirty-one artifacts in catalog order (system-score leads)", () => {
		expect(PRESETS.everything).toEqual([...ALL_ARTIFACT_IDS]);
		expect(PRESETS.everything[0]).toBe("system-score");
		expect(PRESETS.everything).toHaveLength(31);
	});

	it("defines `exec` as the curated leadership view (SPEC-analytics §4 M-AN4)", () => {
		expect(PRESETS.exec).toEqual([
			"system-score",
			"executive",
			"adoption-trend",
			"targets",
			"breaking-calendar",
		]);
	});

	it("defines `org` as the curated per-repo drill-down of the org rollup (SPEC-rollup §4)", () => {
		expect(PRESETS.org).toEqual([
			"system-score",
			"score-velocity",
			"executive",
			"adoption-trend",
			"targets",
			"data-freshness",
		]);
	});

	it("flags view `org` resolves the curated org drill-down", () => {
		const outcome = resolveView({ view: "org" }, {});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.viewName).toBe("org");
			expect(outcome.artifacts).toEqual([...PRESETS.org]);
		}
	});

	it("exports PRESET_NAMES as the nine view names (six personas + everything + exec + org)", () => {
		expect([...PRESET_NAMES].sort()).toEqual(
			[
				"ds-designer",
				"ds-engineer",
				"ds-manager",
				"everything",
				"product-designer",
				"product-engineer",
				"product-manager",
				"exec",
				"org",
			].sort(),
		);
		// Persona presets first, then the three non-persona views.
		expect(PRESET_NAMES.slice(-3)).toEqual(["everything", "exec", "org"]);
	});

	it("references only real catalog artifact ids in every preset", () => {
		for (const name of PRESET_NAMES) {
			for (const id of PRESETS[name]) {
				expect(ALL_ARTIFACT_IDS).toContain(id);
			}
		}
	});
});

describe("resolveView — default", () => {
	it("falls back to everything (catalog order) when neither source selects", () => {
		const outcome = resolveView({}, {});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("default");
			expect(outcome.viewName).toBe("everything");
			expect(outcome.artifacts).toEqual([...ALL_ARTIFACT_IDS]);
		}
	});
});

describe("resolveView — precedence permutations", () => {
	it("flags view `exec` resolves the curated leadership view", () => {
		const outcome = resolveView({ view: "exec" }, {});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("flags");
			expect(outcome.viewName).toBe("exec");
			expect(outcome.artifacts).toEqual([...PRESETS.exec]);
		}
	});

	it("project view `exec` applies when flags are empty", () => {
		const outcome = resolveView({}, { view: "exec" });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("project");
			expect(outcome.artifacts[1]).toBe("executive");
		}
	});

	it("flags view wins (flags-view)", () => {
		const outcome = resolveView({ view: "ds-manager" }, {});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("flags");
			expect(outcome.viewName).toBe("ds-manager");
			expect(outcome.artifacts).toEqual([...PRESETS["ds-manager"]]);
		}
	});

	it("flags artifacts win (flags-artifacts) and carry no viewName", () => {
		const outcome = resolveView({ artifacts: ["parity", "a11y"] }, {});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("flags");
			expect(outcome.viewName).toBeUndefined();
			expect(outcome.artifacts).toEqual(["parity", "a11y"]);
		}
	});

	it("project view applies when flags are empty (project-view)", () => {
		const outcome = resolveView({}, { view: "ds-designer" });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("project");
			expect(outcome.viewName).toBe("ds-designer");
			expect(outcome.artifacts).toEqual([...PRESETS["ds-designer"]]);
		}
	});

	it("project artifacts apply when flags are empty (project-artifacts)", () => {
		const outcome = resolveView({}, { artifacts: ["impact"] });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("project");
			expect(outcome.artifacts).toEqual(["impact"]);
		}
	});

	it("flags override project entirely (mixed flag-over-project)", () => {
		const outcome = resolveView(
			{ view: "product-manager" },
			{ view: "ds-manager", artifacts: ["a11y"] },
		);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("flags");
			expect(outcome.viewName).toBe("product-manager");
			expect(outcome.artifacts).toEqual([...PRESETS["product-manager"]]);
		}
	});

	it("flags artifacts override a project view (mixed flag-artifacts-over-project-view)", () => {
		const outcome = resolveView(
			{ artifacts: ["parity"] },
			{ view: "ds-engineer" },
		);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("flags");
			expect(outcome.viewName).toBeUndefined();
			expect(outcome.artifacts).toEqual(["parity"]);
		}
	});
});

describe("resolveView — conflicting-selection error", () => {
	it("flags with both view and artifacts → typed error sourced to flags", () => {
		const outcome = resolveView(
			{ view: "ds-manager", artifacts: ["parity"] },
			{},
		);
		expect(outcome.kind).toBe("conflicting-selection");
		if (outcome.kind === "conflicting-selection") {
			expect(outcome.source).toBe("flags");
		}
	});

	it("project with both view and artifacts → typed error sourced to project", () => {
		const outcome = resolveView(
			{},
			{ view: "ds-manager", artifacts: ["parity"] },
		);
		expect(outcome.kind).toBe("conflicting-selection");
		if (outcome.kind === "conflicting-selection") {
			expect(outcome.source).toBe("project");
		}
	});

	it("flags conflict takes precedence over a project conflict", () => {
		const outcome = resolveView(
			{ view: "ds-manager", artifacts: ["parity"] },
			{ view: "ds-designer", artifacts: ["a11y"] },
		);
		expect(outcome.kind).toBe("conflicting-selection");
		if (outcome.kind === "conflicting-selection") {
			expect(outcome.source).toBe("flags");
		}
	});
});

describe("resolveView — unknown-view error", () => {
	it("unknown flag view → typed error carrying nearest preset suggestions", () => {
		const outcome = resolveView({ view: "ds-managerr" }, {});
		expect(outcome.kind).toBe("unknown-view");
		if (outcome.kind === "unknown-view") {
			expect(outcome.view).toBe("ds-managerr");
			expect(outcome.suggestions).toContain("ds-manager");
		}
	});

	it("unknown project view → typed error", () => {
		const outcome = resolveView({}, { view: "ds-designe" });
		expect(outcome.kind).toBe("unknown-view");
		if (outcome.kind === "unknown-view") {
			expect(outcome.view).toBe("ds-designe");
			expect(outcome.suggestions).toContain("ds-designer");
		}
	});

	it("suggestions are drawn only from preset names, not artifact ids", () => {
		const outcome = resolveView({ view: "everythin" }, {});
		expect(outcome.kind).toBe("unknown-view");
		if (outcome.kind === "unknown-view") {
			for (const suggestion of outcome.suggestions) {
				expect(PRESET_NAMES).toContain(suggestion as PresetName);
			}
			expect(outcome.suggestions).toContain("everything");
		}
	});

	it("a wildly unrelated view yields no suggestions", () => {
		const outcome = resolveView({ view: "zzzzzzzzzz" }, {});
		expect(outcome.kind).toBe("unknown-view");
		if (outcome.kind === "unknown-view") {
			expect(outcome.suggestions).toEqual([]);
		}
	});
});

describe("resolveView — unknown-artifact error", () => {
	it("unknown flag artifact id → typed error carrying catalog suggestions", () => {
		const outcome = resolveView({ artifacts: ["parityy"] }, {});
		expect(outcome.kind).toBe("unknown-artifact");
		if (outcome.kind === "unknown-artifact") {
			expect(outcome.id).toBe("parityy");
			expect(outcome.suggestions).toContain("parity");
		}
	});

	it("unknown project artifact id → typed error", () => {
		const outcome = resolveView({}, { artifacts: ["a11yy"] });
		expect(outcome.kind).toBe("unknown-artifact");
		if (outcome.kind === "unknown-artifact") {
			expect(outcome.id).toBe("a11yy");
			expect(outcome.suggestions).toContain("a11y");
		}
	});

	it("reports the FIRST unknown id when a list mixes valid and invalid", () => {
		const outcome = resolveView({ artifacts: ["parity", "nope", "a11y"] }, {});
		expect(outcome.kind).toBe("unknown-artifact");
		if (outcome.kind === "unknown-artifact") {
			expect(outcome.id).toBe("nope");
		}
	});
});

describe("resolveView — duplicate dedup with notice", () => {
	it("dedupes a custom flag list, preserving first-seen order, and notices it", () => {
		const outcome = resolveView(
			{ artifacts: ["parity", "a11y", "parity"] },
			{},
		);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.artifacts).toEqual(["parity", "a11y"]);
			expect(outcome.notices.length).toBeGreaterThan(0);
			expect(outcome.notices.some((n) => /duplicate/i.test(n))).toBe(true);
		}
	});

	it("dedupes a project list too", () => {
		const outcome = resolveView(
			{},
			{ artifacts: ["impact", "impact", "parity"] },
		);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("project");
			expect(outcome.artifacts).toEqual(["impact", "parity"]);
			expect(outcome.notices.some((n) => /duplicate/i.test(n))).toBe(true);
		}
	});

	it("emits no notice when a custom list has no duplicates", () => {
		const outcome = resolveView({ artifacts: ["parity", "a11y"] }, {});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.notices).toEqual([]);
		}
	});
});

describe("ResolveSource type", () => {
	it("the success source is one of the three documented values", () => {
		const sources: ResolveSource[] = ["flags", "project", "default"];
		const outcome = resolveView({ view: "ds-manager" }, {});
		if (outcome.kind === "ok") {
			expect(sources).toContain(outcome.source);
		}
	});
});
