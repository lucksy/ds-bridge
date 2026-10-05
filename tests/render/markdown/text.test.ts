// Markdown safety for the paste-ready renderers: untrusted names stay literal,
// one line, and cannot break tables or open links/HTML/emphasis.
import { describe, expect, it } from "vitest";
import { mdText } from "../../../src/render/markdown/text.js";

describe("mdText", () => {
	it("escapes Markdown's active characters", () => {
		expect(mdText("[Fix](javascript:alert(1))")).toBe(
			"\\[Fix\\](javascript:alert(1))",
		);
		expect(mdText('<img src=x onerror="1">')).toBe(
			'\\<img src=x onerror="1"\\>',
		);
		expect(mdText("a|b *c* _d_ `e` ~f~ \\g")).toBe(
			"a\\|b \\*c\\* \\_d\\_ \\`e\\` \\~f\\~ \\\\g",
		);
	});

	it("makes multi-line text one line", () => {
		expect(mdText("fatal: bad ref\n  hint: try again\r\nend")).toBe(
			"fatal: bad ref hint: try again end",
		);
	});

	it("leaves plain prose unchanged", () => {
		const prose = "System score fell 4 pts in 30 days (2 drops in a row)";
		expect(mdText(prose)).toBe(prose);
	});
});
