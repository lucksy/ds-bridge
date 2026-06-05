// T7.18 — llms.txt renderer. PURE string building: a single machine-readable
// system description — a header, a token summary (counts by type from the
// TokenMap), and a component inventory with one-line prop signatures. Golden
// tests pin the exact output.
import { describe, expect, it } from "vitest";
import type { ComponentDoc } from "../../../src/engines/docs/merge.js";
import { renderLlmsTxt } from "../../../src/engines/docs/render-llms.js";
import type { TokenMap } from "../../../src/engines/tokens/types.js";

const TOKENS: TokenMap = {
	format: "w3c",
	tokens: [
		{ name: "color.brand.primary", type: "color", value: "#3b82f6" },
		{ name: "color.brand.secondary", type: "color", value: "#10b981" },
		{ name: "space.sm", type: "dimension", value: "8px" },
		{ name: "font.body", type: "fontFamily", value: "Inter" },
	],
};

describe("renderLlmsTxt", () => {
	it("renders header, token summary, and component inventory", () => {
		const docs: ComponentDoc[] = [
			{
				name: "Button",
				code: {
					importPath: "components/button.tsx",
					props: [
						{ name: "label", type: "string", required: true },
						{
							name: "variant",
							type: '"primary" | "secondary"',
							required: false,
						},
					],
					variants: { variant: ["primary", "secondary"] },
				},
				figma: { nodeId: "10:1", description: "Primary call to action." },
				gaps: [],
			},
			{
				name: "Spinner",
				code: { importPath: "", props: [], variants: {} },
				figma: { nodeId: "10:7", description: "" },
				gaps: ["unmatched-in-code", "missing-figma-description"],
			},
		];

		expect(renderLlmsTxt(docs, TOKENS)).toBe(
			`# Design System

> Machine-readable summary of the design system: tokens and components.

## Tokens

Format: w3c
Total: 4

- color: 2
- dimension: 1
- fontFamily: 1

## Components

- Button(label: string, variant?: "primary" | "secondary") — components/button.tsx [documented]
- Spinner() — figma:10:7 [gaps: unmatched-in-code, missing-figma-description]
`,
		);
	});

	it("renders an empty-state system description", () => {
		expect(renderLlmsTxt([], { format: "style-dictionary", tokens: [] })).toBe(
			`# Design System

> Machine-readable summary of the design system: tokens and components.

## Tokens

Format: style-dictionary
Total: 0

_No tokens._

## Components

_No components._
`,
		);
	});
});
