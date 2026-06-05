// CLI entry — commander wiring only, no logic (SPEC §4).
import { createRequire } from "node:module";
import { Command } from "commander";
import { registerHandoffCommand } from "./cli-commands/handoff.js";
import { registerLintCommand } from "./cli-commands/lint.js";
import { registerReportCommand } from "./cli-commands/report.js";
import { registerTokensCommand } from "./cli-commands/tokens.js";

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
	registerHandoffCommand(program);

	return program;
}

buildProgram().parse();
