// Real-user finding (GitHub Primer testbed): most products consume their design
// system as a package — `import { Button, Label } from "@primer/react"` — so the
// Figma library's components are implemented in node_modules, not under src/.
// Parity reported every one of them missing-in-code. A package component the
// code imports, named like a Figma component, is the code implementation; its
// props come from the package's own typings (React's HTML attributes dropped).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mapUsage } from "../../../src/engines/impact/usage.js";
import type { RegistryFile } from "../../../src/engines/registry/persist.js";
import { scanPackageComponents } from "../../../src/engines/registry/scan-code.js";

let root: string;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "ds-pkg-"));
	const pkg = join(root, "node_modules", "@acme", "ds");
	mkdirSync(pkg, { recursive: true });
	writeFileSync(
		join(pkg, "package.json"),
		JSON.stringify({ name: "@acme/ds", types: "index.d.ts" }),
	);
	writeFileSync(
		join(pkg, "index.d.ts"),
		`export interface ButtonProps {
  variant?: "default" | "primary" | "danger";
  size?: "small" | "medium" | "large";
  block?: boolean;
  children?: unknown;
}
export declare const Button: (props: ButtonProps) => unknown;
export declare const Tooltip: (props: { text: string }) => unknown;
export declare function useTheme(): unknown;
`,
	);
	mkdirSync(join(root, "src"));
	writeFileSync(
		join(root, "src", "Card.tsx"),
		"export function Card(props: { title: string }) { return null }\n",
	);
	writeFileSync(
		join(root, "src", "App.tsx"),
		`import { Button, useTheme } from "@acme/ds";
import { Card } from "./Card";
export function App() { useTheme(); return [Button, Card]; }
`,
	);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("scanPackageComponents", () => {
	it("returns the imported package components named like a wanted (Figma) component", () => {
		const found = scanPackageComponents(
			root,
			new Set(["button", "tooltip", "card"]),
		);
		expect(found.map((c) => [c.name, c.importPath])).toEqual([
			["Button", "@acme/ds"],
		]);
	});

	it("reads the package component's props and variant axes from its typings", () => {
		const [button] = scanPackageComponents(root, new Set(["button"]));
		expect(button?.variants).toEqual({
			variant: ["default", "primary", "danger"],
			size: ["small", "medium", "large"],
		});
		expect(button?.props.map((p) => p.name)).toEqual([
			"variant",
			"size",
			"block",
			"children",
		]);
	});

	it("is empty when nothing is wanted", () => {
		expect(scanPackageComponents(root, new Set())).toEqual([]);
	});
});

describe("mapUsage — a package component", () => {
	it("finds the imports of a registry entry whose importPath is a package", () => {
		const registry: RegistryFile = {
			schemaVersion: 1,
			generatedAt: "2026-10-08T00:00:00.000Z",
			matches: [
				{
					codeName: "Button",
					importPath: "@acme/ds",
					figmaName: "Button",
					nodeId: "1:1",
					score: 1,
				},
			],
			unmatchedCode: [],
			unmatchedFigma: [],
		};
		const [usage] = mapUsage({
			registry,
			changedFigmaNames: ["Button"],
			projectDir: root,
		});
		expect(usage?.count).toBe(1);
		expect(usage?.usages.map((s) => s.file)).toEqual(["src/App.tsx"]);
	});
});
