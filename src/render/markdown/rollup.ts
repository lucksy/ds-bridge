// R4 — Markdown org rollup (SPEC-rollup §4): paste-ready for a PR comment or
// $GITHUB_STEP_SUMMARY. PURE: model in → Markdown out; every model string goes
// through mdText (one line, Markdown escaped).
import type { RollupModel } from "../../engines/rollup/rollup.js";
import {
	aggregateLines,
	DASH,
	DRILL_DOWN_NOTE,
	EMPTY_TEXT,
	headline,
	repoCells,
	TABLE_HEADERS,
	WEIGHTS_NOTE,
} from "../rollup-cells.js";
import { mdText } from "./text.js";

function table(headers: readonly string[], rows: string[][]): string[] {
	return [
		`| ${headers.map(mdText).join(" | ")} |`,
		`|${headers.map(() => " --- ").join("|")}|`,
		...rows.map((r) => `| ${r.map(mdText).join(" | ")} |`),
	];
}

export function renderRollupMarkdown(model: RollupModel): string {
	const out = [
		"## Design-system org rollup",
		"",
		`${headline(model)} · ${model.generatedAt.slice(0, 10)}`,
		"",
	];
	if (model.repos.length === 0) {
		out.push(EMPTY_TEXT);
		return `${out.join("\n")}\n`;
	}
	out.push(
		...table(
			["Aggregate", "Value"],
			aggregateLines(model.aggregate).map(([l, v]) => [l, v]),
		),
		"",
		...table(TABLE_HEADERS, model.repos.map(repoCells)),
		"",
	);
	const teams = model.aggregate.byTeam;
	if (teams !== undefined) {
		out.push(
			"### By team",
			"",
			...table(
				["Team", "Repos", "Scored", "Mean score", "Pooled on-system"],
				teams.map((t) => [
					t.team,
					String(t.repos),
					String(t.scored),
					t.meanScore === undefined ? DASH : String(t.meanScore),
					t.weightedOnSystem === undefined ? DASH : `${t.weightedOnSystem}%`,
				]),
			),
			"",
		);
	}
	const notes = model.repos.flatMap((r) =>
		r.notes.map((n) => `- **${mdText(r.name)}**: ${mdText(n)}`),
	);
	if (notes.length > 0) out.push("### Notes", "", ...notes, "");
	out.push(`_${WEIGHTS_NOTE} ${DRILL_DOWN_NOTE}_`);
	return `${out.join("\n")}\n`;
}
