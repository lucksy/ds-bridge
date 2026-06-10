// M11.1 — renderIndex: the static-site index. Self-contained HTML, relative
// links, no live timestamp (snapshot-stable). Pure.
import { describe, expect, it } from "vitest";
import {
	type IndexEntry,
	renderIndex,
} from "../../../src/render/html/index.js";

const ENTRIES: IndexEntry[] = [
	{ name: "exec", href: "./exec.html" },
	{ name: "team", href: "./team.html" },
];

describe("renderIndex", () => {
	it("renders a self-contained document with a relative link per entry", () => {
		const html = renderIndex(ENTRIES);
		expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
		expect(html).toContain("<title>ds-bridge dashboards</title>");
		expect(html).toContain("<style>"); // inline STYLE, fully offline
		expect(html).toContain('<a href="./exec.html">exec</a>');
		expect(html).toContain('<a href="./team.html">team</a>');
		// No live timestamp — snapshot-stable.
		expect(html).not.toContain("Generated ");
	});

	it("escapes entry names + hrefs", () => {
		const html = renderIndex([{ name: "<x>", href: "./a&b.html" }]);
		expect(html).toContain("&lt;x&gt;");
		expect(html).toContain("a&amp;b.html");
	});

	it("renders an empty-state when there are no entries", () => {
		const html = renderIndex([]);
		expect(html).toContain("No dashboards published");
	});

	it("is deterministic (identical entries → identical bytes)", () => {
		expect(renderIndex(ENTRIES)).toBe(renderIndex(ENTRIES));
	});
});
