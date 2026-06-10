// C7 / M2.2 — migration-checklist engine. Test-first: reconstruct a
// MigrationChecklist {sites, truncated} from the LATEST impact history record's
// optional `sites[]`, capped at the configured limit. Pure: the latest impact
// record (or undefined) + cap in → checklist out. Absent `sites` → empty + not
// truncated (graceful: older/baseline impact lines carry no sites).
import { describe, expect, it } from "vitest";
import { buildMigrationChecklist } from "../../../src/engines/report/migration-checklist.js";

/** A migration site as the impact line persists it. */
function site(
	file: string,
	line: number,
	subject: string,
	from: string,
	to: string,
) {
	return { file, line, subject, from, to };
}

describe("buildMigrationChecklist", () => {
	it("returns an empty, not-truncated checklist when the impact line is absent", () => {
		expect(buildMigrationChecklist(undefined, 200)).toEqual({
			sites: [],
			truncated: false,
		});
	});

	it("returns an empty checklist when the impact line carries no sites (count-only)", () => {
		// An older/baseline impact line has counts but no `sites[]`.
		const record = {
			at: "2026-06-01T10:00:00.000Z",
			kind: "impact",
			breaking: 2,
			additive: 1,
			cosmetic: 0,
			touchedCallSites: 7,
		};
		expect(buildMigrationChecklist(record, 200)).toEqual({
			sites: [],
			truncated: false,
		});
	});

	it("reconstructs the sites verbatim (file:line · subject · from→to)", () => {
		const record = {
			at: "2026-06-02T10:00:00.000Z",
			kind: "impact",
			sites: [
				site("app/Profile.tsx", 3, "Avatar", "Avatar", "Avatar / User"),
				site("app/Card.tsx", 10, "Input / Text", "Input / Text", ""),
			],
		};
		expect(buildMigrationChecklist(record, 200)).toEqual({
			sites: [
				{
					file: "app/Profile.tsx",
					line: 3,
					subject: "Avatar",
					from: "Avatar",
					to: "Avatar / User",
				},
				{
					file: "app/Card.tsx",
					line: 10,
					subject: "Input / Text",
					from: "Input / Text",
					to: "",
				},
			],
			truncated: false,
		});
	});

	it("caps the sites at the configured limit and marks truncated when more existed", () => {
		const sites = Array.from({ length: 5 }, (_, i) =>
			site(`f${i}.tsx`, i + 1, `C${i}`, `C${i}`, `C${i}b`),
		);
		const record = { at: "2026-06-03T10:00:00.000Z", kind: "impact", sites };
		const out = buildMigrationChecklist(record, 3);
		expect(out.sites).toHaveLength(3);
		expect(out.sites.map((s) => s.file)).toEqual([
			"f0.tsx",
			"f1.tsx",
			"f2.tsx",
		]);
		expect(out.truncated).toBe(true);
	});

	it("does not mark truncated when the site count equals the cap exactly", () => {
		const sites = Array.from({ length: 3 }, (_, i) =>
			site(`f${i}.tsx`, i + 1, `C${i}`, `C${i}`, `C${i}b`),
		);
		const record = { at: "2026-06-03T10:00:00.000Z", kind: "impact", sites };
		const out = buildMigrationChecklist(record, 3);
		expect(out.sites).toHaveLength(3);
		expect(out.truncated).toBe(false);
	});

	it("honors a `sitesTruncated` flag persisted on the line even when under the cap", () => {
		// The writer already truncated to the cap and recorded that more existed; the
		// reconstruction must surface that truncation even though it re-caps here.
		const sites = Array.from({ length: 2 }, (_, i) =>
			site(`f${i}.tsx`, i + 1, `C${i}`, `C${i}`, `C${i}b`),
		);
		const record = {
			at: "2026-06-03T10:00:00.000Z",
			kind: "impact",
			sites,
			sitesTruncated: true,
		};
		const out = buildMigrationChecklist(record, 200);
		expect(out.sites).toHaveLength(2);
		expect(out.truncated).toBe(true);
	});

	it("tolerates malformed site entries (coerces missing fields, skips non-objects)", () => {
		const record = {
			at: "2026-06-04T10:00:00.000Z",
			kind: "impact",
			sites: [
				{ file: "a.tsx", line: 2, subject: "A", from: "A", to: "A2" },
				"not an object",
				{ file: "b.tsx" }, // missing line/subject/from/to
			],
		};
		const out = buildMigrationChecklist(record, 200);
		// The non-object entry is dropped; the partial entry is coerced.
		expect(out.sites).toEqual([
			{ file: "a.tsx", line: 2, subject: "A", from: "A", to: "A2" },
			{ file: "b.tsx", line: 0, subject: "", from: "", to: "" },
		]);
		expect(out.truncated).toBe(false);
	});
});
