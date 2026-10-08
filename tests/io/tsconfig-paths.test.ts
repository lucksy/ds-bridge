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

describe("aliasSpecifier — an exact alias to a barrel folder (Simple Design System)", () => {
	it("names the alias when the folder's index re-exports the file", async () => {
		const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join: j } = await import("node:path");
		const dir = mkdtempSync(j(tmpdir(), "alias-barrel-"));
		writeFileSync(
			j(dir, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					baseUrl: "./src",
					paths: { primitives: ["./ui/primitives"] },
				},
			}),
		);
		mkdirSync(j(dir, "src", "ui", "primitives", "Button"), { recursive: true });
		mkdirSync(j(dir, "src", "ui", "primitives", "Secret"), { recursive: true });
		writeFileSync(
			j(dir, "src", "ui", "primitives", "index.ts"),
			'export * from "./Button/Button";\n',
		);
		writeFileSync(
			j(dir, "src", "ui", "primitives", "Button", "Button.tsx"),
			"export const Button = 1;",
		);
		writeFileSync(
			j(dir, "src", "ui", "primitives", "Secret", "Secret.tsx"),
			"export const Secret = 1;",
		);
		expect(aliasSpecifier(dir, "src/ui/primitives/Button/Button.tsx")).toBe(
			"primitives",
		);
		expect(
			aliasSpecifier(dir, "src/ui/primitives/Secret/Secret.tsx"),
		).toBeUndefined();
	});
});
