import { defineConfig } from "tsup";

export default defineConfig({
	entry: { cli: "src/cli.ts" },
	format: ["esm"],
	outDir: "dist",
	outExtension: () => ({ js: ".mjs" }),
	target: "node22",
	platform: "node",
	bundle: true,
	noExternal: [/.*/], // single self-contained file — plugin install needs zero npm install
	clean: true,
	banner: {
		// Shim: bundled CJS deps (commander) require() node builtins inside the ESM output.
		js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);',
	},
});
