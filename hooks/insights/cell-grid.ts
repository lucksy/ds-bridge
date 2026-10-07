// Terminal charts drawn as grids of coloured character cells: a waffle for the
// parts of a whole, a braille line plot for values over time, a heatmap for a
// matrix. The pane draws each row as runs of coloured Text (`gridRuns`), which
// every text surface supports; the transcript gets the same grid as plain
// text (`gridText`). Pure functions, no `$`.
import type { InsightItem, InsightMatrix, InsightSeries } from "../../types";

/** One terminal cell: a single width-1 character and optional colours (#rrggbb). */
export type Cell = { ch: string; fg?: string; bg?: string };
export type Grid = Cell[][];

const BLANK: Cell = { ch: " " };

function blankGrid(columns: number, rows: number): Grid {
	return Array.from({ length: rows }, () =>
		Array.from({ length: columns }, () => ({ ...BLANK })),
	);
}

/** Writes `text` into `row` from `column`, one character per cell. */
function write(
	grid: Grid,
	row: number,
	column: number,
	text: string,
	fg?: string,
): void {
	const line = grid[row];
	if (!line) return;
	[...text].forEach((ch, i) => {
		const cell = line[column + i];
		if (cell) {
			cell.ch = ch;
			if (fg) cell.fg = fg;
		}
	});
}

/** The grid as plain text, trailing spaces trimmed. */
export function gridText(grid: Grid): string {
	return grid
		.map((row) =>
			row
				.map((c) => c.ch)
				.join("")
				.trimEnd(),
		)
		.join("\n");
}

/** A row's cells merged into runs of one colour pair, so a row is a few Text spans. */
export type Run = { text: string; fg?: string; bg?: string };

export function gridRuns(grid: Grid): Run[][] {
	return grid.map((row) => {
		const runs: Run[] = [];
		for (const cell of row) {
			const last = runs[runs.length - 1];
			if (last && last.fg === cell.fg && last.bg === cell.bg)
				last.text += cell.ch;
			else runs.push({ text: cell.ch, fg: cell.fg, bg: cell.bg });
		}
		return runs;
	});
}

// --- Waffle: the parts of a whole --------------------------------------------

export const WAFFLE_SQUARE = "■";

/**
 * 100 squares, one per percent, filled part by part in reading order. Shares
 * are rounded with the largest-remainder method, so the squares always add up
 * to exactly 100. Each square is followed by a space, so the grid is twice
 * `perRow` columns wide.
 */
export function waffleGrid(
	items: readonly InsightItem[],
	colors: readonly string[],
	perRow = 20,
): { grid: Grid; counts: number[] } {
	const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
	const exact = items.map((item) =>
		total > 0 ? (Math.max(0, item.value) / total) * 100 : 0,
	);
	const counts = exact.map(Math.floor);
	let left = 100 - counts.reduce((a, b) => a + b, 0);
	const order = exact
		.map((value, i) => ({ i, remainder: value - Math.floor(value) }))
		.sort((a, b) => b.remainder - a.remainder);
	for (const { i } of order) {
		if (left <= 0) break;
		counts[i] = (counts[i] ?? 0) + 1;
		left -= 1;
	}
	if (total === 0) counts.fill(0);

	const rows = Math.ceil(100 / perRow);
	const grid = blankGrid(perRow * 2, rows);
	let square = 0;
	counts.forEach((count, part) => {
		for (let k = 0; k < count; k++, square++) {
			const cell = grid[Math.floor(square / perRow)]?.[(square % perRow) * 2];
			if (cell) {
				cell.ch = WAFFLE_SQUARE;
				cell.fg = colors[part % colors.length];
			}
		}
	});
	return { grid, counts };
}

// --- Braille line plot: values over time -------------------------------------

// Braille dot bits by [x][y] within a 2×4 cell.
const DOTS = [
	[0x01, 0x02, 0x04, 0x40],
	[0x08, 0x10, 0x20, 0x80],
];

function axisLabel(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Each series as a line of braille dots, 2 × 4 dots per character, on a shared
 * y-axis that starts at 0 for non-negative data. The top and bottom rows carry
 * the axis labels. Where two series cross, the later one's colour wins the cell.
 */
export function brailleLine(
	series: readonly InsightSeries[],
	colors: readonly string[],
	width: number,
	height = 6,
	axisColor = "#8a8f98",
): Grid {
	const all = series.flatMap((s) => s.points);
	const xs = all.map((p) => p.x);
	const ys = all.map((p) => p.y);
	const lo = Math.min(0, ...ys);
	const top = Math.max(...ys, lo + 1);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const labelWidth = Math.max(axisLabel(top).length, axisLabel(lo).length);
	const plotColumns = Math.max(4, width - labelWidth - 2);
	const grid = blankGrid(labelWidth + 2 + plotColumns, height);

	write(grid, 0, 0, axisLabel(top).padStart(labelWidth), axisColor);
	write(grid, height - 1, 0, axisLabel(lo).padStart(labelWidth), axisColor);
	for (let r = 0; r < height; r++)
		write(grid, r, labelWidth + 1, "│", axisColor);

	const bits: number[][] = Array.from({ length: height }, () =>
		new Array(plotColumns).fill(0),
	);
	const dotsX = plotColumns * 2;
	const dotsY = height * 4;
	const toDot = (p: { x: number; y: number }) => ({
		x: Math.round(((p.x - minX) / (maxX - minX || 1)) * (dotsX - 1)),
		y: Math.round((1 - (p.y - lo) / (top - lo)) * (dotsY - 1)),
	});
	const plot = (x: number, y: number, color: string | undefined) => {
		const column = Math.floor(x / 2);
		const row = Math.floor(y / 4);
		const line = bits[row];
		if (!line || column >= plotColumns) return;
		line[column] = (line[column] ?? 0) | (DOTS[x % 2]?.[y % 4] ?? 0);
		const cell = grid[row]?.[labelWidth + 2 + column];
		if (cell) cell.fg = color;
	};

	series.forEach((s, n) => {
		const color = colors[n % colors.length];
		const dots = s.points.map(toDot);
		if (dots.length === 1 && dots[0]) plot(dots[0].x, dots[0].y, color);
		for (let i = 1; i < dots.length; i++) {
			const a = dots[i - 1];
			const b = dots[i];
			if (!a || !b) continue;
			// Bresenham between consecutive points, on the dot grid.
			let x = a.x;
			let y = a.y;
			const dx = Math.abs(b.x - a.x);
			const dy = -Math.abs(b.y - a.y);
			const sx = a.x < b.x ? 1 : -1;
			const sy = a.y < b.y ? 1 : -1;
			let err = dx + dy;
			for (;;) {
				plot(x, y, color);
				if (x === b.x && y === b.y) break;
				const e2 = 2 * err;
				if (e2 >= dy) {
					err += dy;
					x += sx;
				}
				if (e2 <= dx) {
					err += dx;
					y += sy;
				}
			}
		}
	});

	bits.forEach((line, row) => {
		line.forEach((value, column) => {
			if (value === 0) return;
			const cell = grid[row]?.[labelWidth + 2 + column];
			if (cell) cell.ch = String.fromCodePoint(0x2800 + value);
		});
	});
	return grid;
}

// --- Heatmap: a matrix ---------------------------------------------------------

function mix(from: string, to: string, t: number): string {
	const a = Number.parseInt(from.slice(1), 16);
	const b = Number.parseInt(to.slice(1), 16);
	const channel = (shift: number) =>
		Math.round(
			((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t,
		);
	return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}

function luminance(hex: string): number {
	const n = Number.parseInt(hex.slice(1), 16);
	return (
		(0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
		255
	);
}

/**
 * Row labels, then one coloured block per value, shaded from `low` to `high`
 * by the value's share of the largest, with the number printed in it. A zero
 * is a dim dot on the low colour.
 */
export function heatmapGrid(
	matrix: InsightMatrix,
	cellWidth = 5,
	low = "#2b2b30",
	high = "#f47560",
	labelColor = "#a9a9a3",
): Grid {
	const labelWidth = Math.min(
		16,
		Math.max(...matrix.rows.map((r) => r.length), 4),
	);
	const max = Math.max(0, ...matrix.values.flat());
	const grid = blankGrid(
		labelWidth + 1 + matrix.columns.length * cellWidth,
		matrix.rows.length + 1,
	);
	matrix.columns.forEach((column, c) => {
		write(
			grid,
			0,
			labelWidth + 1 + c * cellWidth,
			column.slice(0, cellWidth - 1).padStart(cellWidth - 1),
			labelColor,
		);
	});
	matrix.rows.forEach((row, r) => {
		write(
			grid,
			r + 1,
			0,
			row.slice(0, labelWidth).padEnd(labelWidth),
			labelColor,
		);
		matrix.columns.forEach((_, c) => {
			const value = matrix.values[r]?.[c] ?? 0;
			const bg = max > 0 ? mix(low, high, value / max) : low;
			const text = value === 0 ? "·" : String(value);
			const fg =
				value === 0 ? "#6b6b70" : luminance(bg) > 0.55 ? "#141414" : "#ffffff";
			const start = labelWidth + 1 + c * cellWidth;
			for (let k = 0; k < cellWidth - 1; k++) {
				const cell = grid[r + 1]?.[start + k];
				if (cell) cell.bg = bg;
			}
			write(
				grid,
				r + 1,
				start,
				text.slice(0, cellWidth - 1).padStart(cellWidth - 1),
				fg,
			);
		});
	});
	return grid;
}
