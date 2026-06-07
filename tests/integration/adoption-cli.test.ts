// A3b — integration: the built CLI's `adoption [path]` command. Spawns
// dist/cli.mjs (acceptance against the bundle, like impact-cli.test.ts) over a
// self-contained fixture project (a registry.json + a couple of code components
// + one importer .tsx). Asserts exit codes, the json shape, the no-registry
// error path, and that one `adoption` history line is written.
//
// The fixture is self-contained (NOT the shared sample-project) so its component
// set is fully under this test's control and decoupled from the lint golden.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it, vi } from "vitest";

// ts-morph's first project load is slow under full-suite parallelism.
vi.setConfig({ testTimeout: 60_000 });

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

function isExecError(value: unknown): value is ExecResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		"stderr" in value
	);
}

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

/** Run the CLI in `cwd`; resolve with code/stdout/stderr whether or not it exits 0. */
async function runCli(
	cwd: string,
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8", cwd },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

/**
 * Build a fixture project: a registry mapping two figma names to code
 * components (Button is imported once; Spinner is never imported), plus one
 * unmatched-code component (Tooltip — also never imported). So coverage is
 * imported=1 of total=3, uncovered=[Spinner, Tooltip].
 */
async function buildFixture(dir: string): Promise<void> {
	await mkdir(join(dir, ".ds-bridge"), { recursive: true });
	await writeFile(
		join(dir, ".ds-bridge", "registry.json"),
		`${JSON.stringify({
			schemaVersion: 1,
			generatedAt: "2026-06-07T00:00:00.000Z",
			matches: [
				{
					codeName: "Button",
					importPath: "components/button.tsx",
					figmaName: "Button / Primary",
					nodeId: "10:42",
					score: 0.95,
				},
				{
					codeName: "Spinner",
					importPath: "components/spinner.tsx",
					figmaName: "Spinner",
					nodeId: "10:55",
					score: 0.9,
				},
			],
			unmatchedCode: [
				{
					name: "Tooltip",
					importPath: "components/tooltip.tsx",
					candidates: [],
				},
			],
			unmatchedFigma: [],
		})}\n`,
		"utf8",
	);

	await mkdir(join(dir, "components"), { recursive: true });
	await writeFile(
		join(dir, "components", "button.tsx"),
		"export function Button() {\n\treturn null;\n}\n",
		"utf8",
	);
	await writeFile(
		join(dir, "components", "spinner.tsx"),
		"export function Spinner() {\n\treturn null;\n}\n",
		"utf8",
	);
	await writeFile(
		join(dir, "components", "tooltip.tsx"),
		"export function Tooltip() {\n\treturn null;\n}\n",
		"utf8",
	);

	// One importer: imports Button only. Spinner + Tooltip stay uncovered.
	await mkdir(join(dir, "app"), { recursive: true });
	await writeFile(
		join(dir, "app", "Page.tsx"),
		'import { Button } from "../components/button.tsx";\n\nexport function Page() {\n\treturn Button();\n}\n',
		"utf8",
	);
}

interface AdoptionJson {
	imported: number;
	total: number;
	uncovered: string[];
	uncoveredTotal: number;
}

interface HistoryLine {
	at: string;
	kind: string;
	imported: number;
	total: number;
	uncovered: string[];
}

describe("ds-bridge adoption (built dist/cli.mjs)", () => {
	afterAll(async () => {
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("reports coverage over a fixture project and writes a history line (exit 0)", async () => {
		const dir = await freshTmp("ds-adoption-happy-");
		await buildFixture(dir);

		const result = await runCli(dir, ["adoption"]);
		expect(result.code).toBe(0);
		// Term output mentions the imported/total counts somewhere.
		expect(result.stdout).toContain("1");
		expect(result.stdout).toContain("3");

		// A single adoption history line is appended.
		const text = await readFile(
			join(dir, ".ds-bridge", "history.jsonl"),
			"utf8",
		);
		const lines = text.trim().split("\n");
		expect(lines).toHaveLength(1);
		const record = JSON.parse(lines[0] ?? "") as HistoryLine;
		expect(record.kind).toBe("adoption");
		expect(record.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(record.imported).toBe(1);
		expect(record.total).toBe(3);
		expect(record.uncovered).toEqual(["Spinner", "Tooltip"]);
	});

	it("--format=json emits the stable coverage shape", async () => {
		const dir = await freshTmp("ds-adoption-json-");
		await buildFixture(dir);

		const result = await runCli(dir, ["adoption", "--format=json"]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as AdoptionJson;
		expect(parsed.imported).toBe(1);
		expect(parsed.total).toBe(3);
		expect(parsed.uncovered).toEqual(["Spinner", "Tooltip"]);
		expect(parsed.uncoveredTotal).toBe(2);
	});

	it("accepts an explicit [path] argument", async () => {
		const parent = await freshTmp("ds-adoption-path-");
		const projectDir = join(parent, "project");
		await mkdir(projectDir, { recursive: true });
		await buildFixture(projectDir);

		const result = await runCli(parent, [
			"adoption",
			"project",
			"--format=json",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as AdoptionJson;
		expect(parsed.total).toBe(3);
	});

	it("exits 2 with guidance when no registry is present", async () => {
		const dir = await freshTmp("ds-adoption-noreg-");
		const result = await runCli(dir, ["adoption"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("registry");
		expect(result.stderr).toContain("registry build");
	});

	it("exits 2 when the registry is corrupt JSON", async () => {
		const dir = await freshTmp("ds-adoption-corrupt-");
		await mkdir(join(dir, ".ds-bridge"), { recursive: true });
		await writeFile(
			join(dir, ".ds-bridge", "registry.json"),
			"{ not valid json",
			"utf8",
		);
		const result = await runCli(dir, ["adoption"]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("registry build");
	});

	it("rejects an unknown --format with exit 2", async () => {
		const dir = await freshTmp("ds-adoption-badfmt-");
		await buildFixture(dir);
		const result = await runCli(dir, ["adoption", "--format=xml"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("format");
	});
});
