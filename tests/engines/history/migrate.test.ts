// H6 — `history migrate` (SPEC-history-v2 §4). Pure: v1 lines are rewritten as
// v2 (`source:"local"`, `git:null`, `tool:null`, payload verbatim); v2,
// unparseable and dateless lines are untouched. Idempotent. Every line it emits
// as v2 validates against schemas/history-record.v2.schema.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateHistory } from "../../../src/engines/history/migrate.js";
import {
	type JsonSchema,
	validateJsonSchema,
} from "../../helpers/json-schema.js";

const j = (r: Record<string, unknown>) => JSON.stringify(r);

describe("migrateHistory", () => {
	it("rewrites a v1 record into the v2 envelope, payload verbatim", () => {
		const result = migrateHistory(
			j({ at: "2026-01-01T00:00:00Z", kind: "lint", byKind: { exact: 1 } }),
		);
		expect(result.migrated).toBe(1);
		expect(result.text).toBe(
			`${j({
				v: 2,
				at: "2026-01-01T00:00:00Z",
				kind: "lint",
				source: "local",
				git: null,
				tool: null,
				byKind: { exact: 1 },
			})}\n`,
		);
	});

	it("leaves a v1 record without a string `at` as v1 (the v2 schema requires it)", () => {
		const dateless = j({ kind: "lint", errors: 1 });
		const numericAt = j({ at: 12345, kind: "lint", errors: 2 });
		const result = migrateHistory([dateless, numericAt].join("\n"));
		expect(result.text).toBe(`${dateless}\n${numericAt}\n`);
		expect(result.migrated).toBe(0);
		expect(result.unchanged).toBe(2);
	});

	it("leaves v2, corrupt and kindless lines untouched", () => {
		const v2 = j({ v: 2, at: "1", kind: "lint", source: "ci", git: null });
		const text = [v2, "{bad", j({ note: 1 })].join("\n");
		const result = migrateHistory(text);
		expect(result.migrated).toBe(0);
		expect(result.unchanged).toBe(3);
		expect(result.text).toBe(`${text}\n`);
	});

	it("is idempotent", () => {
		const once = migrateHistory(j({ at: "1", kind: "a11y", modes: [] })).text;
		const twice = migrateHistory(once);
		expect(twice.text).toBe(once);
		expect(twice.migrated).toBe(0);
	});

	it("drops blank lines and keeps an empty file empty", () => {
		expect(migrateHistory("").text).toBe("");
		expect(migrateHistory("\n\n").text).toBe("");
	});

	it("emits only lines that validate against the v2 schema", () => {
		const schema = JSON.parse(
			readFileSync(
				join(
					import.meta.dirname,
					"../../../schemas/history-record.v2.schema.json",
				),
				"utf8",
			),
		) as JsonSchema;
		const text = [
			j({ at: "2026-01-01T00:00:00Z", kind: "lint", errors: 1 }),
			j({ kind: "lint", errors: 2 }),
			j({ at: 12345, kind: "a11y", issues: 3 }),
		].join("\n");
		const v2Lines = migrateHistory(text)
			.text.trim()
			.split("\n")
			.map((l) => JSON.parse(l) as Record<string, unknown>)
			.filter((r) => r.v === 2);
		expect(v2Lines).toHaveLength(1);
		for (const line of v2Lines) {
			expect(validateJsonSchema(schema, line)).toEqual([]);
		}
	});
});
