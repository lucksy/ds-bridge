// CLI entry — commander wiring only, no logic (SPEC §4).
import { createRequire } from "node:module";
import { join } from "node:path";
import { Command } from "commander";
import { registerA11yCommand } from "./cli-commands/a11y.js";
import { registerAdoptionCommand } from "./cli-commands/adoption.js";
import { registerBadgeCommand } from "./cli-commands/badge.js";
import { registerChangelogCommand } from "./cli-commands/changelog.js";
import { registerDashboardCommand } from "./cli-commands/dashboard.js";
import { registerDigestCommand } from "./cli-commands/digest.js";
import { registerDocsCommand } from "./cli-commands/docs.js";
import { registerHandoffCommand } from "./cli-commands/handoff.js";
import { registerImpactCommand } from "./cli-commands/impact.js";
import { registerLibraryHealthCommand } from "./cli-commands/library-health.js";
import { registerLintCommand } from "./cli-commands/lint.js";
import { registerParityCommand } from "./cli-commands/parity.js";
import { registerRegistryCommand } from "./cli-commands/registry.js";
import { registerReportCommand } from "./cli-commands/report.js";
import { registerTokensCommand } from "./cli-commands/tokens.js";
import { loadDotenvInto } from "./io/dotenv.js";

const require = createRequire(import.meta.url);
// Same relative path from src/ (dev via tsx) and dist/ (bundled): repo root = plugin root.
const pkg = require("../package.json") as { version: string };

export function buildProgram(): Command {
	const program = new Command()
		.name("ds-bridge")
		.description(
			"Design-system bridge: token drift, DS-aware linting, handoff QA, design-to-code",
		)
		.version(pkg.version);

	registerTokensCommand(program);
	registerLintCommand(program);
	registerReportCommand(program);
	registerBadgeCommand(program);
	registerHandoffCommand(program);
	registerRegistryCommand(program);
	registerParityCommand(program);
	registerA11yCommand(program);
	registerImpactCommand(program);
	registerLibraryHealthCommand(program);
	registerAdoptionCommand(program);
	registerChangelogCommand(program);
	registerDocsCommand(program);
	registerDashboardCommand(program);
	registerDigestCommand(program);

	return program;
}

// Hydrate <cwd>/.ds-bridge.env into process.env BEFORE the program parses argv, so
// every config-precedence rule (which reads process.env) works unchanged on a
// restarted session (SPEC-personas §6.1). Fail-quiet, real env wins, no upward walk.
loadDotenvInto(join(process.cwd(), ".ds-bridge.env"), process.env);

buildProgram().parse();
