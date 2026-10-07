// T3.5 — integration: the built CLI's `tokens check [path]` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like lint-cli.test.ts).
// Each scenario builds a throwaway project in a fresh tmp dir so nothing
// persistent is mutated; history.jsonl + reports land under <path>/.ds-bridge/.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

interface ExecError {
	code: number;
	stdout: string;
	stderr: string;
}

function isExecError(value: unknown): value is ExecError {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		"stderr" in value
	);
}

/** Run the CLI; resolve with code/stdout/stderr whether it exits 0 or not. */
async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(process.execPath, [
			cliPath,
			...args,
		]);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

// W3C token source reused across scenarios. Token names map to drift keys by
// lowercasing + replacing dots with hyphens (drift.nameKey), so the CSS custom
// prop `--color-base-blue-500` lines up with token `color.base.blue-500`.
const TOKENS_JSON = JSON.stringify(
	{
		color: {
			$type: "color",
			base: {
				"blue-500": { $value: "#3b82f6" },
				"gray-900": { $value: "#111827" },
			},
		},
		space: {
			$type: "dimension",
			md: { $value: "16px" },
		},
	},
	null,
	2,
);

/** CSS whose custom props exactly mirror every (simple) token value. */
const IN_SYNC_CSS = `:root {
	--color-base-blue-500: #3b82f6;
	--color-base-gray-900: #111827;
	--space-md: 16px;
}
`;

/**
 * CSS with one stale value (blue-500 wrong), one missing token (gray-900 absent
 * from outputs), and one orphan output (a custom prop with no matching token).
 */
const DRIFTED_CSS = `:root {
	--color-base-blue-500: #ff0000;
	--space-md: 16px;
	--color-legacy-accent: #00ff00;
}
`;

interface DriftEntryJson {
	kind: string;
}

interface CheckJson {
	entries: DriftEntryJson[];
	inSync: boolean;
}

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

/** Count newline-delimited JSONL records in <dir>/.ds-bridge/history.jsonl. */
async function historyLines(dir: string): Promise<string[]> {
	const text = await readFile(join(dir, ".ds-bridge", "history.jsonl"), "utf8");
	return text.split("\n").filter((line) => line.trim().length > 0);
}

describe("ds-bridge tokens check (built dist/cli.mjs)", () => {
	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("in-sync project exits 0 and appends a history line", async () => {
		const dir = await freshTmp("ds-check-sync-");
		await writeFile(join(dir, "tokens.json"), TOKENS_JSON, "utf8");
		await writeFile(join(dir, "theme.css"), IN_SYNC_CSS, "utf8");

		const result = await runCli([
			"tokens",
			"check",
			dir,
			"--tokens",
			join(dir, "tokens.json"),
		]);
		expect(result.code).toBe(0);

		const lines = await historyLines(dir);
		expect(lines).toHaveLength(1);
		const record = JSON.parse(lines[0] as string) as {
			kind: string;
			inSync: boolean;
			stale: number;
			missing: number;
			orphan: number;
			at: string;
		};
		expect(record.kind).toBe("tokens-check");
		expect(record.inSync).toBe(true);
		expect(record.stale).toBe(0);
		expect(record.missing).toBe(0);
		expect(record.orphan).toBe(0);
		// ISO timestamp.
		expect(record.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("drifted project exits 1; term shows counts; json entries match", async () => {
		const dir = await freshTmp("ds-check-drift-");
		await writeFile(join(dir, "tokens.json"), TOKENS_JSON, "utf8");
		await writeFile(join(dir, "theme.css"), DRIFTED_CSS, "utf8");
		const tokens = join(dir, "tokens.json");

		// term output: severity-labelled counts.
		const term = await runCli(["tokens", "check", dir, "--tokens", tokens]);
		expect(term.code).toBe(1);
		const lower = term.stdout.toLowerCase();
		expect(lower).toContain("stale");
		expect(lower).toContain("missing");
		expect(lower).toContain("orphan");

		// json output: exactly one of each kind, inSync false.
		const json = await runCli([
			"tokens",
			"check",
			dir,
			"--tokens",
			tokens,
			"--format=json",
		]);
		expect(json.code).toBe(1);
		const parsed = JSON.parse(json.stdout) as CheckJson;
		expect(parsed.inSync).toBe(false);
		const kinds = parsed.entries.map((e) => e.kind).sort();
		expect(kinds).toEqual(["missing-output", "orphan-output", "stale-output"]);

		// Two runs appended two history lines.
		const lines = await historyLines(dir);
		expect(lines).toHaveLength(2);
	});

	it("--report writes an html dashboard with a chart after two runs", async () => {
		const dir = await freshTmp("ds-check-report-");
		await writeFile(join(dir, "tokens.json"), TOKENS_JSON, "utf8");
		await writeFile(join(dir, "theme.css"), DRIFTED_CSS, "utf8");
		const tokens = join(dir, "tokens.json");

		// First run seeds history point #1.
		const run1 = await runCli([
			"tokens",
			"check",
			dir,
			"--tokens",
			tokens,
			"--report",
		]);
		expect(run1.code).toBe(1);

		// Second run appends point #2 — trend now has two points → a real line.
		const run2 = await runCli([
			"tokens",
			"check",
			dir,
			"--tokens",
			tokens,
			"--report",
		]);
		expect(run2.code).toBe(1);

		// Two runs → two history lines.
		const lines = await historyLines(dir);
		expect(lines).toHaveLength(2);

		// The report path is printed; it points inside .ds-bridge/reports/.
		expect(run2.stdout).toMatch(/\.ds-bridge[/\\]reports[/\\]tokens-/);

		const date = new Date().toISOString().slice(0, 10);
		const reportPath = join(
			dir,
			".ds-bridge",
			"reports",
			`tokens-${date}.html`,
		);
		const html = await readFile(reportPath, "utf8");
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("<svg");
	});

	it("a directory with no token source exits 2 with actionable stderr", async () => {
		const dir = await freshTmp("ds-check-notoken-");
		await writeFile(join(dir, "theme.css"), IN_SYNC_CSS, "utf8");
		const { code, stderr } = await runCli(["tokens", "check", dir]);
		expect(code).toBe(2);
		expect(stderr.toLowerCase()).toContain("token");
	});
});

// Tokens Studio light/dark: before mode-aware drift, sets merged last-wins (dark)
// and the scanned CSS merged last-wins (.dark), so a stale LIGHT value reported
// "In sync". Each mode is now compared with the CSS that applies in it.
describe("ds-bridge tokens check — Tokens Studio $themes", () => {
	const themed = (lightBg: string) =>
		JSON.stringify({
			core: { radius: { value: "0.5rem", type: "borderRadius" } },
			light: { background: { value: lightBg, type: "color" } },
			dark: { background: { value: "#0a0a0a", type: "color" } },
			$themes: [
				{
					id: "l",
					name: "light",
					selectedTokenSets: { core: "source", light: "enabled" },
				},
				{
					id: "d",
					name: "dark",
					selectedTokenSets: { core: "source", dark: "enabled" },
				},
			],
			$metadata: { tokenSetOrder: ["core", "light", "dark"] },
		});
	const css = `:root {\n\t--radius: 0.5rem;\n\t--background: #ffffff;\n}\n.dark {\n\t--background: #0a0a0a;\n}\n`;

	async function themedProject(lightBg: string): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), "ds-bridge-themes-"));
		themedDirs.push(dir);
		await writeFile(join(dir, "tokens.json"), themed(lightBg));
		await writeFile(join(dir, "tokens.css"), css);
		return dir;
	}

	const themedDirs: string[] = [];
	afterAll(async () => {
		await Promise.all(
			themedDirs.map((d) => rm(d, { recursive: true, force: true })),
		);
	});

	it("is in sync when :root mirrors the light theme and .dark the dark theme", async () => {
		const dir = await themedProject("#ffffff");
		const result = await runCli(["tokens", "check", dir, "--format=json"]);
		expect(result.code).toBe(0);
	});

	it("reports a stale LIGHT value with its mode", async () => {
		const dir = await themedProject("#fafafa");
		const result = await runCli(["tokens", "check", dir, "--format=json"]);
		expect(result.code).toBe(1);
		const parsed = JSON.parse(result.stdout) as {
			entries: { kind: string; mode?: string; token?: { name: string } }[];
		};
		expect(parsed.entries).toHaveLength(1);
		expect(parsed.entries[0]).toMatchObject({
			kind: "stale-output",
			mode: "light",
			token: { name: "background" },
		});
	});
});
