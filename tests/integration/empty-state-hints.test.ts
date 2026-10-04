// Every "No data yet — Run `ds-bridge <command>`" hint the dashboards print must
// name a command the CLI actually has. The hints are free text in two renderers,
// so they drifted once already (`qa`, `ds-lint`, `tokens-check`, `ds-changelog`,
// `diff` — none of them CLI commands); this pins them to the built CLI's own
// command list.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { ALL_ARTIFACT_IDS } from "../../src/engines/report/catalog.js";
import type { ReportData } from "../../src/engines/report/types.js";
import { renderDashboard } from "../../src/render/html/dashboard.js";
import { renderTerminalDashboard } from "../../src/render/terminal/dashboard.js";

const execFileAsync = promisify(execFile);
const cliPath = join(import.meta.dirname, "..", "..", "dist", "cli.mjs");

/** Every section absent, so each renders its empty state. */
const BARE: ReportData = {
	generatedAt: "2026-06-10T00:00:00.000Z",
	project: "demo",
};

/** "ds-bridge tokens check --report" → ["tokens", "check"]: the command words, no flags or args. */
function commandWords(hint: string): string[] {
	return hint
		.split(/\s+/)
		.filter((w) => w !== "")
		.filter((w) => !w.startsWith("-") && !w.startsWith("<"));
}

/** The commands `ds-bridge --help` (or `ds-bridge <group> --help`) lists. */
async function listed(args: string[]): Promise<Set<string>> {
	const { stdout } = await execFileAsync(
		process.execPath,
		[cliPath, ...args, "--help"],
		{
			encoding: "utf8",
		},
	);
	const section = stdout.split(/^Commands:$/m)[1] ?? "";
	return new Set(
		section
			.split("\n")
			.map((line) => /^ {2}([a-z][a-z0-9-]*)/.exec(line)?.[1])
			.filter((name): name is string => name !== undefined && name !== "help"),
	);
}

let topLevel: Set<string>;

beforeAll(async () => {
	topLevel = await listed([]);
});

async function expectRunnable(hints: readonly string[]): Promise<void> {
	expect(hints.length).toBeGreaterThan(0);
	for (const hint of hints) {
		const [first, second] = commandWords(hint);
		expect(topLevel, `"ds-bridge ${hint}": no "${first}" command`).toContain(
			first,
		);
		const sub = first === undefined ? new Set<string>() : await listed([first]);
		// A group (tokens, registry, config…) needs a subcommand it really has.
		if (sub.size > 0) {
			expect(
				sub,
				`"ds-bridge ${hint}": no "${first} ${second}" command`,
			).toContain(second);
		}
	}
}

describe("dashboard empty-state hints name real CLI commands", () => {
	it("in the HTML dashboard", async () => {
		const html = renderDashboard(BARE);
		const hints = [
			...html.matchAll(/Run <code>ds-bridge ([^<]+)<\/code>/g),
		].map((m) => (m[1] ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
		await expectRunnable(hints);
	});

	it("in the terminal dashboard", async () => {
		const out = renderTerminalDashboard(BARE, ALL_ARTIFACT_IDS, {
			generatedAt: BARE.generatedAt,
			color: false,
		});
		const hints = [...out.matchAll(/run `ds-bridge ([^`]+)`/gi)].map(
			(m) => m[1] ?? "",
		);
		await expectRunnable(hints);
	});
});
