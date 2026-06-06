import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// SPEC §9.1 coverage ratchet — activates automatically once engines exist (Phase 1+).
const enginesExist = existsSync(new URL("./src/engines", import.meta.url));

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		// Build dist/cli.mjs once for all integration tests (T7.23 — see tests/global-setup.ts)
		globalSetup: ["tests/global-setup.ts"],
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
