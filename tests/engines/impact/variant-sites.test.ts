// Value-level migration sites (real-user finding, Simple Design System): a
// removed variant value breaks only the JSX that passes it, not every import.
import { describe, expect, it } from "vitest";
import { variantUsageLines } from "../../../src/engines/impact/variant-sites.js";

const source = [
	'import { Avatar } from "primitives";',
	"export const A = () => (",
	"  <>",
	'    <Avatar initials="AS" size="large" />',
	"    <Avatar",
	'      size={"small"}',
	'      initials="B"',
	"    />",
	"    <Avatar initials='C' />",
	"  </>",
	");",
].join("\n");

describe("variantUsageLines", () => {
	it("finds the elements passing a removed value (case- and spelling-insensitive)", () => {
		expect(
			variantUsageLines(source, "Avatar", [
				{ axis: "Size", kind: "value-removed", value: "Large" },
			]),
		).toEqual([
			{ line: 4, reason: 'passes size="large" (Size=Large removed)' },
		]);
	});

	it("finds every element setting a removed axis", () => {
		expect(
			variantUsageLines(source, "Avatar", [
				{ axis: "Size", kind: "axis-removed" },
			]),
		).toEqual([
			{ line: 4, reason: "sets size (axis Size removed)" },
			{ line: 5, reason: "sets size (axis Size removed)" },
		]);
	});

	it("is empty when no element uses what changed", () => {
		expect(
			variantUsageLines(source, "Avatar", [
				{ axis: "Size", kind: "value-removed", value: "XL" },
			]),
		).toEqual([]);
	});
});
