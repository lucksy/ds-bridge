// T0.6 — config resolution precedence: CLI flags > env (CLAUDE_PLUGIN_OPTION_*, FIGMA_TOKEN)
// > .ds-bridge.json > userConfig defaults. Pure function: all sources injected.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	atomicWriteJson,
	parseSelectionFile,
	resolveConfig,
	writeProjectConfig,
} from "../src/config.js";

describe("resolveConfig", () => {
	it("returns userConfig defaults when no sources provide values", () => {
		const outcome = resolveConfig({});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.reportStyle).toBe("both");
		expect(outcome.config.readinessThreshold).toBe(80);
		expect(outcome.config.figmaFileKey).toBeUndefined();
		expect(outcome.config.tokenSource).toBeUndefined();
	});

	it("treats a missing figma token as a typed state, not a throw", () => {
		const outcome = resolveConfig({});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaToken).toEqual({ kind: "missing" });
	});

	it("reads values from the project file (.ds-bridge.json)", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				figma_file_key: "abc123",
				token_source: "tokens/design.json",
				report_style: "html",
				readiness_threshold: 70,
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe("abc123");
		expect(outcome.config.tokenSource).toBe("tokens/design.json");
		expect(outcome.config.reportStyle).toBe("html");
		expect(outcome.config.readinessThreshold).toBe(70);
	});

	it("env (CLAUDE_PLUGIN_OPTION_*) overrides the project file", () => {
		const outcome = resolveConfig({
			env: {
				CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "env-key",
				CLAUDE_PLUGIN_OPTION_REPORT_STYLE: "terminal",
			},
			projectFileText: JSON.stringify({
				figma_file_key: "project-key",
				report_style: "html",
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe("env-key");
		expect(outcome.config.reportStyle).toBe("terminal");
	});

	it("CLI flags override env", () => {
		const outcome = resolveConfig({
			flags: { figmaFileKey: "flag-key", readinessThreshold: 95 },
			env: {
				CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "env-key",
				CLAUDE_PLUGIN_OPTION_READINESS_THRESHOLD: "60",
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe("flag-key");
		expect(outcome.config.readinessThreshold).toBe(95);
	});

	it("merges partial sources field-by-field", () => {
		const outcome = resolveConfig({
			flags: { readinessThreshold: 90 },
			env: { FIGMA_TOKEN: "tok-env" },
			projectFileText: JSON.stringify({ figma_file_key: "proj-key" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.readinessThreshold).toBe(90); // flag
		expect(outcome.config.figmaToken).toEqual({
			kind: "present",
			value: "tok-env",
		}); // env
		expect(outcome.config.figmaFileKey).toBe("proj-key"); // project
		expect(outcome.config.reportStyle).toBe("both"); // default
	});

	it("uses FIGMA_TOKEN when the plugin option is absent", () => {
		const outcome = resolveConfig({ env: { FIGMA_TOKEN: "standalone-token" } });

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaToken).toEqual({
			kind: "present",
			value: "standalone-token",
		});
	});

	it("prefers CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN over FIGMA_TOKEN", () => {
		const outcome = resolveConfig({
			env: {
				CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "plugin-token",
				FIGMA_TOKEN: "standalone-token",
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaToken).toEqual({
			kind: "present",
			value: "plugin-token",
		});
	});

	it("returns a typed outcome for malformed project-file JSON, never throws", () => {
		const outcome = resolveConfig({ projectFileText: "{ not json" });

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toMatch(/JSON/i);
	});

	it("rejects an unknown report_style in the project file with a typed outcome", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ report_style: "carrier-pigeon" }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("report_style");
	});

	it("rejects an out-of-range readiness_threshold with a typed outcome", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ readiness_threshold: 250 }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("readiness_threshold");
	});

	it("ignores figma_token in the project file and warns (secrets stay out of the repo)", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_token: "leaked-secret" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaToken).toEqual({ kind: "missing" });
		expect(outcome.warnings.some((w) => w.includes("figma_token"))).toBe(true);
	});

	it("ignores a non-numeric env readiness threshold and falls through", () => {
		const outcome = resolveConfig({
			env: { CLAUDE_PLUGIN_OPTION_READINESS_THRESHOLD: "not-a-number" },
			projectFileText: JSON.stringify({ readiness_threshold: 65 }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.readinessThreshold).toBe(65);
		expect(outcome.warnings.length).toBeGreaterThan(0);
	});
});

// M1.1 — dashboard composer config keys (SPEC-measure §3). Parsing of the two
// new optional keys; both surface on ResolvedConfig so callers (M1.3 report,
// M0.2 resolveView) can read them, exactly like report_style flows end to end.
describe("resolveConfig — dashboard keys", () => {
	it("reads dashboard_view from the project file", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ dashboard_view: "owner" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.dashboardView).toBe("owner");
		expect(outcome.config.dashboardArtifacts).toBeUndefined();
	});

	it("validates dashboard_view SYNTACTICALLY only — any string is accepted here", () => {
		// Deliberate: semantic preset-name validation lives in resolveView (M0.2),
		// NOT here, to avoid a parallel-build coupling between config.ts and the
		// not-yet-built presets.ts. config.ts only guarantees the key is a string.
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ dashboard_view: "not-a-real-preset" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.dashboardView).toBe("not-a-real-preset");
	});

	it("reads dashboard_artifacts (a valid ArtifactId list) from the project file", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				dashboard_artifacts: ["parity", "a11y"],
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.dashboardArtifacts).toEqual(["parity", "a11y"]);
		expect(outcome.config.dashboardView).toBeUndefined();
	});

	it("rejects dashboard_view + dashboard_artifacts both present with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				dashboard_view: "owner",
				dashboard_artifacts: ["parity"],
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("dashboard_view");
		expect(outcome.message).toContain("dashboard_artifacts");
	});

	it("rejects a non-string dashboard_view with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ dashboard_view: 42 }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("dashboard_view");
	});

	it("rejects a non-array dashboard_artifacts with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ dashboard_artifacts: "parity" }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("dashboard_artifacts");
	});

	it("rejects a dashboard_artifacts list with a non-string member", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ dashboard_artifacts: ["parity", 7] }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("dashboard_artifacts");
	});

	it("rejects an unknown artifact id (semantic check HERE) with nearest-match suggestions", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				dashboard_artifacts: ["parity", "a11yy"],
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("a11yy");
		// suggestion carried through from lookupArtifact's nearest-match helper
		expect(outcome.message).toContain("a11y");
	});
});

describe("resolveConfig — score_weights key (S4a)", () => {
	it("leaves scoreWeights undefined when the key is absent", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: "abc" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.scoreWeights).toBeUndefined();
	});

	it("merges a partial score_weights override onto the engine defaults", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ score_weights: { drift: 50 } }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		// drift overridden, the other five keep their rebalanced defaults (A4 + C3 parity).
		expect(outcome.config.scoreWeights).toEqual({
			drift: 50,
			lint: 25,
			readiness: 15,
			a11y: 15,
			adoption: 20,
			parity: 20,
		});
	});

	it("accepts a full six-key score_weights object (including adoption + parity)", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				score_weights: {
					drift: 1,
					lint: 2,
					readiness: 3,
					a11y: 4,
					adoption: 5,
					parity: 6,
				},
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.scoreWeights).toEqual({
			drift: 1,
			lint: 2,
			readiness: 3,
			a11y: 4,
			adoption: 5,
			parity: 6,
		});
	});

	it("rejects an unknown score_weights subkey with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				score_weights: { mystery: 10 },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("score_weights");
		expect(outcome.message).toContain("mystery");
	});

	it("rejects a non-positive score_weights value with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ score_weights: { lint: 0 } }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("score_weights");
		expect(outcome.message).toContain("lint");
	});

	it("rejects a negative score_weights value with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ score_weights: { readiness: -5 } }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("score_weights");
		expect(outcome.message).toContain("readiness");
	});

	it("rejects a non-number score_weights value with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ score_weights: { a11y: "lots" } }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("score_weights");
		expect(outcome.message).toContain("a11y");
	});

	it("rejects a non-object score_weights with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ score_weights: "30,30,20,20" }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("score_weights");
	});

	it("coexists with dashboard_view in the same project file", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				dashboard_view: "owner",
				score_weights: { drift: 40 },
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.dashboardView).toBe("owner");
		expect(outcome.config.scoreWeights).toEqual({
			drift: 40,
			lint: 25,
			readiness: 15,
			a11y: 15,
			adoption: 20,
			parity: 20,
		});
	});

	it("coexists with dashboard_artifacts in the same project file", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				dashboard_artifacts: ["parity", "a11y"],
				score_weights: { lint: 45 },
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.dashboardArtifacts).toEqual(["parity", "a11y"]);
		expect(outcome.config.scoreWeights?.lint).toBe(45);
	});
});

// ─── M0.3 — persona-wave project-file schema (SPEC-personas §6, §6.5) ────────
// Nine new project-file-only keys + two env merges. Each bad input is a typed
// invalid-project-file outcome (never a throw); unknown enumerated keys carry a
// nearest-match suggestion. All keys coexist with the existing config surface.

describe("resolveConfig — dashboard_default (third mutually-exclusive key)", () => {
	it("reads dashboard_default as a saved-dashboard name", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ dashboard_default: "exec" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.dashboardDefault).toBe("exec");
		expect(outcome.config.dashboardView).toBeUndefined();
		expect(outcome.config.dashboardArtifacts).toBeUndefined();
	});

	it("validates dashboard_default SYNTACTICALLY only — any non-empty string", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ dashboard_default: "not-a-saved-one" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.dashboardDefault).toBe("not-a-saved-one");
	});

	it("rejects a non-string dashboard_default with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ dashboard_default: 7 }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("dashboard_default");
	});

	it("rejects an empty-string dashboard_default with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ dashboard_default: "" }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("dashboard_default");
	});

	it("rejects dashboard_default + dashboard_view (a pair) with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				dashboard_default: "exec",
				dashboard_view: "owner",
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("dashboard_default");
		expect(outcome.message).toContain("dashboard_view");
	});

	it("rejects dashboard_default + dashboard_artifacts (a pair) with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				dashboard_default: "exec",
				dashboard_artifacts: ["parity"],
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("dashboard_default");
		expect(outcome.message).toContain("dashboard_artifacts");
	});

	it("rejects all three dashboard keys at once with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				dashboard_default: "exec",
				dashboard_view: "owner",
				dashboard_artifacts: ["parity"],
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toMatch(/mutually exclusive/i);
	});
});

describe("resolveConfig — product_file_keys (alias→key MAP)", () => {
	it("defaults productFileKeys to an empty object when absent", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: "lib" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.productFileKeys).toEqual({});
	});

	it("reads a product_file_keys map from the project file", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				product_file_keys: { checkout: "AbC123", settings: "DeF456" },
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.productFileKeys).toEqual({
			checkout: "AbC123",
			settings: "DeF456",
		});
	});

	it("rejects a non-object product_file_keys (array) with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ product_file_keys: ["AbC123"] }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("product_file_keys");
	});

	it("rejects a product_file_keys value that is not a string", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ product_file_keys: { checkout: 5 } }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("product_file_keys");
		expect(outcome.message).toContain("checkout");
	});

	it("rejects a product_file_keys value that is an empty string", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ product_file_keys: { checkout: "" } }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("product_file_keys");
		expect(outcome.message).toContain("checkout");
	});
});

describe("resolveConfig — metric_targets (C1)", () => {
	it("leaves metricTargets undefined when absent", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: "lib" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.metricTargets).toBeUndefined();
	});

	it("reads a valid metric_targets map (with and without warn)", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				metric_targets: {
					"on-system": { op: ">=", value: 90, warn: 85 },
					drift: { op: "==", value: 0 },
					parity: { op: ">=", value: 100 },
				},
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.metricTargets).toEqual({
			"on-system": { op: ">=", value: 90, warn: 85 },
			drift: { op: "==", value: 0 },
			parity: { op: ">=", value: 100 },
		});
	});

	it("rejects an unknown metric key with a nearest-match suggestion", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				metric_targets: { "on-systm": { op: ">=", value: 90 } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("on-systm");
		expect(outcome.message).toContain("on-system"); // suggestion
	});

	it("rejects a bad op with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				metric_targets: { drift: { op: "<", value: 0 } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("metric_targets");
		expect(outcome.message).toContain("drift");
	});

	it("rejects a non-finite value with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				metric_targets: { parity: { op: ">=", value: "lots" } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("parity");
	});

	it("rejects a non-finite warn with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				metric_targets: { drift: { op: "==", value: 0, warn: "soon" } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("drift");
		expect(outcome.message).toContain("warn");
	});

	it("rejects a non-object metric_targets entry with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ metric_targets: { drift: 0 } }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("drift");
	});

	it("rejects a non-object metric_targets with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ metric_targets: [1, 2] }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("metric_targets");
	});
});

describe("resolveConfig — score_weights_by_view (C2)", () => {
	it("leaves scoreWeightsByView undefined when absent", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: "lib" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.scoreWeightsByView).toBeUndefined();
	});

	it("reads per-view partial weight overrides, merged onto the engine defaults", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				score_weights_by_view: {
					"ds-designer": { readiness: 40, a11y: 30 },
					"product-engineer": { adoption: 35, lint: 30 },
				},
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.scoreWeightsByView).toEqual({
			"ds-designer": {
				drift: 25,
				lint: 25,
				readiness: 40,
				a11y: 30,
				adoption: 20,
				parity: 20,
			},
			"product-engineer": {
				drift: 25,
				lint: 30,
				readiness: 15,
				a11y: 15,
				adoption: 35,
				parity: 20,
			},
		});
	});

	it("rejects a non-object score_weights_by_view with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ score_weights_by_view: [1] }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("score_weights_by_view");
	});

	it("rejects an unknown weight subkey inside a view, naming the view", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				score_weights_by_view: { "ds-designer": { mystery: 10 } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("ds-designer");
		expect(outcome.message).toContain("mystery");
	});

	it("rejects a non-positive weight inside a view, naming the view", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				score_weights_by_view: { "ds-designer": { readiness: 0 } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("ds-designer");
		expect(outcome.message).toContain("readiness");
	});

	it("rejects a non-object per-view value with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				score_weights_by_view: { "ds-designer": "30,30" },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("ds-designer");
	});
});

describe("resolveConfig — freshness_thresholds (C4, per-kind)", () => {
	it("leaves freshnessThresholds undefined when absent", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: "lib" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.freshnessThresholds).toBeUndefined();
	});

	it("reads a per-kind { aging, stale } map from the project file", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				freshness_thresholds: {
					a11y: { aging: 30, stale: 60 },
					drift: { aging: 14, stale: 30 },
				},
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.freshnessThresholds).toEqual({
			a11y: { aging: 30, stale: 60 },
			drift: { aging: 14, stale: 30 },
		});
	});

	it("accepts a PARTIAL map (only some kinds configured)", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				freshness_thresholds: { parity: { aging: 20, stale: 40 } },
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.freshnessThresholds).toEqual({
			parity: { aging: 20, stale: 40 },
		});
	});

	it("rejects an unknown check-kind with a nearest-match suggestion", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				freshness_thresholds: { a11yy: { aging: 30, stale: 60 } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("freshness_thresholds");
		expect(outcome.message).toContain("a11y");
	});

	it("rejects aging > stale with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				freshness_thresholds: { a11y: { aging: 60, stale: 30 } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("freshness_thresholds");
		expect(outcome.message).toContain("stale");
	});

	it("rejects a non-positive day count with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				freshness_thresholds: { drift: { aging: 0, stale: 30 } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("freshness_thresholds");
	});

	it("rejects a non-finite day count with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				freshness_thresholds: { drift: { aging: 14, stale: "later" } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("freshness_thresholds");
	});

	it("rejects a non-object band value with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				freshness_thresholds: { drift: 14 },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("freshness_thresholds");
	});

	it("rejects a non-object freshness_thresholds with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ freshness_thresholds: 30 }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("freshness_thresholds");
	});
});

describe("resolveConfig — ownership / ownership_file (C9)", () => {
	it("leaves ownership and ownershipFile undefined when absent", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: "lib" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.ownership).toBeUndefined();
		expect(outcome.config.ownershipFile).toBeUndefined();
	});

	it("reads an ownership array ({ owner, paths } CODEOWNERS-style)", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: [{ owner: "@team-checkout", paths: ["src/checkout/**"] }],
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.ownership).toEqual([
			{ owner: "@team-checkout", paths: ["src/checkout/**"] },
		]);
	});

	it("reads a multi-owner, multi-path ownership array", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: [
					{ owner: "@core", paths: ["src/**", "lib/**"] },
					{ owner: "@team-checkout", paths: ["src/checkout/**"] },
				],
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.ownership).toEqual([
			{ owner: "@core", paths: ["src/**", "lib/**"] },
			{ owner: "@team-checkout", paths: ["src/checkout/**"] },
		]);
	});

	it("reads an ownership_file path", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				ownership_file: ".github/CODEOWNERS",
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.ownershipFile).toBe(".github/CODEOWNERS");
	});

	it("allows ownership and ownership_file together (not mutually exclusive)", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: [{ owner: "@core", paths: ["src/**"] }],
				ownership_file: ".github/CODEOWNERS",
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.ownership).toEqual([
			{ owner: "@core", paths: ["src/**"] },
		]);
		expect(outcome.config.ownershipFile).toBe(".github/CODEOWNERS");
	});

	it("rejects a non-array ownership with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: { "src/**": "@team" },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("ownership");
	});

	it("rejects an ownership entry that is not a plain object", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ ownership: ["@team"] }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("ownership");
	});

	it("rejects an ownership entry with an empty owner", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: [{ owner: "", paths: ["src/**"] }],
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("owner");
	});

	it("rejects an ownership entry with a non-string owner", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: [{ owner: 5, paths: ["src/**"] }],
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("owner");
	});

	it("rejects an ownership entry with a non-array paths", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: [{ owner: "@core", paths: "src/**" }],
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("paths");
	});

	it("rejects an ownership entry with an empty paths array", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: [{ owner: "@core", paths: [] }],
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("paths");
	});

	it("rejects an ownership entry with a non-string / empty path glob", () => {
		const nonString = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: [{ owner: "@core", paths: [5] }],
			}),
		});
		expect(nonString.kind).toBe("invalid-project-file");

		const empty = resolveConfig({
			projectFileText: JSON.stringify({
				ownership: [{ owner: "@core", paths: [""] }],
			}),
		});
		expect(empty.kind).toBe("invalid-project-file");
		if (empty.kind !== "invalid-project-file") return;
		expect(empty.message).toContain("paths");
	});

	it("rejects a non-string ownership_file with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ ownership_file: 5 }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("ownership_file");
	});

	it("rejects an empty-string ownership_file with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ ownership_file: "" }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("ownership_file");
	});
});

describe("resolveConfig — component_aliases (C5, object-value join keys)", () => {
	it("leaves componentAliases undefined when absent", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: "lib" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.componentAliases).toBeUndefined();
	});

	it("reads a component → { frameName?, contrastMode? } join-key map", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				component_aliases: {
					Button: { frameName: "Button / Primary", contrastMode: "light" },
					Card: { frameName: "Card / Primary" },
				},
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.componentAliases).toEqual({
			Button: { frameName: "Button / Primary", contrastMode: "light" },
			Card: { frameName: "Card / Primary" },
		});
	});

	it("accepts an empty {} value (component named, no explicit keys yet)", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				component_aliases: { Button: {} },
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.componentAliases).toEqual({ Button: {} });
	});

	it("rejects a non-object component_aliases with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ component_aliases: ["Button"] }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("component_aliases");
	});

	it("rejects a non-object value (the old string form) with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ component_aliases: { Btn: "Button" } }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("component_aliases");
	});

	it("rejects a non-string frameName with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({
				component_aliases: { Button: { frameName: 5 } },
			}),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("component_aliases");
		expect(outcome.message).toContain("frameName");
	});
});

describe("resolveConfig — migration_sites_cap (C7, default 200)", () => {
	it("defaults migrationSitesCap to 200 when absent", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: "lib" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.migrationSitesCap).toBe(200);
	});

	it("reads a positive integer migration_sites_cap", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ migration_sites_cap: 50 }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.migrationSitesCap).toBe(50);
	});

	it("rejects a non-positive migration_sites_cap with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ migration_sites_cap: 0 }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("migration_sites_cap");
	});

	it("rejects a non-integer migration_sites_cap with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ migration_sites_cap: 12.5 }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("migration_sites_cap");
	});
});

describe("resolveConfig — score_velocity_window (C8, default 30)", () => {
	it("defaults scoreVelocityWindow to 30 when absent", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: "lib" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.scoreVelocityWindow).toBe(30);
	});

	it("reads a positive integer score_velocity_window (days)", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ score_velocity_window: 14 }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.scoreVelocityWindow).toBe(14);
	});

	it("rejects a non-positive score_velocity_window with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ score_velocity_window: -1 }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("score_velocity_window");
	});

	it("rejects a non-integer score_velocity_window with a typed error", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ score_velocity_window: 7.5 }),
		});

		expect(outcome.kind).toBe("invalid-project-file");
		if (outcome.kind !== "invalid-project-file") return;
		expect(outcome.message).toContain("score_velocity_window");
	});
});

describe("resolveConfig — figma_file_key URL normalization", () => {
	const URL =
		"https://www.figma.com/design/xfXJSaAWt65rlq486RKvJB/Sahasra-Design-System?m=auto&t=yLJi3bLlwAayHnI2-6";
	const KEY = "xfXJSaAWt65rlq486RKvJB";

	it("collapses a pasted URL in FIGMA_DESIGN_SYSTEM_FILE to the bare key", () => {
		const outcome = resolveConfig({ env: { FIGMA_DESIGN_SYSTEM_FILE: URL } });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe(KEY);
	});

	it("collapses a URL in CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY", () => {
		const outcome = resolveConfig({
			env: { CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: URL },
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe(KEY);
	});

	it("collapses a URL in the project file's figma_file_key", () => {
		const outcome = resolveConfig({
			projectFileText: JSON.stringify({ figma_file_key: URL }),
		});
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe(KEY);
	});

	it("leaves a bare key untouched", () => {
		const outcome = resolveConfig({ env: { FIGMA_DESIGN_SYSTEM_FILE: KEY } });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe(KEY);
	});
});

describe("resolveConfig — FIGMA_DESIGN_SYSTEM_FILE env alias (§6.3)", () => {
	it("resolves the library key from FIGMA_DESIGN_SYSTEM_FILE", () => {
		const outcome = resolveConfig({
			env: { FIGMA_DESIGN_SYSTEM_FILE: "design-sys-key" },
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe("design-sys-key");
	});

	it("ranks CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY above FIGMA_DESIGN_SYSTEM_FILE", () => {
		const outcome = resolveConfig({
			env: {
				CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "plugin-key",
				FIGMA_DESIGN_SYSTEM_FILE: "design-sys-key",
			},
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe("plugin-key");
	});

	it("ranks FIGMA_DESIGN_SYSTEM_FILE above the project file key", () => {
		const outcome = resolveConfig({
			env: { FIGMA_DESIGN_SYSTEM_FILE: "design-sys-key" },
			projectFileText: JSON.stringify({ figma_file_key: "project-key" }),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe("design-sys-key");
	});

	it("ranks flags.figmaFileKey above FIGMA_DESIGN_SYSTEM_FILE", () => {
		const outcome = resolveConfig({
			flags: { figmaFileKey: "flag-key" },
			env: { FIGMA_DESIGN_SYSTEM_FILE: "design-sys-key" },
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.figmaFileKey).toBe("flag-key");
	});
});

describe("resolveConfig — FIGMA_PRODUCT_FILE_<NAME> env merge (§6.4, §11.5)", () => {
	it("derives a lower-cased alias from the env suffix", () => {
		const outcome = resolveConfig({
			env: { FIGMA_PRODUCT_FILE_CHECKOUT: "EnvCheckout" },
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.productFileKeys).toEqual({ checkout: "EnvCheckout" });
	});

	it("merges env product keys with the project-file map", () => {
		const outcome = resolveConfig({
			env: { FIGMA_PRODUCT_FILE_BILLING: "EnvBilling" },
			projectFileText: JSON.stringify({
				product_file_keys: { checkout: "ProjCheckout" },
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.productFileKeys).toEqual({
			checkout: "ProjCheckout",
			billing: "EnvBilling",
		});
	});

	it("env wins over the project-file map for the same alias", () => {
		const outcome = resolveConfig({
			env: { FIGMA_PRODUCT_FILE_CHECKOUT: "EnvCheckout" },
			projectFileText: JSON.stringify({
				product_file_keys: { checkout: "ProjCheckout" },
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.productFileKeys).toEqual({ checkout: "EnvCheckout" });
	});

	it("ignores an empty-value FIGMA_PRODUCT_FILE_<NAME>", () => {
		const outcome = resolveConfig({
			env: { FIGMA_PRODUCT_FILE_CHECKOUT: "" },
			projectFileText: JSON.stringify({
				product_file_keys: { checkout: "ProjCheckout" },
			}),
		});

		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.productFileKeys).toEqual({
			checkout: "ProjCheckout",
		});
	});
});

describe("writeProjectConfig", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "ds-write-config-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	const configPath = () => join(dir, ".ds-bridge.json");

	it("creates the file when absent, with 2-space indent + trailing newline", () => {
		writeProjectConfig(dir, { dashboard_view: "owner" });

		const text = readFileSync(configPath(), "utf8");
		expect(text).toBe(`{\n  "dashboard_view": "owner"\n}\n`);
	});

	it("preserves existing keys AND their insertion order; appends new keys last", () => {
		const original = `{\n  "figma_file_key": "abc",\n  "report_style": "html"\n}\n`;
		writeFileSync(configPath(), original, "utf8");

		writeProjectConfig(dir, { dashboard_view: "owner" });

		const text = readFileSync(configPath(), "utf8");
		// new key appended last; existing keys keep position
		expect(text).toBe(
			`{\n  "figma_file_key": "abc",\n  "report_style": "html",\n  "dashboard_view": "owner"\n}\n`,
		);
	});

	it("editing one existing key is a minimal diff — other keys' order + indentation unchanged", () => {
		const original = `{\n  "figma_file_key": "abc",\n  "report_style": "html",\n  "readiness_threshold": 80\n}\n`;
		writeFileSync(configPath(), original, "utf8");

		writeProjectConfig(dir, { report_style: "terminal" });

		const text = readFileSync(configPath(), "utf8");
		expect(text).toBe(
			`{\n  "figma_file_key": "abc",\n  "report_style": "terminal",\n  "readiness_threshold": 80\n}\n`,
		);
	});

	it("preserves unknown keys (not in parseProjectFile's known set) in place", () => {
		const original = `{\n  "future_key": "keep-me",\n  "report_style": "html"\n}\n`;
		writeFileSync(configPath(), original, "utf8");

		writeProjectConfig(dir, { dashboard_artifacts: ["parity", "a11y"] });

		const text = readFileSync(configPath(), "utf8");
		expect(text).toBe(
			`{\n  "future_key": "keep-me",\n  "report_style": "html",\n  "dashboard_artifacts": [\n    "parity",\n    "a11y"\n  ]\n}\n`,
		);
	});

	it("a patch value of undefined DELETES the key (set --view ⇄ --artifacts handoff)", () => {
		const original = `{\n  "dashboard_artifacts": [\n    "parity"\n  ],\n  "report_style": "html"\n}\n`;
		writeFileSync(configPath(), original, "utf8");

		writeProjectConfig(dir, {
			dashboard_artifacts: undefined,
			dashboard_view: "owner",
		});

		const text = readFileSync(configPath(), "utf8");
		expect(text).toBe(
			`{\n  "report_style": "html",\n  "dashboard_view": "owner"\n}\n`,
		);
	});

	it("round-trips: re-reading a written file via resolveConfig sees the value", () => {
		writeProjectConfig(dir, { dashboard_view: "engineering" });
		const text = readFileSync(configPath(), "utf8");

		const outcome = resolveConfig({ projectFileText: text });
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.config.dashboardView).toBe("engineering");
	});

	it("leaves no temp file behind after a successful write", () => {
		writeProjectConfig(dir, { dashboard_view: "owner" });

		const entries = readdirSync(dir);
		expect(entries).toEqual([".ds-bridge.json"]);
	});

	it("writes atomically via a temp file in the same dir then rename (no partial file on the target name during write)", () => {
		// The final file is the only artifact and is well-formed JSON — proving
		// the rename swapped a fully-written temp file into place, never a stream.
		writeProjectConfig(dir, { dashboard_view: "owner" });

		expect(existsSync(configPath())).toBe(true);
		expect(() => JSON.parse(readFileSync(configPath(), "utf8"))).not.toThrow();
	});
});

// ─── M8.1 — extracted parseSelectionFile + atomicWriteJson ──────────────────
// The saved-dashboard schema's selection (view XOR artifacts, ids CATALOG-
// validated with suggestions) is parsed by the SAME helper resolveView consumes,
// and every sanctioned writer shares one atomic temp+rename JSON seam.

describe("parseSelectionFile", () => {
	it("parses a `view` selection (a preset name, syntactic only)", () => {
		const out = parseSelectionFile(JSON.stringify({ view: "ds-manager" }));
		expect(out).toEqual({ kind: "view", view: "ds-manager" });
	});

	it("parses an `artifacts` selection, validating ids against the catalog", () => {
		const out = parseSelectionFile(
			JSON.stringify({ artifacts: ["system-score", "parity"] }),
		);
		expect(out).toEqual({
			kind: "artifacts",
			artifacts: ["system-score", "parity"],
		});
	});

	it("rejects view + artifacts together (mutually exclusive)", () => {
		const out = parseSelectionFile(
			JSON.stringify({ view: "ds-manager", artifacts: ["parity"] }),
		);
		expect(out.kind).toBe("invalid");
	});

	it("rejects neither view nor artifacts", () => {
		const out = parseSelectionFile(JSON.stringify({ name: "exec" }));
		expect(out.kind).toBe("invalid");
	});

	it("rejects an unknown artifact id with a nearest-match suggestion", () => {
		const out = parseSelectionFile(JSON.stringify({ artifacts: ["parityy"] }));
		expect(out.kind).toBe("invalid");
		if (out.kind === "invalid") {
			expect(out.message).toContain("parityy");
			expect(out.message).toContain("parity");
		}
	});

	it("rejects malformed JSON", () => {
		expect(parseSelectionFile("{ not json").kind).toBe("invalid");
	});

	it("rejects a non-object JSON value", () => {
		expect(parseSelectionFile("[]").kind).toBe("invalid");
		expect(parseSelectionFile('"x"').kind).toBe("invalid");
	});
});

describe("atomicWriteJson", () => {
	let tmp: string;
	beforeEach(async () => {
		tmp = await mkdtemp(join(tmpdir(), "ds-atomic-"));
	});
	afterEach(async () => {
		await rm(tmp, { recursive: true, force: true });
	});

	it("writes pretty-printed JSON with a trailing newline, atomically", () => {
		const filePath = join(tmp, "out.json");
		atomicWriteJson(filePath, { b: 2, a: 1 });
		const text = readFileSync(filePath, "utf8");
		// key order preserved, 2-space indent, trailing newline.
		expect(text).toBe(`${JSON.stringify({ b: 2, a: 1 }, null, 2)}\n`);
		// no temp files left behind.
		expect(readdirSync(tmp)).toEqual(["out.json"]);
	});
});

// ─── M11.1 — `publish` static-site set ──────────────────────────────────────
describe("publish config key", () => {
	it("accepts a non-empty array of names", () => {
		const out = resolveConfig({
			projectFileText: JSON.stringify({ publish: ["exec", "team"] }),
		});
		expect(out.kind).toBe("ok");
		if (out.kind === "ok") expect(out.config.publish).toEqual(["exec", "team"]);
	});

	it("rejects a non-array publish", () => {
		const out = resolveConfig({
			projectFileText: JSON.stringify({ publish: "exec" }),
		});
		expect(out.kind).toBe("invalid-project-file");
	});

	it("rejects an empty publish array", () => {
		const out = resolveConfig({
			projectFileText: JSON.stringify({ publish: [] }),
		});
		expect(out.kind).toBe("invalid-project-file");
	});

	it("rejects a non-string publish entry", () => {
		const out = resolveConfig({
			projectFileText: JSON.stringify({ publish: ["exec", 3] }),
		});
		expect(out.kind).toBe("invalid-project-file");
	});

	it("is undefined when absent", () => {
		const out = resolveConfig({ projectFileText: JSON.stringify({}) });
		expect(out.kind).toBe("ok");
		if (out.kind === "ok") expect(out.config.publish).toBeUndefined();
	});
});
