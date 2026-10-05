// X5 — the DS-manager one-page report composer (SPEC-exec-report §5). PURE: no
// fs/network/clock; deterministic; never throws. It COMPOSES values the report
// engines already computed (score + velocity, adoption, import coverage,
// targets, AN1 consistency, AN2 debt, C4 freshness, H7 per-frame readiness)
// into the answers a manager pastes into a monthly update: how healthy, is it
// improving, are we on target, what is at risk, what do we do next, and can we
// trust the numbers. Risks and actions are fixed rule tables (§5) — candidates
// are emitted in rule order, stably sorted by severity, and capped at three.
import type { FrameReadiness } from "../history/readiness-frames.js";
import type { DebtLevel, DebtRollup } from "./debt.js";
import type {
	AdoptionTrendPoint,
	ConsistencySection,
	FreshnessRow,
	ImportCoverage,
	ScoreVelocity,
	SystemScore,
	TargetVerdict,
} from "./types.js";

export interface ManagerReportInput {
	project: string;
	/** ISO instant the report describes (injected at the io edge). */
	generatedAt: string;
	/** The score-velocity window in days (the "Change" column's horizon). */
	windowDays: number;
	/** The configured handoff readiness bar (frames at/above it are "ready"). */
	readinessThreshold: number;
	systemScore?: SystemScore;
	scoreVelocity?: ScoreVelocity;
	adoptionTrend?: AdoptionTrendPoint[];
	importCoverage?: ImportCoverage;
	targets?: TargetVerdict[];
	consistency?: ConsistencySection;
	debt?: DebtRollup;
	dataFreshness?: FreshnessRow[];
	frames?: FrameReadiness[];
	/** The latest drift point's breaking count. */
	breakingDrift?: number;
	/** X9 — the latest contrast audit: failing pairs, level, failing modes. */
	contrast?: { failed: number; level: "AA" | "AAA"; modes: string[] };
	/** X9 — the latest drift point's non-breaking gaps. */
	tokenGaps?: { missing: number; orphan: number };
	/** X10 — stored `score` records inside the window, file order. */
	scorePoints?: { date: string; score: number }[];
}

export interface ManagerHeadline {
	score?: {
		current: number;
		delta?: number;
		direction?: "up" | "down" | "flat";
		/** X10 — first stored score date when the change comes from scorePoints. */
		since?: string;
		trend: number[];
	};
	onSystem?: { pct: number; delta?: number; since?: string };
	importCoverage?: { imported: number; total: number; pct: number };
	consistency?: number;
	debt?: { pct: number; level: DebtLevel; items: number };
	handoff?: { ready: number; frames: number };
}

export interface ManagerReport {
	project: string;
	generatedAt: string;
	windowDays: number;
	readinessThreshold: number;
	headline: ManagerHeadline;
	targets: TargetVerdict[];
	/** Top three risks, most severe first. */
	risks: string[];
	/** Top three next actions, highest priority first. */
	actions: string[];
	/** Per-frame readiness, worst first. */
	frames: FrameReadiness[];
	coverage: {
		measured: { kind: string; ageDays: number }[];
		stale: { kind: string; ageDays?: number }[];
		never: string[];
	};
}

/** How many risks / actions the one-pager keeps. */
const TOP_N = 3;

/** Consistency below this reads as a risk (the `toneFor` error band). */
const LOW_CONSISTENCY = 50;

/** A system score below this reads as a risk (R12). */
const LOW_SCORE = 50;

interface Ranked {
	rank: number;
	text: string;
}

/** Stable sort by rank desc (Array.prototype.sort is stable), then cap. */
function top(candidates: readonly Ranked[]): string[] {
	return [...candidates]
		.sort((a, b) => b.rank - a.rank)
		.slice(0, TOP_N)
		.map((c) => c.text);
}

function plural(n: number, one: string, many: string): string {
	return n === 1 ? one : many;
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

// ─── Plain-language labels (SPEC-exec-report §5 "Labels") ──────────────────

/** A frame's display label: its name, or its key for a v1 line with no name. */
export function frameLabel(
	f: Pick<FrameReadiness, "frameName" | "key">,
): string {
	return f.frameName !== "" ? f.frameName : f.key;
}

/** Freshness kind id → plain words (kinds not listed read as themselves). */
export const KIND_LABEL: Readonly<Record<string, string>> = {
	drift: "token drift",
	readiness: "handoff readiness",
	"frame-impl": "frame implementability",
	"library-health": "library health",
};

export function kindLabel(kind: string): string {
	return KIND_LABEL[kind] ?? kind;
}

/** Target metric id → plain words (an unknown id reads as itself). */
export const TARGET_LABEL: Readonly<Record<string, string>> = {
	"system-score": "System score",
	"on-system": "On-system usage",
	drift: "Token drift",
	parity: "Figma↔code parity",
	contrast: "Contrast (WCAG)",
	readiness: "Handoff readiness (latest run)",
};

export function targetLabel(metric: string): string {
	return TARGET_LABEL[metric] ?? metric;
}

const TARGET_OP: Readonly<Record<TargetVerdict["op"], string>> = {
	">=": "≥",
	"<=": "≤",
	"==": "=",
};

/** A target comparison operator as a math symbol (≥ ≤ =). */
export function targetOp(op: TargetVerdict["op"]): string {
	return TARGET_OP[op] ?? op;
}

/** Target metrics measured as a percentage. */
const PERCENT_METRICS: ReadonlySet<string> = new Set(["on-system", "parity"]);

/** A target value with its unit (`62%` for on-system / parity), `—` when absent. */
export function targetValue(metric: string, value: number | undefined): string {
	if (value === undefined) return "—";
	return PERCENT_METRICS.has(metric) ? `${value}%` : String(value);
}

/** The footnote both renderers print under a measured design-debt index. */
export const DEBT_INDEX_NOTE =
	"Design debt is a weighted index (deprecated ×8, detached ×5, off-system ×2 per item), capped at 100.";

/** Freshness kinds whose history feeds the system score (R9). */
const SCORE_KINDS: ReadonlySet<string> = new Set([
	"drift",
	"lint",
	"readiness",
	"a11y",
	"adoption",
]);

/** Freshness kinds `ds-bridge record` runs by default (A5a). */
const RECORD_KINDS: ReadonlySet<string> = new Set(["lint", "drift", "a11y"]);

/** The command that starts measuring each kind `record` does not cover (A5b). */
const START_COMMAND: Readonly<Record<string, string>> = {
	readiness: "ds-bridge handoff <frame-url>",
	parity: "ds-bridge record --figma",
	"library-health": "ds-bridge record --figma",
	impact: "ds-bridge impact",
	changelog: "ds-bridge changelog",
	"frame-impl": "ds-bridge frame-impl <frame-url>",
	adoption: "ds-bridge registry build",
};

/** "a", "a and b", "a, b and c". */
function joinAnd(items: readonly string[]): string {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function buildHeadline(input: ManagerReportInput): ManagerHeadline {
	const headline: ManagerHeadline = {};

	const score = input.systemScore;
	if (score !== undefined) {
		const velocity = input.scoreVelocity;
		const points = (input.scorePoints ?? []).filter((p) => finite(p.score));
		const firstPoint = points[0];
		const lastPoint = points[points.length - 1];
		headline.score = {
			current: score.current,
			...(velocity !== undefined
				? { delta: velocity.delta, direction: velocity.direction }
				: points.length >= 2 &&
						firstPoint !== undefined &&
						lastPoint !== undefined
					? {
							// Against "Now" itself, so the row can never read "Now 72 ·
							// ±0 pts" when the stored points were scored with other
							// weights (a per-view profile) or before a newer run.
							delta: score.current - firstPoint.score,
							since: firstPoint.date,
						}
					: {}),
			trend: (Array.isArray(score.trend) ? score.trend : []).map(
				(p) => p.score,
			),
		};
	}

	const adoption = input.adoptionTrend ?? [];
	const last = adoption[adoption.length - 1];
	const first = adoption[0];
	if (last !== undefined) {
		headline.onSystem =
			adoption.length >= 2 && first !== undefined
				? { pct: last.pct, delta: last.pct - first.pct, since: first.date }
				: { pct: last.pct };
	}

	const coverage = input.importCoverage;
	if (coverage !== undefined && finite(coverage.total) && coverage.total > 0) {
		headline.importCoverage = {
			imported: coverage.imported,
			total: coverage.total,
			pct: Math.min(
				100,
				Math.max(0, Math.round((100 * coverage.imported) / coverage.total)),
			),
		};
	}

	if (input.consistency !== undefined) {
		headline.consistency = input.consistency.score;
	}

	if (input.debt !== undefined) {
		headline.debt = {
			pct: input.debt.pct,
			level: input.debt.level,
			items: input.debt.items.length,
		};
	}

	const frames = input.frames ?? [];
	if (frames.length > 0) {
		headline.handoff = {
			ready: frames.filter((f) => f.latest >= input.readinessThreshold).length,
			frames: frames.length,
		};
	}

	return headline;
}

/** Frames worst-first: latest score ascending, ties by key ascending. */
function worstFirst(frames: readonly FrameReadiness[]): FrameReadiness[] {
	return [...frames].sort(
		(a, b) =>
			a.latest - b.latest || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
	);
}

function buildRisks(
	input: ManagerReportInput,
	frames: readonly FrameReadiness[],
	stale: readonly string[],
	never: readonly string[],
): string[] {
	const out: Ranked[] = [];
	const targets = input.targets ?? [];

	// R1 — each red target.
	for (const t of targets) {
		if (t.band !== "red") continue;
		out.push({
			rank: 3,
			text: `${targetLabel(t.metric)} is off target: ${targetValue(t.metric, t.measured)} vs goal ${targetOp(t.op)} ${targetValue(t.metric, t.target)}`,
		});
	}

	// R2 — the score is falling over the window.
	const velocity = input.scoreVelocity;
	if (velocity !== undefined && velocity.direction === "down") {
		const fell = Math.abs(velocity.delta);
		const streak = velocity.regressionStreak;
		out.push({
			rank: streak >= 2 ? 3 : 2,
			text: `System score fell ${fell} ${plural(fell, "pt", "pts")} in ${velocity.windowDays} ${plural(velocity.windowDays, "day", "days")}${streak >= 2 ? ` (${streak} drops in a row)` : ""}`,
		});
	}

	// R3 — breaking token drift in the latest check.
	const drift = input.breakingDrift;
	if (finite(drift) && drift > 0) {
		out.push({
			rank: 3,
			text: `${drift} breaking token ${plural(drift, "change", "changes")} in the latest drift check`,
		});
	}

	// R4 — design debt at medium / high.
	const debt = input.debt;
	if (debt !== undefined && debt.level !== "low") {
		const largest = debt.items[0]?.subject;
		out.push({
			rank: debt.level === "high" ? 3 : 2,
			text: `Design debt is ${debt.level} at ${debt.pct}/100${largest !== undefined ? ` (largest: ${largest})` : ""}`,
		});
	}

	// R5 — frames below the readiness bar.
	const below = frames.filter((f) => f.latest < input.readinessThreshold);
	const lowest = below[0];
	if (lowest !== undefined) {
		out.push({
			rank: 2,
			text: `${below.length} of ${frames.length} tracked ${plural(frames.length, "frame", "frames")} ${plural(below.length, "is", "are")} below the ${input.readinessThreshold} readiness bar (lowest: "${frameLabel(lowest)}" at ${lowest.latest})`,
		});
	}

	// R6 — low consistency.
	const consistency = input.consistency;
	if (consistency !== undefined && consistency.score < LOW_CONSISTENCY) {
		out.push({
			rank: 2,
			text: `Consistency is low at ${consistency.score}/100`,
		});
	}

	// R7 — stale data.
	if (stale.length > 0) {
		out.push({
			rank: 2,
			text: `Stale data: ${stale.map(kindLabel).join(", ")} not measured recently`,
		});
	}

	// R8 — each amber target.
	for (const t of targets) {
		if (t.band !== "amber") continue;
		out.push({
			rank: 1,
			text: `${targetLabel(t.metric)} is close to its goal: ${targetValue(t.metric, t.measured)} vs ${targetOp(t.op)} ${targetValue(t.metric, t.target)}`,
		});
	}

	// R9 — never-measured checks that feed the system score (optional checks a
	// project may never run are not a risk; A5 still suggests them).
	const neverScored = never.filter((k) => SCORE_KINDS.has(k));
	if (neverScored.length > 0) {
		out.push({
			rank: 1,
			text: `Never measured: ${neverScored.map(kindLabel).join(", ")}`,
		});
	}

	// R10 — failing contrast pairs in the latest audit.
	const contrast = input.contrast;
	if (
		contrast !== undefined &&
		finite(contrast.failed) &&
		contrast.failed > 0
	) {
		const n = contrast.failed;
		const modes =
			contrast.modes.length > 0 ? ` (${contrast.modes.join(", ")})` : "";
		out.push({
			rank: 3,
			text: `${n} contrast ${plural(n, "pair fails", "pairs fail")} WCAG ${contrast.level}${modes}`,
		});
	}

	// R11 — tokens missing from the code output / orphan outputs.
	const gaps = input.tokenGaps;
	const missing = finite(gaps?.missing) ? (gaps?.missing ?? 0) : 0;
	const orphan = finite(gaps?.orphan) ? (gaps?.orphan ?? 0) : 0;
	if (missing > 0) {
		out.push({
			rank: 2,
			text: `${missing} design ${plural(missing, "token is", "tokens are")} missing from the code output${orphan > 0 ? `, ${orphan} orphan ${plural(orphan, "output", "outputs")} without a source token` : ""}`,
		});
	} else if (orphan > 0) {
		out.push({
			rank: 2,
			text: `${orphan} orphan token ${plural(orphan, "output", "outputs")} without a source token`,
		});
	}

	// R12 — a low absolute system score (unless a red target already says so).
	const score = input.systemScore;
	const redScoreTarget = targets.some(
		(t) => t.metric === "system-score" && t.band === "red",
	);
	if (
		score !== undefined &&
		finite(score.current) &&
		score.current < LOW_SCORE &&
		!redScoreTarget
	) {
		out.push({ rank: 2, text: `System score is ${score.current}/100` });
	}

	return top(out);
}

function buildActions(
	input: ManagerReportInput,
	frames: readonly FrameReadiness[],
	stale: readonly string[],
	never: readonly string[],
): string[] {
	const out: Ranked[] = [];

	// A1 — each red target.
	for (const t of input.targets ?? []) {
		if (t.band !== "red") continue;
		out.push({
			rank: 3,
			text: `Bring ${targetLabel(t.metric)} to ${targetOp(t.op)} ${targetValue(t.metric, t.target)} (now ${targetValue(t.metric, t.measured)})`,
		});
	}

	// A2 — the two worst debt items' directed recommendations.
	const debt = input.debt;
	if (debt !== undefined) {
		for (const item of debt.items.slice(0, 2)) {
			out.push({
				rank: debt.level === "high" ? 3 : 2,
				text: item.recommendation,
			});
		}
	}

	// A3 — breaking token drift.
	const drift = input.breakingDrift;
	if (finite(drift) && drift > 0) {
		out.push({
			rank: 3,
			text: `Resolve the ${drift} breaking token ${plural(drift, "change", "changes")} (run ds-bridge tokens check)`,
		});
	}

	// A4 — the lowest frame below the bar.
	const lowest = frames.find((f) => f.latest < input.readinessThreshold);
	if (lowest !== undefined) {
		out.push({
			rank: 2,
			text: `Raise handoff readiness of "${frameLabel(lowest)}" from ${lowest.latest} to ${input.readinessThreshold}+ (run ds-bridge handoff)`,
		});
	}

	// A5a — refresh stale data, or never-measured kinds `record` covers.
	if (stale.length > 0 || never.some((k) => RECORD_KINDS.has(k))) {
		out.push({ rank: 1, text: "Refresh the data: run ds-bridge record" });
	}

	// A5b — start measuring each other never-measured kind, grouped by command
	// (in freshness order of each command's first kind).
	const byCommand = new Map<string, string[]>();
	for (const kind of never) {
		const command = START_COMMAND[kind];
		if (command === undefined) continue;
		const kinds = byCommand.get(command) ?? [];
		kinds.push(kindLabel(kind));
		byCommand.set(command, kinds);
	}
	for (const [command, kinds] of byCommand) {
		out.push({
			rank: 1,
			text: `Start measuring ${joinAnd(kinds)}: run ${command}`,
		});
	}

	// A6 — fix failing contrast pairs.
	const contrast = input.contrast;
	if (
		contrast !== undefined &&
		finite(contrast.failed) &&
		contrast.failed > 0
	) {
		const n = contrast.failed;
		out.push({
			rank: 3,
			text: `Fix the ${n} failing contrast ${plural(n, "pair", "pairs")} (run ds-bridge a11y)`,
		});
	}

	// A7 / A7b — missing tokens, else orphan outputs.
	const gaps = input.tokenGaps;
	const missing = finite(gaps?.missing) ? (gaps?.missing ?? 0) : 0;
	const orphan = finite(gaps?.orphan) ? (gaps?.orphan ?? 0) : 0;
	if (missing > 0) {
		out.push({
			rank: 2,
			text: `Add the ${missing} missing ${plural(missing, "token", "tokens")} to the code output (run ds-bridge tokens check)`,
		});
	} else if (orphan > 0) {
		out.push({
			rank: 1,
			text: `Remove or re-source the ${orphan} orphan token ${plural(orphan, "output", "outputs")} (run ds-bridge tokens check)`,
		});
	}

	return top(out);
}

function signedNumber(n: number): string {
	if (n > 0) return `+${n}`;
	if (n < 0) return `−${Math.abs(n)}`;
	return "±0";
}

function dayCount(n: number): string {
	return `${n} ${plural(n, "day", "days")}`;
}

/**
 * The headline score's change text, shared by the Markdown and HTML renderers:
 * "▲ +6 in 30 days" / "▼ −4 in 14 days" / "no change in 30 days", or undefined
 * when no velocity was measured.
 */
export function scoreChangeText(
	headline: ManagerHeadline,
	windowDays: number,
): string | undefined {
	const score = headline.score;
	if (
		score?.delta !== undefined &&
		score.direction === undefined &&
		score.since !== undefined
	) {
		// X10 — no velocity, but ≥ 2 stored score points: same form as on-system.
		return `${signedNumber(score.delta)} pts since ${score.since}`;
	}
	if (score?.delta === undefined || score.direction === undefined) {
		return undefined;
	}
	if (score.direction === "flat" || score.delta === 0) {
		return `no change in ${dayCount(windowDays)}`;
	}
	const arrow = score.direction === "up" ? "▲" : "▼";
	return `${arrow} ${signedNumber(score.delta)} in ${dayCount(windowDays)}`;
}

/** The on-system change text ("+3 pts since 2026-09-01"), or undefined. */
export function onSystemChangeText(
	headline: ManagerHeadline,
): string | undefined {
	const onSystem = headline.onSystem;
	if (onSystem?.delta === undefined || onSystem.since === undefined) {
		return undefined;
	}
	return `${signedNumber(onSystem.delta)} pts since ${onSystem.since}`;
}

/** Compose the manager report. Pure; never throws. */
export function buildManagerReport(input: ManagerReportInput): ManagerReport {
	const frames = worstFirst(input.frames ?? []);

	const measured: { kind: string; ageDays: number }[] = [];
	const stale: { kind: string; ageDays?: number }[] = [];
	const never: string[] = [];
	for (const row of input.dataFreshness ?? []) {
		if (row.band === "unknown") {
			never.push(row.kind);
		} else if (row.band === "red") {
			stale.push({
				kind: row.kind,
				...(row.ageDays !== undefined ? { ageDays: row.ageDays } : {}),
			});
		} else {
			measured.push({ kind: row.kind, ageDays: row.ageDays ?? 0 });
		}
	}

	return {
		project: input.project,
		generatedAt: input.generatedAt,
		windowDays: input.windowDays,
		readinessThreshold: input.readinessThreshold,
		headline: buildHeadline(input),
		targets: [...(input.targets ?? [])],
		risks: buildRisks(
			input,
			frames,
			stale.map((s) => s.kind),
			never,
		),
		actions: buildActions(
			input,
			frames,
			stale.map((s) => s.kind),
			never,
		),
		frames,
		coverage: { measured, stale, never },
	};
}
