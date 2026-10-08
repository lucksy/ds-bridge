// D2 — digest markdown renderer, golden-tested (SPEC-digest §2). The exact
// multi-line string IS the contract: a window header naming the since boundary,
// audience-segmented sections (For designers / For developers, membership =
// section-audience or `both`; a single-audience model renders ONE section),
// movement lines with ▲▼ arrows and "new" markers, a numbered actions block
// (max 3), and the quiet one-liner. Pure string building — no I/O, no clock.
import { describe, expect, it } from "vitest";
import type { DigestModel } from "../../../src/engines/report/digest.js";
import { renderDigestMarkdown } from "../../../src/engines/report/digest-md.js";

const SINCE = "2026-06-01T00:00:00.000Z";

describe("renderDigestMarkdown — full both-audience", () => {
	it("renders both sections, movement lines, and a numbered actions block", () => {
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
					kind: "coverage",
					audience: "both",
					current: 80,
					isNew: true,
					direction: "flat",
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
			actions: [
				{ command: "ds-bridge tokens check", audience: "both" },
				{ command: "ds-bridge lint", audience: "developer", count: 4 },
				{ command: "ds-bridge handoff <frame-url>", audience: "designer" },
			],
		};

		const md = renderDigestMarkdown(model);
		expect(md).toBe(
			`# Design-system digest

_Window: changes since 2026-06-01._

## For designers

- Drift ▼ 5 → 2
- Import coverage — new 80%
- Readiness ▲ 70 → 85

## For developers

- Drift ▼ 5 → 2
- Lint violations ▲ 3 → 4
- Import coverage — new 80%

## Actions

1. Run \`ds-bridge tokens check\` — review breaking token drift
2. Snap 4 off-system values to an existing token, or add the missing tokens (run \`ds-bridge lint\` to list them)
3. Run \`ds-bridge handoff <frame-url>\` — readiness is below the gate
`,
		);
	});
});

describe("renderDigestMarkdown — designers-only filter", () => {
	it("renders a single section (the model is already audience-filtered)", () => {
		const model: DigestModel = {
			kind: "ok",
			sinceIso: SINCE,
			audience: "designer",
			movements: [
				{
					kind: "drift",
					audience: "both",
					baseline: 1,
					current: 1,
					isNew: false,
					direction: "flat",
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
			actions: [
				{ command: "ds-bridge handoff <frame-url>", audience: "designer" },
			],
		};

		const md = renderDigestMarkdown(model);
		expect(md).toBe(
			`# Design-system digest

_Window: changes since 2026-06-01._

## For designers

- Drift = 1 → 1
- Readiness ▲ 70 → 85

## Actions

1. Run \`ds-bridge handoff <frame-url>\` — readiness is below the gate
`,
		);
	});
});

describe("renderDigestMarkdown — quiet", () => {
	it("renders the quiet one-liner", () => {
		const model: DigestModel = {
			kind: "quiet",
			sinceIso: SINCE,
			audience: "both",
		};
		expect(renderDigestMarkdown(model)).toBe(
			`# Design-system digest

_Quiet week — no design-system movement since 2026-06-01._
`,
		);
	});
});

describe("renderDigestMarkdown — actions capped at 3", () => {
	it("never numbers a fourth action (the engine caps; the renderer renders what it gets)", () => {
		const model: DigestModel = {
			kind: "ok",
			sinceIso: SINCE,
			audience: "both",
			movements: [
				{
					kind: "drift",
					audience: "both",
					current: 3,
					isNew: true,
					direction: "flat",
				},
			],
			actions: [
				{ command: "ds-bridge tokens check", audience: "both" },
				{ command: "ds-bridge lint", audience: "developer", count: 4 },
				{ command: "ds-bridge handoff <frame-url>", audience: "designer" },
			],
		};

		const md = renderDigestMarkdown(model);
		expect(md).toContain("1. Run `ds-bridge tokens check`");
		expect(md).toContain(
			"2. Snap 4 off-system values to an existing token, or add the missing tokens (run `ds-bridge lint` to list them)",
		);
		expect(md).not.toContain("/ds-bridge:");
		expect(md).not.toContain("--fix");
		expect(md).toContain("3. Run `ds-bridge handoff <frame-url>`");
		expect(md).not.toContain("4.");
	});
});
