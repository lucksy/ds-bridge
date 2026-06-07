// M0.2 — Presets + view resolution. Test-first: the five frozen persona
// presets (SPEC-measure §3) and resolveView's full precedence lattice —
// flags > project > default everything — plus both typed error shapes
// (conflicting-selection, unknown-view, unknown-artifact) and dedup notices
// are spec'd here before implementation.
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
	it("declares the five views with system-score FIRST in each, then the wave-1 contents (SPEC-score §3)", () => {
		expect(PRESETS.owner).toEqual([
			"system-score",
			"drift-trend",
			"parity",
			"a11y",
		]);
		expect(PRESETS.engineering).toEqual([
			"system-score",
			"lint-summary",
			"impact",
			"drift-trend",
		]);
		expect(PRESETS.design).toEqual([
			"system-score",
			"readiness",
			"a11y",
			"parity",
		]);
		expect(PRESETS.consumer).toEqual(["system-score", "parity", "impact"]);
	});

	it("defines `everything` as all seven artifacts in catalog order (system-score leads)", () => {
		expect(PRESETS.everything).toEqual([...ALL_ARTIFACT_IDS]);
		expect(PRESETS.everything[0]).toBe("system-score");
	});

	it("exports PRESET_NAMES as the five view names", () => {
		expect([...PRESET_NAMES].sort()).toEqual(
			["consumer", "design", "engineering", "everything", "owner"].sort(),
		);
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
		expect(outcome).toEqual({
			kind: "ok",
			artifacts: [...ALL_ARTIFACT_IDS],
			source: "default",
			viewName: "everything",
			notices: [],
		});
	});
});

describe("resolveView — precedence permutations", () => {
	it("flags view wins (flags-view)", () => {
		const outcome = resolveView({ view: "owner" }, {});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("flags");
			expect(outcome.viewName).toBe("owner");
			expect(outcome.artifacts).toEqual([
				"system-score",
				"drift-trend",
				"parity",
				"a11y",
			]);
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
		const outcome = resolveView({}, { view: "design" });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("project");
			expect(outcome.viewName).toBe("design");
			expect(outcome.artifacts).toEqual([
				"system-score",
				"readiness",
				"a11y",
				"parity",
			]);
		}
	});

	it("project artifacts apply when flags are empty (project-artifacts)", () => {
		const outcome = resolveView({}, { artifacts: ["impact"] });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("project");
			expect(outcome.viewName).toBeUndefined();
			expect(outcome.artifacts).toEqual(["impact"]);
		}
	});

	it("flags override project entirely (mixed flag-over-project)", () => {
		const outcome = resolveView(
			{ view: "consumer" },
			{ view: "owner", artifacts: ["a11y"] },
		);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("flags");
			expect(outcome.viewName).toBe("consumer");
			expect(outcome.artifacts).toEqual(["system-score", "parity", "impact"]);
		}
	});

	it("flags artifacts override a project view (mixed flag-artifacts-over-project-view)", () => {
		const outcome = resolveView(
			{ artifacts: ["readiness"] },
			{ view: "engineering" },
		);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind === "ok") {
			expect(outcome.source).toBe("flags");
			expect(outcome.viewName).toBeUndefined();
			expect(outcome.artifacts).toEqual(["readiness"]);
		}
	});
});

describe("resolveView — conflicting-selection error", () => {
	it("flags with both view and artifacts → typed error sourced to flags", () => {
		const outcome = resolveView({ view: "owner", artifacts: ["parity"] }, {});
		expect(outcome).toEqual({
			kind: "conflicting-selection",
			source: "flags",
		});
	});

	it("project with both view and artifacts → typed error sourced to project", () => {
		const outcome = resolveView({}, { view: "owner", artifacts: ["parity"] });
		expect(outcome).toEqual({
			kind: "conflicting-selection",
			source: "project",
		});
	});

	it("flags conflict takes precedence over a project conflict", () => {
		const outcome = resolveView(
			{ view: "owner", artifacts: ["parity"] },
			{ view: "design", artifacts: ["a11y"] },
		);
		expect(outcome.kind).toBe("conflicting-selection");
		if (outcome.kind === "conflicting-selection") {
			expect(outcome.source).toBe("flags");
		}
	});
});

describe("resolveView — unknown-view error", () => {
	it("unknown flag view → typed error carrying nearest preset suggestions", () => {
		const outcome = resolveView({ view: "ownerr" }, {});
		expect(outcome.kind).toBe("unknown-view");
		if (outcome.kind === "unknown-view") {
			expect(outcome.view).toBe("ownerr");
			expect(outcome.suggestions).toContain("owner");
		}
	});

	it("unknown project view → typed error", () => {
		const outcome = resolveView({}, { view: "desgin" });
		expect(outcome.kind).toBe("unknown-view");
		if (outcome.kind === "unknown-view") {
			expect(outcome.view).toBe("desgin");
			expect(outcome.suggestions).toContain("design");
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
		const outcome = resolveView({ view: "owner" }, {});
		if (outcome.kind === "ok") {
			expect(sources).toContain(outcome.source);
		}
	});
});
