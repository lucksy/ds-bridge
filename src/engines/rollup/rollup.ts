// R2 — the org rollup model (SPEC-rollup §3). PURE: one loaded history text per
// repo (or the loader's failure) + an injected `nowIso` in → a ranked, typed org
// view out. No fs/git/clock. Every per-repo number is derived by the EXISTING
// engines over that repo's history — scoreFromHistory (score + trend),
// buildScorecard (on-system / contrast / drift / readiness), buildFreshness,
// historyStats — so a repo's row always agrees with its own `report`/scorecard.
//
// Every repo is scored with the DEFAULT weights (SPEC-scorecard §1.5 precedent:
// one comparable metric); a repo's own score_weights and its stored `score`
// records are deliberately not read. One bad source never fails the model: it
// becomes a row with status `unavailable` / `no-data` and a note.

import { historyStats } from "../history/stats.js";
import { buildFreshness } from "../report/freshness.js";
import { type HistoryRecord, replayHistory } from "../report/history-lines.js";
import {
	DEFAULT_WEIGHTS,
	scoreFromHistory,
	type TrendPoint,
} from "../report/score.js";
import {
	buildScorecard,
	type DriftCounts,
	type ReadinessValue,
} from "../report/scorecard.js";

export const ROLLUP_SCHEMA = "ds-bridge/rollup";
export const ROLLUP_SCHEMA_VERSION = 1;
/** Sparkline length: the last N score-trend points per repo. */
export const TREND_POINTS = 12;
/** The team bucket for repos without a configured team. */
export const NO_TEAM = "(no team)";

/** How a source loaded (the io edge's typed outcome). */
export type RollupLoad =
	| { kind: "ok"; text: string }
	| { kind: "missing"; message: string }
	| { kind: "error"; message: string };

export interface RollupRepoInput {
	name: string;
	/** The source as given (path, file or path@ref) — echoed for the reader. */
	source: string;
	team?: string;
	load: RollupLoad;
}

export type RollupRepoStatus = "ok" | "no-data" | "unavailable";
export type RollupBand = "green" | "amber" | "red" | "unknown";

export interface RollupFreshness {
	/** The latest `at` in the history (any kind). */
	lastAt?: string;
	/** Whole days from lastAt's day to now. */
	ageDays?: number;
	/** Worst band over the check kinds that ran (default thresholds). */
	band: RollupBand;
	/** Kinds whose band is red. */
	staleKinds: string[];
}

export interface RollupRepo {
	rank?: number;
	name: string;
	source: string;
	team?: string;
	status: RollupRepoStatus;
	score?: number;
	trend: TrendPoint[];
	onSystem?: number;
	/** The adoption counts behind onSystem (pooled into the weighted aggregate). */
	onSystemCounts?: { refs: number; literals: number };
	contrast?: number;
	drift?: DriftCounts;
	readiness?: ReadinessValue;
	/** Style values measured (refs + literals) — the repo's weight. */
	size?: number;
	freshness: RollupFreshness;
	history: { records: number; v1: number; v2: number; corrupt: number };
	git?: { branch: string | null; sha: string };
	toolVersion?: string;
	notes: string[];
}

export interface RollupTeam {
	team: string;
	repos: number;
	scored: number;
	meanScore?: number;
	weightedOnSystem?: number;
}

export interface RollupAggregate {
	repos: number;
	scored: number;
	/** Repos with a size (the weighted means' population). */
	sized: number;
	meanScore?: number;
	weightedScore?: number;
	meanOnSystem?: number;
	weightedOnSystem?: number;
	meanContrast?: number;
	meanReadiness?: number;
	drift?: DriftCounts;
	staleRepos: number;
	byTeam?: RollupTeam[];
}

export interface RollupModel {
	schema: typeof ROLLUP_SCHEMA;
	schemaVersion: typeof ROLLUP_SCHEMA_VERSION;
	generatedAt: string;
	weights: "default";
	aggregate: RollupAggregate;
	repos: RollupRepo[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BAND_ORDER: readonly RollupBand[] = ["unknown", "green", "amber", "red"];

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

function mean(values: readonly number[]): number | undefined {
	if (values.length === 0) return undefined;
	return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function pooledOnSystem(repos: readonly RollupRepo[]): number | undefined {
	let refs = 0;
	let total = 0;
	for (const r of repos) {
		if (r.onSystemCounts === undefined) continue;
		refs += r.onSystemCounts.refs;
		total += r.onSystemCounts.refs + r.onSystemCounts.literals;
	}
	return total > 0 ? Math.round((100 * refs) / total) : undefined;
}

/** The latest adoption-bearing lint record's counts (parallel last-wins). */
function latestAdoption(
	records: readonly HistoryRecord[],
): { refs: number; literals: number } | undefined {
	let latest: { refs: number; literals: number } | undefined;
	for (const { kind, record } of records) {
		if (kind !== "lint") continue;
		const adoption = asRecord(record.adoption);
		if (adoption === undefined) continue;
		latest = {
			refs: asNumber(adoption.refs),
			literals: asNumber(adoption.literals),
		};
	}
	return latest;
}

function freshnessOf(
	records: HistoryRecord[],
	nowIso: string,
): RollupFreshness {
	let lastAt: string | undefined;
	for (const r of records) {
		if (r.at !== undefined && (lastAt === undefined || r.at > lastAt)) {
			lastAt = r.at;
		}
	}
	const rows = buildFreshness(records, nowIso, undefined);
	let band: RollupBand = "unknown";
	for (const row of rows) {
		if (BAND_ORDER.indexOf(row.band) > BAND_ORDER.indexOf(band))
			band = row.band;
	}
	const out: RollupFreshness = {
		band,
		staleKinds: rows.filter((r) => r.band === "red").map((r) => r.kind),
	};
	if (lastAt !== undefined) {
		out.lastAt = lastAt;
		const last = Date.parse(`${lastAt.slice(0, 10)}T00:00:00.000Z`);
		const now = Date.parse(nowIso);
		if (!Number.isNaN(last) && !Number.isNaN(now)) {
			out.ageDays = Math.max(0, Math.floor((now - last) / MS_PER_DAY));
		}
	}
	return out;
}

function latestEnvelope(
	records: readonly HistoryRecord[],
): Pick<RollupRepo, "git" | "toolVersion"> {
	const out: Pick<RollupRepo, "git" | "toolVersion"> = {};
	for (const { envelope } of records) {
		if (envelope === undefined) continue;
		if (envelope.git != null) {
			out.git = { branch: envelope.git.branch, sha: envelope.git.sha };
		}
		if (envelope.tool != null) out.toolVersion = envelope.tool.version;
	}
	return out;
}

function summarizeRepo(input: RollupRepoInput, nowIso: string): RollupRepo {
	const base: RollupRepo = {
		name: input.name,
		source: input.source,
		...(input.team !== undefined ? { team: input.team } : {}),
		status: "unavailable",
		trend: [],
		freshness: { band: "unknown", staleKinds: [] },
		history: { records: 0, v1: 0, v2: 0, corrupt: 0 },
		notes: [],
	};
	if (input.load.kind !== "ok") {
		base.notes.push(input.load.message);
		return base;
	}
	const text = input.load.text;
	const stats = historyStats(text, 0);
	base.history = {
		records: stats.records,
		v1: stats.v1,
		v2: stats.v2,
		corrupt: stats.corrupt,
	};
	base.status = "no-data";
	if (stats.records === 0) {
		base.notes.push("History has no readable records.");
		return base;
	}
	if (stats.corrupt > 0) {
		base.notes.push(`${stats.corrupt} unreadable line(s) skipped.`);
	}
	if (stats.v1 > 0 && stats.v2 === 0) {
		base.notes.push(
			"v1 history (no envelope): commit/branch unknown — run ds-bridge history migrate.",
		);
	}
	// One replay feeds the local folds (envelope, freshness, adoption); the
	// score, scorecard and stats engines take the text and replay it themselves.
	const records = replayHistory(text);
	Object.assign(base, latestEnvelope(records));
	base.freshness = freshnessOf(records, nowIso);

	const score = scoreFromHistory(text, DEFAULT_WEIGHTS);
	if (score.kind === "no-data") {
		base.notes.push(
			"No score-relevant checks recorded yet — run ds-bridge record.",
		);
		return base;
	}
	base.status = "ok";
	base.score = score.current;
	base.trend = score.trend.slice(-TREND_POINTS);

	const card = buildScorecard(text, undefined, DEFAULT_WEIGHTS);
	if (card.kind === "ok") {
		for (const row of card.rows) {
			if (row.id === "on-system" && row.now !== undefined) {
				base.onSystem = row.now;
			} else if (row.id === "contrast" && row.now !== undefined) {
				base.contrast = row.now;
			} else if (row.id === "drift" && row.now !== undefined) {
				base.drift = row.now;
			} else if (row.id === "readiness" && row.now !== undefined) {
				base.readiness = row.now;
			}
		}
	}
	const adoption = latestAdoption(records);
	if (adoption !== undefined) {
		const size = adoption.refs + adoption.literals;
		if (size > 0) {
			base.onSystemCounts = adoption;
			base.size = size;
		}
	}
	return base;
}

const STATUS_ORDER: Record<RollupRepoStatus, number> = {
	ok: 0,
	"no-data": 1,
	unavailable: 2,
};

function rank(repos: RollupRepo[]): RollupRepo[] {
	const sorted = [...repos].sort(
		(a, b) =>
			STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
			(b.score ?? 0) - (a.score ?? 0) ||
			(a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
	);
	// Standard competition ranking: a tie shares the earlier rank (1,1,3), so a
	// name-ordered tie never reads as one repo doing worse.
	let position = 0;
	let prev: RollupRepo | undefined;
	for (const repo of sorted) {
		if (repo.status !== "ok") continue;
		position += 1;
		repo.rank =
			prev !== undefined && prev.score === repo.score
				? (prev.rank ?? position)
				: position;
		prev = repo;
	}
	// Re-key so `rank` leads each row in JSON (readable, stable key order).
	return sorted.map(({ rank: r, ...rest }) =>
		r === undefined ? rest : { rank: r, ...rest },
	);
}

function aggregate(repos: readonly RollupRepo[]): RollupAggregate {
	const scored = repos.filter((r) => r.score !== undefined);
	const sized = scored.filter((r) => r.size !== undefined);
	const out: RollupAggregate = {
		repos: repos.length,
		scored: scored.length,
		sized: sized.length,
		staleRepos: repos.filter((r) => r.freshness.band === "red").length,
	};
	const meanScore = mean(scored.map((r) => r.score as number));
	if (meanScore !== undefined) out.meanScore = meanScore;
	const totalSize = sized.reduce((s, r) => s + (r.size as number), 0);
	if (totalSize > 0) {
		out.weightedScore = Math.round(
			sized.reduce((s, r) => s + (r.score as number) * (r.size as number), 0) /
				totalSize,
		);
	}
	const onSystem = mean(
		repos.flatMap((r) => (r.onSystem === undefined ? [] : [r.onSystem])),
	);
	if (onSystem !== undefined) out.meanOnSystem = onSystem;
	const pooled = pooledOnSystem(repos);
	if (pooled !== undefined) out.weightedOnSystem = pooled;
	const contrast = mean(
		repos.flatMap((r) => (r.contrast === undefined ? [] : [r.contrast])),
	);
	if (contrast !== undefined) out.meanContrast = contrast;
	const readiness = mean(
		repos.flatMap((r) =>
			r.readiness === undefined ? [] : [r.readiness.score],
		),
	);
	if (readiness !== undefined) out.meanReadiness = readiness;
	const drifted = repos.filter((r) => r.drift !== undefined);
	if (drifted.length > 0) {
		out.drift = drifted.reduce<DriftCounts>(
			(acc, r) => ({
				stale: acc.stale + (r.drift?.stale ?? 0),
				missing: acc.missing + (r.drift?.missing ?? 0),
				orphan: acc.orphan + (r.drift?.orphan ?? 0),
			}),
			{ stale: 0, missing: 0, orphan: 0 },
		);
	}
	if (repos.some((r) => r.team !== undefined)) {
		const teams = new Map<string, RollupRepo[]>();
		for (const r of repos) {
			const key = r.team ?? NO_TEAM;
			teams.set(key, [...(teams.get(key) ?? []), r]);
		}
		out.byTeam = [...teams.keys()].sort().map((team) => {
			const members = teams.get(team) ?? [];
			const row: RollupTeam = {
				team,
				repos: members.length,
				scored: members.filter((m) => m.score !== undefined).length,
			};
			const m = mean(
				members.flatMap((x) => (x.score === undefined ? [] : [x.score])),
			);
			if (m !== undefined) row.meanScore = m;
			const w = pooledOnSystem(members);
			if (w !== undefined) row.weightedOnSystem = w;
			return row;
		});
	}
	return out;
}

/** Build the ranked org view. Deterministic for a given input + nowIso. */
export function buildRollup(
	inputs: readonly RollupRepoInput[],
	opts: { nowIso: string },
): RollupModel {
	const repos = rank(inputs.map((i) => summarizeRepo(i, opts.nowIso)));
	return {
		schema: ROLLUP_SCHEMA,
		schemaVersion: ROLLUP_SCHEMA_VERSION,
		generatedAt: opts.nowIso,
		weights: "default",
		aggregate: aggregate(repos),
		repos,
	};
}
