import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// SPEC §9.1 coverage ratchet — activates automatically once engines exist (Phase 1+).
const enginesExist = existsSync(new URL("./src/engines", import.meta.url));

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
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
