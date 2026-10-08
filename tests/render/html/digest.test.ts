// F7 — the manager digest view + the HTML digest page (SPEC-figma-trends §4).
// Pure: one structured digestDocument feeds both the markdown and the HTML
// renderers, so they cannot drift. The md default stays byte-identical (the
// D2 goldens in digest-md.test.ts are unchanged).
import { describe, expect, it } from "vitest";
import type { DigestModel } from "../../../src/engines/report/digest.js";
import {
	digestDocument,
	renderDigestMarkdown,
} from "../../../src/engines/report/digest-md.js";
import { renderDigestHtml } from "../../../src/render/html/digest.js";

const SINCE = "2026-09-05T00:00:00.000Z";

const model: DigestModel = {
	kind: "ok",
	sinceIso: SINCE,
	audience: "both",
	movements: [
		{
			kind: "drift",
			audience: "both",
			baseline: 5,
			current: 2,
			isNew: false,
			direction: "down",
		},
		{
			kind: "lint",
			audience: "developer",
			baseline: 3,
			current: 4,
			isNew: false,
			direction: "up",
		},
		{
			kind: "readiness",
			audience: "designer",
			baseline: 70,
			current: 85,
			isNew: false,
			direction: "up",
		},
	],
	actions: [{ command: "ds-bridge tokens check", audience: "both" }],
};

describe("digestDocument", () => {
	it("default view: the designer/developer sections, as today", () => {
		const doc = digestDocument(model);
		expect(doc.sections.map((s) => s.heading)).toEqual([
			"For designers",
			"For developers",
		]);
	});

	it("manager view: ONE section listing every movement once", () => {
		const doc = digestDocument(model, "manager");
		expect(doc.sections).toEqual([
			{
				heading: "For managers",
				lines: [
					"Stale tokens ▼ 5 → 2",
					"Lint violations ▲ 3 → 4",
					"Readiness ▲ 70 → 85",
				],
			},
		]);
		expect(doc.actions).toEqual([
			"Run `ds-bridge tokens check` — review breaking token drift",
		]);
	});
});

describe("renderDigestMarkdown — manager view", () => {
	it("renders one ## For managers section then the actions", () => {
		expect(renderDigestMarkdown(model, "manager")).toBe(
			`# Design-system digest

_Window: changes since 2026-09-05._

## For managers

- Stale tokens ▼ 5 → 2
- Lint violations ▲ 3 → 4
- Readiness ▲ 70 → 85

## Actions

1. Run \`ds-bridge tokens check\` — review breaking token drift
`,
		);
	});
});

describe("renderDigestHtml", () => {
	it("is one offline page: title, window, sections as lists, actions as an ordered list", () => {
		const html = renderDigestHtml(model, "manager");
		expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
		expect(html).toContain("<title>Design-system digest</title>");
		expect(html).toContain("<h1>Design-system digest</h1>");
		expect(html).toContain("changes since 2026-09-05");
		expect(html).toContain("<h2>For managers</h2>");
		expect(html).toContain("<li>Stale tokens ▼ 5 → 2</li>");
		expect(html).toContain("<ol>");
		expect(html).toContain(
			"<li>Run <code>ds-bridge tokens check</code> — review breaking token drift</li>",
		);
		expect(html).not.toMatch(/<script\b/i);
		expect(html).not.toMatch(/<link\b/i);
		expect(html).not.toMatch(/url\(/i);
	});

	it("renders the quiet one-liner", () => {
		const html = renderDigestHtml({
			kind: "quiet",
			sinceIso: SINCE,
			audience: "both",
		});
		expect(html).toContain(
			"Quiet week — no design-system movement since 2026-09-05.",
		);
		expect(html).not.toContain("<h2>");
	});

	it("manager view: window-neutral quiet wording (a 30-day digest is not a week)", () => {
		const quiet = { kind: "quiet", sinceIso: SINCE, audience: "both" } as const;
		expect(digestDocument(quiet, "manager").quiet).toBe(
			"Quiet period — no design-system movement since 2026-09-05.",
		);
		expect(renderDigestHtml(quiet, "manager")).toContain("Quiet period");
		expect(renderDigestMarkdown(quiet, "manager")).toBe(
			"# Design-system digest\n\n_Quiet period — no design-system movement since 2026-09-05._\n",
		);
		// The default view keeps today's wording byte-for-byte.
		expect(digestDocument(quiet).quiet).toBe(
			"Quiet week — no design-system movement since 2026-09-05.",
		);
	});

	it("is byte-stable", () => {
		expect(renderDigestHtml(model)).toBe(renderDigestHtml(model));
	});
});

describe("renderDigestHtml — CLI actions (D6)", () => {
	it("escapes the <frame-url> placeholder inside the code span and names no slash command", () => {
		const html = renderDigestHtml(
			{
				...model,
				actions: [
					{ command: "ds-bridge handoff <frame-url>", audience: "designer" },
					{ command: "ds-bridge lint", audience: "developer", count: 1 },
				],
			},
			"manager",
		);
		expect(html).toContain(
			"<li>Run <code>ds-bridge handoff &lt;frame-url&gt;</code> — readiness is below the gate</li>",
		);
		expect(html).toContain(
			"<li>Snap 1 off-system value to an existing token, or add the missing token (run <code>ds-bridge lint</code> to list them)</li>",
		);
		expect(html).not.toContain("/ds-bridge:");
		expect(html).not.toContain("T00:00:00");
	});
});
