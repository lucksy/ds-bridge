// H1 — the v2 history envelope (SPEC-history-v2 §2), test-first. Pure: a kind
// payload + resolved metadata in → one flat v2 record out. The envelope is
// ADDITIVE: `at` and `kind` stay top-level where v1 had them, so every existing
// reader keeps reading a v2 line by field name.
import { describe, expect, it } from "vitest";
import {
	buildEnvelope,
	envelopeOf,
	parseSource,
	resolveRunId,
	resolveSource,
} from "../../../src/engines/history/envelope.js";

const META = {
	now: "2026-10-04T09:00:00.000Z",
	source: "local" as const,
	git: { sha: "abc123", branch: "main", dirty: false },
	tool: { version: "1.11.0" },
};

describe("buildEnvelope", () => {
	it("puts the envelope first, then the payload verbatim", () => {
		const record = buildEnvelope(
			{ at: "2026-10-01T00:00:00.000Z", kind: "lint", byKind: { exact: 1 } },
			META,
		);
		expect(record).toEqual({
			v: 2,
			at: "2026-10-01T00:00:00.000Z",
			kind: "lint",
			source: "local",
			git: { sha: "abc123", branch: "main", dirty: false },
			tool: { version: "1.11.0" },
			byKind: { exact: 1 },
		});
		expect(Object.keys(record).slice(0, 6)).toEqual([
			"v",
			"at",
			"kind",
			"source",
			"git",
			"tool",
		]);
	});

	it("uses meta.now when the payload carries no string at", () => {
		const record = buildEnvelope({ kind: "a11y" }, META);
		expect(record.at).toBe("2026-10-04T09:00:00.000Z");
	});

	it("carries runId only when present", () => {
		expect(buildEnvelope({ kind: "lint" }, META)).not.toHaveProperty("runId");
		expect(
			buildEnvelope({ kind: "lint" }, { ...META, runId: "r-1" }).runId,
		).toBe("r-1");
	});

	it("keeps git/tool null when unknown", () => {
		const record = buildEnvelope(
			{ kind: "lint" },
			{ ...META, git: null, tool: null },
		);
		expect(record.git).toBeNull();
		expect(record.tool).toBeNull();
	});

	it("drops reserved envelope keys from the payload (the envelope wins)", () => {
		const record = buildEnvelope(
			{
				kind: "lint",
				v: 9,
				source: "spoof",
				git: "x",
				tool: "y",
				runId: "z",
				extra: 1,
			},
			META,
		);
		expect(record.v).toBe(2);
		expect(record.source).toBe("local");
		expect(record.git).toEqual(META.git);
		expect(record.tool).toEqual(META.tool);
		expect(record).not.toHaveProperty("runId");
		expect(record.extra).toBe(1);
	});
});

describe("parseSource / resolveSource", () => {
	it("accepts exactly local | ci | hook", () => {
		expect(parseSource("local")).toBe("local");
		expect(parseSource("ci")).toBe("ci");
		expect(parseSource("hook")).toBe("hook");
		expect(parseSource("CI")).toBeUndefined();
		expect(parseSource("")).toBeUndefined();
		expect(parseSource(undefined)).toBeUndefined();
	});

	it("precedence: flag > DS_BRIDGE_SOURCE > local", () => {
		expect(resolveSource("hook", { DS_BRIDGE_SOURCE: "ci" })).toBe("hook");
		expect(resolveSource(undefined, { DS_BRIDGE_SOURCE: "ci" })).toBe("ci");
		expect(resolveSource(undefined, {})).toBe("local");
	});

	it("an invalid env value falls back to local (metadata never fails a write)", () => {
		expect(resolveSource(undefined, { DS_BRIDGE_SOURCE: "nightly" })).toBe(
			"local",
		);
	});
});

describe("resolveRunId", () => {
	it("reads a non-empty DS_BRIDGE_RUN_ID", () => {
		expect(resolveRunId({ DS_BRIDGE_RUN_ID: "run-7" })).toBe("run-7");
	});

	it("rejects empty / whitespace / over-long ids", () => {
		expect(resolveRunId({})).toBeUndefined();
		expect(resolveRunId({ DS_BRIDGE_RUN_ID: "  " })).toBeUndefined();
		expect(resolveRunId({ DS_BRIDGE_RUN_ID: "x".repeat(129) })).toBeUndefined();
	});
});

describe("envelopeOf", () => {
	it("is undefined for a v1 record (no numeric v)", () => {
		expect(envelopeOf({ at: "2026-01-01", kind: "lint" })).toBeUndefined();
		expect(envelopeOf({ kind: "lint", v: "2" })).toBeUndefined();
	});

	it("extracts the tolerant envelope of a v2 record", () => {
		const env = envelopeOf({
			v: 2,
			kind: "lint",
			source: "ci",
			runId: "r",
			git: { sha: "s", branch: "b", dirty: true },
			tool: { version: "1.0.0" },
		});
		expect(env).toEqual({
			v: 2,
			source: "ci",
			runId: "r",
			git: { sha: "s", branch: "b", dirty: true },
			tool: { version: "1.0.0" },
		});
	});

	it("drops malformed envelope fields instead of failing", () => {
		const env = envelopeOf({
			v: 2,
			kind: "lint",
			source: "nightly",
			runId: 5,
			git: "nope",
			tool: { version: 3 },
		});
		expect(env).toEqual({ v: 2, git: null, tool: null });
	});
});
