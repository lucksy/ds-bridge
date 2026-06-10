// C13 / M3.7 — release-readiness engine. PURE: the latest persisted release
// signals (impact / drift / parity) → a go/no-go rollup with a per-gate
// checklist. No fs/clock/network; deterministic; never throws. The io edge
// (report.ts / the `release-check` command) extracts the latest signals from
// `history.jsonl` and hands them in; this module owns the ZERO-TOLERANCE gate
// logic (SPEC-personas §5 C13, no new user input).
//
// Three gates, ordered impact → drift → parity:
//   - impact:  pass when breaking === 0 (no breaking changes since last snapshot)
//   - drift:   pass when stale === 0 AND missing === 0 (tokens in sync)
//   - parity:  pass when missingInCode === 0 AND missingInFigma === 0 AND total > 0
//
// A gate whose signal is ABSENT (the history never recorded that kind) is an
// INSUFFICIENT-DATA check: `pass: false` with a "no <kind> data" detail. `go` is
// the AND of every gate passing — so a missing required signal can never yield a
// false "go". An all-absent signal set (empty history) → three insufficient
// checks → no-go.
import type { HistoryRecord } from "./history-lines.js";
import type { ReleaseReadiness, ReleaseReadinessCheck } from "./types.js";

/** The latest impact signal: the blast-radius breaking-change count. */
export interface ImpactSignal {
	breaking: number;
}

/** The latest drift signal: stale + missing token counts (tokens-check). */
export interface DriftSignal {
	stale: number;
	missing: number;
}

/** The latest parity signal: the missing-in-{code,figma} counts + the matrix size. */
export interface ParitySignal {
	missingInCode: number;
	missingInFigma: number;
	/** Total parity cells/components observed; 0 means "no parity data". */
	total: number;
}

/**
 * The latest persisted release signals the engine composes into gates. Each is
 * OPTIONAL: an absent signal means the project never recorded that check, which
 * the engine treats as insufficient data (a failing gate), never a silent pass.
 */
export interface ReleaseSignals {
	impact?: ImpactSignal;
	drift?: DriftSignal;
	parity?: ParitySignal;
}

/** Coerce an unknown to a finite number, else 0 (tolerant on malformed signals). */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Extract the latest persisted release signals from replayed history records
 * (last-wins per kind). The `impact` line carries `breaking`; the `tokens-check`
 * line carries `stale`/`missing` (the drift signal); the `parity` line carries
 * `missingInCode`/`missingInFigma`/`total`. A kind never recorded stays absent →
 * its gate becomes insufficient-data downstream. Pure: records in → signals out;
 * never throws (every field is coerced).
 */
export function extractReleaseSignals(
	records: readonly HistoryRecord[],
): ReleaseSignals {
	const signals: ReleaseSignals = {};
	for (const { kind, record } of records) {
		switch (kind) {
			case "impact":
				signals.impact = { breaking: asNumber(record.breaking) };
				break;
			case "tokens-check":
				signals.drift = {
					stale: asNumber(record.stale),
					missing: asNumber(record.missing),
				};
				break;
			case "parity":
				signals.parity = {
					missingInCode: asNumber(record.missingInCode),
					missingInFigma: asNumber(record.missingInFigma),
					total: asNumber(record.total),
				};
				break;
			default:
				break; // unknown kind — skip (forward compat)
		}
	}
	return signals;
}

/** The impact gate: pass when there are no breaking changes. */
function impactCheck(signal: ImpactSignal | undefined): ReleaseReadinessCheck {
	if (signal === undefined) {
		return { name: "impact", pass: false, detail: "no impact data" };
	}
	const breaking = asNumber(signal.breaking);
	if (breaking === 0) {
		return { name: "impact", pass: true, detail: "no breaking changes" };
	}
	return {
		name: "impact",
		pass: false,
		detail: `${breaking} breaking change${breaking === 1 ? "" : "s"}`,
	};
}

/** The drift gate: pass when no token is stale or missing. */
function driftCheck(signal: DriftSignal | undefined): ReleaseReadinessCheck {
	if (signal === undefined) {
		return { name: "drift", pass: false, detail: "no drift data" };
	}
	const stale = asNumber(signal.stale);
	const missing = asNumber(signal.missing);
	if (stale === 0 && missing === 0) {
		return { name: "drift", pass: true, detail: "tokens in sync" };
	}
	return {
		name: "drift",
		pass: false,
		detail: `${stale} stale, ${missing} missing`,
	};
}

/** The parity gate: pass when nothing is missing on either side (and total > 0). */
function parityCheck(signal: ParitySignal | undefined): ReleaseReadinessCheck {
	if (signal === undefined || asNumber(signal.total) === 0) {
		return { name: "parity", pass: false, detail: "no parity data" };
	}
	const missingInCode = asNumber(signal.missingInCode);
	const missingInFigma = asNumber(signal.missingInFigma);
	if (missingInCode === 0 && missingInFigma === 0) {
		return { name: "parity", pass: true, detail: "full parity" };
	}
	return {
		name: "parity",
		pass: false,
		detail: `${missingInCode} missing in code, ${missingInFigma} missing in figma`,
	};
}

/**
 * Evaluate the zero-tolerance release-readiness gates over the latest signals.
 * `go` is true only when EVERY gate passes (a missing signal is a failing,
 * insufficient-data gate). Returns three ordered checks (impact, drift, parity).
 */
export function evaluateReleaseReadiness(
	signals: ReleaseSignals,
): ReleaseReadiness {
	const checks: ReleaseReadinessCheck[] = [
		impactCheck(signals.impact),
		driftCheck(signals.drift),
		parityCheck(signals.parity),
	];
	return { go: checks.every((c) => c.pass), checks };
}
