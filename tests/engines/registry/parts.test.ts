// Compound components: a part is a same-file export extending another export's name.
import { describe, expect, it } from "vitest";
import {
	codeExports,
	componentOf,
	compoundParent,
} from "../../../src/engines/registry/parts.js";

const file = "src/components/ui/dialog.tsx";
const all = [
	{ name: "Dialog", importPath: file },
	{ name: "DialogContent", importPath: file },
	{ name: "DialogContentHeader", importPath: file },
	{ name: "Dialogue", importPath: file }, // lower-case continuation: not a part
	{ name: "DialogTitle", importPath: "src/other.tsx" }, // other file: not a part
];

describe("compoundParent", () => {
	it("is the longest same-file name prefix followed by a capital", () => {
		expect(compoundParent(all[2] as (typeof all)[number], all)).toBe(
			"DialogContent",
		);
		expect(compoundParent(all[3] as (typeof all)[number], all)).toBeUndefined();
		expect(compoundParent(all[4] as (typeof all)[number], all)).toBeUndefined();
	});
});

describe("componentOf", () => {
	it("walks up to the top-level component", () => {
		expect(componentOf(all[2] as (typeof all)[number], all)).toBe("Dialog");
		expect(componentOf(all[0] as (typeof all)[number], all)).toBe("Dialog");
	});
});

describe("codeExports", () => {
	it("lists matched then unmatched code exports and tolerates missing arrays", () => {
		expect(
			codeExports({
				matches: [{ codeName: "Card", importPath: "card.tsx" }],
				unmatchedCode: [{ name: "CardHeader", importPath: "card.tsx" }],
			}),
		).toEqual([
			{ name: "Card", importPath: "card.tsx" },
			{ name: "CardHeader", importPath: "card.tsx" },
		]);
		expect(codeExports({})).toEqual([]);
	});
});
