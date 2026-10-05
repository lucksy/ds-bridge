// F6 — integration: `report` assembles the three Figma/frame trend sections
// (SPEC-figma-trends §3) from history, with the CONFIGURED readiness gate.
// Spawns dist/cli.mjs against throwaway projects; SOURCE_DATE_EPOCH pins the
// render instant.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliPath = join(import.meta.dirname, "..", "..", "dist", "cli.mjs");
const ENV = { SOURCE_DATE_EPOCH: "1791201600" };

async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8", env: { ...process.env, ...ENV } },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

const tmpDirs: string[] = [];
afterAll(async () => {
	await Promise.all(
		tmpDirs.map((d) => rm(d, { recursive: true, force: true })),
	);
});

async function project(lines: object[], config?: object): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-figma-trends-"));
	tmpDirs.push(dir);
	await mkdir(join(dir, ".ds-bridge"), { recursive: true });
	await writeFile(
		join(dir, ".ds-bridge", "history.jsonl"),
		`${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
		"utf8",
	);
	if (config !== undefined) {
		await writeFile(join(dir, ".ds-bridge.json"), JSON.stringify(config));
	}
	return dir;
}

const lh = (at: string, topOverrides: object[]) => ({
	at,
	kind: "library-health",
	overrideHotspots: topOverrides.length,
	deprecatedUsage: 0,
	detachedCandidates: 0,
	topN: 10,
	topOverrides,
	topDeprecated: [],
	topDetached: [],
});

const handoff = (at: string, score: number, nodeId: string, name: string) => ({
	at,
	kind: "handoff",
	score,
	frameName: name,
	fileKey: "F1",
	nodeId,
	deductions: [],
});

const HISTORY = [
	lh("2026-09-01T10:00:00.000Z", [{ name: "Button", count: 4 }]),
	lh("2026-09-08T10:00:00.000Z", [{ name: "Button", count: 9 }]),
	handoff("2026-09-01T10:00:00.000Z", 70, "1:2", "Checkout"),
	handoff("2026-09-05T10:00:00.000Z", 85, "1:2", "Checkout"),
	handoff("2026-09-05T11:00:00.000Z", 75, "3:4", "Cart"),
];

interface JsonDoc {
	data: Record<string, unknown> & {
		libraryHotspotsTrend?: { rows: { name: string; latest: number }[] };
		frameReadinessTrend?: { threshold: number; failing: number };
		handoffPassRate?: { pct: number; passing: number; frames: number };
	};
}

describe("report assembles the Figma/frame trends (F6)", () => {
	it("populates all three sections from history (default gate 80)", async () => {
		const dir = await project(HISTORY);
		const { code, stdout } = await runCli(["report", dir, "--format", "json"]);
		expect(code).toBe(0);
		const doc = JSON.parse(stdout) as JsonDoc;
		expect(doc.data.libraryHotspotsTrend?.rows[0]).toMatchObject({
			name: "Button",
			latest: 9,
		});
		expect(doc.data.frameReadinessTrend).toMatchObject({
			threshold: 80,
			failing: 1,
		});
		expect(doc.data.handoffPassRate).toMatchObject({
			frames: 2,
			passing: 1,
			pct: 50,
		});
	});

	it("uses the project's readiness_threshold as the gate", async () => {
		const dir = await project(HISTORY, { readiness_threshold: 70 });
		const { stdout } = await runCli(["report", dir, "--format", "json"]);
		const doc = JSON.parse(stdout) as JsonDoc;
		expect(doc.data.handoffPassRate).toMatchObject({ passing: 2, pct: 100 });
		expect(doc.data.frameReadinessTrend?.threshold).toBe(70);
	});

	it("counts-only library-health + no handoff → the three sections stay absent", async () => {
		const dir = await project([
			{
				at: "2026-09-01T10:00:00.000Z",
				kind: "library-health",
				overrideHotspots: 3,
				deprecatedUsage: 1,
				detachedCandidates: 0,
			},
		]);
		const { stdout } = await runCli(["report", dir, "--format", "json"]);
		const doc = JSON.parse(stdout) as JsonDoc;
		expect(doc.data).not.toHaveProperty("libraryHotspotsTrend");
		expect(doc.data).not.toHaveProperty("frameReadinessTrend");
		expect(doc.data).not.toHaveProperty("handoffPassRate");
	});

	it("the ds-designer view renders the three panels in the html dashboard", async () => {
		const dir = await project(HISTORY);
		const out = join(dir, "dash.html");
		const { code } = await runCli([
			"report",
			dir,
			"--view",
			"ds-designer",
			"--out",
			out,
		]);
		expect(code).toBe(0);
		const html = await import("node:fs/promises").then((fs) =>
			fs.readFile(out, "utf8"),
		);
		expect(html).toContain("<h2>Library hotspots trend</h2>");
		expect(html).toContain("<h2>Frame readiness trend</h2>");
		expect(html).toContain("<h2>Handoff pass rate</h2>");
		expect(html).toContain("1 of 2 frames below the 80 gate");
	});
});
