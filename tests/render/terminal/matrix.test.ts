// M10.1 — renderMatrix: a labeled status grid over renderTable. ok/warn/fail/none
// → ✓/△/✗/· glyphs, severity-colored when color is on; empty rows → "".
import { describe, expect, it } from "vitest";
import {
	type MatrixRow,
	renderMatrix,
} from "../../../src/render/terminal/matrix.js";

const hasAnsi = (s: string): boolean => s.includes(String.fromCharCode(27));

const ROWS: MatrixRow[] = [
	{ label: "Button", cells: ["ok", "warn", "fail"] },
	{ label: "Card", cells: ["ok", "none", "ok"] },
];
const COLUMNS = ["props", "tokens", "a11y"];

describe("renderMatrix", () => {
	it("renders glyphs per status with the row labels + column headers", () => {
		const out = renderMatrix(ROWS, COLUMNS, { color: false });
		expect(out).toContain("Button");
		expect(out).toContain("props");
		expect(out).toContain("✓");
		expect(out).toContain("△");
		expect(out).toContain("✗");
		expect(out).toContain("·");
	});

	it("returns empty string for no rows (caller supplies the empty-state)", () => {
		expect(renderMatrix([], COLUMNS, { color: false })).toBe("");
	});

	it("colors glyphs only when color is on", () => {
		expect(hasAnsi(renderMatrix(ROWS, COLUMNS, { color: true }))).toBe(true);
		expect(hasAnsi(renderMatrix(ROWS, COLUMNS, { color: false }))).toBe(false);
	});

	it("is deterministic", () => {
		expect(renderMatrix(ROWS, COLUMNS, { color: false })).toBe(
			renderMatrix(ROWS, COLUMNS, { color: false }),
		);
	});
});
