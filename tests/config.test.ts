// T0.6 — config resolution precedence: CLI flags > env (CLAUDE_PLUGIN_OPTION_*, FIGMA_TOKEN)
// > .ds-bridge.json > userConfig defaults. Pure function: all sources injected.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig, writeProjectConfig } from "../src/config.js";

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
