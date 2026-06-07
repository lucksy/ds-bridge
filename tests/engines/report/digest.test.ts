// D1 — digest model engine, test-first (SPEC-digest §1). Two pure functions:
//
//   parseSince(raw, nowIso) — ISO `YYYY-MM-DD` (→ that date's 00:00:00.000Z) or
//     relative `<N>d`/`<N>w` (relative to nowIso); default `7d` when raw is
//     undefined; malformed → a typed error LISTING the accepted forms.
//
//   buildDigest(text, sinceIso, audience, readinessThreshold) — replays the
//     history (the shared replayHistory), splits each kind on the HALF-OPEN
//     instant window [sinceIso, ∞) (`at >= sinceIso` in-window, lexicographic ISO
//     compare), emits per-kind movement rows (baseline = latest before; current =
//     latest in-window; new-in-window flagged; only-before omitted), audience tags
//     (§1.3), and up to 3 actions in the fixed §1.4 priority order, audience-
//     filtered with the designer+both / developer+both membership rule. Zero
//     in-window records anywhere → a typed `quiet` outcome. Deterministic.
import { describe, expect, it } from "vitest";
import {
	buildDigest,
	type DigestModel,
	type MovementRow,
	parseSince,
} from "../../../src/engines/report/digest.js";

/** Build one JSONL line from a record object. */
function line(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

/** Find a movement row by kind from an ok model (asserts the model + row). */
function movement(model: DigestModel, kind: MovementRow["kind"]): MovementRow {
	if (model.kind !== "ok") {
		throw new Error(`expected an ok model, got ${model.kind}`);
	}
	const found = model.movements.find((m) => m.kind === kind);
	if (found === undefined) {
		throw new Error(`expected movement row "${kind}" to be present`);
	}
	return found;
}

// ---------------------------------------------------------------------------
// parseSince
// ---------------------------------------------------------------------------

describe("parseSince — ISO dates", () => {
	const now = "2026-06-07T12:00:00.000Z";

	it("resolves a bare YYYY-MM-DD to that date's 00:00:00.000Z instant", () => {
		const out = parseSince("2026-06-01", now);
		expect(out).toEqual({ kind: "ok", sinceIso: "2026-06-01T00:00:00.000Z" });
	});
});

describe("parseSince — relative windows", () => {
	const now = "2026-06-08T00:00:00.000Z";

	it("resolves <N>d as N days before nowIso", () => {
		expect(parseSince("7d", now)).toEqual({
			kind: "ok",
			sinceIso: "2026-06-01T00:00:00.000Z",
		});
		expect(parseSince("1d", now)).toEqual({
			kind: "ok",
			sinceIso: "2026-06-07T00:00:00.000Z",
		});
	});

	it("resolves <N>w as N*7 days before nowIso", () => {
		expect(parseSince("1w", now)).toEqual({
			kind: "ok",
			sinceIso: "2026-06-01T00:00:00.000Z",
		});
		expect(parseSince("2w", now)).toEqual({
			kind: "ok",
			sinceIso: "2026-05-25T00:00:00.000Z",
		});
	});

	it("defaults to 7d when raw is undefined", () => {
		expect(parseSince(undefined, now)).toEqual({
			kind: "ok",
			sinceIso: "2026-06-01T00:00:00.000Z",
		});
	});
});

describe("parseSince — malformed", () => {
	const now = "2026-06-07T12:00:00.000Z";

	it("rejects garbage with a typed error listing the accepted forms", () => {
		const out = parseSince("last tuesday", now);
		expect(out.kind).toBe("error");
		if (out.kind !== "error") throw new Error("unreachable");
		expect(out.message).toContain("YYYY-MM-DD");
		expect(out.message).toContain("<N>d");
		expect(out.message).toContain("<N>w");
	});

	it("rejects an impossible calendar date", () => {
		expect(parseSince("2026-13-40", now).kind).toBe("error");
	});

	it("rejects a zero / non-positive relative count", () => {
		expect(parseSince("0d", now).kind).toBe("error");
		expect(parseSince("-3d", now).kind).toBe("error");
	});

	it("rejects a relative form with no number", () => {
		expect(parseSince("d", now).kind).toBe("error");
		expect(parseSince("w", now).kind).toBe("error");
	});
});

// ---------------------------------------------------------------------------
// buildDigest — window
// ---------------------------------------------------------------------------

describe("buildDigest — half-open instant window", () => {
	const since = "2026-06-01T00:00:00.000Z";

	it("treats a record exactly AT sinceIso as in-window (inclusive lower bound)", () => {
		const text = [
			line({ at: "2026-05-20T00:00:00.000Z", kind: "handoff", score: 70 }),
			line({ at: "2026-06-01T00:00:00.000Z", kind: "handoff", score: 90 }),
		].join("\n");
		const model = buildDigest(text, since, "both", 80);
		const row = movement(model, "readiness");
		expect(row.isNew).toBe(false);
		expect(row.baseline).toBe(70);
		expect(row.current).toBe(90);
	});

	it("treats a record one millisecond BEFORE sinceIso as the baseline (out of window)", () => {
		const text = [
			line({ at: "2026-05-31T23:59:59.999Z", kind: "handoff", score: 70 }),
			line({ at: "2026-06-02T00:00:00.000Z", kind: "handoff", score: 90 }),
		].join("\n");
		const row = movement(buildDigest(text, since, "both", 80), "readiness");
		expect(row.baseline).toBe(70);
		expect(row.current).toBe(90);
	});

	it("flags a kind seen ONLY in-window as new (no baseline)", () => {
		const text = line({
			at: "2026-06-03T00:00:00.000Z",
			kind: "handoff",
			score: 88,
		});
		const row = movement(buildDigest(text, since, "both", 80), "readiness");
		expect(row.isNew).toBe(true);
		expect(row.baseline).toBeUndefined();
		expect(row.current).toBe(88);
	});

	it("omits a kind seen ONLY before the window (no movement to report)", () => {
		const text = [
			line({ at: "2026-05-20T00:00:00.000Z", kind: "handoff", score: 70 }),
			// an in-window record of a DIFFERENT kind keeps the digest non-quiet
			line({
				at: "2026-06-03T00:00:00.000Z",
				kind: "tokens-check",
				stale: 0,
				missing: 0,
				orphan: 0,
			}),
		].join("\n");
		const model = buildDigest(text, since, "both", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		expect(model.movements.some((m) => m.kind === "readiness")).toBe(false);
		expect(model.movements.some((m) => m.kind === "drift")).toBe(true);
	});

	it("uses lexicographic ISO compare (millisecond precision, never day truncation)", () => {
		const text = [
			line({ at: "2026-06-01T00:00:00.000Z", kind: "handoff", score: 50 }),
			line({ at: "2026-06-01T08:30:00.000Z", kind: "handoff", score: 95 }),
		].join("\n");
		// since is one ms past midnight: the 00:00 record is the baseline, the 08:30 is in-window.
		const row = movement(
			buildDigest(text, "2026-06-01T00:00:00.001Z", "both", 80),
			"readiness",
		);
		expect(row.baseline).toBe(50);
		expect(row.current).toBe(95);
	});
});

// ---------------------------------------------------------------------------
// buildDigest — quiet
// ---------------------------------------------------------------------------

describe("buildDigest — quiet outcome", () => {
	const since = "2026-06-01T00:00:00.000Z";

	it("returns { kind: 'quiet' } when nothing falls in the window", () => {
		const text = [
			line({ at: "2026-05-20T00:00:00.000Z", kind: "handoff", score: 70 }),
			line({ at: "2026-05-25T00:00:00.000Z", kind: "lint", byKind: {} }),
		].join("\n");
		expect(buildDigest(text, since, "both", 80).kind).toBe("quiet");
	});

	it("returns quiet for empty / history-less text", () => {
		expect(buildDigest("", since, "both", 80).kind).toBe("quiet");
	});

	it("carries the sinceIso on the quiet outcome", () => {
		const model = buildDigest("", since, "both", 80);
		if (model.kind !== "quiet") throw new Error("expected quiet");
		expect(model.sinceIso).toBe(since);
	});
});

// ---------------------------------------------------------------------------
// buildDigest — per-kind movement metrics
// ---------------------------------------------------------------------------

describe("buildDigest — per-kind metrics & direction", () => {
	const since = "2026-06-01T00:00:00.000Z";

	it("drift uses the stale count (baseline vs in-window latest)", () => {
		const text = [
			line({
				at: "2026-05-20T00:00:00.000Z",
				kind: "tokens-check",
				stale: 5,
				missing: 0,
				orphan: 0,
			}),
			line({
				at: "2026-06-03T00:00:00.000Z",
				kind: "tokens-check",
				stale: 2,
				missing: 1,
				orphan: 0,
			}),
		].join("\n");
		const row = movement(buildDigest(text, since, "both", 80), "drift");
		expect(row.baseline).toBe(5);
		expect(row.current).toBe(2);
		expect(row.direction).toBe("down");
		expect(row.audience).toBe("both");
	});

	it("readiness uses the score and rises", () => {
		const text = [
			line({ at: "2026-05-20T00:00:00.000Z", kind: "handoff", score: 70 }),
			line({ at: "2026-06-03T00:00:00.000Z", kind: "handoff", score: 85 }),
		].join("\n");
		const row = movement(buildDigest(text, since, "both", 80), "readiness");
		expect(row.direction).toBe("up");
		expect(row.audience).toBe("designer");
	});

	it("lint uses the summed byKind violations and is developer-tagged", () => {
		const text = [
			line({
				at: "2026-05-20T00:00:00.000Z",
				kind: "lint",
				byKind: { exact: 1, near: 1, offSystem: 1 },
			}),
			line({
				at: "2026-06-03T00:00:00.000Z",
				kind: "lint",
				byKind: { exact: 0, near: 0, offSystem: 2 },
			}),
		].join("\n");
		const row = movement(buildDigest(text, since, "both", 80), "lint");
		expect(row.baseline).toBe(3);
		expect(row.current).toBe(2);
		expect(row.audience).toBe("developer");
	});

	it("a11y uses the contrast pass pct and is designer-tagged", () => {
		const text = [
			line({
				at: "2026-05-20T00:00:00.000Z",
				kind: "a11y",
				modes: [{ mode: "light", passed: 8, failed: 2 }],
			}),
			line({
				at: "2026-06-03T00:00:00.000Z",
				kind: "a11y",
				modes: [{ mode: "light", passed: 9, failed: 1 }],
			}),
		].join("\n");
		const row = movement(buildDigest(text, since, "both", 80), "a11y");
		expect(row.baseline).toBe(80);
		expect(row.current).toBe(90);
		expect(row.audience).toBe("designer");
	});

	it("on-system uses the adoption-bearing lint pct, parallel last-wins (a later plain lint never clears it)", () => {
		const text = [
			line({
				at: "2026-05-20T00:00:00.000Z",
				kind: "lint",
				byKind: {},
				adoption: { refs: 60, literals: 40 },
			}),
			line({
				at: "2026-06-03T00:00:00.000Z",
				kind: "lint",
				byKind: {},
				adoption: { refs: 90, literals: 10 },
			}),
			// a later PLAIN lint line in-window must NOT clear the adoption slot
			line({ at: "2026-06-04T00:00:00.000Z", kind: "lint", byKind: {} }),
		].join("\n");
		const row = movement(buildDigest(text, since, "both", 80), "on-system");
		expect(row.baseline).toBe(60);
		expect(row.current).toBe(90);
		expect(row.audience).toBe("both");
	});

	it("coverage uses imported/total pct and is both-tagged", () => {
		const text = [
			line({
				at: "2026-05-20T00:00:00.000Z",
				kind: "adoption",
				imported: 5,
				total: 10,
			}),
			line({
				at: "2026-06-03T00:00:00.000Z",
				kind: "adoption",
				imported: 8,
				total: 10,
			}),
		].join("\n");
		const row = movement(buildDigest(text, since, "both", 80), "coverage");
		expect(row.baseline).toBe(50);
		expect(row.current).toBe(80);
		expect(row.audience).toBe("both");
	});
});

// ---------------------------------------------------------------------------
// buildDigest — audience filter (membership rule)
// ---------------------------------------------------------------------------

describe("buildDigest — audience filter (designer+both / developer+both)", () => {
	const since = "2026-06-01T00:00:00.000Z";
	const text = [
		line({ at: "2026-06-02T00:00:00.000Z", kind: "handoff", score: 90 }), // designer
		line({
			at: "2026-06-02T00:00:00.000Z",
			kind: "lint",
			byKind: { offSystem: 1 },
		}), // developer
		line({
			at: "2026-06-02T00:00:00.000Z",
			kind: "tokens-check",
			stale: 0,
			missing: 0,
			orphan: 0,
		}), // both
	].join("\n");

	it("designer filter keeps designer + both, drops developer-only", () => {
		const model = buildDigest(text, since, "designer", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		const kinds = model.movements.map((m) => m.kind);
		expect(kinds).toContain("readiness"); // designer
		expect(kinds).toContain("drift"); // both
		expect(kinds).not.toContain("lint"); // developer-only
	});

	it("developer filter keeps developer + both, drops designer-only", () => {
		const model = buildDigest(text, since, "developer", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		const kinds = model.movements.map((m) => m.kind);
		expect(kinds).toContain("lint"); // developer
		expect(kinds).toContain("drift"); // both
		expect(kinds).not.toContain("readiness"); // designer-only
	});

	it("both keeps everything", () => {
		const model = buildDigest(text, since, "both", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		expect(model.movements.map((m) => m.kind).sort()).toEqual(
			["drift", "lint", "readiness"].sort(),
		);
	});
});

// ---------------------------------------------------------------------------
// buildDigest — action rules
// ---------------------------------------------------------------------------

describe("buildDigest — action rules (fixed priority, max 3)", () => {
	const since = "2026-06-01T00:00:00.000Z";

	it("breaking drift in window fires the token-check action", () => {
		const text = line({
			at: "2026-06-02T00:00:00.000Z",
			kind: "tokens-check",
			stale: 3,
			missing: 0,
			orphan: 0,
		});
		const model = buildDigest(text, since, "both", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		expect(model.actions[0]?.command).toBe("/ds-bridge:token-check");
		expect(model.actions[0]?.audience).toBe("both");
	});

	it("off-system lint fires the ds-lint action", () => {
		const text = line({
			at: "2026-06-02T00:00:00.000Z",
			kind: "lint",
			byKind: { offSystem: 4 },
		});
		const model = buildDigest(text, since, "both", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		expect(model.actions.map((a) => a.command)).toContain(
			"/ds-bridge:ds-lint --fix",
		);
	});

	it("readiness below the CONFIGURED threshold fires handoff-qa (param, not hardcoded 80)", () => {
		const text = line({
			at: "2026-06-02T00:00:00.000Z",
			kind: "handoff",
			score: 85,
		});
		// 85 is fine under default 80, but a project raising the gate to 90 trips it.
		expect(
			(buildDigest(text, since, "both", 80) as { actions: unknown[] }).actions,
		).toEqual([]);
		const raised = buildDigest(text, since, "both", 90);
		if (raised.kind !== "ok") throw new Error("expected ok");
		expect(raised.actions.map((a) => a.command)).toContain(
			"/ds-bridge:handoff-qa",
		);
		expect(
			raised.actions.find((a) => a.command === "/ds-bridge:handoff-qa")
				?.audience,
		).toBe("designer");
	});

	it("a failing a11y pair fires a11y-check", () => {
		const text = line({
			at: "2026-06-02T00:00:00.000Z",
			kind: "a11y",
			modes: [{ mode: "light", passed: 9, failed: 1 }],
		});
		const model = buildDigest(text, since, "both", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		expect(model.actions.map((a) => a.command)).toContain(
			"/ds-bridge:a11y-check",
		);
	});

	it("coverage below 100% fires the adoption action", () => {
		const text = line({
			at: "2026-06-02T00:00:00.000Z",
			kind: "adoption",
			imported: 8,
			total: 10,
		});
		const model = buildDigest(text, since, "both", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		expect(model.actions.map((a) => a.command)).toContain("ds-bridge adoption");
	});

	it("caps at three actions in the fixed priority order", () => {
		const text = [
			line({
				at: "2026-06-02T00:00:00.000Z",
				kind: "tokens-check",
				stale: 1,
				missing: 0,
				orphan: 0,
			}),
			line({
				at: "2026-06-02T00:00:00.000Z",
				kind: "lint",
				byKind: { offSystem: 2 },
			}),
			line({ at: "2026-06-02T00:00:00.000Z", kind: "handoff", score: 50 }),
			line({
				at: "2026-06-02T00:00:00.000Z",
				kind: "a11y",
				modes: [{ mode: "light", passed: 9, failed: 1 }],
			}),
			line({
				at: "2026-06-02T00:00:00.000Z",
				kind: "adoption",
				imported: 1,
				total: 10,
			}),
		].join("\n");
		const model = buildDigest(text, since, "both", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		expect(model.actions).toHaveLength(3);
		expect(model.actions.map((a) => a.command)).toEqual([
			"/ds-bridge:token-check",
			"/ds-bridge:ds-lint --fix",
			"/ds-bridge:handoff-qa",
		]);
	});

	it("filters actions by the chosen audience (developer drops the designer a11y action)", () => {
		const text = [
			line({
				at: "2026-06-02T00:00:00.000Z",
				kind: "lint",
				byKind: { offSystem: 2 },
			}),
			line({
				at: "2026-06-02T00:00:00.000Z",
				kind: "a11y",
				modes: [{ mode: "light", passed: 9, failed: 1 }],
			}),
		].join("\n");
		const model = buildDigest(text, since, "developer", 80);
		if (model.kind !== "ok") throw new Error("expected ok");
		const cmds = model.actions.map((a) => a.command);
		expect(cmds).toContain("/ds-bridge:ds-lint --fix");
		expect(cmds).not.toContain("/ds-bridge:a11y-check");
	});
});

// ---------------------------------------------------------------------------
// buildDigest — determinism
// ---------------------------------------------------------------------------

describe("buildDigest — determinism", () => {
	it("produces a deeply-equal model for identical inputs", () => {
		const text = [
			line({
				at: "2026-05-20T00:00:00.000Z",
				kind: "tokens-check",
				stale: 5,
				missing: 0,
				orphan: 0,
			}),
			line({
				at: "2026-06-03T00:00:00.000Z",
				kind: "tokens-check",
				stale: 2,
				missing: 0,
				orphan: 0,
			}),
		].join("\n");
		const since = "2026-06-01T00:00:00.000Z";
		expect(buildDigest(text, since, "both", 80)).toEqual(
			buildDigest(text, since, "both", 80),
		);
	});
});
