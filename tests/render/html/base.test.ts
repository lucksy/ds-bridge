// The shared HTML building blocks: one escaping contract for every page.
import { describe, expect, it } from "vitest";
import {
	debtTone,
	kpiTile,
	panel,
	tableHtml,
} from "../../../src/render/html/base.js";

describe("tableHtml", () => {
	it("escapes every plain-string cell and header; only RawHtml is markup", () => {
		const html = tableHtml(
			["<th>"],
			[["<img src=x onerror=1>", { html: '<span class="badge">ok</span>' }]],
		);
		expect(html).toContain("<th>&lt;th&gt;</th>");
		expect(html).toContain("<td>&lt;img src=x onerror=1&gt;</td>");
		expect(html).toContain('<td><span class="badge">ok</span></td>');
		expect(html).not.toContain("<img");
	});
});

describe("kpiTile / panel", () => {
	it("escapes text and reads an unmeasured value as '—' / not measured", () => {
		expect(kpiTile("<b>", undefined, "ok", "x")).toBe(
			'<div class="kpi"><span class="kpi-label">&lt;b&gt;</span><span class="kpi-value">—</span><span class="kpi-sub">not measured</span></div>',
		);
		expect(kpiTile("Score", "72", "warn", "+4")).toContain('class="kpi warn"');
		expect(panel("<h>", "<p>body</p>", "wide")).toBe(
			'<section class="panel wide"><h2>&lt;h&gt;</h2><p>body</p></section>',
		);
	});
});

describe("debtTone", () => {
	it("follows the debt engine's level bands (<25 low, 25–59 medium, ≥60 high)", () => {
		expect([0, 24, 25, 59, 60, 100].map(debtTone)).toEqual([
			"ok",
			"ok",
			"warn",
			"warn",
			"error",
			"error",
		]);
	});
});
