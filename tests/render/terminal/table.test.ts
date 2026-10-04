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

	it("aligns columns on visible width when cells carry ANSI colour codes", () => {
		const red = (text: string) => `\u001b[31m${text}\u001b[39m`;
		const out = renderTable(
			["kind", "count"],
			[
				[red("exact"), "3"],
				["near", "3"],
			],
			{ color: true },
		);
		const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
		const visible = out.replace(ansi, "");
		const widths = new Set(visible.split("\n").map((line) => [...line].length));
		expect(widths.size).toBe(1);
		expect(visible).toContain("│ exact │     3 │");
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
