// Dashboard timeline through the built CLI: `report` (html/site) carries the
// dashboard's earlier days, each rebuilt from history as it stood at the end of
// that day; `--no-timeline`, snapshots and a one-day history carry none.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const ENV = { ...process.env, SOURCE_DATE_EPOCH: "1791158400" }; // 5 Oct 2026

const tmpDirs: string[] = [];
afterAll(async () => {
	await Promise.all(
		tmpDirs.map((d) => rm(d, { recursive: true, force: true })),
	);
});

/** A project whose history has one a11y run per day with `failed` failures. */
async function project(
	days: { at: string; failed: number }[],
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-report-timeline-"));
	tmpDirs.push(dir);
	await mkdir(join(dir, ".ds-bridge"), { recursive: true });
	const lines = days.map(({ at, failed }) =>
		JSON.stringify({
			at,
			kind: "a11y",
			level: "AA",
			modes: [{ mode: "light", passed: 10, failed }],
		}),
	);
	await writeFile(
		join(dir, ".ds-bridge", "history.jsonl"),
		`${lines.join("\n")}\n`,
		"utf8",
	);
	return dir;
}

async function report(dir: string, ...flags: string[]): Promise<void> {
	await execFileAsync(process.execPath, [cliPath, "report", dir, ...flags], {
		env: ENV,
	});
}

const radios = (html: string) =>
	[...html.matchAll(/class="tl-radio" id="([^"]+)"/g)].map((m) => m[1]);

/** The body of state `i` (`tl-s<i>`). */
function stateBody(html: string, i: number): string {
	const start = html.indexOf(`<div class="wrap tl-state tl-s${i}">`);
	const next = html.indexOf('<div class="wrap tl-state', start + 1);
	return html.slice(start, next === -1 ? undefined : next);
}

/** The "Contrast failures" KPI value in a state body. */
function contrastKpi(body: string): string | undefined {
	return /Contrast failures<\/span><span class="kpi-value">(\d+)</.exec(
		body,
	)?.[1];
}

describe("report — dashboard timeline", () => {
	const days = [
		{ at: "2026-10-01T09:00:00.000Z", failed: 9 },
		{ at: "2026-10-01T18:00:00.000Z", failed: 7 }, // last of 1 Oct wins
		{ at: "2026-10-02T09:00:00.000Z", failed: 5 },
		{ at: "2026-10-04T09:00:00.000Z", failed: 2 },
	];

	it("offers each earlier day + Now, each with that day's numbers", async () => {
		const dir = await project(days);
		await report(dir);
		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		expect(radios(html)).toEqual(["tl-0", "tl-1", "tl-now"]);
		expect(contrastKpi(stateBody(html, 0))).toBe("7"); // end of 1 Oct
		expect(contrastKpi(stateBody(html, 1))).toBe("5"); // end of 2 Oct
		expect(contrastKpi(stateBody(html, 2))).toBe("2"); // Now
		expect(html).toContain(
			'<span class="tl-asof tl-g0">As of 1 Oct 2026</span>',
		);
		expect(html).not.toMatch(/<script\b/i);
	});

	it("--no-timeline renders the current state only", async () => {
		const dir = await project(days);
		await report(dir, "--no-timeline");
		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		expect(radios(html)).toEqual([]);
		expect(contrastKpi(html)).toBe("2");
	});

	it("a one-day history has no timeline", async () => {
		const dir = await project([{ at: "2026-10-04T09:00:00.000Z", failed: 2 }]);
		await report(dir);
		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		expect(radios(html)).toEqual([]);
	});

	it("keeps the newest 11 earlier days (12 stops with Now)", async () => {
		const dir = await project(
			Array.from({ length: 20 }, (_, i) => ({
				at: `2026-09-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
				failed: i,
			})),
		);
		await report(dir);
		const html = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		expect(radios(html)).toHaveLength(12);
		expect(html).toContain('title="End of 9 Sep 2026"');
		expect(html).not.toContain('title="End of 8 Sep 2026"');
	});

	it("the static site carries the timeline; snapshots do not", async () => {
		const dir = await project(days);
		await report(dir, "--format", "site");
		const site = await readFile(
			join(dir, ".ds-bridge", "reports", "dashboard.html"),
			"utf8",
		);
		expect(radios(site)).toHaveLength(3);
		await report(dir, "--snapshot");
		const snap = await readFile(
			join(dir, ".ds-bridge", "snapshots", "dashboard.snapshot.html"),
			"utf8",
		);
		expect(radios(snap)).toEqual([]);
	});
});
