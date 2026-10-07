// Which directories hold the design-system components `registry build` scans:
// the project's component_paths, else shadcn's components.json `aliases.ui`
// resolved through the tsconfig aliases, else nothing (scan the project).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveComponentPaths } from "../../src/io/component-paths.js";
import { resolveAliasDir } from "../../src/io/tsconfig-paths.js";

const fixtures = join(import.meta.dirname, "..", "fixtures");
const aliasProject = join(fixtures, "alias-project");

describe("resolveAliasDir", () => {
	it("maps an aliased directory specifier to a project-relative path", () => {
		expect(resolveAliasDir(aliasProject, "@/components/ui")).toBe(
			"src/components/ui",
		);
	});

	it("is undefined for a specifier no alias covers", () => {
		expect(resolveAliasDir(aliasProject, "~/x")).toBeUndefined();
	});
});

describe("resolveComponentPaths", () => {
	it("prefers the configured component_paths", () => {
		expect(resolveComponentPaths(aliasProject, ["src/pages"])).toEqual({
			paths: ["src/pages"],
			source: "component_paths",
		});
	});

	it("detects shadcn's ui directory from components.json", () => {
		expect(resolveComponentPaths(aliasProject, undefined)).toEqual({
			paths: ["src/components/ui"],
			source: "components.json",
		});
	});

	it("is undefined when neither is available", () => {
		expect(
			resolveComponentPaths(join(fixtures, "inherited-props"), undefined),
		).toBeUndefined();
	});
});
