// H6 — `history migrate` (SPEC-history-v2 §4). Pure: v1 lines are rewritten as
// v2 (`source:"local"`, `git:null`, `tool:null`, payload verbatim, `at` kept or
// left absent); v2 and unparseable lines are untouched. Idempotent.
import { describe, expect, it } from "vitest";
import { migrateHistory } from "../../../src/engines/history/migrate.js";

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

	it("leaves a dateless v1 record dateless", () => {
		const out = JSON.parse(migrateHistory(j({ kind: "lint" })).text) as Record<
			string,
			unknown
		>;
		expect(out).not.toHaveProperty("at");
		expect(out.v).toBe(2);
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
});
