// Tokens Studio $themes → per-mode sub-documents (shared by a11y contrast and
// mode-aware drift).
import { describe, expect, it } from "vitest";
import {
	readThemes,
	themeSubDocument,
} from "../../../src/engines/tokens/themes.js";

const doc = {
	core: { radius: { value: "8px", type: "borderRadius" } },
	light: { background: { value: "#ffffff", type: "color" } },
	dark: { background: { value: "#0a0a0a", type: "color" } },
	$themes: [
		{
			id: "l",
			name: "light",
			selectedTokenSets: { core: "source", light: "enabled" },
		},
		{
			id: "d",
			name: "dark",
			selectedTokenSets: { core: "source", dark: "enabled", light: "disabled" },
		},
		{ id: "x", name: 42, selectedTokenSets: {} },
		"not-a-theme",
	],
};

describe("readThemes", () => {
	it("reads named themes in order and ignores malformed entries", () => {
		expect(readThemes(doc)).toEqual([
			{
				name: "light",
				selectedTokenSets: { core: "source", light: "enabled" },
			},
			{
				name: "dark",
				selectedTokenSets: {
					core: "source",
					dark: "enabled",
					light: "disabled",
				},
			},
		]);
	});

	it("is undefined without a usable $themes array", () => {
		expect(readThemes({ core: {} })).toBeUndefined();
		expect(readThemes({ $themes: [] })).toBeUndefined();
		expect(readThemes("nope")).toBeUndefined();
	});
});

describe("themeSubDocument", () => {
	it("keeps only the theme's non-disabled sets, in declared order", () => {
		const [, dark] = readThemes(doc) ?? [];
		if (dark === undefined) throw new Error("dark theme missing");
		expect(themeSubDocument(doc, dark)).toEqual({
			core: doc.core,
			dark: doc.dark,
			$metadata: { tokenSetOrder: ["core", "dark"] },
		});
	});
});
