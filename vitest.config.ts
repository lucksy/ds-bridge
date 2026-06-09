import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// SPEC §9.1 coverage ratchet — activates automatically once engines exist (Phase 1+).
const enginesExist = existsSync(new URL("./src/engines", import.meta.url));

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		// Build dist/cli.mjs once for all integration tests (T7.23 — see tests/global-setup.ts)
		globalSetup: ["tests/global-setup.ts"],
		// Integration tests spawn the bundled CLI (a 430 KB+ esbuild bundle) 100+
		// times; with ~50 spawning files running in parallel, vitest's 5s default
		// is reproducibly too tight on a busy dev machine (CI's faster runner passed
		// at 5s, but a machine-dependent suite is a liability — bit twice: D5 +
		// the N-wave). Unit tests finish in ms regardless; this only gives the spawn
		// suites headroom. A REAL hang still fails — 20s is generous, not unbounded.
		testTimeout: 20000,
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			reporter: ["text", "lcov"],
			...(enginesExist && {
				thresholds: {
					"src/engines/**/*.ts": { lines: 90 },
				},
			}),
		},
	},
});
