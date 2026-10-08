// T3.1 — SVG chart module. Pure, deterministic functions returning
// self-contained SVG strings: no DOM, no network, no randomness. Output is
// reproducible for a given input + options, so it can be snapshot-tested and
// embedded directly into the offline HTML dashboard.
//
// Drawn to be read at their own size (the dashboard renders each chart at the
// width its card gives it): 11–12px type, label columns sized to the longest
// label, rounded marks on a light track, and the harvest palette shared with the
// insights pane. Colours that carry meaning (ok / warn / error) come from
// `toneFor` / `bandColor`, never from a series' position.

/** A named line series of (x, y) data points. */
export interface LineSeries {
	label: string;
	points: { x: number; y: number }[];
}

export interface LineChartOptions {
	width?: number;
	height?: number;
	colors?: string[];
	/** X-axis labels for the first and last point (e.g. dates); omitted when absent. */
	xLabels?: [string, string];
	/** Fill the area under a lone series. Default true. */
	area?: boolean;
	/** Append to y tick labels, e.g. "%". */
	unit?: string;
}

/** A single horizontal bar: a label and a numeric value. */
export interface BarItem {
	label: string;
	value: number;
	/** This bar's own colour (a tone, a category); overrides `color`. */
	color?: string;
}

export interface BarChartOptions {
	width?: number;
	height?: number;
	color?: string;
	/** The value every bar is scaled against; the largest value when absent. */
	max?: number;
	/** Append to value labels, e.g. "%". */
	unit?: string;
}

export interface DonutGaugeOptions {
	label?: string;
	/** The arc's colour; banded by value (ok ≥ 80, warn ≥ 50, else error) when absent. */
	color?: string;
	/** "score" titles the gauge `76/100` (a score is not a percentage). */
	unit?: "percent" | "score";
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

// --- Palette ----------------------------------------------------------------

/** The harvest palette: berry, olive, mustard, burnt orange, khaki, sage. */
export const PALETTE = [
	"#a3384b",
	"#7f9139",
	"#e3a73b",
	"#d06f2e",
	"#b89a6a",
	"#8f9a5a",
] as const;

/** Meaning colours from the same family. */
export const TONE = {
	ok: "#6f8a2e",
	warn: "#c98a1e",
	error: "#b83f4f",
	neutral: "#8a8f98",
} as const;

export type Tone = keyof typeof TONE;

/** The tone a 0–100 score or percentage earns: ok ≥ 80, warn ≥ 50, else error. */
export function toneFor(pct: number): Exclude<Tone, "neutral"> {
	if (pct >= 80) return "ok";
	if (pct >= 50) return "warn";
	return "error";
}

/** The colour of {@link toneFor}. */
export function bandColor(pct: number): string {
	return TONE[toneFor(pct)];
}

const TRACK_COLOR = "#eceae4";
const TEXT_COLOR = "#2a2a27";
const MUTED_COLOR = "#7a7a72";
const GRID_COLOR = "#e6e4dd";
const FONT =
	"-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif";

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

/** A text element in the chart font. */
function text(
	x: number,
	y: number,
	body: string,
	attrs: {
		anchor?: "start" | "middle" | "end";
		size?: number;
		fill?: string;
		weight?: number;
	} = {},
): string {
	const weight =
		attrs.weight === undefined ? "" : ` font-weight="${attrs.weight}"`;
	return `<text x="${round(x)}" y="${round(y)}" text-anchor="${attrs.anchor ?? "start"}" fill="${attrs.fill ?? TEXT_COLOR}" font-family="${FONT}" font-size="${attrs.size ?? 12}"${weight}>${body}</text>`;
}

/** A centered empty-state SVG with an accessible title and a placeholder text. */
function emptyState(width: number, height: number, title: string): string {
	const safe = escapeXml(title);
	return [
		svgOpen(width, height),
		`<title>${safe}</title>`,
		`<text x="${round(width / 2)}" y="${round(height / 2)}" text-anchor="middle" dominant-baseline="middle" fill="${MUTED_COLOR}" font-family="${FONT}" font-size="12">No data</text>`,
		"</svg>",
	].join("");
}

/** A label cut to fit `chars` characters, with an ellipsis when cut. */
function clip(label: string, chars: number): string {
	return label.length <= chars
		? label
		: `${label.slice(0, Math.max(1, chars - 1))}…`;
}

// Approximate advance of a 12px sans character; generous, so labels never clip.
const CHAR_W = 6.6;

function formatTick(value: number, unit?: string): string {
	const n = Number.isInteger(value) ? String(value) : String(round(value));
	return unit ? `${n}${unit}` : n;
}

/**
 * Render one or more line series as an SVG with nice-tick axes and gridlines,
 * one polyline per series (2.5px, round joins) with ringed points, a soft area
 * under a lone series, and a legend row when there are several. Returns an
 * empty-state SVG (with a `<text>` placeholder) when there are no series or no
 * plottable points.
 */
export function lineChart(
	series: LineSeries[],
	opts: LineChartOptions = {},
): string {
	const width = opts.width ?? 480;
	const height = opts.height ?? 240;
	const palette = opts.colors ?? [...PALETTE];

	const plottable = series.filter((s) => s.points.length > 0);
	const allPoints = plottable.flatMap((s) => s.points);
	if (plottable.length === 0 || allPoints.length === 0) {
		return emptyState(width, height, "Line chart (no data)");
	}

	const legend = plottable.length > 1;
	const pad = {
		top: legend ? 30 : 12,
		right: 14,
		bottom: opts.xLabels ? 26 : 14,
		left: 36,
	};
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

	// Legend: a swatch and the label per series, left to right.
	if (legend) {
		let lx = pad.left;
		plottable.forEach((s, index) => {
			const color = palette[index % palette.length] ?? PALETTE[0];
			parts.push(
				`<rect x="${round(lx)}" y="8" width="10" height="10" rx="5" fill="${color}" />`,
			);
			parts.push(
				text(lx + 15, 17, escapeXml(s.label), { size: 12, fill: MUTED_COLOR }),
			);
			lx += 15 + s.label.length * CHAR_W + 18;
		});
	}

	// Y gridlines and tick labels.
	for (const tick of yTicks) {
		const y = round(sy(tick));
		parts.push(
			`<line x1="${pad.left}" y1="${y}" x2="${round(width - pad.right)}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="1" />`,
		);
		parts.push(
			text(pad.left - 7, y + 4, formatTick(tick, opts.unit), {
				anchor: "end",
				size: 11,
				fill: MUTED_COLOR,
			}),
		);
	}

	// X labels: the first and last point (e.g. the date range).
	if (opts.xLabels) {
		const base = round(height - 8);
		parts.push(
			text(pad.left, base, escapeXml(opts.xLabels[0]), {
				size: 11,
				fill: MUTED_COLOR,
			}),
		);
		parts.push(
			text(width - pad.right, base, escapeXml(opts.xLabels[1]), {
				anchor: "end",
				size: 11,
				fill: MUTED_COLOR,
			}),
		);
	}

	const filled = (opts.area ?? true) && plottable.length === 1;
	plottable.forEach((s, index) => {
		const stroke = palette[index % palette.length] ?? PALETTE[0];
		const coords = s.points.map((p) => `${round(sx(p.x))},${round(sy(p.y))}`);
		if (filled && s.points.length > 1) {
			const first = s.points[0];
			const last = s.points[s.points.length - 1];
			if (first && last) {
				const floor = round(sy(yLo));
				parts.push(
					`<polygon points="${round(sx(first.x))},${floor} ${coords.join(" ")} ${round(sx(last.x))},${floor}" fill="${stroke}" fill-opacity="0.12" />`,
				);
			}
		}
		parts.push(
			`<polyline fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${coords.join(" ")}" />`,
		);
		for (const p of s.points) {
			parts.push(
				`<circle cx="${round(sx(p.x))}" cy="${round(sy(p.y))}" r="3" fill="#ffffff" stroke="${stroke}" stroke-width="2" />`,
			);
		}
	});

	parts.push("</svg>");
	return parts.join("");
}

/**
 * Render horizontal bars on a light full-width track, scaled to the largest
 * value (or `opts.max`), with the label column sized to the longest label and
 * the value printed after each bar. Zero and negative values clamp to a
 * zero-width bar. Returns an empty-state SVG when there are no items.
 */
export function barChart(items: BarItem[], opts: BarChartOptions = {}): string {
	const width = opts.width ?? 480;
	const rowH = 26;
	const height = opts.height ?? Math.max(rowH, items.length * rowH + 8);
	const fill = opts.color ?? PALETTE[0];

	if (items.length === 0) {
		return emptyState(width, height, "Bar chart (no data)");
	}

	const values = items.map((i) => formatTick(i.value, opts.unit));
	const longest = Math.max(...items.map((i) => i.label.length));
	const labelChars = Math.max(
		4,
		Math.min(longest, Math.floor((width * 0.42) / CHAR_W)),
	);
	const labelW = Math.ceil(labelChars * CHAR_W + 10);
	const valueW = Math.ceil(
		Math.max(...values.map((v) => v.length)) * CHAR_W + 12,
	);
	const pad = { top: 4, left: labelW, right: valueW };
	const trackW = Math.max(0, width - pad.left - pad.right);
	const max = opts.max ?? Math.max(0, ...items.map((i) => i.value));

	const parts: string[] = [];
	parts.push(svgOpen(width, height));
	parts.push(
		`<title>Bar chart: ${escapeXml(items.map((i) => i.label).join(", "))}</title>`,
	);

	items.forEach((item, index) => {
		const clamped = Math.max(0, item.value);
		const barW = max > 0 ? round((Math.min(clamped, max) / max) * trackW) : 0;
		const y = pad.top + index * rowH;
		const barY = round(y + 6);
		const barH = rowH - 12;
		const midY = round(y + rowH / 2 + 4);
		const label = clip(item.label, labelChars);
		const tip =
			label === item.label ? "" : `<title>${escapeXml(item.label)}</title>`;

		parts.push(
			`<g>${tip}${text(pad.left - 8, midY, escapeXml(label), { anchor: "end", size: 12, fill: TEXT_COLOR })}</g>`,
		);
		parts.push(
			`<rect x="${pad.left}" y="${barY}" width="${round(trackW)}" height="${barH}" fill="${TRACK_COLOR}" rx="${barH / 2}" />`,
		);
		parts.push(
			`<rect class="bar" x="${pad.left}" y="${barY}" width="${barW}" height="${barH}" fill="${item.color ?? fill}" rx="${barH / 2}" />`,
		);
		parts.push(
			text(pad.left + trackW + 8, midY, escapeXml(values[index] ?? ""), {
				size: 12,
				fill: TEXT_COLOR,
				weight: 600,
			}),
		);
	});

	parts.push("</svg>");
	return parts.join("");
}

/**
 * Render a donut gauge: a background track circle plus a value arc drawn with
 * the stroke-dasharray technique, in the colour its band earns (or `opts.color`).
 * `value` is clamped to [0, 100] and shown as a centered numeral.
 */
export function donutGauge(
	value: number,
	opts: DonutGaugeOptions = {},
): string {
	const size = 132;
	const clamped = clamp(value, 0, 100);
	const display = Math.round(clamped);

	const cx = size / 2;
	const cy = size / 2;
	const strokeWidth = 14;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const drawn = round((clamped / 100) * circumference);
	const gap = round(circumference - drawn);
	const color = opts.color ?? bandColor(clamped);

	const labelText = opts.label !== undefined ? `${opts.label}: ` : "";
	const title = `${labelText}${display}${opts.unit === "score" ? "/100" : "%"}`;

	return [
		svgOpen(size, size),
		`<title>${escapeXml(title)}</title>`,
		`<circle cx="${cx}" cy="${cy}" r="${round(radius)}" fill="none" stroke="${TRACK_COLOR}" stroke-width="${strokeWidth}" />`,
		`<circle cx="${cx}" cy="${cy}" r="${round(radius)}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${drawn} ${gap}" transform="rotate(-90 ${cx} ${cy})" />`,
		`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${TEXT_COLOR}" font-family="${FONT}" font-size="30" font-weight="700">${display}</text>`,
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

// RAG pill fills, from the harvest tones; "unknown" is neutral.
const STATUS_BAND_FILL: Record<StatusBand, string> = {
	green: TONE.ok,
	amber: TONE.warn,
	red: TONE.error,
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
	const rowH = 32;
	const height = opts.height ?? Math.max(rowH, rows.length * rowH + 8);

	if (rows.length === 0) {
		return emptyState(width, height, "Status grid (no data)");
	}

	const pad = { top: 4, left: 2, right: 2 };
	const pillW = 66;
	const pillX = round(width - pad.right - pillW);
	const measuredX = round(width * 0.44);
	const targetX = round(width * 0.62);

	const parts: string[] = [];
	parts.push(svgOpen(width, height));
	parts.push(
		`<title>Status grid: ${escapeXml(rows.map((r) => r.label).join(", "))}</title>`,
	);

	rows.forEach((row, index) => {
		const y = pad.top + index * rowH;
		const midY = round(y + rowH / 2 + 4);
		const fill = STATUS_BAND_FILL[row.band];
		const pillTextColor = row.band === "unknown" ? TEXT_COLOR : "#ffffff";

		if (index > 0) {
			parts.push(
				`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="1" />`,
			);
		}
		parts.push(
			text(pad.left, midY, escapeXml(row.label), { size: 12, weight: 600 }),
		);
		parts.push(
			text(measuredX, midY, escapeXml(row.measured), { size: 12, weight: 600 }),
		);
		parts.push(
			text(targetX, midY, escapeXml(row.target), {
				size: 12,
				fill: MUTED_COLOR,
			}),
		);
		parts.push(
			`<rect class="pill" x="${pillX}" y="${round(y + 7)}" width="${pillW}" height="${rowH - 14}" fill="${fill}" rx="${(rowH - 14) / 2}" />`,
		);
		parts.push(
			text(pillX + pillW / 2, midY - 0.5, escapeXml(row.band), {
				anchor: "middle",
				size: 11,
				fill: pillTextColor,
				weight: 600,
			}),
		);
	});

	parts.push("</svg>");
	return parts.join("");
}

/**
 * Render a grid of cells whose `intensity` (clamped to [0, 1]) maps onto the
 * fill opacity, with row labels sized to the longest one. Returns an
 * empty-state SVG when there are no rows.
 */
export function heatGrid(rows: HeatRow[], opts: HeatGridOptions = {}): string {
	const cellSize = 26;
	const longest = Math.max(0, ...rows.map((r) => r.label.length));
	const labelW = Math.ceil(Math.min(18, Math.max(4, longest)) * CHAR_W + 12);
	const maxCells = Math.max(0, ...rows.map((r) => r.cells.length));
	const width = opts.width ?? labelW + Math.max(1, maxCells) * cellSize + 8;
	const height = opts.height ?? Math.max(cellSize, rows.length * cellSize + 8);
	const fill = opts.color ?? PALETTE[0];

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
			text(labelW - 8, y + cellSize / 2 + 3, escapeXml(clip(row.label, 18)), {
				anchor: "end",
				size: 12,
			}),
		);
		row.cells.forEach((cell, cellIndex) => {
			const x = pad.left + cellIndex * cellSize;
			const opacity = round(clamp(cell.intensity, 0, 1));
			parts.push(
				`<rect x="${x}" y="${y}" width="${cellSize - 3}" height="${cellSize - 3}" fill="${TRACK_COLOR}" rx="4" />`,
			);
			parts.push(
				`<rect class="cell" x="${x}" y="${y}" width="${cellSize - 3}" height="${cellSize - 3}" fill="${fill}" fill-opacity="${opacity}" rx="4" />`,
			);
		});
	});

	parts.push("</svg>");
	return parts.join("");
}
