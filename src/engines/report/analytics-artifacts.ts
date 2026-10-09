// E4 — analytics artifacts (SPEC-analytics-export §3; SPEC-analytics §5). PURE:
// the assembled ReportData in → the five per-domain artifacts (the vision doc's
// "agents' outputs", computed deterministically), the merged analytics document,
// a byte-stable serialization and the terminal rollup out. No new measurement:
// every number is a ReportData section, threaded through verbatim.
import type { ReportSectionKey } from "./catalog.js";
import { debtLevel } from "./debt.js";
import type { ExecutiveRollup } from "./executive.js";
import type { ReportData } from "./types.js";

export const ANALYTICS_DOMAINS = [
	"figma",
	"code",
	"token",
	"git",
	"score",
] as const;
export type AnalyticsDomain = (typeof ANALYTICS_DOMAINS)[number];

export const ANALYTICS_SCHEMA_VERSION = 1;

/** Every ReportData section belongs to exactly one domain (compile-forced). */
export const DOMAIN_OF: Record<ReportSectionKey, AnalyticsDomain> = {
	libraryHealth: "figma",
	libraryHealthTrend: "figma",
	libraryHotspotsTrend: "figma",
	exceptionsReview: "figma",
	frameReadinessTrend: "figma",
	handoffPassRate: "figma",
	readiness: "figma",
	frameImplementability: "figma",
	lintSummary: "code",
	leaderboard: "code",
	adoptionTrend: "code",
	importCoverage: "code",
	parity: "code",
	parityTrend: "code",
	componentHealth: "code",
	impact: "code",
	migrationChecklist: "code",
	driftTrend: "token",
	a11y: "token",
	breakingCalendar: "token",
	changeFrequency: "git",
	audienceChangelog: "git",
	ownershipLeaderboard: "git",
	scoreVelocity: "git",
	systemScore: "score",
	consistency: "score",
	debt: "score",
	executive: "score",
	targets: "score",
	dataFreshness: "score",
	releaseReadiness: "score",
};

/** Artifact file names (SPEC-analytics §5). */
export const ARTIFACT_FILE: Record<AnalyticsDomain, string> = {
	figma: "figma-metrics.json",
	code: "code-metrics.json",
	token: "token-metrics.json",
	git: "git-metrics.json",
	score: "design-system-score.json",
};
export const MERGED_ARTIFACT_FILE = "analytics.json";

/** The command that produces a domain's data (named on no-data). */
const DOMAIN_HINT: Record<AnalyticsDomain, string> = {
	figma:
		"ds-bridge record --figma (per-frame readiness: ds-bridge handoff / ds-bridge frame-impl)",
	code: "ds-bridge record",
	token: "ds-bridge tokens check",
	git: "ds-bridge changelog",
	score: "ds-bridge record",
};

export type DomainStatus = "ok" | "no-data";

/** One domain's slice inside the merged document. */
export interface DomainSlice {
	status: DomainStatus;
	metrics: Partial<ReportData>;
	hint?: string;
}

/** One emitted per-domain artifact. */
export interface DomainArtifact extends DomainSlice {
	schema: string;
	schemaVersion: number;
	domain: AnalyticsDomain;
	generatedAt: string;
	project: string;
}

/** The merged analytics document (`analytics.json`). */
export interface AnalyticsDocument {
	schema: "ds-bridge/analytics";
	schemaVersion: number;
	generatedAt: string;
	project: string;
	executive?: ExecutiveRollup;
	domains: Record<AnalyticsDomain, DomainSlice>;
}

/**
 * Defined and non-empty (an empty list / calendar / frequency is not data).
 * `dataFreshness` is always assembled (one `unknown` row per check before any
 * run), so it counts only when some row has actually been measured.
 */
function isPresent(key: ReportSectionKey, value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (key === "dataFreshness") {
		return (value as { band: string }[]).some((r) => r.band !== "unknown");
	}
	if (Array.isArray(value)) return value.length > 0;
	if (key === "breakingCalendar") {
		return (value as { entries: unknown[] }).entries.length > 0;
	}
	if (key === "changeFrequency") {
		return (value as { byKind: unknown[] }).byKind.length > 0;
	}
	if (key === "executive") return Object.keys(value as object).length > 0;
	return true;
}

function domainSlice(domain: AnalyticsDomain, data: ReportData): DomainSlice {
	const metrics: Record<string, unknown> = {};
	for (const [key, owner] of Object.entries(DOMAIN_OF) as [
		ReportSectionKey,
		AnalyticsDomain,
	][]) {
		if (owner !== domain) continue;
		const value = data[key];
		if (isPresent(key, value)) metrics[key] = value;
	}
	return Object.keys(metrics).length > 0
		? { status: "ok", metrics: metrics as Partial<ReportData> }
		: { status: "no-data", metrics: {}, hint: DOMAIN_HINT[domain] };
}

export function buildDomainArtifact(
	domain: AnalyticsDomain,
	data: ReportData,
): DomainArtifact {
	return {
		schema: `ds-bridge/analytics/${domain}`,
		schemaVersion: ANALYTICS_SCHEMA_VERSION,
		domain,
		generatedAt: data.generatedAt,
		project: data.project,
		...domainSlice(domain, data),
	};
}

export function buildAnalytics(data: ReportData): AnalyticsDocument {
	const domains = {} as Record<AnalyticsDomain, DomainSlice>;
	for (const domain of ANALYTICS_DOMAINS) {
		domains[domain] = domainSlice(domain, data);
	}
	return {
		schema: "ds-bridge/analytics",
		schemaVersion: ANALYTICS_SCHEMA_VERSION,
		generatedAt: data.generatedAt,
		project: data.project,
		...(data.executive !== undefined && isPresent("executive", data.executive)
			? { executive: data.executive }
			: {}),
		domains,
	};
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (typeof value === "object" && value !== null) {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			out[key] = sortKeys((value as Record<string, unknown>)[key]);
		}
		return out;
	}
	return value;
}

/** Byte-stable JSON: recursively sorted keys, 2-space indent, trailing newline. */
export function stableStringify(value: unknown): string {
	return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

export type ParseEmitResult =
	| { kind: "ok"; domains: AnalyticsDomain[]; merged: boolean }
	| { kind: "error"; message: string };

export function parseEmit(raw: string): ParseEmitResult {
	if (raw === "all") {
		return { kind: "ok", domains: [...ANALYTICS_DOMAINS], merged: true };
	}
	const domain = ANALYTICS_DOMAINS.find((d) => d === raw);
	if (domain !== undefined)
		return { kind: "ok", domains: [domain], merged: false };
	return {
		kind: "error",
		message: `Unknown --emit "${raw}". Expected one of: ${ANALYTICS_DOMAINS.join(", ")}, all.`,
	};
}

/** The terminal rollup: four headlines, then one line per domain. */
export function renderAnalyticsTerm(doc: AnalyticsDocument): string {
	const ex = doc.executive ?? {};
	const nm = "not measured";
	const measured =
		ex.health !== undefined ||
		ex.adoption !== undefined ||
		ex.consistency !== undefined ||
		ex.debt !== undefined;
	const lines = [
		`Design system analytics — ${doc.project} (${doc.generatedAt.slice(0, 10)})`,
		"",
		// E8 — the exec-report labels: import coverage (registry), not "adoption";
		// debt as an index with its level, not a percentage.
		`  ${"Health".padEnd(17)}${ex.health !== undefined ? `${ex.health}/100` : nm}`,
		`  ${"Import coverage".padEnd(17)}${ex.adoption !== undefined ? `${ex.adoption}%` : `${nm} — run ds-bridge registry build, then ds-bridge record`}`,
		`  ${"Consistency".padEnd(17)}${ex.consistency !== undefined ? `${ex.consistency}/100` : nm}`,
		`  ${"Debt".padEnd(17)}${ex.debt !== undefined ? `${ex.debt}/100 (${debtLevel(ex.debt)})` : nm}`,
		"",
		"Domains:",
	];
	for (const domain of ANALYTICS_DOMAINS) {
		const slice = doc.domains[domain];
		const label = domain.padEnd(7);
		if (slice.status === "ok") {
			const n = Object.keys(slice.metrics).length;
			lines.push(`  ${label} ok (${n} section${n === 1 ? "" : "s"})`);
		} else {
			lines.push(
				`  ${label} no data — run ${slice.hint ?? "ds-bridge record"}`,
			);
		}
	}
	lines.push(
		"",
		measured
			? "Write the JSON artifacts with `ds-bridge analytics --emit all` (to .ds-bridge/analytics/)."
			: "Nothing recorded yet — run ds-bridge record.",
	);
	return `${lines.join("\n")}\n`;
}
