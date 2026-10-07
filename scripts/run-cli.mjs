#!/usr/bin/env node
// Slash-command pre-exec adapter. Claude Code substitutes `$ARGUMENTS` into a
// command's `!` line as raw text and aborts the command (no model turn) when
// that line exits non-zero. Two consequences this script exists to absorb:
//   • unquoted, a pasted Figma URL (`…?node-id=1-2&t=…`) is globbed by zsh
//     ("no matches found") and backgrounded at `&` by every shell, so the
//     command line passes `'$ARGUMENTS'` single-quoted and this script splits it;
//   • the CLI exits 1 on findings and 2 on usage errors — both are output the
//     model must read, so this script merges stderr into stdout and ALWAYS
//     exits 0.
//
// Usage: run-cli.mjs <subcommand words> '<raw user arguments>' [fixed flags…]
//   argv[0] — the subcommand, one word or two space-separated words ("tokens check")
//   argv[1] — the raw user arguments, split on whitespace (quotes group)
//   rest    — fixed flags appended after the user's arguments (e.g. --format=json)
// `--echo-argv` as the first argument prints the CLI argv as JSON instead of
// running it (used by tests).
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"dist",
	"cli.mjs",
);

/** Split a raw argument string on whitespace; "…" and '…' group a segment. */
function splitArgs(raw) {
	const args = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	for (const match of raw.matchAll(re)) {
		args.push(match[1] ?? match[2] ?? match[3]);
	}
	return args;
}

let argv = process.argv.slice(2);
const echo = argv[0] === "--echo-argv";
if (echo) argv = argv.slice(1);

const [subcommand = "", raw = "", ...fixed] = argv;
const cliArgs = [...splitArgs(subcommand), ...splitArgs(raw), ...fixed];

if (echo) {
	process.stdout.write(`${JSON.stringify(cliArgs)}\n`);
	process.exit(0);
}

const result = spawnSync(process.execPath, [cliPath, ...cliArgs], {
	encoding: "utf8",
	stdio: ["ignore", "pipe", "pipe"],
	maxBuffer: 64 * 1024 * 1024,
});
if (result.error !== undefined) {
	process.stdout.write(`ds-bridge could not start: ${result.error.message}\n`);
	process.exit(0);
}
process.stdout.write(result.stdout ?? "");
if (result.stderr) process.stdout.write(result.stderr);
process.exit(0);
