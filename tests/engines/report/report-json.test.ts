// E3 — `report --format json` document (SPEC-analytics-export §2). Pure:
// ReportData + the resolved selection in → the versioned envelope out; the
// committed JSON Schema documents (and pins) the shape.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../../../src/engines/report/catalog.js";
import {
	REPORT_JSON_SCHEMA,
	REPORT_JSON_SCHEMA_VERSION,
	reportJsonDocument,
} from "../../../src/engines/report/report-json.js";
import { FULL_REPORT_DATA } from "../../fixtures/report/full-report-data.js";
import {
	type JsonSchema,
	validateJsonSchema,
} from "../../helpers/json-schema.js";

const schemaPath = join(
	import.meta.dirname,
	"..",
	"..",
	"..",
	"schemas",
	"report.v1.schema.json",
);
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as JsonSchema;

describe("reportJsonDocument", () => {
	it("wraps the full ReportData in a versioned envelope", () => {
		const doc = reportJsonDocument(FULL_REPORT_DATA, ["system-score"], "exec");
		expect(doc).toEqual({
			schema: "ds-bridge/report",
			schemaVersion: 1,
			view: "exec",
			artifacts: ["system-score"],
			data: FULL_REPORT_DATA,
		});
		expect(REPORT_JSON_SCHEMA).toBe("ds-bridge/report");
		expect(REPORT_JSON_SCHEMA_VERSION).toBe(1);
	});

	it("the default view is null", () => {
		expect(reportJsonDocument(FULL_REPORT_DATA, [], undefined).view).toBeNull();
	});

	it("a fully populated document validates against schemas/report.v1.schema.json", () => {
		const doc = JSON.parse(
			JSON.stringify(
				reportJsonDocument(
					FULL_REPORT_DATA,
					["system-score", "design-debt"],
					undefined,
				),
			),
		);
		expect(validateJsonSchema(schema, doc, { strict: true })).toEqual([]);
	});

	it("a minimal (no sections) document validates", () => {
		const doc = reportJsonDocument(
			{ generatedAt: "2026-10-05T12:00:00.000Z", project: "p" },
			[],
			undefined,
		);
		expect(validateJsonSchema(schema, doc, { strict: true })).toEqual([]);
	});

	it("the published schema is open: additive fields validate (SPEC §1.3 compatibility)", () => {
		expect(readFileSync(schemaPath, "utf8")).not.toContain(
			'"additionalProperties": false',
		);
		const doc = reportJsonDocument(
			FULL_REPORT_DATA,
			[],
			undefined,
		) as unknown as {
			data: Record<string, unknown>;
		};
		const newer = { ...doc, data: { ...doc.data, futureSection: { n: 1 } } };
		expect(validateJsonSchema(schema, newer)).toEqual([]);
	});

	it("strict validation rejects an undocumented data field (exhaustiveness)", () => {
		const doc = reportJsonDocument(
			FULL_REPORT_DATA,
			[],
			undefined,
		) as unknown as {
			data: Record<string, unknown>;
		};
		const tampered = { ...doc, data: { ...doc.data, surprise: 1 } };
		expect(
			validateJsonSchema(schema, tampered, { strict: true }).join(),
		).toContain("surprise");
	});

	it("schema data.properties = header pair + every catalog reportDataKey", () => {
		const data = (schema.properties as Record<string, JsonSchema>).data as {
			properties: Record<string, unknown>;
		};
		const expected = [
			"generatedAt",
			"project",
			...new Set(CATALOG.map((a) => a.reportDataKey)),
		].sort();
		expect(Object.keys(data.properties).sort()).toEqual(expected);
		expect(Object.keys(FULL_REPORT_DATA).sort()).toEqual(expected);
	});
});
