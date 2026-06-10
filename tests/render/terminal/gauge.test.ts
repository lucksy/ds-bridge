// M10.1 — renderGauge: a single-line 0–100 meter. Clamps, fills proportionally,
// pads the remainder with light-shade, color tints only the filled glyphs.
import { describe, expect, it } from "vitest";
import { renderGauge } from "../../../src/render/terminal/gauge.js";

/** True when `s` carries an ANSI escape (ESC byte) — no control char in source. */
const hasAnsi = (s: string): boolean => s.includes(String.fromCharCode(27));

describe("renderGauge", () => {
	it("renders a labeled meter with the rounded percent (no color)", () => {
		const out = renderGauge(78, { label: "Score", width: 10, color: false });
		expect(out).toBe("Score [███████▊░░] 78%");
	});

	it("renders without a label", () => {
		expect(renderGauge(50, { width: 10, color: false })).toBe(
			"[█████░░░░░] 50%",
		);
	});

	it("clamps below 0 and above 100", () => {
		expect(renderGauge(-20, { width: 10, color: false })).toBe(
			"[░░░░░░░░░░] 0%",
		);
		expect(renderGauge(150, { width: 4, color: false })).toBe("[████] 100%");
	});

	it("emits ANSI only when color is on", () => {
		expect(hasAnsi(renderGauge(78, { width: 10, color: true }))).toBe(true);
		expect(hasAnsi(renderGauge(78, { width: 10, color: false }))).toBe(false);
	});

	it("is deterministic", () => {
		const opts = { label: "x", width: 8, color: false } as const;
		expect(renderGauge(42, opts)).toBe(renderGauge(42, opts));
	});
});
