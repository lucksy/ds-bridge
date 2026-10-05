// E3 — the `report --format json` document (SPEC-analytics-export §2). PURE:
// the assembled ReportData + the resolved selection in → a versioned envelope
// out. The shape is documented and pinned by schemas/report.v1.schema.json.
// Additive changes (a new optional section) keep the version; a removal or a
// type change bumps REPORT_JSON_SCHEMA_VERSION and ships a new schema file.
import type { ArtifactId } from "./catalog.js";
import type { ReportData } from "./types.js";

export const REPORT_JSON_SCHEMA = "ds-bridge/report";
export const REPORT_JSON_SCHEMA_VERSION = 1;

export interface ReportJsonDocument {
	schema: typeof REPORT_JSON_SCHEMA;
	schemaVersion: typeof REPORT_JSON_SCHEMA_VERSION;
	/** The resolved view label, or null for the default (`everything`). */
	view: string | null;
	/** The resolved artifact ids, in render order. */
	artifacts: ArtifactId[];
	/** The FULL ReportData, regardless of the selection. */
	data: ReportData;
}

export function reportJsonDocument(
	data: ReportData,
	artifacts: readonly ArtifactId[],
	viewLabel: string | undefined,
): ReportJsonDocument {
	return {
		schema: REPORT_JSON_SCHEMA,
		schemaVersion: REPORT_JSON_SCHEMA_VERSION,
		view: viewLabel ?? null,
		artifacts: [...artifacts],
		data,
	};
}
