// tsconfig import aliases: read (following Vite solution-style references) and
// reversed into the specifier a user would write.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	aliasSpecifier,
	readPathAliases,
} from "../../src/io/tsconfig-paths.js";

const fixtures = join(import.meta.dirname, "..", "fixtures");
const aliasProject = join(fixtures, "alias-project");

describe("readPathAliases", () => {
	it("finds paths in a referenced tsconfig, with an absolute baseUrl", () => {
		const aliases = readPathAliases(aliasProject);
		expect(aliases.paths).toEqual({ "@/*": ["./src/*"] });
		expect(aliases.baseUrl).toBe(aliasProject);
	});

	it("is empty without a tsconfig", () => {
		expect(readPathAliases(join(fixtures, "inherited-props"))).toEqual({});
	});
});

describe("aliasSpecifier", () => {
	it("maps a project file to its aliased import specifier", () => {
		expect(aliasSpecifier(aliasProject, "src/components/ui/button.tsx")).toBe(
			"@/components/ui/button",
		);
	});

	it("is undefined for a file no alias covers", () => {
		expect(aliasSpecifier(aliasProject, "tsconfig.json")).toBeUndefined();
		expect(
			aliasSpecifier(join(fixtures, "inherited-props"), "button.tsx"),
		).toBeUndefined();
	});
});
