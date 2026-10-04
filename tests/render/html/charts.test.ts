// T3.1 — SVG chart module: pure, deterministic SVG string builders.
import { describe, expect, it } from "vitest";
import {
	barChart,
	donutGauge,
	heatGrid,
	lineChart,
	niceTicks,
} from "../../../src/render/html/charts.js";

describe("niceTicks", () => {
	it("produces classic 0..100 ticks for (0, 97, 5)", () => {
		expect(niceTicks(0, 97, 5)).toEqual([0, 25, 50, 75, 100]);
	});

	it("rounds the span up to a nice number then splits into equal intervals", () => {
		// span 8 rounds up to nice 10, split over 4 intervals → step 2.5
		expect(niceTicks(0, 8, 5)).toEqual([0, 2.5, 5, 7.5, 10]);
	});

	it("handles a 0..10 range with 5 ticks", () => {
		expect(niceTicks(0, 10, 5)).toEqual([0, 2.5, 5, 7.5, 10]);
	});

	it("handles negative ranges symmetrically", () => {
		expect(niceTicks(-50, 50, 5)).toEqual([-50, -25, 0, 25, 50]);
	});

	it("handles a fully negative range", () => {
		expect(niceTicks(-97, 0, 5)).toEqual([-100, -75, -50, -25, 0]);
	});

	it("guards a zero-span range (min === max) without throwing", () => {
		const ticks = niceTicks(5, 5, 5);
		expect(ticks.length).toBeGreaterThanOrEqual(2);
		// the value must lie within the produced tick span
		expect(ticks[0]).toBeLessThanOrEqual(5);
		expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(5);
		// strictly ascending
		for (let i = 1; i < ticks.length; i++) {
			expect(ticks[i]).toBeGreaterThan(ticks[i - 1] as number);
		}
	});

	it("guards an inverted range (min > max)", () => {
		expect(niceTicks(97, 0, 5)).toEqual([0, 25, 50, 75, 100]);
	});

	it("never returns more than maxTicks+1 boundaries and stays ascending", () => {
		const ticks = niceTicks(0, 97, 5);
		expect(ticks.length).toBeLessThanOrEqual(6);
		for (let i = 1; i < ticks.length; i++) {
			expect(ticks[i]).toBeGreaterThan(ticks[i - 1] as number);
		}
	});
});

const SVG_OPEN = /<svg\b[^>]*>/;

function svgOpenTag(svg: string): string {
	const match = svg.match(SVG_OPEN);
	if (match === null) throw new Error("no <svg> tag found");
	return match[0];
}

function countMatches(haystack: string, pattern: RegExp): number {
	return (haystack.match(pattern) ?? []).length;
}

describe("lineChart", () => {
	const series = [
		{
			label: "coverage",
			points: [
				{ x: 0, y: 10 },
				{ x: 1, y: 40 },
				{ x: 2, y: 97 },
			],
		},
		{
			label: "drift",
			points: [
				{ x: 0, y: 5 },
				{ x: 1, y: 20 },
				{ x: 2, y: 30 },
			],
		},
	];

	it("emits a valid svg root with viewBox, role, width/height and a title", () => {
		const svg = lineChart(series);
		const open = svgOpenTag(svg);
		expect(open).toMatch(/viewBox="0 0 \d+ \d+"/);
		expect(open).toMatch(/role="img"/);
		expect(open).toMatch(/\bwidth="\d+"/);
		expect(open).toMatch(/\bheight="\d+"/);
		expect(svg).toMatch(/<title>[^<]+<\/title>/);
		expect(svg.trim().endsWith("</svg>")).toBe(true);
	});

	it("renders one polyline per series", () => {
		const svg = lineChart(series);
		expect(countMatches(svg, /<polyline\b/g)).toBe(2);
	});

	it("draws axis tick labels using nice tick values", () => {
		const svg = lineChart(series);
		// y axis nice ticks for max 97 → includes 100 and 0
		expect(svg).toMatch(/<text[^>]*>0<\/text>/);
		expect(svg).toMatch(/<text[^>]*>100<\/text>/);
	});

	it("respects custom width and height options", () => {
		const svg = lineChart(series, { width: 640, height: 320 });
		const open = svgOpenTag(svg);
		expect(open).toContain('width="640"');
		expect(open).toContain('height="320"');
		expect(open).toContain('viewBox="0 0 640 320"');
	});

	it("uses the provided color palette for stroke", () => {
		const svg = lineChart(series, { colors: ["#ff0000", "#00ff00"] });
		expect(svg).toContain('stroke="#ff0000"');
		expect(svg).toContain('stroke="#00ff00"');
	});

	it("returns a valid empty-state svg with a text placeholder for no series", () => {
		const svg = lineChart([]);
		expect(svgOpenTag(svg)).toMatch(/role="img"/);
		expect(svg).toMatch(/<title>[^<]+<\/title>/);
		expect(svg).toMatch(/<text\b/);
		expect(countMatches(svg, /<polyline\b/g)).toBe(0);
	});

	it("treats series with empty point arrays as empty (no polyline, no throw)", () => {
		const svg = lineChart([{ label: "empty", points: [] }]);
		expect(countMatches(svg, /<polyline\b/g)).toBe(0);
		expect(svg).toMatch(/<text\b/);
	});
});

describe("barChart", () => {
	const items = [
		{ label: "red", value: 10 },
		{ label: "green", value: 5 },
		{ label: "blue", value: 0 },
	];

	it("emits a valid svg root with viewBox, role, dims and title", () => {
		const svg = barChart(items);
		const open = svgOpenTag(svg);
		expect(open).toMatch(/viewBox="0 0 \d+ \d+"/);
		expect(open).toMatch(/role="img"/);
		expect(open).toMatch(/\bwidth="\d+"/);
		expect(open).toMatch(/\bheight="\d+"/);
		expect(svg).toMatch(/<title>[^<]+<\/title>/);
	});

	it("renders one bar rect per item", () => {
		const svg = barChart(items);
		expect(countMatches(svg, /<rect\b[^>]*class="bar"/g)).toBe(3);
	});

	it("makes bar widths proportional to value", () => {
		const svg = barChart(items, { width: 400 });
		const widths = [
			...svg.matchAll(/<rect\b[^>]*class="bar"[^>]*\bwidth="([\d.]+)"/g),
		].map((m) => Number(m[1]));
		expect(widths).toHaveLength(3);
		// value 5 bar is ~half the value 10 bar
		expect(widths[1] as number).toBeCloseTo((widths[0] as number) / 2, 4);
		// value 0 (and clamped negatives) → zero width
		expect(widths[2]).toBe(0);
	});

	it("clamps negative values to a zero-width bar", () => {
		const svg = barChart([
			{ label: "a", value: -3 },
			{ label: "b", value: 4 },
		]);
		const widths = [
			...svg.matchAll(/<rect\b[^>]*class="bar"[^>]*\bwidth="([\d.]+)"/g),
		].map((m) => Number(m[1]));
		expect(widths[0]).toBe(0);
		expect(widths[1] as number).toBeGreaterThan(0);
	});

	it("never emits a negative bar width even when width is smaller than padding", () => {
		const svg = barChart([{ label: "a", value: 4 }], { width: 40 });
		const widths = [
			...svg.matchAll(/<rect\b[^>]*class="bar"[^>]*\bwidth="(-?[\d.]+)"/g),
		].map((m) => Number(m[1]));
		for (const w of widths) {
			expect(w).toBeGreaterThanOrEqual(0);
		}
	});

	it("renders value labels for each item", () => {
		const svg = barChart(items);
		expect(svg).toMatch(/<text[^>]*>10<\/text>/);
		expect(svg).toMatch(/<text[^>]*>5<\/text>/);
		expect(svg).toMatch(/<text[^>]*>0<\/text>/);
	});

	it("returns a valid empty-state svg with a text placeholder for no items", () => {
		const svg = barChart([]);
		expect(svgOpenTag(svg)).toMatch(/role="img"/);
		expect(svg).toMatch(/<title>[^<]+<\/title>/);
		expect(svg).toMatch(/<text\b/);
		expect(countMatches(svg, /<rect\b[^>]*class="bar"/g)).toBe(0);
	});
});

describe("donutGauge", () => {
	it("emits a valid svg root with viewBox, role, dims and title", () => {
		const svg = donutGauge(75);
		const open = svgOpenTag(svg);
		expect(open).toMatch(/viewBox="0 0 \d+ \d+"/);
		expect(open).toMatch(/role="img"/);
		expect(open).toMatch(/\bwidth="\d+"/);
		expect(open).toMatch(/\bheight="\d+"/);
		expect(svg).toMatch(/<title>[^<]+<\/title>/);
	});

	it("renders two circles: a track and a value arc", () => {
		const svg = donutGauge(75);
		expect(countMatches(svg, /<circle\b/g)).toBe(2);
	});

	it("uses stroke-dasharray proportional to the value", () => {
		const svg = donutGauge(50);
		const match = svg.match(/stroke-dasharray="([\d.]+) ([\d.]+)"/);
		expect(match).not.toBeNull();
		const drawn = Number(match?.[1]);
		const gap = Number(match?.[2]);
		const circumference = drawn + gap;
		// 50% → half the circumference is drawn
		expect(drawn / circumference).toBeCloseTo(0.5, 4);
	});

	it("renders the value as a centered numeral", () => {
		const svg = donutGauge(75);
		expect(svg).toMatch(/<text[^>]*>75<\/text>/);
	});

	it("clamps values above 100 to 100", () => {
		const svg = donutGauge(140);
		expect(svg).toMatch(/<text[^>]*>100<\/text>/);
		const match = svg.match(/stroke-dasharray="([\d.]+) ([\d.]+)"/);
		const drawn = Number(match?.[1]);
		const gap = Number(match?.[2]);
		expect(gap).toBeCloseTo(0, 4);
		expect(drawn).toBeGreaterThan(0);
	});

	it("clamps values below 0 to 0", () => {
		const svg = donutGauge(-20);
		expect(svg).toMatch(/<text[^>]*>0<\/text>/);
		const match = svg.match(/stroke-dasharray="([\d.]+) ([\d.]+)"/);
		const drawn = Number(match?.[1]);
		expect(drawn).toBeCloseTo(0, 4);
	});

	it("includes a custom label in the accessible title when provided", () => {
		const svg = donutGauge(60, { label: "Coverage" });
		expect(svg).toMatch(/<title>[^<]*Coverage[^<]*<\/title>/);
	});
});

describe("heatGrid", () => {
	const rows = [
		{
			label: "row1",
			cells: [{ intensity: 0 }, { intensity: 0.5 }, { intensity: 1 }],
		},
		{
			label: "row2",
			cells: [{ intensity: 0.25 }, { intensity: 0.75 }, { intensity: 0.9 }],
		},
	];

	it("emits a valid svg root with viewBox, role, dims and title", () => {
		const svg = heatGrid(rows);
		const open = svgOpenTag(svg);
		expect(open).toMatch(/viewBox="0 0 \d+ \d+"/);
		expect(open).toMatch(/role="img"/);
		expect(open).toMatch(/\bwidth="\d+"/);
		expect(open).toMatch(/\bheight="\d+"/);
		expect(svg).toMatch(/<title>[^<]+<\/title>/);
	});

	it("renders one cell rect per cell", () => {
		const svg = heatGrid(rows);
		expect(countMatches(svg, /<rect\b[^>]*class="cell"/g)).toBe(6);
	});

	it("maps intensity to a fill-opacity in [0, 1]", () => {
		const svg = heatGrid(rows);
		const opacities = [
			...svg.matchAll(
				/<rect\b[^>]*class="cell"[^>]*\bfill-opacity="([\d.]+)"/g,
			),
		].map((m) => Number(m[1]));
		expect(opacities).toHaveLength(6);
		for (const o of opacities) {
			expect(o).toBeGreaterThanOrEqual(0);
			expect(o).toBeLessThanOrEqual(1);
		}
	});

	it("clamps out-of-range intensities into [0, 1]", () => {
		const svg = heatGrid([
			{ label: "x", cells: [{ intensity: -1 }, { intensity: 2 }] },
		]);
		const opacities = [
			...svg.matchAll(
				/<rect\b[^>]*class="cell"[^>]*\bfill-opacity="([\d.]+)"/g,
			),
		].map((m) => Number(m[1]));
		expect(opacities[0]).toBe(0);
		expect(opacities[1]).toBe(1);
	});

	it("renders row labels", () => {
		const svg = heatGrid(rows);
		expect(svg).toMatch(/<text[^>]*>row1<\/text>/);
		expect(svg).toMatch(/<text[^>]*>row2<\/text>/);
	});

	it("returns a valid empty-state svg with a text placeholder for no rows", () => {
		const svg = heatGrid([]);
		expect(svgOpenTag(svg)).toMatch(/role="img"/);
		expect(svg).toMatch(/<title>[^<]+<\/title>/);
		expect(svg).toMatch(/<text\b/);
		expect(countMatches(svg, /<rect\b[^>]*class="cell"/g)).toBe(0);
	});
});

describe("XML safety", () => {
	it("escapes special characters in labels for lineChart titles", () => {
		const svg = lineChart([{ label: "a & b <c>", points: [{ x: 0, y: 1 }] }]);
		expect(svg).not.toMatch(/<title>[^<]*&(?!amp;|lt;|gt;|quot;|#39;)/);
		expect(svg).toContain("&amp;");
	});

	it("escapes special characters in bar labels", () => {
		const svg = barChart([{ label: "<b>&", value: 3 }]);
		expect(svg).toContain("&lt;b&gt;&amp;");
	});
});

describe("inline snapshots (one tiny SVG per chart type)", () => {
	it("lineChart", () => {
		expect(
			lineChart(
				[
					{
						label: "s",
						points: [
							{ x: 0, y: 0 },
							{ x: 1, y: 10 },
						],
					},
				],
				{ width: 100, height: 60, colors: ["#1f77b4"] },
			),
		).toMatchInlineSnapshot(
			`"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60" viewBox="0 0 100 60" role="img"><title>Line chart: s</title><line x1="36" y1="46" x2="86" y2="46" stroke="#e6e4dd" stroke-width="1" /><text x="29" y="50" text-anchor="end" fill="#7a7a72" font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif" font-size="11">0</text><line x1="36" y1="37.5" x2="86" y2="37.5" stroke="#e6e4dd" stroke-width="1" /><text x="29" y="41.5" text-anchor="end" fill="#7a7a72" font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif" font-size="11">2.5</text><line x1="36" y1="29" x2="86" y2="29" stroke="#e6e4dd" stroke-width="1" /><text x="29" y="33" text-anchor="end" fill="#7a7a72" font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif" font-size="11">5</text><line x1="36" y1="20.5" x2="86" y2="20.5" stroke="#e6e4dd" stroke-width="1" /><text x="29" y="24.5" text-anchor="end" fill="#7a7a72" font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif" font-size="11">7.5</text><line x1="36" y1="12" x2="86" y2="12" stroke="#e6e4dd" stroke-width="1" /><text x="29" y="16" text-anchor="end" fill="#7a7a72" font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif" font-size="11">10</text><polygon points="36,46 36,46 86,12 86,46" fill="#1f77b4" fill-opacity="0.12" /><polyline fill="none" stroke="#1f77b4" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="36,46 86,12" /><circle cx="36" cy="46" r="3" fill="#ffffff" stroke="#1f77b4" stroke-width="2" /><circle cx="86" cy="12" r="3" fill="#ffffff" stroke="#1f77b4" stroke-width="2" /></svg>"`,
		);
	});

	it("barChart", () => {
		expect(
			barChart([{ label: "a", value: 4 }], { width: 200, height: 40 }),
		).toMatchInlineSnapshot(
			`"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40" role="img"><title>Bar chart: a</title><g><text x="29" y="21" text-anchor="end" fill="#2a2a27" font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif" font-size="12">a</text></g><rect x="37" y="10" width="144" height="14" fill="#eceae4" rx="7" /><rect class="bar" x="37" y="10" width="144" height="14" fill="#a3384b" rx="7" /><text x="189" y="21" text-anchor="start" fill="#2a2a27" font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif" font-size="12" font-weight="600">4</text></svg>"`,
		);
	});

	it("donutGauge", () => {
		expect(donutGauge(50, { label: "G" })).toMatchInlineSnapshot(
			`"<svg xmlns="http://www.w3.org/2000/svg" width="132" height="132" viewBox="0 0 132 132" role="img"><title>G: 50%</title><circle cx="66" cy="66" r="59" fill="none" stroke="#eceae4" stroke-width="14" /><circle cx="66" cy="66" r="59" fill="none" stroke="#c98a1e" stroke-width="14" stroke-linecap="round" stroke-dasharray="185.354 185.354" transform="rotate(-90 66 66)" /><text x="66" y="66" text-anchor="middle" dominant-baseline="central" fill="#2a2a27" font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif" font-size="30" font-weight="700">50</text></svg>"`,
		);
	});

	it("heatGrid", () => {
		expect(
			heatGrid([{ label: "r", cells: [{ intensity: 0.5 }] }], {
				width: 100,
				height: 40,
			}),
		).toMatchInlineSnapshot(
			`"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40" role="img"><title>Heat grid: r</title><text x="31" y="20" text-anchor="end" fill="#2a2a27" font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif" font-size="12">r</text><rect x="39" y="4" width="23" height="23" fill="#eceae4" rx="4" /><rect class="cell" x="39" y="4" width="23" height="23" fill="#a3384b" fill-opacity="0.5" rx="4" /></svg>"`,
		);
	});
});
