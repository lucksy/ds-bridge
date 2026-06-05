// T1.7 — single-line unicode sparkline.
import { describe, expect, it } from "vitest";
import { sparkline } from "../../../src/render/terminal/sparkline.js";

describe("sparkline", () => {
	it("maps a rising ramp across the eight block elevations", () => {
		expect(sparkline([0, 1, 2, 3, 4, 5, 6, 7])).toBe("▁▂▃▄▅▆▇█");
	});

	it("returns an empty string for empty input", () => {
		expect(sparkline([])).toBe("");
	});

	it("does not divide by zero for a constant series", () => {
		expect(sparkline([5, 5, 5])).toBe("▁▁▁");
	});

	it("renders a mixed series relative to its own min/max", () => {
		expect(sparkline([1, 8, 3, 5, 2])).toBe("▁█▃▅▂");
	});

	it("handles a single value", () => {
		expect(sparkline([42])).toBe("▁");
	});
});
