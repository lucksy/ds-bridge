// renderInstant — the report's single clock read, pinnable by SOURCE_DATE_EPOCH so
// a report built from fixed history is byte-identical on any day.
import { describe, expect, it } from "vitest";
import { renderInstant } from "../../src/cli-commands/report.js";

describe("renderInstant", () => {
	it("uses SOURCE_DATE_EPOCH (whole seconds) when it holds one", () => {
		expect(renderInstant({ SOURCE_DATE_EPOCH: "1781114400" })).toBe(
			"2026-06-10T18:00:00.000Z",
		);
		expect(renderInstant({ SOURCE_DATE_EPOCH: " 0 " })).toBe(
			"1970-01-01T00:00:00.000Z",
		);
	});

	it("falls back to now when it is unset or not whole seconds", () => {
		for (const env of [
			{},
			{ SOURCE_DATE_EPOCH: "" },
			{ SOURCE_DATE_EPOCH: "1.5" },
			{ SOURCE_DATE_EPOCH: "soon" },
		]) {
			const before = Date.now();
			const at = Date.parse(renderInstant(env));
			expect(at).toBeGreaterThanOrEqual(before);
			expect(at).toBeLessThanOrEqual(Date.now());
		}
	});
});
