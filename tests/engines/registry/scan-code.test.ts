// T5.1 — component scanner (Code Connect replacement, code side). Test-first.
// Acceptance data: tests/fixtures/sample-project/components/** — a small
// component library exercising real-world export patterns:
//   button.tsx        plain function component, inline props
//   card.tsx          React.FC<CardProps> (typed const)
//   icon-button.tsx   React.forwardRef<T, IconButtonProps>
//   badge.tsx         HOC-wrapped export (withTooltip(BadgeInner))
//   styled.tsx        styled.div`…` template export
//   internal-helper.tsx  non-exported component (must NOT appear)
//
// Contract under test (the chosen shape, per task): scanCodeComponents returns
// CodeComponent[] directly and NEVER throws — unreadable/weird files are
// skipped, not fatal. Ordering is deterministic: components by name, props by
// declaration order, variant values in union order.
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	type CodeComponent,
	scanCodeComponents,
} from "../../../src/engines/registry/scan-code.js";

// ts-morph's first project load is slow, and slower still under coverage
// instrumentation + full-suite parallel load — the default 5s timeout flakes.
vi.setConfig({ testTimeout: 60_000 });

const componentsRoot = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"sample-project",
	"components",
);

function scan(): CodeComponent[] {
	return scanCodeComponents(componentsRoot);
}

function byName(components: CodeComponent[], name: string): CodeComponent {
	const found = components.find((c) => c.name === name);
	if (found === undefined) throw new Error(`component ${name} not found`);
	return found;
}

describe("scanCodeComponents — discovery", () => {
	it("finds exactly the five exported components, name-sorted", () => {
		const names = scan().map((c) => c.name);
		expect(names).toEqual([
			"Badge",
			"Button",
			"Card",
			"HeroPanel",
			"IconButton",
		]);
	});

	it("never reports the non-exported InternalHelper", () => {
		const names = scan().map((c) => c.name);
		expect(names).not.toContain("InternalHelper");
	});

	it("never reports the local HOC/styled helpers as components", () => {
		const names = scan().map((c) => c.name);
		expect(names).not.toContain("withTooltip");
		expect(names).not.toContain("BadgeInner");
		expect(names).not.toContain("styled");
	});

	it("records relative, forward-slash import paths", () => {
		const components = scan();
		expect(byName(components, "Button").importPath).toBe("button.tsx");
		expect(byName(components, "Card").importPath).toBe("card.tsx");
		expect(byName(components, "IconButton").importPath).toBe("icon-button.tsx");
		expect(byName(components, "Badge").importPath).toBe("badge.tsx");
		expect(byName(components, "HeroPanel").importPath).toBe("styled.tsx");
	});
});

describe("scanCodeComponents — Button (plain function, inline props)", () => {
	it("extracts every prop with exact name/type/required", () => {
		const button = byName(scan(), "Button");
		expect(button.props).toEqual([
			{
				name: "variant",
				type: '"primary" | "secondary" | "ghost"',
				required: true,
			},
			{ name: "size", type: '"sm" | "md" | "lg"', required: false },
			{ name: "disabled", type: "boolean", required: false },
			{ name: "children", type: "unknown", required: true },
		]);
	});

	it("extracts string-literal unions as variants in union order", () => {
		const button = byName(scan(), "Button");
		expect(button.variants).toEqual({
			variant: ["primary", "secondary", "ghost"],
			size: ["sm", "md", "lg"],
		});
	});
});

describe("scanCodeComponents — Card (React.FC<CardProps>)", () => {
	it("resolves props through the React.FC generic", () => {
		const card = byName(scan(), "Card");
		expect(card.props).toEqual([
			{ name: "title", type: "string", required: true },
			{ name: "elevated", type: "boolean", required: false },
		]);
	});

	it("has no string-literal variants", () => {
		expect(byName(scan(), "Card").variants).toEqual({});
	});
});

describe("scanCodeComponents — IconButton (forwardRef)", () => {
	it("resolves props through forwardRef's second generic", () => {
		const icon = byName(scan(), "IconButton");
		expect(icon.props).toEqual([
			{ name: "icon", type: "string", required: true },
			{ name: "label", type: "string", required: true },
		]);
		expect(icon.variants).toEqual({});
	});
});

describe("scanCodeComponents — Badge (HOC-wrapped)", () => {
	it("recovers BadgeProps via the HOC generic signature", () => {
		const badge = byName(scan(), "Badge");
		expect(badge.props).toEqual([
			{ name: "tone", type: '"info" | "success" | "danger"', required: true },
			{ name: "text", type: "string", required: true },
		]);
		expect(badge.variants).toEqual({ tone: ["info", "success", "danger"] });
	});
});

describe("scanCodeComponents — HeroPanel (styled template)", () => {
	it("discovers the name; props may be empty/loose (styled fallback)", () => {
		const hero = byName(scan(), "HeroPanel");
		expect(hero.name).toBe("HeroPanel");
		// The styled stub exposes only an optional children prop; no variants.
		expect(hero.props).toEqual([
			{ name: "children", type: "unknown", required: false },
		]);
		expect(hero.variants).toEqual({});
	});
});

describe("scanCodeComponents — determinism & robustness", () => {
	it("returns deep-equal results across two runs", () => {
		expect(scan()).toEqual(scan());
	});

	it("never throws and yields [] for a directory with no components", () => {
		const empty = join(
			import.meta.dirname,
			"..",
			"..",
			"fixtures",
			"tokens",
			"w3c",
		);
		expect(() => scanCodeComponents(empty)).not.toThrow();
		// w3c holds JSON only; no .tsx → no components.
		expect(scanCodeComponents(empty)).toEqual([]);
	});

	it("never throws on a missing directory", () => {
		const missing = join(import.meta.dirname, "does-not-exist-xyz");
		expect(() => scanCodeComponents(missing)).not.toThrow();
		expect(scanCodeComponents(missing)).toEqual([]);
	});
});

describe("scanCodeComponents — inherited attributes and helpers", () => {
	const inheritedRoot = join(
		import.meta.dirname,
		"..",
		"..",
		"fixtures",
		"inherited-props",
	);

	it("keeps only the props the project declares, not inherited .d.ts attributes", () => {
		const button = byName(scanCodeComponents(inheritedRoot), "Button");
		expect(button.props.map((p) => p.name)).toEqual(["variant", "asChild"]);
		// autoCapitalize/translate are string-literal unions in the inherited type
		// and used to become variant axes that broke every Figma shape match.
		expect(button.variants).toEqual({ variant: ["default", "outline"] });
	});

	it("reports a component whose props are all inherited with no props", () => {
		const label = byName(scanCodeComponents(inheritedRoot), "Label");
		expect(label.props).toEqual([]);
		expect(label.variants).toEqual({});
	});

	it("skips callable exports that are not PascalCase (cva helpers)", () => {
		const names = scanCodeComponents(inheritedRoot).map((c) => c.name);
		expect(names).toEqual(["Button", "Label", "Separator"]);
	});

	it("keeps an inherited prop the component destructures (radix orientation)", () => {
		const separator = byName(scanCodeComponents(inheritedRoot), "Separator");
		expect(separator.props.map((p) => p.name)).toEqual(["orientation"]);
		expect(separator.variants).toEqual({
			orientation: ["horizontal", "vertical"],
		});
	});
});

// Real-user finding (Material 3 testbed): `icon?: ReactNode` rendered as the
// whole expanded union (~400 chars) in the docs props table and llms.txt.
describe("scanCodeComponents — readable prop types", () => {
	const m3Components = join(
		import.meta.dirname,
		"..",
		"..",
		"fixtures",
		"m3-project",
	);

	it("prints a long resolved type as it is written (ReactNode)", () => {
		const button = byName(scanCodeComponents(m3Components), "Button");
		const icon = button.props.find((p) => p.name === "icon");
		expect(icon?.type).toBe("ReactNode");
	});

	it("keeps a short string-literal union resolved", () => {
		const button = byName(scanCodeComponents(m3Components), "Button");
		const variant = button.props.find((p) => p.name === "variant");
		expect(variant?.type).toBe('"filled" | "tonal" | "outlined"');
	});
});
