// C5 / M3.3 — component-health engine. PURE: a cross-engine JOIN over
// already-persisted signals → one health rollup per UI component. No
// fs/network/process; deterministic; NEVER throws (malformed signals are skipped,
// not fatal). Empty / no-signal input → [].
//
// The join, per component name:
//   - registry/parity status (ok | prop-mismatch | missing-in-code |
//     missing-in-figma) from buildParity's rows;
//   - library-health lists — override hotspots, deprecated usage, and detached
//     candidates whose name/componentName IS this component;
//   - name-heuristic readiness (the latest handoff frameName) and a11y (the latest
//     a11y mode), contributing ONLY when the frame/mode name normalizes to this
//     component's name (honest-scope heuristic). component_aliases raises that
//     heuristic to an EXACT join: when `aliases[component].frameName` /
//     `.contrastMode` is set, the readiness/a11y signal joins by that explicit key
//     instead of the name match.
//
// healthScore (0–100, documented): start at 100 and deduct per signal —
//   parity:    missing-in-code/missing-in-figma −30, prop-mismatch −15, ok 0;
//   overrides: −10 per hotspot naming the component, capped at −20;
//   deprecated:−20 when the component has any deprecated usage;
//   detached:  −10 when a detached candidate names the component;
//   readiness (joined): −round((100 − score) · 0.3) — a scaled readiness deficit;
//   contrast  (joined): −min(20, failed · 5) when the joined mode has failures.
// The result is clamped to [0, 100]. Rows sort worst-health-first, then name asc.

import type { ComponentAliases } from "../../config.js";
import type {
	DeprecatedUsageGroup,
	DetachedCandidate,
	OverrideHotspot,
} from "../figma/library-health.js";
import type { ParityRow } from "../registry/parity.js";
import type { ComponentHealthRow } from "./types.js";

/** The library-health per-component lists the join reads (a partial L1 report). */
export interface ComponentHealthLibraryHealth {
	overrideHotspots?: OverrideHotspot[];
	deprecatedUsage?: DeprecatedUsageGroup[];
	detachedCandidates?: DetachedCandidate[];
}

/** The latest handoff readiness signal (frame-scoped). */
export interface ComponentHealthReadiness {
	frameName: string;
	score: number;
}

/** One a11y contrast mode's pass/fail tallies. */
export interface ComponentHealthA11yMode {
	mode: string;
	passed: number;
	failed: number;
}

/** The latest a11y signal (per-mode contrast tallies). */
export interface ComponentHealthA11y {
	modes: ComponentHealthA11yMode[];
}

/** The full cross-engine signal bundle the join folds into per-component rows. */
export interface ComponentHealthInput {
	parityRows?: ParityRow[];
	libraryHealth?: ComponentHealthLibraryHealth;
	readiness?: ComponentHealthReadiness;
	a11y?: ComponentHealthA11y;
	aliases?: ComponentAliases;
}

/** Parity-status deductions and issue labels. */
const PARITY_DEDUCTION: Record<ParityRow["status"], number> = {
	ok: 0,
	"prop-mismatch": 15,
	"missing-in-code": 30,
	"missing-in-figma": 30,
};

const OVERRIDE_PER_HOTSPOT = 10;
const OVERRIDE_CAP = 20;
const DEPRECATED_DEDUCTION = 20;
const DETACHED_DEDUCTION = 10;
const READINESS_WEIGHT = 0.3;
const CONTRAST_PER_FAIL = 5;
const CONTRAST_CAP = 20;

/** Strip non-alphanumerics + lowercase: the normalized identity key (registry house style). */
function normalizeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** True for a finite number. */
function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** Clamp to the 0–100 display range, half-up rounded. */
function clampScore(value: number): number {
	return Math.min(100, Math.max(0, Math.round(value)));
}

/** A mutable per-component accumulator before the final score is computed. */
interface Accumulator {
	component: string;
	deduction: number;
	issues: string[];
}

/**
 * Build the per-component health rollup. See the module header for the join and
 * the healthScore formula. Pure; never throws; worst-first then name asc.
 */
export function buildComponentHealth(
	input: ComponentHealthInput,
): ComponentHealthRow[] {
	// One accumulator per component name, created lazily on first signal.
	const byComponent = new Map<string, Accumulator>();
	const get = (component: string): Accumulator => {
		let acc = byComponent.get(component);
		if (acc === undefined) {
			acc = { component, deduction: 0, issues: [] };
			byComponent.set(component, acc);
		}
		return acc;
	};

	// ── Parity ──
	for (const parityRow of input.parityRows ?? []) {
		if (parityRow === null || typeof parityRow !== "object") continue;
		const component = parityRow.component;
		if (typeof component !== "string" || component === "") continue;
		const status = parityRow.status;
		const deduction = PARITY_DEDUCTION[status];
		if (deduction === undefined) continue; // unknown status — skip defensively
		const acc = get(component);
		if (deduction > 0) {
			acc.deduction += deduction;
			acc.issues.push(`parity: ${status}`);
		}
	}

	// ── Library-health lists (joined by component name) ──
	const lh = input.libraryHealth;
	if (lh !== undefined) {
		// Override hotspots: per-component count, capped.
		const overrideCounts = new Map<string, number>();
		for (const hotspot of lh.overrideHotspots ?? []) {
			if (hotspot === null || typeof hotspot !== "object") continue;
			const name = hotspot.componentName;
			if (typeof name !== "string" || name === "") continue;
			overrideCounts.set(name, (overrideCounts.get(name) ?? 0) + 1);
		}
		for (const [name, count] of overrideCounts) {
			const acc = get(name);
			const deduction = Math.min(OVERRIDE_CAP, count * OVERRIDE_PER_HOTSPOT);
			acc.deduction += deduction;
			acc.issues.push(`${count} override hotspot${count === 1 ? "" : "s"}`);
		}

		for (const group of lh.deprecatedUsage ?? []) {
			if (group === null || typeof group !== "object") continue;
			const name = group.componentName;
			if (typeof name !== "string" || name === "") continue;
			const acc = get(name);
			acc.deduction += DEPRECATED_DEDUCTION;
			const count = isFiniteNumber(group.count) ? group.count : 0;
			acc.issues.push(`deprecated usage${count > 0 ? ` (${count})` : ""}`);
		}

		for (const candidate of lh.detachedCandidates ?? []) {
			if (candidate === null || typeof candidate !== "object") continue;
			const name = candidate.name;
			if (typeof name !== "string" || name === "") continue;
			const acc = get(name);
			acc.deduction += DETACHED_DEDUCTION;
			acc.issues.push("detached candidate (heuristic)");
		}
	}

	// ── Readiness (exact join via alias.frameName, else name heuristic) ──
	const readiness = input.readiness;
	if (
		readiness !== undefined &&
		typeof readiness.frameName === "string" &&
		isFiniteNumber(readiness.score)
	) {
		const target = matchByKeyOrName(
			[...byComponent.keys()],
			input.aliases,
			"frameName",
			readiness.frameName,
		);
		if (target !== undefined && readiness.score < 100) {
			const acc = get(target);
			acc.deduction += Math.round((100 - readiness.score) * READINESS_WEIGHT);
			acc.issues.push(`readiness ${readiness.score}`);
		}
	}

	// ── A11y contrast (exact join via alias.contrastMode, else name heuristic) ──
	const a11y = input.a11y;
	if (a11y !== undefined && Array.isArray(a11y.modes)) {
		for (const mode of a11y.modes) {
			if (mode === null || typeof mode !== "object") continue;
			if (typeof mode.mode !== "string") continue;
			const failed = isFiniteNumber(mode.failed) ? mode.failed : 0;
			if (failed <= 0) continue;
			const target = matchByKeyOrName(
				[...byComponent.keys()],
				input.aliases,
				"contrastMode",
				mode.mode,
			);
			if (target === undefined) continue;
			const acc = get(target);
			acc.deduction += Math.min(CONTRAST_CAP, failed * CONTRAST_PER_FAIL);
			acc.issues.push(`contrast: ${failed} failing`);
		}
	}

	return [...byComponent.values()]
		.map(
			(acc): ComponentHealthRow => ({
				component: acc.component,
				healthScore: clampScore(100 - acc.deduction),
				issues: acc.issues,
			}),
		)
		.sort(
			(a, b) =>
				a.healthScore - b.healthScore ||
				(a.component < b.component ? -1 : a.component > b.component ? 1 : 0),
		);
}

/**
 * Resolve which existing component a readiness/a11y signal joins to.
 *
 * EXACT join first: if any component's `aliases[component][key]` equals the
 * signal's value, that component wins. Otherwise fall back to the name heuristic:
 * a component whose NORMALIZED name equals the normalized signal value. Returns
 * the component name, or undefined when neither path matches (no spurious join).
 */
function matchByKeyOrName(
	components: string[],
	aliases: ComponentAliases | undefined,
	key: "frameName" | "contrastMode",
	signalValue: string,
): string | undefined {
	// Exact alias join.
	if (aliases !== undefined) {
		for (const component of components) {
			if (aliases[component]?.[key] === signalValue) return component;
		}
	}
	// Name heuristic.
	const needle = normalizeName(signalValue);
	if (needle === "") return undefined;
	for (const component of components) {
		if (normalizeName(component) === needle) return component;
	}
	return undefined;
}
