// C1 / M3.1 — targets RAG engine. PURE: a map of measured scalars + a validated
// `metric_targets` config map in → a `TargetVerdict[]` out. No fs/clock/network;
// deterministic; never throws. One verdict per CONFIGURED target (config order),
// banding each measured scalar against its `{op, value, warn?}` goal.
//
// Banding (SPEC-personas §5 C1):
//   - GREEN  — the op is satisfied (`>=`/`<=` inclusive; `==` exact).
//   - AMBER  — the op fails but the measurement is within the warn band on the
//              FAILING side. The amber boundary is the explicit `warn` threshold
//              when set, else the default margin = 10% of the target value applied
//              on the failing side (so a target of 0 collapses amber → green-or-red).
//              For `==`, the failing side is BOTH directions (a symmetric ±margin).
//   - RED    — the op fails and the measurement is outside the amber band.
//   - UNKNOWN — the metric was never measured (`undefined`). NEVER a misleading red.
//
// Absent config → []. A configured metric with no measured scalar → `unknown`.
import type {
	MetricTarget,
	MetricTargets,
	TargetMetric,
} from "../../config.js";
import type { TargetVerdict } from "./types.js";

/** Measured latest scalars, keyed by target metric; `undefined` = never recorded. */
export type LatestScalars = Partial<Record<TargetMetric, number | undefined>>;

/** Whether the op is satisfied by `measured` against `value` (inclusive `>=`/`<=`). */
function isSatisfied(
	measured: number,
	op: MetricTarget["op"],
	value: number,
): boolean {
	switch (op) {
		case ">=":
			return measured >= value;
		case "<=":
			return measured <= value;
		case "==":
			return measured === value;
	}
}

/**
 * The amber-band boundary on the failing side: the explicit `warn` threshold when
 * set, else the target shifted by 10% of its magnitude toward the failing side.
 * For `>=` the boundary is a floor (`value - margin`); for `<=` a ceiling
 * (`value + margin`); `==` uses the margin symmetrically (see {@link bandFor}).
 */
function defaultMargin(value: number): number {
	return Math.abs(value) * 0.1;
}

/** Band a measured scalar against one configured target. */
function bandFor(
	measured: number,
	target: MetricTarget,
): TargetVerdict["band"] {
	const { op, value, warn } = target;
	if (isSatisfied(measured, op, value)) return "green";

	// Op failed — is the measurement within the amber band on the failing side?
	const margin = defaultMargin(value);
	if (op === ">=") {
		// Failing side is below the target; amber floor = warn (explicit) or value-margin.
		const floor = warn ?? value - margin;
		return measured >= floor ? "amber" : "red";
	}
	if (op === "<=") {
		// Failing side is above the target; amber ceiling = warn (explicit) or value+margin.
		const ceiling = warn ?? value + margin;
		return measured <= ceiling ? "amber" : "red";
	}
	// op === "==": amber is a symmetric band around the target. An explicit `warn`
	// is read as a half-width; the default is the 10%-of-target margin.
	const halfWidth = warn ?? margin;
	return Math.abs(measured - value) <= halfWidth ? "amber" : "red";
}

/**
 * Evaluate every configured metric target against the measured latest scalars.
 * One {@link TargetVerdict} per configured metric, in the config's key order. A
 * metric with no measured scalar (`undefined` or absent) bands `unknown`. Empty
 * config → []. Pure and deterministic.
 */
export function evaluateTargets(
	latest: LatestScalars,
	targets: MetricTargets,
): TargetVerdict[] {
	const verdicts: TargetVerdict[] = [];
	for (const [metric, target] of Object.entries(targets) as [
		TargetMetric,
		MetricTarget,
	][]) {
		const measured = latest[metric];
		const band: TargetVerdict["band"] =
			measured === undefined ? "unknown" : bandFor(measured, target);
		verdicts.push({
			metric,
			measured,
			target: target.value,
			op: target.op,
			band,
		});
	}
	return verdicts;
}
