// H4 — the stored composite score (SPEC-history-v2 §2, gap G3). PURE: history
// text + the resolved weight profile in → the `score` record payload out.
//
// `record` appends this after each batch so the score trend is auditable: the
// number is stored WITH the weights that produced it, so a later weights change
// never silently rewrites the past. Every reader (incl. scoreFromHistory) treats
// `kind: "score"` as an unknown kind, so it never feeds itself or double counts.
import {
	type ComponentKind,
	scoreFromHistory,
	type WeightProfile,
	type Weights,
} from "../report/score.js";

/** The `score` history payload (the writer adds the v2 envelope). */
export interface ScoreRecordPayload {
	kind: "score";
	/** The composite 0–100 (half-up rounded once), as the dashboard shows it. */
	score: number;
	/** Present components only, display-rounded. */
	subScores: Partial<Record<ComponentKind, number>>;
	/** The FULL weights table applied (all components). */
	weights: Weights;
	/** Where the weights came from: `default` | `project` | `view:<name>`. */
	weightsSource: string;
}

/** The `score` payload for this history, or undefined when there is no data. */
export function scoreRecordPayload(
	text: string,
	profile: WeightProfile,
): ScoreRecordPayload | undefined {
	const outcome = scoreFromHistory(text, profile.weights);
	if (outcome.kind !== "ok") return undefined;
	const subScores: Partial<Record<ComponentKind, number>> = {};
	for (const component of outcome.components) {
		subScores[component.kind] = component.score;
	}
	return {
		kind: "score",
		score: outcome.current,
		subScores,
		weights: { ...profile.weights },
		weightsSource:
			profile.source === "view" ? `view:${profile.name ?? ""}` : profile.source,
	};
}
