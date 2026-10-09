// E3/E4 — a ReportData with EVERY section populated. Typed `Required<ReportData>`
// so a new ReportData field fails typecheck until this fixture (and therefore the
// JSON Schema validation and the analytics domain map specs) covers it.
import type { ReportData } from "../../../src/engines/report/types.js";

export const FULL_REPORT_DATA: Required<ReportData> = {
	generatedAt: "2026-06-05T12:00:00.000Z",
	project: "acme-design-system",
	systemScore: {
		current: 78,
		components: [
			{ kind: "drift", score: 80, weight: 30 },
			{ kind: "lint", score: 65, weight: 30 },
			{ kind: "readiness", score: 82, weight: 20 },
			{ kind: "a11y", score: 85, weight: 20 },
		],
		trend: [
			{ date: "2026-06-01", score: 70 },
			{ date: "2026-06-02", score: 74 },
			{ date: "2026-06-03", score: 78 },
		],
	},
	driftTrend: [
		{ date: "2026-06-01", breaking: 2, additive: 5, cosmetic: 3 },
		{ date: "2026-06-02", breaking: 1, additive: 7, cosmetic: 4 },
		{ date: "2026-06-03", breaking: 0, additive: 9, cosmetic: 2 },
	],
	lintSummary: {
		byKind: { exact: 42, near: 11, offSystem: 7 },
		topOffenders: [
			{ file: "src/Button.tsx", count: 9 },
			{ file: "src/Card.tsx", count: 5 },
		],
	},
	readiness: {
		score: 82,
		frameName: "Checkout / Desktop",
		deductions: [
			{ reason: "Detached instance", points: 10 },
			{ reason: "Hard-coded color", points: 8 },
		],
	},
	a11y: {
		level: "AA",
		modes: [
			{ mode: "light", passed: 12, failed: 2 },
			{ mode: "dark", passed: 10, failed: 4 },
		],
	},
	impact: {
		breaking: 3,
		additive: 5,
		cosmetic: 2,
		touchedCallSites: 37,
	},
	parity: {
		columns: ["variant", "size", "icon"],
		rows: [
			{
				component: "Button",
				cells: [
					{ status: "ok" },
					{ status: "prop-mismatch" },
					{ status: "missing-in-code" },
				],
			},
			{
				component: "Card",
				cells: [
					{ status: "ok" },
					{ status: "ok" },
					{ status: "missing-in-figma" },
				],
			},
		],
	},
	adoptionTrend: [
		{ date: "2026-06-01", pct: 60 },
		{ date: "2026-06-02", pct: 68 },
		{ date: "2026-06-03", pct: 75 },
	],
	importCoverage: {
		imported: 17,
		total: 22,
		uncovered: ["Spinner", "Tooltip"],
		uncoveredTotal: 5,
	},
	leaderboard: [
		{ dir: "src/legacy", refs: 2, literals: 18 },
		{ dir: "src/components", refs: 211, literals: 9 },
	],
	libraryHealth: {
		overrideHotspots: [
			{
				nodeId: "1:10",
				name: "Primary CTA",
				componentName: "Button / Primary",
				overrideCount: 3,
			},
			{
				nodeId: "1:20",
				name: "Old Button A",
				componentName: "[deprecated] OldButton",
				overrideCount: 2,
			},
		],
		deprecatedUsage: [{ componentName: "[deprecated] OldButton", count: 2 }],
		detachedCandidates: [
			{ nodeId: "1:30", name: "Button / Primary", heuristic: true },
		],
		totals: {
			overrideHotspots: 2,
			deprecatedUsage: 2,
			detachedCandidates: 1,
		},
	},
	breakingCalendar: {
		entries: [
			{
				date: "2026-06-03",
				source: "figma",
				count: 2,
				detail: "2 breaking component changes",
			},
			{
				date: "2026-06-01",
				source: "tokens",
				count: 1,
				detail: "1 stale output",
			},
		],
		total: 3,
	},
	changeFrequency: {
		byKind: [
			{ kind: "tokens-check", count: 2 },
			{ kind: "impact", count: 1 },
		],
		windowFirst: "2026-06-01T10:00:00.000Z",
		windowLast: "2026-06-03T10:00:00.000Z",
	},
	// Persona-wave metric sections (C1–C13) — present so the full render has no
	// empty-state stub. Real chart renderers land in M4.
	targets: [
		{ metric: "on-system", measured: 88, target: 90, op: ">=", band: "amber" },
	],
	parityTrend: [{ date: "2026-06-01", pct: 80 }],
	componentHealth: [
		{ component: "Button", healthScore: 70, issues: ["prop-mismatch"] },
	],
	libraryHealthTrend: [
		{ date: "2026-06-01", overrides: 2, deprecated: 1, detached: 0 },
	],
	migrationChecklist: {
		sites: [
			{
				file: "src/Button.tsx",
				line: 9,
				subject: "Button",
				from: "a",
				to: "b",
			},
		],
		truncated: false,
	},
	scoreVelocity: {
		delta: 4,
		windowDays: 30,
		direction: "up",
		regressionStreak: 0,
	},
	ownershipLeaderboard: [
		{ owner: "team-web", refs: 100, literals: 5, pct: 95 },
	],
	audienceChangelog: {
		slices: [
			{
				audience: "designers",
				breaking: 1,
				additive: 2,
				cosmetic: 0,
				recent: ["Button renamed"],
			},
		],
	},
	frameImplementability: {
		pct: 80,
		resolved: 8,
		total: 10,
		gaps: [{ reason: "no-token-match", count: 2 }],
	},
	releaseReadiness: {
		go: false,
		checks: [{ name: "drift-zero", pass: true }],
	},
	dataFreshness: [
		{ kind: "a11y", lastRun: "2026-06-05", ageDays: 0, band: "green" },
	],
	// AN7 (X4) — the executive layer.
	consistency: {
		score: 84,
		components: [
			{ kind: "tokens", score: 75, weight: 40 },
			{ kind: "components", score: 100, weight: 40 },
			{ kind: "overrides", score: 76, weight: 20 },
		],
	},
	debt: {
		pct: 30,
		level: "medium",
		items: [
			{
				kind: "deprecated",
				subject: "LegacyButton",
				count: 2,
				weight: 8,
				recommendation:
					'Replace deprecated "LegacyButton" with its supported DS component',
			},
			{
				kind: "off-system",
				subject: "off-system values",
				count: 7,
				weight: 2,
				recommendation:
					"Tokenize 7 off-system values (run /ds-bridge:ds-lint --fix)",
			},
		],
	},
	executive: {
		health: 78,
		adoption: 60,
		consistency: 84,
		debt: 30,
		trend: [
			{ date: "2026-06-01", score: 70 },
			{ date: "2026-06-05", score: 78 },
		],
	},
	libraryHotspotsTrend: {
		dates: ["2026-06-01", "2026-06-05"],
		rows: [
			{
				signal: "overrides",
				name: "Button",
				points: [
					{ date: "2026-06-01", count: 4 },
					{ date: "2026-06-05", count: 7 },
				],
				first: 4,
				latest: 7,
				delta: 3,
				status: "rising",
			},
			{
				signal: "deprecated",
				name: "LegacyButton",
				points: [
					{ date: "2026-06-01", count: 2 },
					{ date: "2026-06-05", count: null },
				],
				first: 2,
				latest: null,
				status: "below-top",
			},
		],
	},
	frameReadinessTrend: {
		threshold: 80,
		total: 1,
		failing: 0,
		frames: [
			{
				key: "F1:1:2",
				frameName: "Checkout",
				fileKey: "F1",
				nodeId: "1:2",
				points: [
					{ date: "2026-06-01", score: 70 },
					{ date: "2026-06-05", score: 85 },
				],
				latest: 85,
				first: 70,
				delta: 15,
				runs: 2,
				passing: true,
			},
		],
	},
	handoffPassRate: {
		threshold: 80,
		frames: 2,
		passing: 1,
		pct: 50,
		trend: [{ date: "2026-06-05", frames: 2, passing: 1, pct: 50 }],
	},
	exceptionsReview: {
		dates: ["2026-06-01", "2026-06-05"],
		rows: [
			{
				signal: "overrides",
				name: "Card",
				runs: 2,
				latest: 7,
				state: "needs-owner",
			},
			{
				signal: "overrides",
				name: "Button",
				runs: 2,
				latest: 3,
				state: "evolve-component",
				owner: "@checkout-design",
				decision: "evolve-component",
				note: "Needs a compact size",
				reviewBy: "2026-07-01",
			},
		],
		totals: {
			needsOwner: 1,
			overdue: 0,
			inReview: 0,
			decided: 1,
			resolved: 0,
			notSeen: 0,
		},
	},
};
