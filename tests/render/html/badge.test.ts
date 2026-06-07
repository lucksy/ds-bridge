// S5a — System-score badge SVG. Test-first: a pure, deterministic, flat
// self-contained SVG badge with a label segment + a value segment whose fill
// band is chosen by score thresholds. No DOM, no dates, no randomness.
import { describe, expect, it } from "vitest";
import { renderBadge } from "../../../src/render/html/badge.js";

const SVG_OPEN = /<svg\b[^>]*>/;

function svgOpenTag(svg: string): string {
	const match = svg.match(SVG_OPEN);
	if (match === null) throw new Error("no <svg> tag found");
	return match[0];
}

describe("renderBadge", () => {
	it("emits a valid svg root with viewBox, role and dimensions", () => {
		const svg = renderBadge({ score: 95 });
		const open = svgOpenTag(svg);
		expect(open).toMatch(/viewBox="0 0 \d+ \d+"/);
		expect(open).toMatch(/role="img"/);
		expect(open).toMatch(/\bwidth="\d+"/);
		expect(open).toMatch(/\bheight="\d+"/);
		expect(svg.trim().endsWith("</svg>")).toBe(true);
	});

	it("renders an accessible <title> naming the system score", () => {
		const svg = renderBadge({ score: 95 });
		expect(svg).toMatch(/<title>ds-bridge system score: 95\/100<\/title>/);
	});

	it("defaults the label segment to 'ds-bridge'", () => {
		const svg = renderBadge({ score: 80 });
		expect(svg).toMatch(/<text[^>]*>ds-bridge<\/text>/);
	});

	it("renders the value segment as NN/100", () => {
		const svg = renderBadge({ score: 80 });
		expect(svg).toMatch(/<text[^>]*>80\/100<\/text>/);
	});

	it("uses a dark neutral background for the label segment", () => {
		const svg = renderBadge({ score: 80 });
		// the label segment rect uses a dark neutral fill (not a band color)
		expect(svg).toMatch(/fill="#(?!16a34a|d97706|dc2626)[0-9a-f]{6}"/);
	});

	describe("band fill by score", () => {
		it("fills green (#16a34a) at the 90 boundary (>= 90)", () => {
			expect(renderBadge({ score: 90 })).toContain('fill="#16a34a"');
		});

		it("fills green (#16a34a) above 90", () => {
			expect(renderBadge({ score: 100 })).toContain('fill="#16a34a"');
		});

		it("fills amber (#d97706) at the 70 boundary (>= 70, < 90)", () => {
			const svg = renderBadge({ score: 70 });
			expect(svg).toContain('fill="#d97706"');
			expect(svg).not.toContain('fill="#16a34a"');
		});

		it("fills amber (#d97706) just below 90", () => {
			const svg = renderBadge({ score: 89 });
			expect(svg).toContain('fill="#d97706"');
		});

		it("fills red (#dc2626) below 70", () => {
			const svg = renderBadge({ score: 69 });
			expect(svg).toContain('fill="#dc2626"');
			expect(svg).not.toContain('fill="#d97706"');
		});

		it("fills red (#dc2626) at zero", () => {
			expect(renderBadge({ score: 0 })).toContain('fill="#dc2626"');
		});
	});

	describe("clamping", () => {
		it("clamps a negative score up to 0", () => {
			const svg = renderBadge({ score: -5 });
			expect(svg).toMatch(/<text[^>]*>0\/100<\/text>/);
			expect(svg).toContain('fill="#dc2626"');
		});

		it("clamps a score above 100 down to 100", () => {
			const svg = renderBadge({ score: 250 });
			expect(svg).toMatch(/<text[^>]*>100\/100<\/text>/);
			expect(svg).toContain('fill="#16a34a"');
		});
	});

	describe("rounding (half-up for display)", () => {
		it("rounds 89.5 up to 90 (which lands in the green band)", () => {
			const svg = renderBadge({ score: 89.5 });
			expect(svg).toMatch(/<text[^>]*>90\/100<\/text>/);
			expect(svg).toContain('fill="#16a34a"');
		});

		it("rounds 69.4 down to 69 (red band)", () => {
			const svg = renderBadge({ score: 69.4 });
			expect(svg).toMatch(/<text[^>]*>69\/100<\/text>/);
			expect(svg).toContain('fill="#dc2626"');
		});
	});

	describe("custom label escaping", () => {
		it("renders a custom label in the label segment", () => {
			const svg = renderBadge({ score: 80, label: "my-repo" });
			expect(svg).toMatch(/<text[^>]*>my-repo<\/text>/);
			expect(svg).toMatch(/<title>my-repo system score: 80\/100<\/title>/);
		});

		it("XML-escapes a label containing &", () => {
			const svg = renderBadge({ score: 80, label: "a & b" });
			expect(svg).toContain("a &amp; b");
			expect(svg).not.toContain("a & b");
		});

		it("XML-escapes a label containing <", () => {
			const svg = renderBadge({ score: 80, label: "<script>" });
			expect(svg).toContain("&lt;script&gt;");
			expect(svg).not.toContain("<script>");
		});
	});

	it("is deterministic: identical input yields identical output", () => {
		expect(renderBadge({ score: 73, label: "x" })).toBe(
			renderBadge({ score: 73, label: "x" }),
		);
	});

	it("contains no dates or randomness markers", () => {
		const svg = renderBadge({ score: 50 });
		expect(svg).not.toMatch(/\d{4}-\d{2}-\d{2}/);
	});
});
