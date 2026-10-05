// H5 — the `record` batch plan + per-check classification (SPEC-history-v2 §4).
// Pure: which checks run (and why the others don't), and how a finished
// subprocess maps to recorded / skipped / error.
import { describe, expect, it } from "vitest";
import {
	classifyStep,
	handoffRecordedFor,
	planRecordSteps,
	type RecordStep,
} from "../../src/cli-commands/record.js";

const ids = (steps: RecordStep[]) =>
	steps.filter((s) => s.run).map((s) => s.id);

describe("planRecordSteps", () => {
	it("no Figma, no registry: lint, tokens-check, a11y run; the rest say why not", () => {
		const steps = planRecordSteps({
			hasRegistry: false,
			figmaConfigured: false,
			figma: false,
		});
		expect(ids(steps)).toEqual(["lint", "tokens-check", "a11y"]);
		const byId = new Map(steps.map((s) => [s.id, s]));
		expect(byId.get("adoption")?.reason).toMatch(/registry/);
		expect(byId.get("registry-build")?.reason).toMatch(/--figma/);
		expect(byId.get("library-health")?.reason).toMatch(/--figma/);
	});

	it("a registry enables adoption", () => {
		expect(
			ids(
				planRecordSteps({
					hasRegistry: true,
					figmaConfigured: false,
					figma: false,
				}),
			),
		).toEqual(["lint", "tokens-check", "a11y", "adoption"]);
	});

	it("Figma steps need BOTH --figma and a configured token + file key", () => {
		const notConfigured = planRecordSteps({
			hasRegistry: false,
			figmaConfigured: false,
			figma: true,
		});
		expect(ids(notConfigured)).toEqual(["lint", "tokens-check", "a11y"]);
		expect(
			notConfigured.find((s) => s.id === "registry-build")?.reason,
		).toMatch(/not configured/i);

		const configuredNoFlag = planRecordSteps({
			hasRegistry: false,
			figmaConfigured: true,
			figma: false,
		});
		expect(ids(configuredNoFlag)).toEqual(["lint", "tokens-check", "a11y"]);
	});

	it("with Figma: registry build first (refreshes parity), adoption follows it, library-health last", () => {
		expect(
			ids(
				planRecordSteps({
					hasRegistry: false,
					figmaConfigured: true,
					figma: true,
				}),
			),
		).toEqual([
			"registry-build",
			"lint",
			"tokens-check",
			"a11y",
			"adoption",
			"library-health",
		]);
	});

	it("each step names the history kind it appends and runs against the cwd project", () => {
		const steps = planRecordSteps({
			hasRegistry: true,
			figmaConfigured: true,
			figma: true,
		});
		const kinds = Object.fromEntries(steps.map((s) => [s.id, s.kind]));
		expect(kinds).toEqual({
			"registry-build": "parity",
			lint: "lint",
			"tokens-check": "tokens-check",
			a11y: "a11y",
			adoption: "adoption",
			"library-health": "library-health",
		});
		for (const step of steps) expect(step.args).toContain("json");
		expect(steps.find((s) => s.id === "lint")?.args).toEqual([
			"lint",
			".",
			"--format",
			"json",
		]);
	});
});

describe("planRecordSteps — F2 library top-N", () => {
	it("forwards --top N to library-health when libraryTop is set", () => {
		const steps = planRecordSteps({
			hasRegistry: true,
			figmaConfigured: true,
			figma: true,
			libraryTop: 5,
		});
		expect(steps.find((s) => s.id === "library-health")?.args).toEqual([
			"library-health",
			"--format",
			"json",
			"--top",
			"5",
		]);
	});

	it("leaves the library-health args unchanged without libraryTop", () => {
		const steps = planRecordSteps({
			hasRegistry: true,
			figmaConfigured: true,
			figma: true,
		});
		expect(steps.find((s) => s.id === "library-health")?.args).toEqual([
			"library-health",
			"--format",
			"json",
		]);
	});
});

describe("classifyStep", () => {
	it("recorded when a record of its kind carries the run id (findings or not)", () => {
		expect(classifyStep({ status: 1, stderr: "" }, true)).toEqual({
			status: "recorded",
			exitCode: 1,
		});
		expect(classifyStep({ status: 0, stderr: "" }, true).status).toBe(
			"recorded",
		);
	});

	it("skipped with the first stderr line when the check could not run (exit 2)", () => {
		expect(
			classifyStep(
				{ status: 2, stderr: "No design-token source found.\nmore\n" },
				false,
			),
		).toEqual({
			status: "skipped",
			exitCode: 2,
			reason: "No design-token source found.",
		});
	});

	it("skipped when it exited cleanly but wrote no record", () => {
		expect(classifyStep({ status: 0, stderr: "" }, false)).toEqual({
			status: "skipped",
			exitCode: 0,
			reason: "no history record written",
		});
	});

	it("error when the subprocess could not be spawned", () => {
		expect(
			classifyStep({ status: null, stderr: "", error: "ENOENT" }, false),
		).toEqual({ status: "error", reason: "ENOENT" });
	});
});

// ---------- H14 — tracked frames (SPEC-history-v2 §9.1) ----------

const FRAME_A =
	"https://www.figma.com/design/ABcdEFghIJklMNopQRstUV/Demo?node-id=1-2";
const FRAME_B = "https://www.figma.com/design/ZZcdEFghIJklMNopQRstUV/Other";

describe("planRecordSteps — tracked frames (H14)", () => {
	it("adds one handoff step per tracked frame after library-health, in config order", () => {
		const steps = planRecordSteps({
			hasRegistry: true,
			figmaConfigured: true,
			figma: true,
			trackedFrames: [FRAME_A, FRAME_B],
		});
		expect(ids(steps)).toEqual([
			"registry-build",
			"lint",
			"tokens-check",
			"a11y",
			"adoption",
			"library-health",
			"handoff",
			"handoff",
		]);
		const handoffs = steps.filter((s) => s.id === "handoff");
		expect(handoffs.map((s) => s.frame)).toEqual([FRAME_A, FRAME_B]);
		expect(handoffs[0]?.kind).toBe("handoff");
		expect(handoffs[0]?.args).toEqual(["handoff", FRAME_A, "--format", "json"]);
	});

	it("handoff needs only a token (the URL carries the file key), plus --figma", () => {
		const tokenOnly = planRecordSteps({
			hasRegistry: false,
			figmaConfigured: false,
			figmaToken: true,
			figma: true,
			trackedFrames: [FRAME_A],
		});
		expect(ids(tokenOnly)).toEqual(["lint", "tokens-check", "a11y", "handoff"]);

		const noFlag = planRecordSteps({
			hasRegistry: false,
			figmaConfigured: true,
			figma: false,
			trackedFrames: [FRAME_A],
		});
		const skipped = noFlag.find((s) => s.id === "handoff");
		expect(skipped?.run).toBe(false);
		expect(skipped?.reason).toMatch(/--figma/);

		const noToken = planRecordSteps({
			hasRegistry: false,
			figmaConfigured: false,
			figmaToken: false,
			figma: true,
			trackedFrames: [FRAME_A],
		});
		expect(noToken.find((s) => s.id === "handoff")?.reason).toMatch(
			/token not configured/i,
		);
	});

	it("no tracked frames → the plan is unchanged", () => {
		const plain = planRecordSteps({
			hasRegistry: true,
			figmaConfigured: true,
			figma: true,
		});
		const empty = planRecordSteps({
			hasRegistry: true,
			figmaConfigured: true,
			figma: true,
			trackedFrames: [],
		});
		expect(empty).toEqual(plain);
		expect(plain.some((s) => s.id === "handoff")).toBe(false);
	});
});

describe("handoffRecordedFor (H14)", () => {
	const RUN = "run-1";
	const rec = (fields: Record<string, unknown>) => ({
		kind: "handoff",
		record: { kind: "handoff", ...fields },
		envelope: { v: 2, runId: RUN },
	});

	it("matches fileKey + nodeId under this runId", () => {
		const records = [rec({ fileKey: "ABcdEFghIJklMNopQRstUV", nodeId: "1:2" })];
		expect(handoffRecordedFor(records, RUN, FRAME_A)).toBe(true);
		expect(handoffRecordedFor(records, "other-run", FRAME_A)).toBe(false);
		expect(
			handoffRecordedFor(
				[rec({ fileKey: "ABcdEFghIJklMNopQRstUV", nodeId: "9:9" })],
				RUN,
				FRAME_A,
			),
		).toBe(false);
	});

	it("a URL without node-id matches on the fileKey alone", () => {
		expect(
			handoffRecordedFor(
				[rec({ fileKey: "ZZcdEFghIJklMNopQRstUV" })],
				RUN,
				FRAME_B,
			),
		).toBe(true);
		expect(handoffRecordedFor([], RUN, FRAME_B)).toBe(false);
	});
});
