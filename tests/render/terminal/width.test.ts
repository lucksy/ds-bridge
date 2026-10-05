// Terminal column width: CJK and emoji are two columns, combining marks and
// joiners zero, SGR colour none — so name columns line up.
import { describe, expect, it } from "vitest";
import { renderTable } from "../../../src/render/terminal/table.js";
import {
	displayWidth,
	padToWidth,
} from "../../../src/render/terminal/width.js";

describe("displayWidth", () => {
	it("counts terminal columns, not code units or code points", () => {
		expect(displayWidth("Button")).toBe(6);
		expect(displayWidth("登録画面")).toBe(8);
		expect(displayWidth("✅ ok")).toBe(5); // emoji presentation → 2 columns
		expect(displayWidth("✓ ok")).toBe(4); // text symbol → 1 column
		expect(displayWidth("🚀 Go")).toBe(5);
		expect(displayWidth("é")).toBe(1); // e + combining acute
		expect(displayWidth("👩‍💻")).toBe(4); // ZWJ itself is zero wide
		expect(displayWidth("\u001b[31mred\u001b[39m")).toBe(3);
	});

	it("pads to a visible width, either side", () => {
		expect(padToWidth("登録", 6)).toBe("登録  ");
		expect(padToWidth("7", 3, true)).toBe("  7");
		expect(padToWidth("toolong", 3)).toBe("toolong");
	});
});

describe("renderTable alignment", () => {
	it("aligns the border after CJK and emoji cells", () => {
		const out = renderTable(["name"], [["登録画面"], ["🚀 Go"], ["Button"]], {
			color: false,
		});
		const widths = out.split("\n").map((line) => displayWidth(line));
		expect(new Set(widths).size).toBe(1);
	});
});
