// R4 — terminal org rollup (SPEC-rollup §4). PURE: model in → text out, built
// from the shared terminal primitives (renderTable + sparkline).

import type { RollupModel } from "../../engines/rollup/rollup.js";
import {
	aggregateLines,
	DRIFT_LABEL,
	DRIFT_LEGEND,
	DRIFT_SHORT,
	EMPTY_TEXT,
	headline,
	repoCells,
	TABLE_HEADERS,
	WEIGHTS_NOTE,
} from "../rollup-cells.js";
import { terminalSafe } from "./sanitize.js";
import { renderTable } from "./table.js";

export function renderRollupTerm(model: RollupModel): string {
	const lines = [headline(model), ""];
	if (model.repos.length === 0) {
		lines.push(EMPTY_TEXT);
		return terminalSafe(`${lines.join("\n")}\n`);
	}
	const pairs = aggregateLines(model.aggregate);
	const width = Math.max(...pairs.map(([label]) => label.length));
	for (const [label, value] of pairs) {
		lines.push(`${label.padEnd(width)}  ${value}`);
	}
	lines.push("");
	lines.push(
		renderTable(
			TABLE_HEADERS.map((h) => (h === DRIFT_LABEL ? DRIFT_SHORT : h)),
			model.repos.map(repoCells),
			{
				color: false,
				// Numeric columns stay right-aligned when a row is "—" (unmeasured).
				align: [
					"right",
					"left",
					"right",
					"left",
					"right",
					"left",
					"right",
					"right",
					"left",
				],
			},
		),
	);
	const teams = model.aggregate.byTeam;
	if (teams !== undefined) {
		lines.push("");
		lines.push(
			renderTable(
				["Team", "Repos", "Scored", "Mean score", "Pooled on-system"],
				teams.map((t) => [
					t.team,
					String(t.repos),
					String(t.scored),
					t.meanScore === undefined ? "—" : String(t.meanScore),
					t.weightedOnSystem === undefined ? "—" : `${t.weightedOnSystem}%`,
				]),
				{ color: false, align: ["left", "right", "right", "right", "right"] },
			),
		);
	}
	const notes = model.repos.flatMap((r) =>
		r.notes.map((n) => `  ${r.name}: ${n}`),
	);
	if (notes.length > 0) {
		lines.push("", "Notes", ...notes);
	}
	lines.push("", WEIGHTS_NOTE, DRIFT_LEGEND);
	return terminalSafe(`${lines.join("\n")}\n`);
}
