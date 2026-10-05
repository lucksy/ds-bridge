// R4 — shared cell text for the org-rollup renderers (term / md / html). PURE.
// Unmeasured values render as "—" (never 0): absent is not zero.
import type {
	RollupAggregate,
	RollupModel,
	RollupRepo,
} from "../engines/rollup/rollup.js";
import { sparkline } from "./terminal/sparkline.js";

export const DASH = "—";

export function pctText(value: number | undefined): string {
	return value === undefined ? DASH : `${value}%`;
}

export function numText(value: number | undefined): string {
	return value === undefined ? DASH : String(value);
}

export function driftText(repo: Pick<RollupRepo, "drift">): string {
	const d = repo.drift;
	return d === undefined ? DASH : `${d.stale}/${d.missing}/${d.orphan}`;
}

export function readinessText(repo: RollupRepo): string {
	return repo.readiness === undefined ? DASH : String(repo.readiness.score);
}

/** One recorded run is not a trend: fewer than two points render as "—". */
export function trendText(repo: RollupRepo): string {
	return repo.trend.length < 2
		? DASH
		: sparkline(repo.trend.map((p) => p.score));
}

export function freshText(repo: RollupRepo): string {
	const f = repo.freshness;
	if (f.ageDays === undefined) return DASH;
	const age = f.ageDays === 0 ? "today" : `${f.ageDays}d`;
	return f.band === "unknown" ? age : `${age} (${f.band})`;
}

export function rankText(repo: RollupRepo): string {
	return repo.rank === undefined ? DASH : String(repo.rank);
}

/** Same wording as the PR scorecard (`report --format md`) for the same metric. */
export const DRIFT_LABEL = "Drift (stale/missing/orphan)";
/** Compact header for the width-bound terminal table, paired with DRIFT_LEGEND. */
export const DRIFT_SHORT = "Drift";
export const DRIFT_LEGEND = "Drift = stale/missing/orphan tokens.";

export const TABLE_HEADERS = [
	"#",
	"Repo",
	"Score",
	"Trend",
	"On-system",
	DRIFT_LABEL,
	"Contrast",
	"Readiness",
	"Fresh",
] as const;

/** One row of plain cells (callers escape for their medium). */
export function repoCells(repo: RollupRepo): string[] {
	return [
		rankText(repo),
		repo.team === undefined ? repo.name : `${repo.name} · ${repo.team}`,
		numText(repo.score),
		trendText(repo),
		pctText(repo.onSystem),
		driftText(repo),
		pctText(repo.contrast),
		readinessText(repo),
		freshText(repo),
	];
}

/** The aggregate as label/value pairs, in display order. */
export function aggregateLines(a: RollupAggregate): [string, string][] {
	return [
		["Mean score", numText(a.meanScore)],
		[
			"Size-weighted score",
			a.weightedScore === undefined
				? DASH
				: `${a.weightedScore} (${a.sized} sized repo${a.sized === 1 ? "" : "s"})`,
		],
		["Mean on-system", pctText(a.meanOnSystem)],
		["Pooled on-system", pctText(a.weightedOnSystem)],
		["Mean contrast", pctText(a.meanContrast)],
		["Mean readiness", numText(a.meanReadiness)],
		[DRIFT_LABEL, driftText(a)],
		["Stale repos", String(a.staleRepos)],
	];
}

export function headline(model: RollupModel): string {
	const a = model.aggregate;
	return `Org rollup — ${a.repos} repo${a.repos === 1 ? "" : "s"} (${a.scored} scored)`;
}

export const EMPTY_TEXT =
	"No repos to roll up. Pass repo paths (or <path>@<ref>) or add .ds-bridge/rollup.json.";

export const WEIGHTS_NOTE =
	"Scores use the default weights for every repo (like-for-like ranking).";

export const DRILL_DOWN_NOTE =
	"Drill into one repo with `ds-bridge report <repo> --view org` (uses that repo's own score weights and working-tree history, so its score can differ from the default-weight rollup).";

export const NO_TRENDS_TEXT = "Trends appear after a second recorded run.";
