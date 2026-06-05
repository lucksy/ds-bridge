// T7.18 — MDX renderer. PURE string building: one MDX page per ComponentDoc,
// with frontmatter (title + status derived from gaps), a props table, a variants
// list, an import snippet from importPath, a figma description section, and a
// gaps callout. Golden tests pin the exact output.
import { describe, expect, it } from "vitest";
import type { ComponentDoc } from "../../../src/engines/docs/merge.js";
import { renderComponentMdx } from "../../../src/engines/docs/render-mdx.js";

describe("renderComponentMdx", () => {
	it("renders a fully-matched component page", () => {
		const doc: ComponentDoc = {
			name: "Button",
			code: {
				importPath: "components/button.tsx",
				props: [
					{ name: "label", type: "string", required: true },
					{ name: "variant", type: '"primary" | "secondary"', required: false },
				],
				variants: { variant: ["primary", "secondary"] },
			},
			figma: { nodeId: "10:1", description: "Primary call to action." },
			gaps: [],
		};

		expect(renderComponentMdx(doc)).toBe(
			`---
title: Button
status: documented
---

# Button

\`\`\`tsx
import { Button } from "components/button.tsx";
\`\`\`

## Props

| Prop | Type | Required |
| --- | --- | --- |
| \`label\` | \`string\` | yes |
| \`variant\` | \`"primary" \\| "secondary"\` | no |

## Variants

- **variant**: \`primary\`, \`secondary\`

## Figma

Primary call to action.

Node: \`10:1\`
`,
		);
	});

	it("renders the empty-state sections and a gaps callout", () => {
		const doc: ComponentDoc = {
			name: "Spinner",
			code: { importPath: "", props: [], variants: {} },
			figma: { nodeId: "10:7", description: "" },
			gaps: ["unmatched-in-code", "missing-figma-description"],
		};

		expect(renderComponentMdx(doc)).toBe(
			`---
title: Spinner
status: gaps
---

# Spinner

## Props

_No props documented._

## Variants

_No variants._

## Figma

_No Figma description authored._

Node: \`10:7\`

> [!WARNING]
> This component has documentation gaps:
> - Figma publishes this component but no code component matches it.
> - The matched Figma component has no authored description.
`,
		);
	});

	it("omits the import snippet and figma section when there is no code/figma side", () => {
		const doc: ComponentDoc = {
			name: "HeroPanel",
			code: {
				importPath: "components/hero-panel.tsx",
				props: [{ name: "title", type: "string", required: true }],
				variants: {},
			},
			gaps: ["unmatched-in-figma"],
		};

		expect(renderComponentMdx(doc)).toBe(
			`---
title: HeroPanel
status: gaps
---

# HeroPanel

\`\`\`tsx
import { HeroPanel } from "components/hero-panel.tsx";
\`\`\`

## Props

| Prop | Type | Required |
| --- | --- | --- |
| \`title\` | \`string\` | yes |

## Variants

_No variants._

> [!WARNING]
> This component has documentation gaps:
> - The codebase has this component but the Figma library does not publish a match.
`,
		);
	});
});
