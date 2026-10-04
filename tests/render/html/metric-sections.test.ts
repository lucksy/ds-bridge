// M4.1 + M4.2 — Persona-wave metric HTML sections (C1–C13). Each section is
// gated by the caller-supplied selection; an included-but-absent section keeps
// its shared empty-state, a populated one renders its real chart/list markup.
// These tests assert both quadrants against the real renderer and types.
import { describe, expect, it } from "vitest";
import type { ArtifactId } from "../../../src/engines/report/catalog.js";
import type {
	FreshnessRow,
	ReportData,
	TargetVerdict,
} from "../../../src/engines/report/types.js";
import { renderDashboard } from "../../../src/render/html/dashboard.js";

function countMatches(haystack: string, pattern: RegExp): number {
	return (haystack.match(pattern) ?? []).length;
}

// C1 — Targets / SLAs section: a RAG status grid (one row per verdict) + a
// band-key legend. Selection gates inclusion; an included-but-empty section
// keeps its empty-state. These tests assert both quadrants against the real
// renderer and types.
describe("targetsSection — Targets / SLAs", () => {
	const base: ReportData = {
		generatedAt: "2026-06-09T00:00:00.000Z",
		project: "demo",
	};

	it("renders the title with the empty-state when selected but absent", () => {
		const html = renderDashboard(base, ["targets"]);
		expect(html).toMatch(/<h2>Targets \/ SLAs<\/h2>/);
		expect(html).toMatch(/No data yet/i);
		expect(html).toMatch(/ds-bridge report/); // empty-state run hint command
	});

	it("renders the title with the empty-state when selected but empty", () => {
		const html = renderDashboard({ ...base, targets: [] }, ["targets"]);
		expect(html).toMatch(/<h2>Targets \/ SLAs<\/h2>/);
		expect(html).toMatch(/No data yet/i);
	});

	it("renders the status-grid svg and legend with no empty-state when populated", () => {
		const targets: TargetVerdict[] = [
			{ metric: "adoption", measured: 82, target: 80, op: ">=", band: "green" },
			{ metric: "drift", measured: 5, target: 0, op: "<=", band: "red" },
			{
				metric: "parity",
				measured: undefined,
				target: 100,
				op: "==",
				band: "unknown",
			},
		];
		const html = renderDashboard({ ...base, targets }, ["targets"]);

		expect(html).toMatch(/<h2>Targets \/ SLAs<\/h2>/);
		expect(html).not.toMatch(/No data yet/i);
		// the new statusGrid chart is present
		expect(html).toMatch(/<svg\b/);
		expect(html).toMatch(/Status grid:/);
		// one band-colored pill per band (harvest ok / error tones + neutral)
		expect(html).toMatch(/fill="#6f8a2e"/); // green
		expect(html).toMatch(/fill="#b83f4f"/); // red
		// the unmeasured verdict reads as a dash, target+op text present
		expect(html).toMatch(/&#8212;|—/);
		expect(html).toMatch(/&gt;= 80|>= 80/);
		// band-key legend table
		expect(html).toMatch(/<th>Band<\/th>/);
		expect(html).toMatch(/meets target/);
	});
});

describe("parity-trend section", () => {
	const base: ReportData = {
		generatedAt: "2026-06-09T00:00:00Z",
		project: "demo",
	};

	it("renders an empty-state when selected but the section is absent", () => {
		const html = renderDashboard(base, ["parity-trend"]);
		expect(html).toContain("Parity trend");
		expect(html).toContain("No data yet");
		expect(html).toContain("ds-bridge registry build");
	});

	it("renders a line chart and no empty-state when populated", () => {
		const data: ReportData = {
			...base,
			parityTrend: [
				{ date: "2026-06-01", pct: 70 },
				{ date: "2026-06-08", pct: 92 },
			],
		};
		const html = renderDashboard(data, ["parity-trend"]);
		expect(html).toContain("Parity trend");
		expect(html).toMatch(/<svg\b/);
		expect(html).toContain("<polyline");
		expect(html).toContain("2026-06-01 → 2026-06-08");
		expect(html).not.toContain("No data yet");
	});
});

describe("componentHealthSection (component-health metric section)", () => {
	const baseData: ReportData = {
		generatedAt: "2026-06-05T12:00:00.000Z",
		project: "acme-design-system",
	};

	it("renders the title with an empty-state when selected but absent", () => {
		const html = renderDashboard(baseData, ["component-health"]);
		expect(html).toContain("Component health");
		expect(html).toContain("No data yet");
		expect(html).toContain("ds-bridge registry build");
		// No chart when there is no data.
		expect(html).not.toContain("<svg");
	});

	it("renders the title with an empty-state when selected but the array is empty", () => {
		const html = renderDashboard({ ...baseData, componentHealth: [] }, [
			"component-health",
		]);
		expect(html).toContain("Component health");
		expect(html).toContain("No data yet");
		expect(html).not.toContain("<svg");
	});

	it("renders a chart + offenders list with no empty-state when populated", () => {
		const data: ReportData = {
			...baseData,
			componentHealth: [
				{
					component: "Button",
					healthScore: 42,
					issues: ["3 lint violations", "drift detected"],
				},
				{
					component: "Card",
					healthScore: 71,
					issues: ["parity mismatch"],
				},
				{ component: "Badge", healthScore: 95, issues: [] },
			],
		};
		const html = renderDashboard(data, ["component-health"]);

		expect(html).toContain("Component health");
		expect(html).not.toContain("No data yet");
		// A real chart is emitted.
		expect(html).toContain("<svg");
		// Offenders list carries the component name, score and joined issues.
		expect(html).toContain('<ul class="offenders">');
		expect(html).toContain("Button");
		expect(html).toContain("42");
		expect(html).toContain("3 lint violations, drift detected");
		// The worst-first scope hint is present.
		expect(html).toContain("worst-first");
	});

	it("is omitted entirely when not selected", () => {
		const data: ReportData = {
			...baseData,
			componentHealth: [
				{ component: "Button", healthScore: 42, issues: ["lint"] },
			],
		};
		const html = renderDashboard(data, ["system-score"]);
		expect(html).not.toContain("Component health");
	});
});

describe("libraryHealthTrendSection", () => {
	const base: ReportData = {
		generatedAt: "2026-06-05T12:00:00.000Z",
		project: "acme-design-system",
	};
	const selection: ArtifactId[] = ["library-health-trend"];

	it("renders the title with the empty-state when selected but absent", () => {
		const html = renderDashboard(base, selection);
		expect(html).toContain("Library health trend");
		expect(html).toContain("No data yet");
		expect(html).toContain("ds-bridge library-health");
		// Empty-state means no chart is drawn for this section.
		expect(html).not.toContain("<polyline");
	});

	it("renders a multi-series line chart and NO empty-state when populated", () => {
		const populated: ReportData = {
			...base,
			libraryHealthTrend: [
				{ date: "2026-06-01", overrides: 12, deprecated: 5, detached: 3 },
				{ date: "2026-06-02", overrides: 9, deprecated: 6, detached: 2 },
				{ date: "2026-06-03", overrides: 7, deprecated: 4, detached: 1 },
			],
		};

		const html = renderDashboard(populated, selection);
		expect(html).toContain("Library health trend");
		expect(html).toContain("<svg");
		// Three series → three polylines (overrides / deprecated / detached).
		expect((html.match(/<polyline/g) ?? []).length).toBe(3);
		expect(html).toContain("2026-06-01 → 2026-06-03");
		expect(html).not.toContain("No data yet");
	});
});

describe("migrationChecklistSection (migration-checklist artifact)", () => {
	const baseData: ReportData = {
		generatedAt: "2026-06-05T12:00:00.000Z",
		project: "acme-design-system",
	};

	it("renders the title with the empty-state when selected but absent", () => {
		const html = renderDashboard(baseData, ["migration-checklist"]);
		expect(html).toContain("Migration checklist");
		expect(html).toContain("No data yet");
		expect(html).toContain("ds-bridge impact --checklist");
		// No-site data is also an empty state.
		const emptyData: ReportData = {
			...baseData,
			migrationChecklist: { sites: [], truncated: false },
		};
		const emptyHtml = renderDashboard(emptyData, ["migration-checklist"]);
		expect(emptyHtml).toContain("Migration checklist");
		expect(emptyHtml).toContain("No data yet");
	});

	it("omits the section entirely when not selected", () => {
		const html = renderDashboard(baseData, []);
		expect(html).not.toContain("Migration checklist");
	});

	it("renders the call-site list (no empty-state) when populated", () => {
		const data: ReportData = {
			...baseData,
			migrationChecklist: {
				sites: [
					{
						file: "src/Button.tsx",
						line: 42,
						subject: "Button",
						from: 'variant="primary"',
						to: 'tone="brand"',
					},
					{
						file: "src/Card.tsx",
						line: 7,
						subject: "color.bg",
						from: "#fff",
						to: "var(--surface)",
					},
				],
				truncated: true,
			},
		};
		const html = renderDashboard(data, ["migration-checklist"]);
		expect(html).toContain("Migration checklist");
		expect(html).not.toContain("No data yet");
		// The list markup and a site's file:line render.
		expect(html).toContain('<ul class="calendar stack">');
		expect(html).toContain("src/Button.tsx:42");
		expect(html).toContain("src/Card.tsx:7");
		// from → to arrow and subject are present.
		expect(html).toContain("→");
		expect(html).toContain("color.bg");
		// Truncation drives the overflow note.
		expect(html).toContain("and more sites beyond the cap");
		// Two sites → "2 call sites".
		expect(html).toContain("2 call sites");
		// Untrusted strings are escaped (the double-quote in variant="primary").
		expect(html).toContain("&quot;");
	});

	it("renders the singular site count for a single non-truncated site", () => {
		const data: ReportData = {
			...baseData,
			migrationChecklist: {
				sites: [
					{
						file: "src/Input.tsx",
						line: 100,
						subject: "Input",
						from: 'size="sm"',
						to: 'density="compact"',
					},
				],
				truncated: false,
			},
		};
		const html = renderDashboard(data, ["migration-checklist"]);
		expect(html).toContain("1 call site to migrate");
		expect(html).not.toContain("call sites to migrate");
		expect(html).not.toContain("and more sites beyond the cap");
		expect(html).not.toContain("No data yet");
	});
});

describe("renderDashboard — score velocity section (C8)", () => {
	const base = {
		generatedAt: "2026-06-05T12:00:00.000Z",
		project: "velocity",
	} as const;

	it("renders the title with the shared empty-state when selected but absent", () => {
		const html = renderDashboard({ ...base } satisfies ReportData, [
			"score-velocity",
		]);
		// the section is included (its title renders) but degrades to "No data yet".
		expect(html).toMatch(/Score velocity/);
		expect(html).toMatch(/No data yet/i);
		expect(html).toMatch(/ds-bridge report/i);
	});

	it("renders the signed delta, window and regression streak with NO empty state", () => {
		const data: ReportData = {
			...base,
			scoreVelocity: {
				delta: -4,
				windowDays: 14,
				direction: "down",
				regressionStreak: 3,
			},
		};
		const html = renderDashboard(data, ["score-velocity"]);

		expect(html).toMatch(/Score velocity/);
		// signed (negative) delta with the down arrow + window in days.
		expect(html).toMatch(/▼\s*−4/);
		expect(html).toMatch(/over 14 days/);
		// regression streak surfaced as a badge.
		expect(html).toMatch(/<span class="badge">3 regressions<\/span>/);
		// a populated section must not fall back to the empty state.
		expect(html).not.toMatch(/No data yet/i);
	});

	it("renders a positive flat-free up move with a '+' sign and no regression badge", () => {
		const data: ReportData = {
			...base,
			scoreVelocity: {
				delta: 6,
				windowDays: 1,
				direction: "up",
				regressionStreak: 0,
			},
		};
		const html = renderDashboard(data, ["score-velocity"]);

		expect(html).toMatch(/▲\s*\+6/);
		// singular day label when windowDays === 1.
		expect(html).toMatch(/over 1 day(?!s)/);
		// zero streak → no badge markup, streak shown as plain "0".
		expect(html).not.toMatch(/class="badge"/);
		expect(html).not.toMatch(/No data yet/i);
	});
});

describe("renderDashboard — ownership leaderboard section", () => {
	const SELECTION: ArtifactId[] = ["ownership-leaderboard"];

	it("renders the title with an empty-state when selected but absent", () => {
		const data: ReportData = {
			generatedAt: "2026-06-05T12:00:00.000Z",
			project: "acme-design-system",
		};
		const html = renderDashboard(data, SELECTION);

		expect(html).toContain("Ownership leaderboard");
		expect(html).toMatch(/No data yet/i);
		// Empty-state command hint, and no chart drawn.
		expect(html).toContain("lint");
		expect(countMatches(html, /<svg\b/g)).toBe(0);
	});

	it("renders the title with an empty-state when selected but empty", () => {
		const data: ReportData = {
			generatedAt: "2026-06-05T12:00:00.000Z",
			project: "acme-design-system",
			ownershipLeaderboard: [],
		};
		const html = renderDashboard(data, SELECTION);

		expect(html).toContain("Ownership leaderboard");
		expect(html).toMatch(/No data yet/i);
		expect(countMatches(html, /<svg\b/g)).toBe(0);
	});

	it("renders a bar chart and per-owner labels with no empty-state when populated", () => {
		const data: ReportData = {
			generatedAt: "2026-06-05T12:00:00.000Z",
			project: "acme-design-system",
			ownershipLeaderboard: [
				{ owner: "platform-team", refs: 4, literals: 16, pct: 20 },
				{ owner: "growth-team", refs: 180, literals: 20, pct: 90 },
			],
		};
		const html = renderDashboard(data, SELECTION);

		expect(html).toContain("Ownership leaderboard");
		expect(html).not.toMatch(/No data yet/i);
		// A real chart is drawn.
		expect(html).toContain("<svg");
		expect(countMatches(html, /<svg\b/g)).toBe(1);
		// Owner names and their refs/literals split surface in the list.
		expect(html).toContain("platform-team");
		expect(html).toContain("growth-team");
		expect(html).toContain("20%");
		expect(html).toContain("90%");
		expect(html).toContain("4 refs / 16 literals");
		expect(html).toContain("180 refs / 20 literals");
	});
});

describe("audienceChangelogSection (audience-changelog)", () => {
	const base: ReportData = {
		generatedAt: "2026-06-05T12:00:00.000Z",
		project: "acme-design-system",
	};

	it("renders title with the 'No data yet' empty-state when selected but absent", () => {
		const html = renderDashboard(base, ["audience-changelog"]);
		expect(html).toMatch(/Changelog by audience/);
		expect(html).toMatch(/No data yet/i);
		expect(html).toMatch(/ds-bridge changelog</);
	});

	it("renders audience columns, count badges and the recent list (no empty-state) when populated", () => {
		const data: ReportData = {
			...base,
			audienceChangelog: {
				slices: [
					{
						audience: "designers",
						breaking: 2,
						additive: 4,
						cosmetic: 1,
						recent: ["Button color token renamed", "Card radius changed"],
					},
					{
						audience: "developers",
						breaking: 0,
						additive: 3,
						cosmetic: 5,
						recent: ["Added <Stack /> prop `gap`"],
					},
				],
			},
		};
		const html = renderDashboard(data, ["audience-changelog"]);

		expect(html).not.toMatch(/No data yet/i);
		expect(html).toMatch(/Changelog by audience/);
		expect(html).toMatch(/designers/);
		expect(html).toMatch(/developers/);
		expect(html).toMatch(/breaking 2/);
		expect(html).toMatch(/additive 3/);
		expect(html).toMatch(/cosmetic 5/);
		// Recent entries render in the offenders list, HTML-escaped.
		expect(html).toMatch(/Button color token renamed/);
		expect(html).toMatch(/Added &lt;Stack \/&gt; prop/);
	});
});

describe("frameImplementabilitySection (C11)", () => {
	const baseData: ReportData = {
		generatedAt: "2026-06-05T12:00:00.000Z",
		project: "acme-design-system",
	};

	it("renders the title with an empty-state when selected but data is absent", () => {
		const html = renderDashboard(baseData, ["frame-implementability"]);
		expect(html).toContain("Frame implementability");
		expect(html).toContain("No data yet");
		expect(html).toContain("ds-bridge frame-impl");
	});

	it("renders a donut gauge and gaps list (no empty-state) when populated", () => {
		const data: ReportData = {
			...baseData,
			frameImplementability: {
				pct: 75,
				resolved: 30,
				total: 40,
				gaps: [
					{ reason: "no-registry-match", count: 7 },
					{ reason: "near-token-only", count: 3 },
				],
			},
		};
		const html = renderDashboard(data, ["frame-implementability"]);
		expect(html).toContain("Frame implementability");
		expect(html).toContain("<svg");
		expect(html).toContain("30/40 requirements resolve to the system");
		expect(html).toContain("no-registry-match");
		expect(html).toContain("near-token-only");
		expect(html).not.toContain("No data yet");
	});

	it("omits the gaps list but keeps the gauge when there are no gaps", () => {
		const data: ReportData = {
			...baseData,
			frameImplementability: {
				pct: 100,
				resolved: 40,
				total: 40,
				gaps: [],
			},
		};
		const html = renderDashboard(data, ["frame-implementability"]);
		expect(html).toContain("<svg");
		expect(html).toContain("40/40 requirements resolve to the system");
		expect(html).not.toContain('<ul class="offenders">');
		expect(html).not.toContain("No data yet");
	});
});

describe("releaseReadinessSection", () => {
	const baseData: ReportData = {
		generatedAt: "2026-06-05T12:00:00.000Z",
		project: "acme-design-system",
	};
	const selection: ArtifactId[] = ["release-readiness"];

	it("renders the title with an empty-state when selected but absent", () => {
		const html = renderDashboard(baseData, selection);
		expect(html).toContain("Release readiness");
		expect(html).toContain("No data yet");
		expect(html).toContain("ds-bridge release-check");
	});

	it("renders the title with an empty-state when present but checkless", () => {
		const html = renderDashboard(
			{ ...baseData, releaseReadiness: { go: true, checks: [] } },
			selection,
		);
		expect(html).toContain("Release readiness");
		expect(html).toContain("No data yet");
	});

	it("renders a go/no-go badge + checklist markup with no empty-state", () => {
		const populated: ReportData = {
			...baseData,
			releaseReadiness: {
				go: false,
				checks: [
					{ name: "No breaking drift", pass: true, detail: "0 breaking" },
					{ name: "Lint clean", pass: false, detail: "7 off-system" },
					{ name: "Contrast AA", pass: true },
				],
			},
		};
		const html = renderDashboard(populated, selection);
		expect(html).toContain("Release readiness");
		expect(html).not.toContain("No data yet");
		// Go/no-go header badge.
		expect(html).toContain("NO-GO");
		expect(html).toContain('class="badge"');
		// Checklist marks + names + details.
		expect(html).toContain("✓");
		expect(html).toContain("✗");
		expect(html).toContain("No breaking drift");
		expect(html).toContain("7 off-system");
		expect(html).toContain('<ul class="calendar">');
	});

	it("escapes untrusted check names and details", () => {
		const populated: ReportData = {
			...baseData,
			releaseReadiness: {
				go: true,
				checks: [{ name: "<b>x</b>", pass: false, detail: "a & b" }],
			},
		};
		const html = renderDashboard(populated, selection);
		expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
		expect(html).toContain("a &amp; b");
		expect(html).not.toContain("<b>x</b>");
	});
});

describe("dataFreshnessSection (data-freshness artifact)", () => {
	const base: ReportData = {
		generatedAt: "2026-06-05T12:00:00.000Z",
		project: "acme-design-system",
	};

	it("renders the title with the empty-state when selected but absent", () => {
		const html = renderDashboard(base, ["data-freshness"]);
		expect(html).toContain("Data freshness");
		expect(html).toContain("No data yet");
		expect(html).toContain("<code>ds-bridge report</code>");
	});

	it("renders the title with the empty-state when selected but empty", () => {
		const html = renderDashboard({ ...base, dataFreshness: [] }, [
			"data-freshness",
		]);
		expect(html).toContain("Data freshness");
		expect(html).toContain("No data yet");
	});

	it("renders a per-kind list with age + band pill (no empty-state) when populated", () => {
		const dataFreshness: FreshnessRow[] = [
			{ kind: "drift", lastRun: "2026-06-02", ageDays: 3, band: "amber" },
			{ kind: "lint", lastRun: "2026-06-05", ageDays: 0, band: "green" },
			{ kind: "a11y", band: "unknown" },
		];
		const html = renderDashboard({ ...base, dataFreshness }, [
			"data-freshness",
		]);

		// Title present, empty-state absent.
		expect(html).toContain("Data freshness");
		expect(html).not.toContain("No data yet");

		// List markup with one row per kind.
		expect(html).toContain('<ul class="calendar">');
		expect(html).toContain("drift");
		expect(html).toContain("lint");
		expect(html).toContain("a11y");

		// Age labels: today / Nd ago / never.
		expect(html).toContain("3d ago");
		expect(html).toContain("today");
		expect(html).toContain("never");

		// Band-colored pills in the harvest tones + neutral unknown.
		expect(html).toContain("background:#c98a1e");
		expect(html).toContain("background:#6f8a2e");
		expect(html).toContain("background:#8a8f98");
	});
});
