import { defineConfig } from "tsup";

export default defineConfig({
	entry: { cli: "src/cli.ts" },
	format: ["esm"],
	outDir: "dist",
	outExtension: () => ({ js: ".mjs" }),
	target: "node22",
	platform: "node",
	bundle: true,
	noExternal: [/.*/], // self-contained dist/ — plugin install needs zero npm install
	// Code-splitting stays ON (T7.25): the deferred ts-morph imports
	// (registry/impact/docs) split into lazy dist/*.mjs chunks, keeping the
	// main cli.mjs small so per-edit hook spawns stay inside the <2s budget
	// (T2.6) — a splitting:false single 14MB file pushed hook startup past it.
	// The release contract therefore commits the ENTIRE dist/ directory at
	// tags, never just cli.mjs (the v0.5.0 tag latently shipped without its
	// registry-path chunk).
	splitting: true,
	clean: true,
	banner: {
		// Shim: bundled CJS deps (commander) require() node builtins inside the ESM output.
		js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);',
	},
});
