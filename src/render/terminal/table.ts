// T1.7 — aligned unicode box-drawing table. PURE string building.
import { terminalCell } from "./sanitize.js";
import type { ColorOptions } from "./severity.js";

function isNumericCell(value: string): boolean {
	const trimmed = value.trim();
	return trimmed !== "" && !Number.isNaN(Number(trimmed));
}

// SGR colour codes (`\x1b[31m` … `\x1b[39m`) take no columns on screen; a cell
// that callers coloured must still pad to its visible width.
const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function displayWidth(value: string): number {
	return [...value.replace(ANSI_SGR, "")].length;
}

function pad(value: string, width: number, alignRight: boolean): string {
	const gap = Math.max(0, width - displayWidth(value));
	const filler = " ".repeat(gap);
	return alignRight ? filler + value : value + filler;
}

/**
 * Render a table with aligned columns (padded to the widest cell), unicode
 * box-drawing borders, and right-aligned numeric columns. Missing cells are
 * treated as empty. Empty `rows` yields just the header framed by borders.
 *
 * The `color` option is accepted for a uniform render-primitive signature; the
 * frame and cells are currently emitted uncolored regardless. `align` (opt-in,
 * per column) forces `"right"` / `"left"`; `"auto"` or absent keeps the
 * all-numeric detection — so a numeric column with a "—" placeholder can stay
 * right-aligned when the caller says so.
 */
export function renderTable(
	headers: string[],
	rows: string[][],
	opts: ColorOptions & { align?: readonly ("left" | "right" | "auto")[] },
): string {
	const columnCount = headers.length;

	// Every cell (and header) is one line with no control sequence but SGR
	// colour: names in cells can come from Figma, configs or git (./sanitize.ts).
	const cellAt = (row: string[], column: number): string =>
		terminalCell(row[column] ?? "");
	headers = headers.map((header) => terminalCell(header));

	const widths: number[] = [];
	for (let c = 0; c < columnCount; c++) {
		let width = displayWidth(headers[c] ?? "");
		for (const row of rows) {
			width = Math.max(width, displayWidth(cellAt(row, c)));
		}
		widths.push(width);
	}

	const numericColumn: boolean[] = [];
	for (let c = 0; c < columnCount; c++) {
		const forced = opts.align?.[c];
		numericColumn.push(
			forced === "right"
				? true
				: forced === "left"
					? false
					: rows.length > 0 &&
						rows.every((row) => isNumericCell(cellAt(row, c))),
		);
	}

	const border = (left: string, mid: string, right: string): string =>
		left + widths.map((w) => "─".repeat(w + 2)).join(mid) + right;

	const dataRow = (cells: string[], alignNumeric: boolean): string =>
		`│${cells
			.map((cell, c) => {
				const right = alignNumeric && (numericColumn[c] ?? false);
				return ` ${pad(cell, widths[c] ?? 0, right)} `;
			})
			.join("│")}│`;

	const lines: string[] = [];
	lines.push(border("┌", "┬", "┐"));
	lines.push(dataRow(headers, false));
	lines.push(border("├", "┼", "┤"));
	for (const row of rows) {
		lines.push(
			dataRow(
				headers.map((_, c) => cellAt(row, c)),
				true,
			),
		);
	}
	lines.push(border("└", "┴", "┘"));
	return lines.join("\n");
}
