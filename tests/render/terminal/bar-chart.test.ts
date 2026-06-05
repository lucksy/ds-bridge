// T1.7 — proportional unicode block bar chart.
import { describe, expect, it } from "vitest";
import { renderBarChart } from "../../../src/render/terminal/bar-chart.js";

describe("renderBarChart", () => {
	it("renders proportional bars with aligned labels and values (color off)", () => {
		const out = renderBarChart(
			[
				{ label: "red", value: 10 },
				{ label: "green", value: 5 },
				{ label: "blue", value: 0 },
			],
			{ width: 10, color: false },
		);
		expect(out).toMatchInlineSnapshot(`
			"red   │██████████ 10
			green │█████  5
			blue  │  0"
		`);
	});

	it("uses partial blocks for sub-character precision", () => {
		// 3 of 10 across width 8 = 2.4 cells → "██▍"
		const out = renderBarChart(
			[
				{ label: "x", value: 3 },
				{ label: "y", value: 10 },
			],
			{ width: 8, color: false },
		);
		expect(out).toMatchInlineSnapshot(`
			"x │██▍  3
			y │████████ 10"
		`);
	});

	it("clamps zero and negative values at an empty bar", () => {
		const out = renderBarChart(
			[
				{ label: "a", value: -3 },
				{ label: "b", value: 4 },
			],
			{ width: 10, color: false },
		);
		expect(out).toMatchInlineSnapshot(`
			"a │ -3
			b │██████████  4"
		`);
	});

	it("emits ANSI color codes around the bar glyphs when color is on", () => {
		const ESC = "";
		const out = renderBarChart([{ label: "a", value: 10 }], {
			width: 4,
			color: true,
		});
		// the bar glyphs are wrapped in cyan (open 36, close 39)
		expect(out).toContain(`${ESC}[36m`);
		expect(out).toContain(`${ESC}[39m`);
		// the colored segment is exactly the full-width bar in cyan
		expect(out).toContain(`${ESC}[36m████${ESC}[39m`);
	});
});
