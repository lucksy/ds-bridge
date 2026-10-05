// X6 — the paste-ready Markdown manager report (SPEC-exec-report §5.1). PURE:
// a ManagerReport in → GitHub-flavoured Markdown out (tables + numbered lists,
// no HTML), byte-stable for a given input. Written for a DS manager to paste
// straight into a monthly update: headline table first, then targets, risks,
// next actions, per-frame handoff readiness, and how much of the data is fresh.
import {
	DEBT_INDEX_NOTE,
	frameLabel,
	kindLabel,
	type ManagerReport,
	onSystemChangeText,
	scoreChangeText,
	targetLabel,
	targetOp,
	targetValue,
} from "../../engines/report/manager-report.js";
import type { TargetVerdict } from "../../engines/report/types.js";
import { sparkline } from "../terminal/sparkline.js";

const NOT_MEASURED = "not measured";
const NO_CHANGE = "—";

/** Escape a table cell: pipes break GFM tables; newlines break rows. */
function cell(text: string): string {
	return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function row(cells: readonly string[]): string {
	return `| ${cells.map(cell).join(" | ")} |`;
}

function table(header: readonly string[], rows: readonly string[][]): string[] {
	return [row(header), row(header.map(() => "---")), ...rows.map(row)];
}

function days(n: number): string {
	return `${n} ${n === 1 ? "day" : "days"}`;
}

function headlineRows(report: ManagerReport): string[][] {
	const h = report.headline;
	const onSystem = h.onSystem;
	const coverage = h.importCoverage;
	const handoff = h.handoff;
	return [
		[
			"System score",
			h.score === undefined ? NOT_MEASURED : `${h.score.current}/100`,
			scoreChangeText(h, report.windowDays) ?? NO_CHANGE,
		],
		[
			"On-system usage",
			onSystem === undefined ? NOT_MEASURED : `${onSystem.pct}%`,
			onSystemChangeText(h) ?? NO_CHANGE,
		],
		[
			"Component import coverage",
			coverage === undefined
				? NOT_MEASURED
				: `${coverage.pct}% (${coverage.imported} of ${coverage.total})`,
			NO_CHANGE,
		],
		[
			"Consistency",
			h.consistency === undefined ? NOT_MEASURED : `${h.consistency}/100`,
			NO_CHANGE,
		],
		[
			"Design debt",
			h.debt === undefined
				? NOT_MEASURED
				: `${h.debt.pct}/100 (${h.debt.level})`,
			NO_CHANGE,
		],
		[
			"Handoff readiness",
			handoff === undefined
				? NOT_MEASURED
				: `${handoff.ready} of ${handoff.frames} ${handoff.frames === 1 ? "frame" : "frames"} ready`,
			NO_CHANGE,
		],
	];
}

const STATUS: Record<TargetVerdict["band"], string> = {
	green: "On track",
	amber: "At risk",
	red: "Off track",
	unknown: "Not measured",
};

function numbered(items: readonly string[], empty: string): string[] {
	if (items.length === 0) return [empty];
	return items.map((text, i) => `${i + 1}. ${text.replace(/\r?\n/g, " ")}`);
}

function age(n: number | undefined): string {
	if (n === undefined) return "age unknown";
	return n === 0 ? "today" : `${n}d ago`;
}

/** How many frames the one-pager lists (worst first). */
const FRAMES_SHOWN = 10;

/** Render the manager report as paste-ready Markdown. Pure. */
export function renderManagerMarkdown(report: ManagerReport): string {
	const out: string[] = [
		`# Design system report: ${report.project}`,
		"",
		`Report date ${report.generatedAt.slice(0, 10)} · changes over the last ${days(report.windowDays)}`,
		"",
		...table(["Metric", "Now", "Change"], headlineRows(report)),
		"",
	];

	const trend = report.headline.score?.trend ?? [];
	if (trend.length >= 2) {
		out.push(`Score trend: ${sparkline(trend)} (${trend.length} runs)`, "");
	}

	out.push("## Targets", "");
	if (report.targets.length === 0) {
		out.push(
			"No targets set. Add `metric_targets` to `.ds-bridge.json` to track goals.",
		);
	} else {
		out.push(
			...table(
				["Target", "Now", "Goal", "Status"],
				report.targets.map((t) => [
					targetLabel(t.metric),
					targetValue(t.metric, t.measured),
					`${targetOp(t.op)} ${targetValue(t.metric, t.target)}`,
					STATUS[t.band],
				]),
			),
		);
	}
	out.push("");

	out.push(
		"## Top risks",
		"",
		...numbered(report.risks, "No risks flagged."),
		"",
	);
	out.push(
		"## Next actions",
		"",
		...numbered(report.actions, "Nothing urgent."),
		"",
	);

	out.push("## Handoff readiness by frame", "");
	if (report.frames.length === 0) {
		out.push(
			"No handoff checks yet. Run `ds-bridge handoff <frame-url>` to track frame readiness.",
		);
	} else {
		const shown = report.frames.slice(0, FRAMES_SHOWN);
		out.push(
			...table(
				["Frame", "Readiness", "Pass rate", "Runs"],
				shown.map((f) => [
					frameLabel(f),
					String(f.latest),
					`${f.passRate}%`,
					String(f.runs),
				]),
			),
		);
		if (report.frames.length > shown.length) {
			out.push("", `… and ${report.frames.length - shown.length} more frames`);
		}
	}
	out.push("");

	out.push("## Data coverage", "");
	const { measured, stale, never } = report.coverage;
	if (measured.length + stale.length + never.length === 0) {
		out.push("- No checks recorded yet. Run `ds-bridge record`.");
	} else {
		if (measured.length > 0) {
			out.push(
				`- Measured: ${measured.map((m) => `${kindLabel(m.kind)} (${age(m.ageDays)})`).join(", ")}`,
			);
		}
		if (stale.length > 0) {
			out.push(
				`- Stale: ${stale.map((m) => `${kindLabel(m.kind)} (${age(m.ageDays)})`).join(", ")}`,
			);
		}
		if (never.length > 0) {
			out.push(`- Never measured: ${never.map(kindLabel).join(", ")}`);
		}
	}
	out.push("");
	if (report.headline.debt !== undefined) {
		out.push(`_${DEBT_INDEX_NOTE}_`, "");
	}
	out.push(
		'_Generated by ds-bridge (`report --format exec`) from `.ds-bridge/history.jsonl`. Numbers marked "not measured" were never recorded; they are not zero._',
		"",
	);
	return out.join("\n");
}
