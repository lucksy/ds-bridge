// Real-user regression (Figma Simple Design System testbed, 2026-10-08):
// Figma's own reference system exports its variables as ONE DTCG-shaped file
// — collections as `@color` / `@color_primitives`, every mode's value in
// `$extensions["com.figma.sds"].modes`, aliases written with the variables'
// display names (`{@color_primitives.Gray.100}`, `{… Scale 03}`) over
// slug keys, FLOAT variables as unitless numbers and a secondary mode
// (`brand_b_light`) that aliases a palette the export never wrote. Its build
// emits `--sds-` prefixed CSS with dark in `@media (prefers-color-scheme)`.
// Spawns dist/cli.mjs against a throwaway copy of tests/fixtures/sds-project.
import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const fixture = join(repoRoot, "tests", "fixtures", "sds-project");

interface Run {
	code: number;
	stdout: string;
	stderr: string;
}

async function runCli(args: string[], cwd: string): Promise<Run> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ cwd, env: { ...process.env, NO_COLOR: "1" } },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

let project: string;

beforeAll(async () => {
	project = await mkdtemp(join(tmpdir(), "ds-sds-"));
	await cp(fixture, project, { recursive: true });
});

afterAll(async () => {
	await rm(project, { recursive: true, force: true });
});

describe("tokens check — a Figma variables export", () => {
	it("resolves display-name aliases and compares light and dark against --sds- outputs", async () => {
		const run = await runCli(["tokens", "check", "--format", "json"], project);
		const out = JSON.parse(run.stdout) as {
			entries: { kind: string; token?: { name: string } }[];
			source: { path: string; modes: string[] };
		};
		expect(out.source.path).toBe("scripts/tokens/tokens.json");
		expect(out.source.modes).toEqual([
			"sds-light/desktop",
			"brand-b-light",
			"mobile",
			"sds-dark",
			"tablet",
		]);
		// Only the design-time @responsive.device string is unbuilt; no stale,
		// no orphan (`--column-count` is a local variable, not an emitted token).
		expect(out.entries.map((e) => `${e.kind} ${e.token?.name ?? ""}`)).toEqual([
			"missing-output @responsive.device",
		]);
		expect(run.stderr).toMatch(
			/mode "brand-b-light": @color\.background\.brand\.default keeps its default value — .*Brand B\.800/,
		);
		expect(
			(JSON.parse(run.stdout) as { notes?: string[] }).notes?.some((n) =>
				n.startsWith(
					'mode "brand-b-light": @color.background.brand.default keeps',
				),
			),
		).toBe(true);
	});
});

describe("lint — Figma FLOAT spacing and default roles", () => {
	it("suggests space / radius tokens and the default surface, skipping stories and calc factors", async () => {
		const run = await runCli(["lint", "--format", "json"], project);
		const findings = JSON.parse(run.stdout) as {
			file: string;
			raw: string;
			kind: string;
			expectedToken?: string;
		}[];
		const lines = findings.map(
			(f) => `${f.file} ${f.raw} ${f.kind} ${f.expectedToken ?? ""}`,
		);
		expect(lines.some((l) => l.includes("stories"))).toBe(false);
		expect(lines.some((l) => l.includes("layout.css"))).toBe(false);
		expect(lines).toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/Settings\.tsx "#f5f5f5" exact .*background\.default\.secondary/,
				),
				expect.stringMatching(/Settings\.tsx 16px exact .*space\.400/),
				expect.stringMatching(/Settings\.tsx 8px exact .*radius\.200/),
				expect.stringMatching(/Settings\.tsx 12px exact .*space\.300/),
			]),
		);
	});
});

describe("lint --fix — writes the variable the build emits", () => {
	it("rewrites to var(--sds-…), never to an invalid --@… name", async () => {
		const { readFile } = await import("node:fs/promises");
		const json = await runCli(["lint", "--format", "json"], project);
		const findings = JSON.parse(json.stdout) as {
			raw: string;
			expectedVar?: string;
		}[];
		expect(findings.find((f) => f.raw === "16px")?.expectedVar).toBe(
			"var(--sds-size-space-400)",
		);
		await runCli(["lint", "--fix"], project);
		const fixed = await readFile(
			join(project, "src", "team", "Settings.tsx"),
			"utf8",
		);
		expect(fixed).toContain('padding: "var(--sds-size-space-400)"');
		expect(fixed).toContain(
			'background: "var(--sds-color-background-default-secondary)"',
		);
		expect(fixed).not.toContain("--@");
	});
});

describe("implementation hand-off — the project's own names", () => {
	it("tokens parse names the variable the build emits for each token", async () => {
		const run = await runCli(
			["tokens", "parse", "scripts/tokens/tokens.json", "--format", "json"],
			project,
		);
		const { tokens } = JSON.parse(run.stdout) as {
			tokens: { name: string; cssVar?: string }[];
		};
		expect(tokens.find((t) => t.name === "@size.space.400")?.cssVar).toBe(
			"sds-size-space-400",
		);
		expect(
			tokens.find((t) => t.name === "@color_primitives.gray.100")?.cssVar,
		).toBe("sds-color-gray-100");
	});

	it("registry resolve gives the tsconfig alias the project imports from", async () => {
		const { mkdir, writeFile } = await import("node:fs/promises");
		await mkdir(join(project, ".ds-bridge"), { recursive: true });
		await writeFile(
			join(project, ".ds-bridge", "registry.json"),
			JSON.stringify({
				schemaVersion: 1,
				generatedAt: "2026-10-08T00:00:00.000Z",
				matches: [
					{
						codeName: "Button",
						importPath: "src/ui/primitives/Button/Button.tsx",
						figmaName: "Button",
						nodeId: "4185:3778",
						score: 1,
					},
				],
				unmatchedCode: [],
				unmatchedFigma: [],
			}),
		);
		const run = await runCli(["registry", "resolve", "4185:3778"], project);
		expect(run.code).toBe(0);
		expect(JSON.parse(run.stdout)).toMatchObject({
			codeName: "Button",
			importSpecifier: "primitives",
		});
	});
});

describe("lint history — the noisiest files survive into reports", () => {
	it("records top files and the report rebuilt from history names them", async () => {
		const fresh = await mkdtemp(join(tmpdir(), "ds-sds-top-"));
		await cp(fixture, fresh, { recursive: true });
		await runCli(["lint"], fresh);
		const report = await runCli(["report", "--format", "json"], fresh);
		const doc = JSON.parse(report.stdout) as {
			data: {
				lintSummary?: { topOffenders: { file: string; count: number }[] };
			};
		};
		expect(doc.data.lintSummary?.topOffenders[0]).toEqual({
			file: "src/team/Settings.tsx",
			count: 5,
		});
		await rm(fresh, { recursive: true, force: true });
	});
});
