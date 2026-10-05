// X2 — executive inputs extraction (SPEC-exec-report §3). PURE: replayed
// history records + the registry in → the AN1 consistency input and the AN2
// debt input out. No measurement: it only threads ALREADY-recorded signals to
// the engines. Latest record wins per source; an absent source stays absent
// (absent-not-zero). Never throws on malformed records or registries.
import type {
	DeprecatedUsageGroup,
	DetachedCandidate,
} from "../figma/library-health.js";
import type { RegistryFile } from "../registry/persist.js";
import type { ConsistencyInput } from "./consistency.js";
import type { DebtInput } from "./debt.js";
import type { HistoryRecord } from "./history-lines.js";

export interface ExecutiveInputs {
	consistency: ConsistencyInput;
	/** Undefined when neither a `lint` nor a `library-health` line exists. */
	debt: DebtInput | undefined;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function num(value: unknown): number {
	return isFiniteNumber(value) ? value : 0;
}

/** Extract the consistency + debt inputs. Pure; never throws. */
export function executiveInputs(
	records: readonly HistoryRecord[],
	registry: RegistryFile | undefined,
): ExecutiveInputs {
	let lint: Record<string, unknown> | undefined;
	let adoption: Record<string, unknown> | undefined;
	let health: Record<string, unknown> | undefined;
	for (const { kind, record } of records) {
		if (kind === "lint") {
			lint = record;
			const block = asObject(record.adoption);
			if (block !== undefined) adoption = block;
		} else if (kind === "library-health") {
			health = record;
		}
	}

	const consistency: ConsistencyInput = {};
	if (adoption !== undefined) {
		consistency.tokens = {
			refs: num(adoption.refs),
			literals: num(adoption.literals),
		};
	}
	if (
		registry !== undefined &&
		Array.isArray(registry.matches) &&
		Array.isArray(registry.unmatchedCode)
	) {
		consistency.components = {
			matched: registry.matches.length,
			custom: registry.unmatchedCode.length,
		};
	}
	if (health !== undefined) {
		const hotspots = health.overrideHotspots;
		if (Array.isArray(hotspots)) {
			consistency.overrides = { hotspots: hotspots.length };
		} else if (isFiniteNumber(hotspots)) {
			consistency.overrides = { hotspots };
		}
	}

	if (lint === undefined && health === undefined) {
		return { consistency, debt: undefined };
	}
	const debt: DebtInput = {};
	if (lint !== undefined) {
		debt.offSystem = num(asObject(lint.byKind)?.offSystem);
	}
	if (health !== undefined) {
		const deprecated = health.deprecatedUsage;
		if (Array.isArray(deprecated)) {
			debt.deprecatedUsage = deprecated as DeprecatedUsageGroup[];
		} else if (isFiniteNumber(deprecated)) {
			debt.deprecatedCount = deprecated;
		}
		const detached = health.detachedCandidates;
		if (Array.isArray(detached)) {
			debt.detachedCandidates = detached as DetachedCandidate[];
		} else if (isFiniteNumber(detached)) {
			debt.detachedCount = detached;
		}
	}
	return { consistency, debt };
}
