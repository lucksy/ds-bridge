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
			`"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60" viewBox="0 0 100 60" role="img"><title>Line chart: s</title><line x1="40" y1="32" x2="84" y2="32" stroke="#9ca3af" stroke-width="0.5" /><text x="34" y="35" text-anchor="end" fill="#374151" font-family="sans-serif" font-size="10">0</text><line x1="40" y1="28" x2="84" y2="28" stroke="#9ca3af" stroke-width="0.5" /><text x="34" y="31" text-anchor="end" fill="#374151" font-family="sans-serif" font-size="10">2.5</text><line x1="40" y1="24" x2="84" y2="24" stroke="#9ca3af" stroke-width="0.5" /><text x="34" y="27" text-anchor="end" fill="#374151" font-family="sans-serif" font-size="10">5</text><line x1="40" y1="20" x2="84" y2="20" stroke="#9ca3af" stroke-width="0.5" /><text x="34" y="23" text-anchor="end" fill="#374151" font-family="sans-serif" font-size="10">7.5</text><line x1="40" y1="16" x2="84" y2="16" stroke="#9ca3af" stroke-width="0.5" /><text x="34" y="19" text-anchor="end" fill="#374151" font-family="sans-serif" font-size="10">10</text><polyline fill="none" stroke="#1f77b4" stroke-width="2" points="40,32 84,16" /></svg>"`,
		);
	});

	it("barChart", () => {
		expect(
			barChart([{ label: "a", value: 4 }], { width: 200, height: 40 }),
		).toMatchInlineSnapshot(
			`"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40" role="img"><title>Bar chart: a</title><text x="74" y="23" text-anchor="end" fill="#374151" font-family="sans-serif" font-size="11">a</text><rect class="bar" x="80" y="12" width="80" height="16" fill="#2563eb" rx="2" /><text x="164" y="23" text-anchor="start" fill="#374151" font-family="sans-serif" font-size="11">4</text></svg>"`,
		);
	});

	it("donutGauge", () => {
		expect(donutGauge(50, { label: "G" })).toMatchInlineSnapshot(
			`"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" role="img"><title>G: 50%</title><circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" stroke-width="12" /><circle cx="60" cy="60" r="54" fill="none" stroke="#2563eb" stroke-width="12" stroke-linecap="round" stroke-dasharray="169.646 169.646" transform="rotate(-90 60 60)" /><text x="60" y="60" text-anchor="middle" dominant-baseline="central" fill="#374151" font-family="sans-serif" font-size="24" font-weight="600">50</text></svg>"`,
		);
	});

	it("heatGrid", () => {
		expect(
			heatGrid([{ label: "r", cells: [{ intensity: 0.5 }] }], {
				width: 100,
				height: 40,
			}),
		).toMatchInlineSnapshot(
			`"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40" role="img"><title>Heat grid: r</title><text x="66" y="21" text-anchor="end" fill="#374151" font-family="sans-serif" font-size="11">r</text><rect class="cell" x="72" y="4" width="26" height="26" fill="#2563eb" fill-opacity="0.5" rx="2" /></svg>"`,
		);
	});
});
