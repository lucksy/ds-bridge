// T3.1 — SVG chart module. Pure, deterministic functions returning
// self-contained SVG strings: no DOM, no network, no randomness. Output is
// reproducible for a given input + options, so it can be snapshot-tested and
// embedded directly into the offline HTML dashboard.

/** A named line series of (x, y) data points. */
export interface LineSeries {
	label: string;
	points: { x: number; y: number }[];
}

export interface LineChartOptions {
	width?: number;
	height?: number;
	colors?: string[];
}

/** A single horizontal bar: a label and a numeric value. */
export interface BarItem {
	label: string;
	value: number;
}

export interface BarChartOptions {
	width?: number;
	height?: number;
	color?: string;
}

export interface DonutGaugeOptions {
	label?: string;
}

/** A heat-grid cell. `intensity` is clamped to [0, 1] when rendered. */
export interface HeatCell {
	label?: string;
	intensity: number;
}

/** A heat-grid row: a label and a list of cells. */
export interface HeatRow {
	label: string;
	cells: HeatCell[];
}

export interface HeatGridOptions {
	width?: number;
	height?: number;
	color?: string;
}

// Fixed default palette so output is reproducible without injected config.
const DEFAULT_PALETTE = [
	"#2563eb",
	"#16a34a",
	"#dc2626",
	"#d97706",
	"#7c3aed",
	"#0891b2",
] as const;

const TRACK_COLOR = "#e5e7eb";
const TEXT_COLOR = "#374151";
const GAUGE_COLOR = "#2563eb";
const HEAT_COLOR = "#2563eb";
const AXIS_COLOR = "#9ca3af";

/** Escape the five XML-significant characters so labels are safe in markup. */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Round to a stable, snapshot-friendly precision (avoids float noise). */
function round(n: number): number {
	return Number(n.toFixed(3));
}

function clamp(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/** Nearest nice number (1, 2, 5, 10 family) at or above/below `x`. */
function niceNum(x: number, snap: boolean): number {
	const exp = Math.floor(Math.log10(x));
	const fraction = x / 10 ** exp;
	let nice: number;
	if (snap) {
		if (fraction < 1.5) nice = 1;
		else if (fraction < 3) nice = 2;
		else if (fraction < 7) nice = 5;
		else nice = 10;
	} else {
		if (fraction <= 1) nice = 1;
		else if (fraction <= 2) nice = 2;
		else if (fraction <= 5) nice = 5;
		else nice = 10;
	}
	return nice * 10 ** exp;
}

/**
 * Compute evenly spaced "nice" axis tick boundaries spanning [min, max].
 *
 * The data span is rounded up to a nice number, then divided into exactly
 * `maxTicks - 1` equal intervals, yielding `maxTicks` ascending boundaries.
 * Inverted ranges (min > max) are swapped; a zero-span range (min === max)
 * is given a synthetic span so the result stays strictly ascending and never
 * throws. Example: niceTicks(0, 97, 5) → [0, 25, 50, 75, 100].
 */
export function niceTicks(
	min: number,
	max: number,
	maxTicks: number,
): number[] {
	let lo = Math.min(min, max);
	let hi = Math.max(min, max);
	const intervals = Math.max(1, maxTicks - 1);

	let span = hi - lo;
	if (span === 0) {
		// Zero-span guard: synthesize a span centered on the value.
		span = Math.abs(hi) || 1;
		lo = hi - span / 2;
		hi = lo + span;
	}

	const niceSpan = niceNum(span, false);
	const step = niceSpan / intervals;
	const start = Math.floor(lo / step) * step;

	const ticks: number[] = [];
	for (let i = 0; i <= intervals; i++) {
		ticks.push(Number((start + i * step).toFixed(10)));
	}
	return ticks;
}

/** Open an SVG element with viewBox, explicit dimensions and a11y role. */
function svgOpen(width: number, height: number): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`;
}

/** A centered empty-state SVG with an accessible title and a placeholder text. */
function emptyState(width: number, height: number, title: string): string {
	const safe = escapeXml(title);
	return [
		svgOpen(width, height),
		`<title>${safe}</title>`,
		`<text x="${round(width / 2)}" y="${round(height / 2)}" text-anchor="middle" dominant-baseline="middle" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="12">No data</text>`,
		"</svg>",
	].join("");
}

/**
 * Render one or more line series as an SVG with nice-tick axes, one polyline
 * per series and tick labels. Returns an empty-state SVG (with a `<text>`
 * placeholder) when there are no series or no plottable points.
 */
export function lineChart(
	series: LineSeries[],
	opts: LineChartOptions = {},
): string {
	const width = opts.width ?? 480;
	const height = opts.height ?? 240;
	const palette = opts.colors ?? [...DEFAULT_PALETTE];

	const plottable = series.filter((s) => s.points.length > 0);
	const allPoints = plottable.flatMap((s) => s.points);
	if (plottable.length === 0 || allPoints.length === 0) {
		return emptyState(width, height, "Line chart (no data)");
	}

	const pad = { top: 16, right: 16, bottom: 28, left: 40 };
	const plotW = Math.max(0, width - pad.left - pad.right);
	const plotH = Math.max(0, height - pad.top - pad.bottom);

	const xs = allPoints.map((p) => p.x);
	const ys = allPoints.map((p) => p.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(0, ...ys);
	const maxY = Math.max(...ys);

	const yTicks = niceTicks(minY, maxY, 5);
	const yLo = yTicks[0] ?? minY;
	const yHi = yTicks[yTicks.length - 1] ?? maxY;
	const xSpan = maxX - minX || 1;
	const ySpan = yHi - yLo || 1;

	const sx = (x: number): number => pad.left + ((x - minX) / xSpan) * plotW;
	const sy = (y: number): number => pad.top + (1 - (y - yLo) / ySpan) * plotH;

	const parts: string[] = [];
	parts.push(svgOpen(width, height));
	parts.push(
		`<title>Line chart: ${escapeXml(series.map((s) => s.label).join(", "))}</title>`,
	);

	// Y axis tick labels and gridlines.
	for (const tick of yTicks) {
		const y = round(sy(tick));
		parts.push(
			`<line x1="${pad.left}" y1="${y}" x2="${round(width - pad.right)}" y2="${y}" stroke="${AXIS_COLOR}" stroke-width="0.5" />`,
		);
		parts.push(
			`<text x="${round(pad.left - 6)}" y="${round(y + 3)}" text-anchor="end" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="10">${tick}</text>`,
		);
	}

	// One polyline per plottable series.
	plottable.forEach((s, index) => {
		const stroke = palette[index % palette.length] ?? GAUGE_COLOR;
		const pointsAttr = s.points
			.map((p) => `${round(sx(p.x))},${round(sy(p.y))}`)
			.join(" ");
		parts.push(
			`<polyline fill="none" stroke="${stroke}" stroke-width="2" points="${pointsAttr}" />`,
		);
	});

	parts.push("</svg>");
	return parts.join("");
}

/**
 * Render horizontal bars proportional to the largest value, with value labels.
 * Zero and negative values clamp to a zero-width bar. Returns an empty-state
 * SVG when there are no items.
 */
export function barChart(items: BarItem[], opts: BarChartOptions = {}): string {
	const width = opts.width ?? 480;
	const rowH = 24;
	const height = opts.height ?? Math.max(rowH, items.length * rowH + 16);
	const fill = opts.color ?? DEFAULT_PALETTE[0];

	if (items.length === 0) {
		return emptyState(width, height, "Bar chart (no data)");
	}

	const pad = { top: 8, right: 40, bottom: 8, left: 80 };
	const trackW = Math.max(0, width - pad.left - pad.right);
	const max = Math.max(0, ...items.map((i) => i.value));

	const parts: string[] = [];
	parts.push(svgOpen(width, height));
	parts.push(
		`<title>Bar chart: ${escapeXml(items.map((i) => i.label).join(", "))}</title>`,
	);

	items.forEach((item, index) => {
		const clamped = Math.max(0, item.value);
		const barW = max > 0 ? round((clamped / max) * trackW) : 0;
		const y = pad.top + index * rowH;
		const barY = y + 4;
		const barH = rowH - 8;
		const midY = round(y + rowH / 2 + 3);

		parts.push(
			`<text x="${round(pad.left - 6)}" y="${midY}" text-anchor="end" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="11">${escapeXml(item.label)}</text>`,
		);
		parts.push(
			`<rect class="bar" x="${pad.left}" y="${barY}" width="${barW}" height="${barH}" fill="${fill}" rx="2" />`,
		);
		parts.push(
			`<text x="${round(pad.left + barW + 4)}" y="${midY}" text-anchor="start" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="11">${escapeXml(String(item.value))}</text>`,
		);
	});

	parts.push("</svg>");
	return parts.join("");
}

/**
 * Render a donut gauge: a background track circle plus a value arc drawn with
 * the stroke-dasharray technique. `value` is clamped to [0, 100] and shown as
 * a centered numeral.
 */
export function donutGauge(
	value: number,
	opts: DonutGaugeOptions = {},
): string {
	const size = 120;
	const clamped = clamp(value, 0, 100);
	const display = Math.round(clamped);

	const cx = size / 2;
	const cy = size / 2;
	const strokeWidth = 12;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const drawn = round((clamped / 100) * circumference);
	const gap = round(circumference - drawn);

	const labelText = opts.label !== undefined ? `${opts.label}: ` : "";
	const title = `${labelText}${display}%`;

	return [
		svgOpen(size, size),
		`<title>${escapeXml(title)}</title>`,
		`<circle cx="${cx}" cy="${cy}" r="${round(radius)}" fill="none" stroke="${TRACK_COLOR}" stroke-width="${strokeWidth}" />`,
		`<circle cx="${cx}" cy="${cy}" r="${round(radius)}" fill="none" stroke="${GAUGE_COLOR}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${drawn} ${gap}" transform="rotate(-90 ${cx} ${cy})" />`,
		`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="24" font-weight="600">${display}</text>`,
		"</svg>",
	].join("");
}

/** A RAG band for a status row; "unknown" renders neutral. */
export type StatusBand = "green" | "amber" | "red" | "unknown";

/** One status-grid row: a metric label, its measured/target text and a band. */
export interface StatusRow {
	label: string;
	measured: string;
	target: string;
	band: StatusBand;
}

export interface StatusGridOptions {
	width?: number;
	height?: number;
}

// RAG pill fills, mirroring badge.ts BAND_GREEN/AMBER/RED; "unknown" is neutral.
const STATUS_BAND_FILL: Record<StatusBand, string> = {
	green: "#16a34a",
	amber: "#d97706",
	red: "#dc2626",
	unknown: TRACK_COLOR,
};

/**
 * Render a RAG status grid: one row per verdict — a metric label, its measured
 * value, the target+operator, and a band-colored pill carrying the band name.
 * Deterministic, self-contained SVG. Returns an empty-state SVG when there are
 * no rows.
 */
export function statusGrid(
	rows: StatusRow[],
	opts: StatusGridOptions = {},
): string {
	const width = opts.width ?? 480;
	const rowH = 28;
	const height = opts.height ?? Math.max(rowH, rows.length * rowH + 8);

	if (rows.length === 0) {
		return emptyState(width, height, "Status grid (no data)");
	}

	const pad = { top: 4, left: 8, right: 8 };
	const pillW = 76;
	const pillX = round(width - pad.right - pillW);
	const measuredX = round(width * 0.42);
	const targetX = round(width * 0.62);

	const parts: string[] = [];
	parts.push(svgOpen(width, height));
	parts.push(
		`<title>Status grid: ${escapeXml(rows.map((r) => r.label).join(", "))}</title>`,
	);

	rows.forEach((row, index) => {
		const y = pad.top + index * rowH;
		const midY = round(y + rowH / 2 + 3);
		const fill = STATUS_BAND_FILL[row.band];
		const pillTextColor = row.band === "unknown" ? TEXT_COLOR : "#ffffff";

		parts.push(
			`<text x="${pad.left}" y="${midY}" text-anchor="start" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="11" font-weight="600">${escapeXml(row.label)}</text>`,
		);
		parts.push(
			`<text x="${measuredX}" y="${midY}" text-anchor="start" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="11">${escapeXml(row.measured)}</text>`,
		);
		parts.push(
			`<text x="${targetX}" y="${midY}" text-anchor="start" fill="${AXIS_COLOR}" font-family="sans-serif" font-size="11">${escapeXml(row.target)}</text>`,
		);
		parts.push(
			`<rect class="pill" x="${pillX}" y="${round(y + 5)}" width="${pillW}" height="${rowH - 10}" fill="${fill}" rx="9" />`,
		);
		parts.push(
			`<text x="${round(pillX + pillW / 2)}" y="${midY}" text-anchor="middle" fill="${pillTextColor}" font-family="sans-serif" font-size="10" font-weight="600">${escapeXml(row.band)}</text>`,
		);
	});

	parts.push("</svg>");
	return parts.join("");
}

/**
 * Render a grid of cells whose `intensity` (clamped to [0, 1]) maps onto the
 * fill opacity, with row labels. Returns an empty-state SVG when there are no
 * rows.
 */
export function heatGrid(rows: HeatRow[], opts: HeatGridOptions = {}): string {
	const cellSize = 28;
	const labelW = 72;
	const maxCells = Math.max(0, ...rows.map((r) => r.cells.length));
	const width = opts.width ?? labelW + Math.max(1, maxCells) * cellSize + 8;
	const height = opts.height ?? Math.max(cellSize, rows.length * cellSize + 8);
	const fill = opts.color ?? HEAT_COLOR;

	if (rows.length === 0) {
		return emptyState(width, height, "Heat grid (no data)");
	}

	const pad = { top: 4, left: labelW };
	const parts: string[] = [];
	parts.push(svgOpen(width, height));
	parts.push(
		`<title>Heat grid: ${escapeXml(rows.map((r) => r.label).join(", "))}</title>`,
	);

	rows.forEach((row, rowIndex) => {
		const y = pad.top + rowIndex * cellSize;
		parts.push(
			`<text x="${labelW - 6}" y="${round(y + cellSize / 2 + 3)}" text-anchor="end" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="11">${escapeXml(row.label)}</text>`,
		);
		row.cells.forEach((cell, cellIndex) => {
			const x = pad.left + cellIndex * cellSize;
			const opacity = round(clamp(cell.intensity, 0, 1));
			parts.push(
				`<rect class="cell" x="${x}" y="${y}" width="${cellSize - 2}" height="${cellSize - 2}" fill="${fill}" fill-opacity="${opacity}" rx="2" />`,
			);
		});
	});

	parts.push("</svg>");
	return parts.join("");
}
