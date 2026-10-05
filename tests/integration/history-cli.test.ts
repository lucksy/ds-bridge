// H6 — integration: `ds-bridge history stats|compact|migrate` (spawns
// dist/cli.mjs against throwaway project dirs).
import { execFile } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");

const tmpDirs: string[] = [];
async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}
afterAll(async () => {
	for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
});

async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8" },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, stdout: e.stdout, stderr: e.stderr };
	}
}

const j = (r: Record<string, unknown>) => JSON.stringify(r);

async function seed(dir: string, lines: string[]): Promise<string> {
	const stateDir = join(dir, ".ds-bridge");
	await mkdir(stateDir, { recursive: true });
	const path = join(stateDir, "history.jsonl");
	await writeFile(path, `${lines.join("\n")}\n`, "utf8");
	return path;
}

const DUPES = [
	j({ at: "2026-01-01T00:00:00Z", kind: "handoff", score: 80, frameName: "A" }),
	j({ at: "2026-01-02T00:00:00Z", kind: "handoff", score: 80, frameName: "A" }),
	j({ at: "2026-01-03T00:00:00Z", kind: "handoff", score: 80, frameName: "A" }),
	j({
		v: 2,
		at: "2026-01-04T00:00:00Z",
		kind: "lint",
		source: "ci",
		git: null,
		tool: { version: "1" },
		runId: "r1",
		byKind: { exact: 1, near: 0, offSystem: 0 },
	}),
];

describe("ds-bridge history stats", () => {
	it("an absent history is zero stats, exit 0", async () => {
		const dir = await freshTmp("ds-hist-none-");
		const { code, stdout } = await runCli([
			"history",
			"stats",
			dir,
			"--format",
			"json",
		]);
		expect(code).toBe(0);
		const out = JSON.parse(stdout) as { exists: boolean; records: number };
		expect(out.exists).toBe(false);
		expect(out.records).toBe(0);
	});

	it("an unreadable history is an error (exit 2), never 'no history yet'", async () => {
		const dir = await freshTmp("ds-hist-unreadable-");
		// A directory where the file should be: present but unreadable as text.
		await mkdir(join(dir, ".ds-bridge", "history.jsonl"), { recursive: true });
		for (const args of [
			["history", "stats", dir, "--format", "json"],
			["history", "export", dir],
		]) {
			const { code, stdout, stderr } = await runCli(args);
			expect(code).toBe(2);
			expect(stdout).toBe("");
			expect(stderr).toContain("Could not read");
		}
	});

	it("reports kinds, v1/v2 split, size, date range and per-frame readiness", async () => {
		const dir = await freshTmp("ds-hist-stats-");
		await seed(dir, DUPES);
		const { code, stdout } = await runCli([
			"history",
			"stats",
			dir,
			"--format",
			"json",
		]);
		expect(code).toBe(0);
		const out = JSON.parse(stdout) as Record<string, unknown>;
		expect(out.exists).toBe(true);
		expect(out.byKind).toEqual({ handoff: 3, lint: 1 });
		expect(out.v1).toBe(3);
		expect(out.v2).toBe(1);
		expect(out.bytes).toBeGreaterThan(0);
		expect(out.firstAt).toBe("2026-01-01T00:00:00Z");
		expect(out.lastAt).toBe("2026-01-04T00:00:00Z");
		expect(out.readinessByFrame).toEqual([
			{
				key: "name:A",
				frameName: "A",
				latest: 80,
				at: "2026-01-03T00:00:00Z",
				runs: 3,
				passRate: 100,
			},
		]);
	});

	it("term output names the counts", async () => {
		const dir = await freshTmp("ds-hist-term-");
		await seed(dir, DUPES);
		const { code, stdout } = await runCli(["history", "stats", dir]);
		expect(code).toBe(0);
		expect(stdout).toContain("handoff");
		expect(stdout).toMatch(/v1 3 · v2 1/);
	});
});

describe("ds-bridge history compact", () => {
	it("--dry-run reports without writing", async () => {
		const dir = await freshTmp("ds-hist-dry-");
		const path = await seed(dir, DUPES);
		const before = await readFile(path, "utf8");
		const { code, stdout } = await runCli([
			"history",
			"compact",
			dir,
			"--dry-run",
			"--format",
			"json",
		]);
		expect(code).toBe(0);
		expect(JSON.parse(stdout)).toMatchObject({
			removed: 2,
			before: 4,
			after: 2,
			dryRun: true,
		});
		expect(await readFile(path, "utf8")).toBe(before);
	});

	it("rewrites the file (latest duplicate kept) and is idempotent", async () => {
		const dir = await freshTmp("ds-hist-compact-");
		const path = await seed(dir, DUPES);
		expect((await runCli(["history", "compact", dir])).code).toBe(0);
		const lines = (await readFile(path, "utf8")).trim().split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("2026-01-03");
		const again = await runCli(["history", "compact", dir, "--format", "json"]);
		expect(JSON.parse(again.stdout)).toMatchObject({ removed: 0 });
	});

	it("--keep-per-day keeps the last record per kind per day", async () => {
		const dir = await freshTmp("ds-hist-day-");
		const path = await seed(dir, [
			j({ at: "2026-01-01T08:00:00Z", kind: "lint", n: 1 }),
			j({ at: "2026-01-01T09:00:00Z", kind: "lint", n: 2 }),
		]);
		expect(
			(await runCli(["history", "compact", dir, "--keep-per-day"])).code,
		).toBe(0);
		expect((await readFile(path, "utf8")).trim()).toBe(
			j({ at: "2026-01-01T09:00:00Z", kind: "lint", n: 2 }),
		);
	});

	it("exits 2 and leaves the file alone when the history is locked", async () => {
		const dir = await freshTmp("ds-hist-lock-");
		const path = await seed(dir, DUPES);
		await writeFile(join(dir, ".ds-bridge", "history.jsonl.lock"), "1", "utf8");
		const before = await readFile(path, "utf8");
		const { code, stderr } = await runCli(["history", "compact", dir]);
		expect(code).toBe(2);
		expect(stderr).toMatch(/lock/i);
		expect(await readFile(path, "utf8")).toBe(before);
	});
});

describe("ds-bridge history migrate", () => {
	it("rewrites v1 lines as v2 (git:null, source:local) and is idempotent", async () => {
		const dir = await freshTmp("ds-hist-migrate-");
		const path = await seed(dir, DUPES);
		const { code, stdout } = await runCli([
			"history",
			"migrate",
			dir,
			"--format",
			"json",
		]);
		expect(code).toBe(0);
		expect(JSON.parse(stdout)).toMatchObject({ migrated: 3, unchanged: 1 });
		const records = (await readFile(path, "utf8"))
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l) as Record<string, unknown>);
		expect(records.every((r) => r.v === 2)).toBe(true);
		expect(records[0]).toMatchObject({ source: "local", git: null });
		const again = await runCli(["history", "migrate", dir, "--format", "json"]);
		expect(JSON.parse(again.stdout)).toMatchObject({ migrated: 0 });
	});

	it("--dry-run does not write", async () => {
		const dir = await freshTmp("ds-hist-migrate-dry-");
		const path = await seed(dir, DUPES);
		const before = await readFile(path, "utf8");
		expect((await runCli(["history", "migrate", dir, "--dry-run"])).code).toBe(
			0,
		);
		expect(await readFile(path, "utf8")).toBe(before);
	});
});

describe("ds-bridge history init (H12)", () => {
	const LINE = ".ds-bridge/history.jsonl merge=union";

	it("creates .gitattributes with the union-merge line", async () => {
		const dir = await freshTmp("ds-hist-init-");
		const { code, stdout } = await runCli(["history", "init", dir]);
		expect(code).toBe(0);
		expect(stdout).toContain(".gitattributes");
		expect(await readFile(join(dir, ".gitattributes"), "utf8")).toBe(
			`${LINE}\n`,
		);
	});

	it("appends to an existing file and is idempotent (second run: present, byte-identical)", async () => {
		const dir = await freshTmp("ds-hist-init-twice-");
		const attrs = join(dir, ".gitattributes");
		await writeFile(attrs, "*.png binary", "utf8");
		const first = await runCli(["history", "init", dir, "--format", "json"]);
		expect(first.code).toBe(0);
		expect(JSON.parse(first.stdout)).toEqual({
			path: attrs,
			line: LINE,
			status: "added",
			dryRun: false,
		});
		const after = await readFile(attrs, "utf8");
		expect(after).toBe(`*.png binary\n${LINE}\n`);
		const second = await runCli(["history", "init", dir, "--format", "json"]);
		expect(JSON.parse(second.stdout)).toMatchObject({ status: "present" });
		expect(await readFile(attrs, "utf8")).toBe(after);
	});

	it("--dry-run reports without writing", async () => {
		const dir = await freshTmp("ds-hist-init-dry-");
		const { code, stdout } = await runCli([
			"history",
			"init",
			dir,
			"--dry-run",
			"--format",
			"json",
		]);
		expect(code).toBe(0);
		expect(JSON.parse(stdout)).toMatchObject({
			status: "added",
			dryRun: true,
		});
		await expect(
			readFile(join(dir, ".gitattributes"), "utf8"),
		).rejects.toThrow();
	});

	it("term output after Added explains why to commit .gitattributes", async () => {
		const dir = await freshTmp("ds-hist-init-hint-");
		const { code, stdout } = await runCli(["history", "init", dir]);
		expect(code).toBe(0);
		expect(stdout).toContain(
			"Commit .gitattributes so history appends from different machines merge line-by-line instead of conflicting.",
		);
		const dry = await freshTmp("ds-hist-init-hint-dry-");
		const preview = await runCli(["history", "init", dry, "--dry-run"]);
		expect(preview.stdout).not.toContain("Commit .gitattributes");
	});

	it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
		"an unreadable .gitattributes → exit 2, content unchanged",
		async () => {
			const dir = await freshTmp("ds-hist-init-eacces-");
			const attrs = join(dir, ".gitattributes");
			const original = "*.png binary\n* text=auto\n";
			await writeFile(attrs, original, "utf8");
			await chmod(attrs, 0o200);
			try {
				const { code, stderr } = await runCli(["history", "init", dir]);
				expect(code).toBe(2);
				expect(stderr).toContain(attrs);
			} finally {
				await chmod(attrs, 0o600);
			}
			expect(await readFile(attrs, "utf8")).toBe(original);
		},
	);

	it("an overridden union line is not reported as present (last line wins)", async () => {
		const dir = await freshTmp("ds-hist-init-override-");
		const attrs = join(dir, ".gitattributes");
		const original = `${LINE}\n.ds-bridge/** -merge\n`;
		await writeFile(attrs, original, "utf8");
		const { code, stdout } = await runCli([
			"history",
			"init",
			dir,
			"--format",
			"json",
		]);
		expect(code).toBe(0);
		expect(JSON.parse(stdout)).toMatchObject({ status: "added" });
		expect(await readFile(attrs, "utf8")).toBe(`${original}${LINE}\n`);
	});

	it("exit 2 on a missing path or an unknown --format", async () => {
		const dir = await freshTmp("ds-hist-init-bad-");
		expect((await runCli(["history", "init", join(dir, "nope")])).code).toBe(2);
		expect(
			(await runCli(["history", "init", dir, "--format", "xml"])).code,
		).toBe(2);
		await expect(
			readFile(join(dir, ".gitattributes"), "utf8"),
		).rejects.toThrow();
	});
});

describe("ds-bridge history --help", () => {
	it("lists the subcommands", async () => {
		const { stdout } = await runCli(["history", "--help"]);
		for (const sub of ["stats", "compact", "migrate", "init"]) {
			expect(stdout).toContain(sub);
		}
	});

	it("rejects an unknown --format with exit 2", async () => {
		const dir = await freshTmp("ds-hist-fmt-");
		expect(
			(await runCli(["history", "stats", dir, "--format", "xml"])).code,
		).toBe(2);
	});
});
