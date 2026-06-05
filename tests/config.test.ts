// T0.6 — config resolution precedence: CLI flags > env (CLAUDE_PLUGIN_OPTION_*, FIGMA_TOKEN)
// > .ds-bridge.json > userConfig defaults. Pure function: all sources injected.
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";

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
