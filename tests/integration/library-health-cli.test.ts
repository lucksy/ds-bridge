// L5 — integration: the built CLI's `library-health` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like impact-cli.test.ts)
// against a local node:http server serving the recorded library-health fixture
// (tests/fixtures/figma/library-file.json) — NEVER the live network. FIGMA_API_BASE
// points the client at the local server; FIGMA_TOKEN supplies the PAT;
// CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY supplies the file key.
//
// The raw getFile response is cached (TTL-stamped) under CLAUDE_PLUGIN_DATA/figma/
// (env set) else <cwd>/.ds-bridge/cache/library-<key>.json (L2). A fresh hit is
// reused; --refresh always re-fetches and re-stamps. A rate-limit outcome is
// tolerated: warn + use cache if present, else exit 2. Missing token / file key →
// exit 2 with connect-Figma guidance (graceful — never a stack trace).
// Routes:
//   GET /v1/files/:key            -> library-file.json  (the crawl shape)
//   GET /v1/files/UNAUTHORIZED    -> 401
//   GET /v1/files/RATELIMITED     -> 429 (always)
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const libraryFixture = readFileSync(
	join(fixturesDir, "library-file.json"),
	"utf8",
);

const FILE_KEY = "ABcdEFghIJklMNopQRstUV";
const UNAUTHORIZED_KEY = "UNAUTHORIZED";
const RATELIMITED_KEY = "RATELIMITED";
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

/** Count how many times the server served the full getFile body. */
let fetchCount = 0;

function makeServer(): Server {
	return createServer((req, res) => {
		const url = req.url ?? "";
		const method = req.method ?? "GET";

		if (url.includes(`/v1/files/${UNAUTHORIZED_KEY}`)) {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ err: "Invalid token" }));
			return;
		}

		if (url.includes(`/v1/files/${RATELIMITED_KEY}`)) {
			// Always 429 with a 0s Retry-After so the client exhausts retries fast.
			res.writeHead(429, {
				"Content-Type": "application/json",
				"Retry-After": "0",
			});
			res.end(JSON.stringify({ err: "Rate limited" }));
			return;
		}

		if (method === "GET" && url === `/v1/files/${FILE_KEY}`) {
			fetchCount += 1;
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(libraryFixture);
			return;
		}

		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ err: "Not found" }));
	});
}

let server: Server;
let baseUrl: string;

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
	extraEnv?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		FIGMA_API_BASE: baseUrl,
		FIGMA_TOKEN: TOKEN,
		CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: FILE_KEY,
		// Default: no plugin-data dir, so the cache falls back to .ds-bridge/cache.
		CLAUDE_PLUGIN_DATA: "",
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

interface LibraryHealthHistoryRecord {
	at: string;
	kind: string;
	overrideHotspots: number;
	deprecatedUsage: number;
	detachedCandidates: number;
}

/** Read the appended history.jsonl, parsed line-by-line, or [] when absent. */
async function readHistory(cwd: string): Promise<LibraryHealthHistoryRecord[]> {
	try {
		const text = await readFile(
			join(cwd, ".ds-bridge", "history.jsonl"),
			"utf8",
		);
		return text
			.trim()
			.split("\n")
			.filter((l) => l.length > 0)
			.map((l) => JSON.parse(l) as LibraryHealthHistoryRecord);
	} catch {
		return [];
	}
}

/** Read the cached envelope at the fallback path, or undefined. */
async function readCacheFile(cwd: string): Promise<unknown | undefined> {
	try {
		const text = await readFile(
			join(cwd, ".ds-bridge", "cache", `library-${FILE_KEY}.json`),
			"utf8",
		);
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

describe("ds-bridge library-health (built dist/cli.mjs)", () => {
	beforeAll(async () => {
		server = makeServer();
		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", () => resolve());
		});
		const address = server.address() as AddressInfo;
		baseUrl = `http://127.0.0.1:${address.port}`;
	}, 120_000);

	afterAll(async () => {
		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("fetches the file, surfaces the three signals (term), and exits 0", async () => {
		const dir = await freshTmp("ds-lh-term-");
		const result = await runCli(dir, ["library-health"]);
		expect(result.code).toBe(0);
		const out = result.stdout.toLowerCase();
		// The three hygiene signals are named in the term report.
		expect(out).toContain("override");
		expect(out).toContain("deprecated");
		expect(out).toContain("detached");
		// The detached-candidate heuristic is caveated wherever the number renders.
		expect(out).toContain("heuristic");
	});

	it("json format reports the totals + the ranked override hotspots", async () => {
		const dir = await freshTmp("ds-lh-json-");
		const result = await runCli(dir, ["library-health", "--format=json"]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			totals: {
				overrideHotspots: number;
				deprecatedUsage: number;
				detachedCandidates: number;
			};
			overrideHotspots: { nodeId: string; overrideCount: number }[];
		};
		// The fixture seeds exactly 3 / 3 / 3 (see library-health.test.ts).
		expect(parsed.totals).toEqual({
			overrideHotspots: 2,
			deprecatedUsage: 3,
			detachedCandidates: 3,
			placedInstances: 7,
		});
		// Ranked desc by override count — the Primary CTA (3 overrides) leads.
		expect(parsed.overrideHotspots[0]?.nodeId).toBe("1:10");
		expect(parsed.overrideHotspots[0]?.overrideCount).toBe(2);
	});

	it("appends ONE library-health history line carrying the three counts", async () => {
		const dir = await freshTmp("ds-lh-history-");
		const result = await runCli(dir, ["library-health", "--format=json"]);
		expect(result.code).toBe(0);

		const history = await readHistory(dir);
		expect(history).toHaveLength(1);
		const record = history[0];
		expect(record?.kind).toBe("library-health");
		expect(record?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(record?.overrideHotspots).toBe(2);
		expect(record?.deprecatedUsage).toBe(3);
		expect(record?.detachedCandidates).toBe(3);
	});

	it("caches the raw response; a second run reuses the cache (no extra fetch)", async () => {
		const dir = await freshTmp("ds-lh-cache-");
		const before = fetchCount;
		const first = await runCli(dir, ["library-health", "--format=json"]);
		expect(first.code).toBe(0);
		// The first run fetched once and wrote the cache.
		expect(fetchCount).toBe(before + 1);
		expect(await readCacheFile(dir)).toBeDefined();

		const second = await runCli(dir, ["library-health", "--format=json"]);
		expect(second.code).toBe(0);
		// A fresh cache hit means NO additional server fetch.
		expect(fetchCount).toBe(before + 1);
	});

	it("--refresh bypasses a fresh cache and re-fetches", async () => {
		const dir = await freshTmp("ds-lh-refresh-");
		const before = fetchCount;
		await runCli(dir, ["library-health", "--format=json"]);
		expect(fetchCount).toBe(before + 1);
		const refreshed = await runCli(dir, [
			"library-health",
			"--refresh",
			"--format=json",
		]);
		expect(refreshed.code).toBe(0);
		// --refresh forces a second fetch even though the cache is fresh.
		expect(fetchCount).toBe(before + 2);
	});

	it("stores the cache under CLAUDE_PLUGIN_DATA when that env is set", async () => {
		const dir = await freshTmp("ds-lh-plugindata-");
		const dataDir = await freshTmp("ds-lh-data-");
		const result = await runCli(dir, ["library-health", "--format=json"], {
			CLAUDE_PLUGIN_DATA: dataDir,
		});
		expect(result.code).toBe(0);
		// Nothing under the cwd fallback.
		expect(await readCacheFile(dir)).toBeUndefined();
		// The cache lives under the plugin-data dir.
		const text = await readFile(
			join(dataDir, "figma", `library-${FILE_KEY}.json`),
			"utf8",
		);
		expect(text.length).toBeGreaterThan(0);
	});

	it("a rate-limit with NO cache exits 2 with a tolerated warning", async () => {
		const dir = await freshTmp("ds-lh-429-nocache-");
		const result = await runCli(dir, ["library-health"], {
			CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: RATELIMITED_KEY,
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("rate");
	}, 30_000);

	it("a rate-limit WITH a STALE cached response warns and falls back to the cache (exit 0)", async () => {
		const dir = await freshTmp("ds-lh-429-cache-");
		// Seed a STALE cache envelope (stamped well past the TTL) for the
		// RATELIMITED key: the CLI must attempt a re-crawl (the cache is stale),
		// hit the rate-limit, and then fall back to the stale-but-present cache.
		const cacheDir = join(dir, ".ds-bridge", "cache");
		await mkdir(cacheDir, { recursive: true });
		await writeFile(
			join(cacheDir, `library-${RATELIMITED_KEY}.json`),
			`${JSON.stringify(
				{ stampedAtMs: 0, data: JSON.parse(libraryFixture) },
				null,
				2,
			)}\n`,
			"utf8",
		);
		const result = await runCli(dir, ["library-health", "--format=json"], {
			CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: RATELIMITED_KEY,
		});
		expect(result.code).toBe(0);
		// The rate-limit is tolerated with a warning…
		expect(result.stderr.toLowerCase()).toContain("rate");
		// …and the cached totals still surface.
		const parsed = JSON.parse(result.stdout) as {
			totals: { overrideHotspots: number };
		};
		expect(parsed.totals.overrideHotspots).toBe(2);
	}, 30_000);

	it("a missing token exits 2 with connect-Figma guidance", async () => {
		const dir = await freshTmp("ds-lh-notoken-");
		const result = await runCli(dir, ["library-health"], {
			FIGMA_TOKEN: "",
			CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "",
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("token");
	});

	it("a missing file key exits 2 with guidance", async () => {
		const dir = await freshTmp("ds-lh-nokey-");
		const result = await runCli(dir, ["library-health"], {
			CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "",
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("file key");
	});

	it("a 401 exits 2 with an auth message (never a stack trace)", async () => {
		const dir = await freshTmp("ds-lh-401-");
		const result = await runCli(dir, ["library-health"], {
			CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: UNAUTHORIZED_KEY,
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("auth");
	});

	it("rejects an unknown --format with exit 2", async () => {
		const dir = await freshTmp("ds-lh-badfmt-");
		const result = await runCli(dir, ["library-health", "--format=xml"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("format");
	});

	it("M1.3: --file-key resolves a product_file_keys alias to its mapped key", async () => {
		const dir = await freshTmp("ds-lh-alias-");
		await writeFile(
			join(dir, ".ds-bridge.json"),
			`${JSON.stringify({ product_file_keys: { checkout: FILE_KEY } }, null, 2)}\n`,
			"utf8",
		);
		// Default points at an unserved key; success via the alias proves resolution.
		const result = await runCli(
			dir,
			["library-health", "--file-key=checkout", "--format=json"],
			{ CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "UNSERVED_DEFAULT_KEY" },
		);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			totals: { overrideHotspots: number };
		};
		expect(parsed.totals.overrideHotspots).toBe(2);
	});

	it("M1.3: --file-key passes a raw figma key straight through", async () => {
		const dir = await freshTmp("ds-lh-rawkey-");
		const result = await runCli(
			dir,
			["library-health", `--file-key=${FILE_KEY}`, "--format=json"],
			{ CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "UNSERVED_DEFAULT_KEY" },
		);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			totals: { overrideHotspots: number };
		};
		expect(parsed.totals.overrideHotspots).toBe(2);
	});

	it("M1.3: an unknown --file-key alias exits 2 with a nearest-match suggestion", async () => {
		const dir = await freshTmp("ds-lh-badalias-");
		await writeFile(
			join(dir, ".ds-bridge.json"),
			`${JSON.stringify({ product_file_keys: { checkout: FILE_KEY } }, null, 2)}\n`,
			"utf8",
		);
		const result = await runCli(dir, ["library-health", "--file-key=chekcout"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("chekcout");
		expect(result.stderr).toContain("checkout");
	});

	// ---------- F2 — top-N lists in the history record (SPEC-figma-trends §2) ----------

	it("F2: the appended line also carries topN + the three per-component lists (default N=10)", async () => {
		const dir = await freshTmp("ds-lh-top-");
		const result = await runCli(dir, ["library-health", "--format=json"]);
		expect(result.code).toBe(0);
		const [record] = (await readHistory(dir)) as unknown as Record<
			string,
			unknown
		>[];
		// The count keys are unchanged numbers (every existing reader).
		expect(record?.overrideHotspots).toBe(2);
		expect(record?.topN).toBe(10);
		expect(record?.topOverrides).toEqual([
			{ name: "Button / Primary", count: 2 },
			{ name: "[deprecated] OldButton", count: 1 },
		]);
		expect(record?.topDeprecated).toEqual([
			{ name: "[deprecated] OldButton", count: 2 },
			{ name: "⚠ Banner (do not use)", count: 1 },
		]);
		expect(record?.topDetached).toEqual([
			{ name: "Button", count: 1 },
			{ name: "Button / Primary", count: 1 },
			{ name: "Card / Default", count: 1 },
		]);
		// The printed report is unchanged (no list keys leak into stdout JSON).
		expect(JSON.parse(result.stdout)).not.toHaveProperty("topN");
	});

	it("F2: the appended line carries the RESOLVED fileKey (alias → key), even with --top 0", async () => {
		const dir = await freshTmp("ds-lh-filekey-");
		await writeFile(
			join(dir, ".ds-bridge.json"),
			`${JSON.stringify({ product_file_keys: { checkout: FILE_KEY } }, null, 2)}\n`,
			"utf8",
		);
		const env = { CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "UNSERVED_DEFAULT_KEY" };
		expect(
			(await runCli(dir, ["library-health", "--file-key=checkout"], env)).code,
		).toBe(0);
		expect(
			(
				await runCli(
					dir,
					["library-health", "--file-key=checkout", "--top", "0"],
					env,
				)
			).code,
		).toBe(0);
		const records = (await readHistory(dir)) as unknown as Record<
			string,
			unknown
		>[];
		expect(records.map((r) => r.fileKey)).toEqual([FILE_KEY, FILE_KEY]);
	});

	it("F2: --top 1 caps every list at one entry", async () => {
		const dir = await freshTmp("ds-lh-top1-");
		const result = await runCli(dir, ["library-health", "--top", "1"]);
		expect(result.code).toBe(0);
		const [record] = (await readHistory(dir)) as unknown as Record<
			string,
			unknown
		>[];
		expect(record?.topN).toBe(1);
		expect(record?.topDetached).toEqual([{ name: "Button", count: 1 }]);
	});

	it("F2: --top 0 writes the lean counts-only line", async () => {
		const dir = await freshTmp("ds-lh-top0-");
		const result = await runCli(dir, ["library-health", "--top", "0"]);
		expect(result.code).toBe(0);
		const [record] = (await readHistory(dir)) as unknown as Record<
			string,
			unknown
		>[];
		expect(record?.detachedCandidates).toBe(3);
		for (const key of [
			"topN",
			"topOverrides",
			"topDeprecated",
			"topDetached",
		]) {
			expect(record).not.toHaveProperty(key);
		}
	});

	it.each([
		["-1"],
		["abc"],
		["101"],
		["2.5"],
	])("F2: an invalid --top %s exits 2 before any fetch and appends nothing", async (value) => {
		const dir = await freshTmp("ds-lh-topbad-");
		const before = fetchCount;
		const result = await runCli(dir, ["library-health", `--top=${value}`]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("--top");
		expect(fetchCount).toBe(before);
		expect(await readHistory(dir)).toEqual([]);
	});
});
