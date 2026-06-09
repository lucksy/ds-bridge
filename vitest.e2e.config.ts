import { defineConfig } from "vitest/config";

// T4.7 — dedicated config for the gated live Figma smoke test.
//
// The default vitest.config.ts only globs `tests/**`, so `npm test` never picks
// up anything under `e2e/`. This config's include is the e2e suite ONLY, and it
// is run explicitly (never by the default test task):
//
//   npx vitest run --config vitest.e2e.config.ts e2e/figma-smoke.test.ts
//
// The smoke test itself self-skips (describe.skipIf) unless FIGMA_TOKEN and
// SMOKE_FILE_KEY are present, so running this config with no env vars reports
// the suite as skipped — not failed. No coverage thresholds here: this is a
// live shape-drift check, not a unit-coverage gate.
export default defineConfig({
	test: {
		include: ["e2e/**/*.test.ts"],
		// Live Figma calls against a large real library exceed vitest's 5s default
		// (observed ~15s for getVersions on the smoke file, F1) — these are network
		// shape checks, not unit tests, so allow generous headroom.
		testTimeout: 60000,
	},
});
