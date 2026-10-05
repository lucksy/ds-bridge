// R2 (SPEC-rollup §3) — the pure org-rollup model.
import { describe, expect, it } from "vitest";
import {
	DEFAULT_WEIGHTS,
	scoreFromHistory,
} from "../../../src/engines/report/score.js";
import { buildScorecard } from "../../../src/engines/report/scorecard.js";
import {
	buildRollup,
	ROLLUP_SCHEMA,
	type RollupRepoInput,
	TREND_POINTS,
} from "../../../src/engines/rollup/rollup.js";

const NOW = "2026-10-05T12:00:00.000Z";
const j = (r: Record<string, unknown>) => JSON.stringify(r);
const text = (lines: string[]) => `${lines.join("\n")}\n`;

const v2 = (r: Record<string, unknown>) =>
	j({
		v: 2,
		source: "ci",
		git: { sha: "abc1234", branch: "main", dirty: false },
		tool: { version: "1.11.0" },
		...r,
	});

const ok = (name: string, lines: string[], team?: string): RollupRepoInput => ({
	name,
	source: `/repos/${name}`,
	...(team !== undefined ? { team } : {}),
	load: { kind: "ok", text: text(lines) },
});

// web: a full v2 series — lint+adoption (size 100), tokens-check, a11y, handoff.
const WEB = [
	v2({
		at: "2026-10-01T09:00:00Z",
		kind: "lint",
		byKind: { exact: 1, near: 0, offSystem: 1 },
		adoption: { refs: 80, literals: 20 },
	}),
	v2({
		at: "2026-10-02T09:00:00Z",
		kind: "tokens-check",
		stale: 1,
		missing: 2,
		orphan: 0,
	}),
	v2({
		at: "2026-10-03T09:00:00Z",
		kind: "a11y",
		modes: [{ mode: "light", passed: 9, failed: 1 }],
	}),
	v2({
		at: "2026-10-04T09:00:00Z",
		kind: "handoff",
		score: 90,
		frameName: "Checkout",
	}),
];

// ios: handoff only (score 60), v1 lines, old.
const IOS_V1 = [
	j({ at: "2026-07-01T09:00:00Z", kind: "handoff", score: 50, frameName: "A" }),
	j({ at: "2026-07-02T09:00:00Z", kind: "handoff", score: 60, frameName: "A" }),
];

// android: lint+adoption with size 300 (on-system 50%).
const ANDROID = [
	v2({
		at: "2026-10-04T09:00:00Z",
		kind: "lint",
		byKind: { exact: 0, near: 0, offSystem: 0 },
		adoption: { refs: 150, literals: 150 },
	}),
];

describe("buildRollup — per repo", () => {
	it("derives every row field from the existing engines with default weights", () => {
		const model = buildRollup([ok("web", WEB)], { nowIso: NOW });
		expect(model.schema).toBe(ROLLUP_SCHEMA);
		expect(model.schemaVersion).toBe(1);
		expect(model.generatedAt).toBe(NOW);
		expect(model.weights).toBe("default");
		const [web] = model.repos;
		const score = scoreFromHistory(text(WEB), DEFAULT_WEIGHTS);
		expect(score.kind).toBe("ok");
		if (score.kind !== "ok" || web === undefined) return;
		expect(web.status).toBe("ok");
		expect(web.rank).toBe(1);
		expect(web.score).toBe(score.current);
		expect(web.trend).toEqual(score.trend);
		const card = buildScorecard(text(WEB), undefined, DEFAULT_WEIGHTS);
		expect(card.kind).toBe("ok");
		expect(web.onSystem).toBe(80);
		expect(web.contrast).toBe(90);
		expect(web.drift).toEqual({ stale: 1, missing: 2, orphan: 0 });
		expect(web.readiness).toEqual({ score: 90, frame: "Checkout" });
		expect(web.size).toBe(100);
		expect(web.history).toEqual({ records: 4, v1: 0, v2: 4, corrupt: 0 });
		expect(web.git).toEqual({ branch: "main", sha: "abc1234" });
		expect(web.toolVersion).toBe("1.11.0");
		expect(web.freshness.lastAt).toBe("2026-10-04T09:00:00Z");
		expect(web.freshness.ageDays).toBe(1);
		expect(web.freshness.band).toBe("green");
		expect(web.freshness.staleKinds).toEqual([]);
		expect(web.notes).toEqual([]);
	});

	it("keeps only the last TREND_POINTS trend points", () => {
		const lines: string[] = [];
		for (let d = 1; d <= 20; d += 1) {
			lines.push(
				j({
					at: `2026-09-${String(d).padStart(2, "0")}T00:00:00Z`,
					kind: "handoff",
					score: 50 + d,
				}),
			);
		}
		const [repo] = buildRollup([ok("x", lines)], { nowIso: NOW }).repos;
		expect(TREND_POINTS).toBe(12);
		expect(repo?.trend).toHaveLength(12);
		expect(repo?.trend[11]).toEqual({ date: "2026-09-20", score: 70 });
	});

	it("ignores a repo's stored score weights (like-for-like default weights)", () => {
		// A stored `score` record carries the repo's own weights — never read.
		const lines = [
			...ANDROID,
			v2({
				at: "2026-10-04T09:01:00Z",
				kind: "score",
				score: 3,
				weights: { adoption: 1 },
			}),
		];
		const [repo] = buildRollup([ok("a", lines)], { nowIso: NOW }).repos;
		const expected = scoreFromHistory(text(lines), DEFAULT_WEIGHTS);
		expect(expected.kind).toBe("ok");
		if (expected.kind === "ok") expect(repo?.score).toBe(expected.current);
	});

	it("notes a v1-only history and still reads it", () => {
		const [ios] = buildRollup([ok("ios", IOS_V1)], { nowIso: NOW }).repos;
		expect(ios?.status).toBe("ok");
		expect(ios?.score).toBe(60);
		expect(ios?.history).toEqual({ records: 2, v1: 2, v2: 0, corrupt: 0 });
		expect(ios?.git).toBeUndefined();
		expect(ios?.notes.join(" ")).toMatch(/v1 history/);
		expect(ios?.notes.join(" ")).toMatch(/history migrate/);
		// 95 days since the last handoff → readiness is red (stale ≥ 60).
		expect(ios?.freshness.band).toBe("red");
		expect(ios?.freshness.staleKinds).toEqual(["readiness"]);
	});

	it("notes corrupt lines and keeps the readable ones", () => {
		const [repo] = buildRollup([ok("c", [...ANDROID, "{oops", "42"])], {
			nowIso: NOW,
		}).repos;
		expect(repo?.status).toBe("ok");
		expect(repo?.history.corrupt).toBe(2);
		expect(repo?.notes).toContain("2 unreadable line(s) skipped.");
	});

	it("an all-corrupt history is no-data with a note, never a crash", () => {
		const [repo] = buildRollup([ok("bad", ["not json", "{"])], {
			nowIso: NOW,
		}).repos;
		expect(repo?.status).toBe("no-data");
		expect(repo?.score).toBeUndefined();
		expect(repo?.rank).toBeUndefined();
		expect(repo?.notes).toContain("History has no readable records.");
	});

	it("records without a score-relevant kind are no-data with a hint", () => {
		const [repo] = buildRollup(
			[ok("cl", [j({ at: "2026-10-01T00:00:00Z", kind: "changelog" })])],
			{ nowIso: NOW },
		).repos;
		expect(repo?.status).toBe("no-data");
		expect(repo?.notes.join(" ")).toMatch(/ds-bridge record/);
	});

	it("an unavailable source carries the loader message", () => {
		const [repo] = buildRollup(
			[
				{
					name: "gone",
					source: "/nope",
					load: { kind: "missing", message: "No history at /nope." },
				},
			],
			{ nowIso: NOW },
		).repos;
		expect(repo?.status).toBe("unavailable");
		expect(repo?.notes).toEqual(["No history at /nope."]);
		expect(repo?.trend).toEqual([]);
		expect(repo?.freshness.band).toBe("unknown");
		expect(repo?.history).toEqual({ records: 0, v1: 0, v2: 0, corrupt: 0 });
	});

	it("an empty history file is no-data", () => {
		const [repo] = buildRollup(
			[{ name: "e", source: "/e", load: { kind: "ok", text: "" } }],
			{ nowIso: NOW },
		).repos;
		expect(repo?.status).toBe("no-data");
	});
});

describe("buildRollup — ranking + aggregate", () => {
	const inputs: RollupRepoInput[] = [
		ok("ios", IOS_V1, "Mobile"),
		{
			name: "gone",
			source: "/gone",
			team: "Mobile",
			load: { kind: "error", message: "bad ref" },
		},
		ok("web", WEB, "Web"),
		ok("android", ANDROID, "Mobile"),
		ok("blank", ["garbage"]),
	];
	const model = buildRollup(inputs, { nowIso: NOW });

	it("ranks scored repos by score desc, then no-data, then unavailable", () => {
		const scored = model.repos.slice(0, 3);
		expect(scored.map((r) => r.name).sort()).toEqual(["android", "ios", "web"]);
		const scores = scored.map((r) => r.score as number);
		expect(scores).toEqual([...scores].sort((a, b) => b - a));
		expect(model.repos.slice(3).map((r) => r.name)).toEqual(["blank", "gone"]);
		expect(model.repos.map((r) => r.rank)).toEqual([
			1,
			2,
			3,
			undefined,
			undefined,
		]);
	});

	it("breaks score ties by name", () => {
		const tie = buildRollup(
			[
				ok("b", [
					j({ at: "2026-10-01T00:00:00Z", kind: "handoff", score: 70 }),
				]),
				ok("a", [
					j({ at: "2026-10-01T00:00:00Z", kind: "handoff", score: 70 }),
				]),
			],
			{ nowIso: NOW },
		);
		expect(tie.repos.map((r) => r.name)).toEqual(["a", "b"]);
	});

	it("gives tied scores the same rank (competition ranking 1,1,3)", () => {
		const h = (score: number) => [
			j({ at: "2026-10-01T00:00:00Z", kind: "handoff", score }),
		];
		const tie = buildRollup(
			[ok("web", h(35)), ok("ios", h(35)), ok("and", h(20)), ok("z", h(10))],
			{ nowIso: NOW },
		);
		expect(tie.repos.map((r) => [r.name, r.rank])).toEqual([
			["ios", 1],
			["web", 1],
			["and", 3],
			["z", 4],
		]);
	});

	it("aggregates mean, size-weighted and pooled values", () => {
		const scores = model.repos
			.filter((r) => r.score !== undefined)
			.map((r) => r.score as number);
		const web = model.repos.find((r) => r.name === "web");
		const android = model.repos.find((r) => r.name === "android");
		const a = model.aggregate;
		expect(a.repos).toBe(5);
		expect(a.scored).toBe(3);
		expect(a.meanScore).toBe(
			Math.round(scores.reduce((s, x) => s + x, 0) / scores.length),
		);
		// Only web (100) and android (300) have a size.
		expect(a.sized).toBe(2);
		expect(a.weightedScore).toBe(
			Math.round(
				((web?.score as number) * 100 + (android?.score as number) * 300) / 400,
			),
		);
		expect(a.meanOnSystem).toBe(65); // (80 + 50) / 2
		expect(a.weightedOnSystem).toBe(58); // (80 + 150) / 400 = 57.5 → 58
		expect(a.meanContrast).toBe(90);
		expect(a.meanReadiness).toBe(75); // (90 + 60) / 2
		expect(a.drift).toEqual({ stale: 1, missing: 2, orphan: 0 });
		expect(a.staleRepos).toBe(1); // ios
	});

	it("groups by team when any repo has one (untagged → (no team))", () => {
		expect(model.aggregate.byTeam?.map((t) => t.team)).toEqual([
			"(no team)",
			"Mobile",
			"Web",
		]);
		const mobile = model.aggregate.byTeam?.find((t) => t.team === "Mobile");
		expect(mobile).toMatchObject({ repos: 3, scored: 2, weightedOnSystem: 50 });
	});

	it("omits byTeam and the weighted values when nothing carries them", () => {
		const plain = buildRollup([ok("ios", IOS_V1)], { nowIso: NOW });
		expect(plain.aggregate.byTeam).toBeUndefined();
		expect(plain.aggregate.weightedScore).toBeUndefined();
		expect(plain.aggregate.weightedOnSystem).toBeUndefined();
		expect(plain.aggregate.meanOnSystem).toBeUndefined();
		expect(plain.aggregate.drift).toBeUndefined();
	});

	it("an empty input is an empty, valid model", () => {
		const empty = buildRollup([], { nowIso: NOW });
		expect(empty.repos).toEqual([]);
		expect(empty.aggregate).toMatchObject({ repos: 0, scored: 0, sized: 0 });
		expect(empty.aggregate.meanScore).toBeUndefined();
	});

	it("is deterministic for the same input", () => {
		expect(JSON.stringify(buildRollup(inputs, { nowIso: NOW }))).toBe(
			JSON.stringify(model),
		);
	});
});
