// E9 (SPEC-analytics-export §6a) — every versioned machine export has a
// published JSON Schema: analytics (merged + per-domain), rollup, and one v2
// history line. Like report.v1, the published schemas are OPEN; these specs
// validate engine output in STRICT mode (every emitted key must be declared).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEnvelope } from "../../src/engines/history/envelope.js";
import {
	ANALYTICS_DOMAINS,
	buildAnalytics,
	buildDomainArtifact,
	DOMAIN_OF,
} from "../../src/engines/report/analytics-artifacts.js";
import { buildRollup } from "../../src/engines/rollup/rollup.js";
import { FULL_REPORT_DATA } from "../fixtures/report/full-report-data.js";
import { type JsonSchema, validateJsonSchema } from "../helpers/json-schema.js";

const schemasDir = join(import.meta.dirname, "..", "..", "schemas");
const load = (name: string) =>
	JSON.parse(readFileSync(join(schemasDir, name), "utf8")) as JsonSchema;

const STRICT = { strict: true };
const MINIMAL = { generatedAt: "2026-10-05T12:00:00.000Z", project: "empty" };

describe("schemas/analytics.v1.schema.json (E9)", () => {
	const schema = load("analytics.v1.schema.json");
	const report = load("report.v1.schema.json");

	it("is published open (no additionalProperties:false)", () => {
		expect(JSON.stringify(schema)).not.toContain(
			'"additionalProperties":false',
		);
	});

	it("the merged document validates (full and empty)", () => {
		expect(
			validateJsonSchema(schema, buildAnalytics(FULL_REPORT_DATA), STRICT),
		).toEqual([]);
		expect(validateJsonSchema(schema, buildAnalytics(MINIMAL), STRICT)).toEqual(
			[],
		);
	});

	it("every per-domain artifact validates (full and empty)", () => {
		for (const domain of ANALYTICS_DOMAINS) {
			for (const data of [FULL_REPORT_DATA, MINIMAL]) {
				expect(
					validateJsonSchema(schema, buildDomainArtifact(domain, data), STRICT),
					domain,
				).toEqual([]);
			}
		}
	});

	it("each domain's metrics keys are declared, and their values match report.v1", () => {
		const defs = schema.$defs as Record<string, JsonSchema>;
		for (const domain of ANALYTICS_DOMAINS) {
			const declared = Object.keys(
				(defs[`Metrics_${domain}`]?.properties ?? {}) as object,
			).sort();
			const owned = Object.entries(DOMAIN_OF)
				.filter(([, d]) => d === domain)
				.map(([k]) => k)
				.sort();
			expect(declared, domain).toEqual(owned);
			const { metrics } = buildDomainArtifact(domain, FULL_REPORT_DATA);
			const asReport = {
				schema: "ds-bridge/report",
				schemaVersion: 1,
				view: null,
				artifacts: [],
				data: { ...MINIMAL, ...metrics },
			};
			expect(validateJsonSchema(report, asReport, STRICT), domain).toEqual([]);
		}
	});

	it("rejects an undeclared top-level key in strict mode", () => {
		const doc = { ...buildAnalytics(MINIMAL), surprise: 1 };
		// The top level is anyOf(merged, per-domain): no branch accepts it.
		expect(validateJsonSchema(schema, doc, STRICT)).not.toEqual([]);
		expect(validateJsonSchema(schema, buildAnalytics(MINIMAL), STRICT)).toEqual(
			[],
		);
	});
});

describe("schemas/rollup.v1.schema.json (E9)", () => {
	const schema = load("rollup.v1.schema.json");
	const NOW = "2026-10-05T12:00:00.000Z";
	const line = (r: Record<string, unknown>) => JSON.stringify(r);
	const model = buildRollup(
		[
			{
				name: "web",
				source: "/r/web",
				team: "Web",
				load: {
					kind: "ok",
					text: `${[
						line({
							v: 2,
							at: "2026-10-01T00:00:00Z",
							kind: "lint",
							source: "ci",
							git: { sha: "abc", branch: "main", dirty: false },
							tool: { version: "1.12.0" },
							byKind: { exact: 0, near: 0, offSystem: 0 },
							adoption: { refs: 80, literals: 20 },
						}),
						line({
							at: "2026-10-01T00:00:00Z",
							kind: "tokens-check",
							stale: 1,
							missing: 2,
							orphan: 0,
						}),
						line({
							at: "2026-10-01T00:00:00Z",
							kind: "a11y",
							level: "AA",
							modes: [{ mode: "light", passed: 3, failed: 1 }],
						}),
						line({
							at: "2026-10-02T00:00:00Z",
							kind: "handoff",
							score: 70,
							frameName: "Checkout",
						}),
						line({ at: "2026-10-03T00:00:00Z", kind: "handoff", score: 90 }),
					].join("\n")}\n`,
				},
			},
			{
				name: "ios",
				source: "/r/ios",
				team: "Mobile",
				load: { kind: "missing", message: "No history." },
			},
		],
		{ nowIso: NOW },
	);

	it("is published open", () => {
		expect(JSON.stringify(schema)).not.toContain(
			'"additionalProperties":false',
		);
	});

	it("a rollup with a scored repo, a missing repo and teams validates", () => {
		expect(model.aggregate.byTeam).toBeDefined();
		expect(validateJsonSchema(schema, model, STRICT)).toEqual([]);
	});

	it("an empty rollup validates", () => {
		expect(
			validateJsonSchema(schema, buildRollup([], { nowIso: NOW }), STRICT),
		).toEqual([]);
	});
});

describe("schemas/history-record.v2.schema.json (E9)", () => {
	const schema = load("history-record.v2.schema.json");

	it("a v2 line with git + tool + runId validates; payload keys stay open", () => {
		const record = buildEnvelope(
			{ kind: "lint", byKind: { exact: 1, near: 0, offSystem: 2 } },
			{
				now: "2026-10-05T12:00:00.000Z",
				source: "ci",
				git: { sha: "9f1c2e4", branch: "main", dirty: false },
				tool: { version: "1.12.0" },
				runId: "5b0d",
			},
		);
		expect(validateJsonSchema(schema, record, STRICT)).toEqual([]);
	});

	it("a migrated line (git null, tool null, no runId, detached branch null) validates", () => {
		const migrated = buildEnvelope(
			{ kind: "handoff", at: "2026-06-01T00:00:00.000Z", score: 80 },
			{
				now: "2026-10-05T12:00:00.000Z",
				source: "local",
				git: null,
				tool: null,
			},
		);
		expect(validateJsonSchema(schema, migrated, STRICT)).toEqual([]);
		const detached = buildEnvelope(
			{ kind: "a11y" },
			{
				now: "2026-10-05T12:00:00.000Z",
				source: "local",
				git: { sha: "abc", branch: null, dirty: true },
				tool: { version: "1.12.0" },
			},
		);
		expect(validateJsonSchema(schema, detached, STRICT)).toEqual([]);
	});

	it("rejects a v1 line, a bad source and a missing envelope key", () => {
		expect(
			validateJsonSchema(schema, { kind: "lint", at: "x" }, STRICT).length,
		).toBeGreaterThan(0);
		expect(
			validateJsonSchema(
				schema,
				{ v: 2, at: "x", kind: "lint", source: "cron", git: null, tool: null },
				STRICT,
			).length,
		).toBeGreaterThan(0);
	});
});
