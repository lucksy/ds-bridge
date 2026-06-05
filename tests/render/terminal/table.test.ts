// T1.7 — aligned unicode box-drawing table.
import { describe, expect, it } from "vitest";
import { renderTable } from "../../../src/render/terminal/table.js";

describe("renderTable", () => {
	it("aligns columns, right-aligns numeric columns, draws box separators", () => {
		const out = renderTable(
			["Name", "Count"],
			[
				["alpha", "10"],
				["b", "200"],
			],
			{ color: false },
		);
		expect(out).toMatchInlineSnapshot(`
			"┌───────┬───────┐
			│ Name  │ Count │
			├───────┼───────┤
			│ alpha │    10 │
			│ b     │   200 │
			└───────┴───────┘"
		`);
	});

	it("handles empty rows (header + frame only)", () => {
		const out = renderTable(["Name", "Count"], [], { color: false });
		expect(out).toMatchInlineSnapshot(`
			"┌──────┬───────┐
			│ Name │ Count │
			├──────┼───────┤
			└──────┴───────┘"
		`);
	});

	it("left-aligns non-numeric columns and pads to the widest cell", () => {
		const out = renderTable(
			["Token", "Value"],
			[
				["color.brand", "#3b82f6"],
				["space.sm", "8px"],
			],
			{ color: false },
		);
		expect(out).toMatchInlineSnapshot(`
			"┌─────────────┬─────────┐
			│ Token       │ Value   │
			├─────────────┼─────────┤
			│ color.brand │ #3b82f6 │
			│ space.sm    │ 8px     │
			└─────────────┴─────────┘"
		`);
	});

	it("treats a missing cell as empty without throwing", () => {
		const out = renderTable(["A", "B"], [["x"]], { color: false });
		expect(out).toMatchInlineSnapshot(`
			"┌───┬───┐
			│ A │ B │
			├───┼───┤
			│ x │   │
			└───┴───┘"
		`);
	});
});
