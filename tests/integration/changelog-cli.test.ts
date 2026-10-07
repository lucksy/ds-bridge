// T7.14 — integration: the built CLI's `changelog` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like handoff-cli) in a
// REAL temp git repo so the git-log path runs end-to-end deterministically. The
// Figma side is exercised against a local node:http server that serves the
// recorded versions fixture (tests/fixtures/figma/versions.json) — never the
// live network. FIGMA_API_BASE points the client at the local server; a token +
// file key in env enables the Figma side, their absence exercises offline mode.
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, "..", "..");
const cliPath = join(repoRoot, "dist", "cli.mjs");
const fixturesDir = join(repoRoot, "tests", "fixtures", "figma");
const versionsFixture = readFileSync(
	join(fixturesDir, "versions.json"),
	"utf8",
);

const FILE_KEY = "ABcdEFghIJklMNopQRstUV";
const TOKEN = "figd-test-token";

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

function makeServer(): Server {
	return createServer((req, res) => {
		const url = req.url ?? "";
		if (req.method === "GET" && url === `/v1/files/${FILE_KEY}/versions`) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(versionsFixture);
			return;
		}
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ err: "Not found" }));
	});
}

let server: Server;
let baseUrl: string;
const tmpDirs: string[] = [];

/** Build a deterministic temp git repo with two conventional commits. */
async function makeRepo(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-changelog-"));
	tmpDirs.push(dir);
	const env = {
		...process.env,
		GIT_AUTHOR_NAME: "Avery Nakamura",
		GIT_AUTHOR_EMAIL: "avery@example.com",
		GIT_COMMITTER_NAME: "Avery Nakamura",
		GIT_COMMITTER_EMAIL: "avery@example.com",
		GIT_AUTHOR_DATE: "2026-06-02T10:00:00+00:00",
		GIT_COMMITTER_DATE: "2026-06-02T10:00:00+00:00",
	};
	const git = (args: string[], extraEnv?: NodeJS.ProcessEnv): void => {
		execFileSync("git", args, { cwd: dir, env: { ...env, ...extraEnv } });
	};
	git(["init", "-q"]);
	git(["config", "user.email", "avery@example.com"]);
	git(["config", "user.name", "Avery Nakamura"]);
	execFileSync("touch", ["a.txt"], { cwd: dir });
	git(["add", "a.txt"]);
	git(["commit", "-q", "-m", "feat: add date picker"]);
	execFileSync("touch", ["b.txt"], { cwd: dir });
	git(["add", "b.txt"]);
	const later = {
		GIT_AUTHOR_DATE: "2026-06-03T10:00:00+00:00",
		GIT_COMMITTER_DATE: "2026-06-03T10:00:00+00:00",
	};
	git(["commit", "-q", "-m", "fix: correct overflow"], later);
	return dir;
}

/** Run the CLI in a given cwd; resolve with code/stdout/stderr either way. */
async function runCliIn(
	cwd: string,
	args: string[],
	extraEnv?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		FIGMA_API_BASE: baseUrl,
		...extraEnv,
	};
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8", env, cwd },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

/** One parsed changelog history record (the C10 / M2.3 append shape). */
interface ChangelogHistoryRecord {
	at: string;
	kind: string;
	since: string;
	designer?: { breaking: number; notable: number; minor: number };
	developer?: { breaking: number; notable: number; minor: number };
	both?: { breaking: number; notable: number; minor: number };
	recent: {
		audience: string;
		severity: string;
		source: string;
		title: string;
	}[];
}

/** Read + parse the changelog records in <dir>/.ds-bridge/history.jsonl (or []). */
async function readChangelogHistory(
	dir: string,
): Promise<ChangelogHistoryRecord[]> {
	const historyPath = join(dir, ".ds-bridge", "history.jsonl");
	let text: string;
	try {
		text = await readFile(historyPath, "utf8");
	} catch {
		return [];
	}
	const records: ChangelogHistoryRecord[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		const record = JSON.parse(trimmed) as ChangelogHistoryRecord;
		if (record.kind === "changelog") records.push(record);
	}
	return records;
}

/** True when <dir>/.ds-bridge/history.jsonl exists. */
async function changelogHistoryExists(dir: string): Promise<boolean> {
	try {
		await access(join(dir, ".ds-bridge", "history.jsonl"));
		return true;
	} catch {
		return false;
	}
}

/** Env that enables the Figma side (token + file key). */
const FIGMA_ENV: NodeJS.ProcessEnv = {
	FIGMA_TOKEN: TOKEN,
	CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: FILE_KEY,
};

/** Env that disables the Figma side (offline). */
const OFFLINE_ENV: NodeJS.ProcessEnv = {
	FIGMA_TOKEN: "",
	CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "",
	CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "",
};

describe("ds-bridge changelog (built dist/cli.mjs)", () => {
	beforeAll(async () => {
		server = makeServer();
		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", () => resolve());
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	}, 120_000);

	afterAll(async () => {
		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("offline (no token): aggregates only git commits and notes the skip", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			["changelog", "--since", "2026-01-01", "--format", "json"],
			OFFLINE_ENV,
		);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			entries: { source: string; title: string }[];
		};
		const sources = new Set(parsed.entries.map((e) => e.source));
		expect(sources.has("code")).toBe(true);
		expect(sources.has("figma")).toBe(false);
		expect(parsed.entries.map((e) => e.title)).toContain("add date picker");
		expect(parsed.entries.map((e) => e.title)).toContain("correct overflow");
	});

	it("with token + file key: includes the labeled Figma version, filters autosave", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			["changelog", "--since", "2026-01-01", "--format", "json"],
			FIGMA_ENV,
		);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			entries: { source: string; audience: string; title: string }[];
		};
		const figma = parsed.entries.filter((e) => e.source === "figma");
		// versions.json has one labeled version + one autosave (filtered out).
		expect(figma).toHaveLength(1);
		expect(figma[0]?.title).toBe("Button hover state");
		expect(figma[0]?.audience).toBe("designer");
	});

	it("reads figma_file_key from the project's .ds-bridge.json", async () => {
		const repo = await makeRepo();
		await writeFile(
			join(repo, ".ds-bridge.json"),
			JSON.stringify({ figma_file_key: FILE_KEY }),
		);
		const result = await runCliIn(
			repo,
			[
				"changelog",
				"--since",
				"2026-01-01",
				"--format",
				"json",
				"--no-history",
			],
			{ FIGMA_TOKEN: TOKEN, CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "" },
		);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			entries: { source: string }[];
		};
		expect(parsed.entries.filter((e) => e.source === "figma")).toHaveLength(1);
	});

	it("--audience developers excludes designer-only Figma entries", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			[
				"changelog",
				"--since",
				"2026-01-01",
				"--audience",
				"developers",
				"--format",
				"json",
			],
			FIGMA_ENV,
		);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			entries: { source: string }[];
		};
		expect(parsed.entries.every((e) => e.source !== "figma")).toBe(true);
		expect(parsed.entries.some((e) => e.source === "code")).toBe(true);
	});

	it("--format md renders the developer section with the conventional-commit titles", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			["changelog", "--since", "2026-01-01", "--format", "md"],
			FIGMA_ENV,
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("# Changelog");
		expect(result.stdout).toContain("## For developers");
		expect(result.stdout).toContain("## For designers");
		expect(result.stdout).toContain("add date picker");
		expect(result.stdout).toContain("Button hover state");
	});

	it("--format term prints a colored summary and notes the offline skip on stderr", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			["changelog", "--since", "2026-01-01"],
			OFFLINE_ENV,
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("change(s)");
		expect(result.stderr.toLowerCase()).toContain("figma side skipped");
	});

	it("accepts a relative --since (7d) like digest and history export", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			["changelog", "--since", "7d", "--format", "json", "--no-history"],
			OFFLINE_ENV,
		);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as { since: string };
		const expected = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 10);
		expect(parsed.since).toBe(expected);
	});

	it("exits 2 on an unparseable --since instead of returning an empty changelog", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			["changelog", "--since", "banana", "--format", "json", "--no-history"],
			OFFLINE_ENV,
		);
		expect(result.code).toBe(2);
		expect(result.stderr).toMatch(/--since/);
	});

	it("exits 2 with --format bogus", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			["changelog", "--format", "bogus"],
			OFFLINE_ENV,
		);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("format");
	});

	it("exits 2 outside a git repository", async () => {
		const notRepo = await mkdtemp(join(tmpdir(), "ds-changelog-notrepo-"));
		tmpDirs.push(notRepo);
		const result = await runCliIn(
			notRepo,
			["changelog", "--since", "2026-01-01"],
			OFFLINE_ENV,
		);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("git repository");
	});

	it("--no-history writes nothing to disk (stdout-only generator)", async () => {
		const repo = await makeRepo();
		const before = execFileSync("git", ["status", "--porcelain"], {
			cwd: repo,
			encoding: "utf8",
		});
		await runCliIn(
			repo,
			["changelog", "--since", "2026-01-01", "--no-history"],
			FIGMA_ENV,
		);
		const after = execFileSync("git", ["status", "--porcelain"], {
			cwd: repo,
			encoding: "utf8",
		});
		expect(after).toBe(before);
		expect(await changelogHistoryExists(repo)).toBe(false);
	});

	it("C10/M2.3: a real run appends ONE changelog history line (per-audience counts + capped recent[])", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			["changelog", "--since", "2026-01-01", "--format", "json"],
			FIGMA_ENV,
		);
		expect(result.code).toBe(0);

		const lines = await readChangelogHistory(repo);
		expect(lines).toHaveLength(1);
		const record = lines[0];
		expect(record?.kind).toBe("changelog");
		expect(typeof record?.at).toBe("string");
		expect(record?.since).toBe("2026-01-01");
		// The membership rule: the labeled Figma version is a designer story; the two
		// conventional commits are a developer story. Counts are per-audience and use
		// the line-level severity vocabulary (breaking/notable/minor).
		expect(record?.designer?.notable).toBe(1); // "Button hover state" (notable)
		expect(record?.developer?.notable).toBe(1); // feat: add date picker
		expect(record?.developer?.minor).toBe(1); // fix: correct overflow
		// recent[] is breaking-first and carries {audience, severity, source, title}.
		expect(Array.isArray(record?.recent)).toBe(true);
		expect(record?.recent.length).toBeGreaterThan(0);
		const titles = record?.recent.map((e) => e.title) ?? [];
		expect(titles).toContain("add date picker");
		expect(titles).toContain("Button hover state");
	});

	it("C10/M2.3: --no-history suppresses the changelog history append", async () => {
		const repo = await makeRepo();
		const result = await runCliIn(
			repo,
			["changelog", "--since", "2026-01-01", "--no-history"],
			FIGMA_ENV,
		);
		expect(result.code).toBe(0);
		expect(await changelogHistoryExists(repo)).toBe(false);
	});

	it("C10/M2.3: the appended line's recent[] is capped (breaking-first survive)", async () => {
		const repo = await makeRepo();
		await runCliIn(repo, ["changelog", "--since", "2026-01-01"], FIGMA_ENV);
		const lines = await readChangelogHistory(repo);
		expect(lines[0]?.recent.length).toBeLessThanOrEqual(12);
	});
});
