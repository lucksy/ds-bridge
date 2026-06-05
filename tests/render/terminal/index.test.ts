// T1.7 — barrel re-export surface.
import { describe, expect, it } from "vitest";
import * as terminal from "../../../src/render/terminal/index.js";

describe("terminal render barrel", () => {
	it("re-exports the primitive functions", () => {
		expect(typeof terminal.renderTable).toBe("function");
		expect(typeof terminal.renderBarChart).toBe("function");
		expect(typeof terminal.sparkline).toBe("function");
		expect(typeof terminal.severityColor).toBe("function");
		expect(typeof terminal.shouldColor).toBe("function");
	});
});
