// C11 / M2.4 — integration: the built CLI's `frame-impl <url>` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like handoff-cli.test.ts)
// against a local node:http server that serves the recorded Figma frame fixture
// (tests/fixtures/figma/frame-impl-nodes.json) — NEVER the live network.
// FIGMA_API_BASE points the client at the local server and FIGMA_TOKEN supplies
// the PAT, so the Figma REST edge is exercised end-to-end deterministically.
//
// Routes:
//   GET  /v1/files/:key/nodes?ids=1:2 -> frame-impl-nodes.json (the frame subtree)
//   GET  /v1/files/UNAUTHORIZED/...    -> 401 (token failure route)
//
// Each scenario seeds a fresh tmp project with a committed registry + a W3C token
// file so `findGaps` has a real system to resolve against.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
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
const frameNodesFixture = readFileSync(
	join(fixturesDir, "frame-impl-nodes.json"),
	"utf8",
);

const FILE_KEY = "ABcdEFghIJklMNopQRstUV";
const UNAUTHORIZED_KEY = "UNAUTHORIZED";
const TOKEN = "figd-test-token";
const NODE_ID = "1:2";

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
		// 401 route: any request whose key is UNAUTHORIZED.
		if (url.includes(`/v1/files/${UNAUTHORIZED_KEY}`)) {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ err: "Invalid token" }));
			return;
		}
		if (req.method === "GET" && url.startsWith(`/v1/files/${FILE_KEY}/nodes`)) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(frameNodesFixture);
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

/**
 * A registry that matches the "Button / Primary" INSTANCE (resolved) and offers
 * no match for "Mystery Widget" (a no-registry-match gap).
 */
function sampleRegistry(): unknown {
	return {
		schemaVersion: 1,
		generatedAt: "2026-06-05T10:00:00.000Z",
		matches: [
			{
				codeName: "Button",
				importPath: "src/Button.tsx",
				figmaName: "Button / Primary",
				nodeId: "1:7",
				score: 0.95,
			},
		],
		unmatchedCode: [],
		unmatchedFigma: [],
	};
}

/** A W3C token file whose color.brand.primary EXACTLY matches the Background fill. */
function sampleTokens(): unknown {
	return {
		color: {
			$type: "color",
			brand: { primary: { $value: "#3b82f6" } },
		},
	};
}

/** Seed <dir>/.ds-bridge/registry.json + a token file at <dir>/tokens.json. */
async function seedProject(
	dir: string,
	opts: { registry?: boolean; tokens?: boolean } = {},
): Promise<void> {
	const stateDir = join(dir, ".ds-bridge");
	await mkdir(stateDir, { recursive: true });
	if (opts.registry !== false) {
		await writeFile(
			join(stateDir, "registry.json"),
			`${JSON.stringify(sampleRegistry(), null, 2)}\n`,
			"utf8",
		);
	}
	if (opts.tokens !== false) {
		await writeFile(
			join(dir, "tokens.json"),
			`${JSON.stringify(sampleTokens(), null, 2)}\n`,
			"utf8",
		);
	}
}

/** Run the CLI with an explicit cwd; resolve with code/stdout/stderr either way. */
async function runCliIn(
	cwd: string,
	args: string[],
	extraEnv?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		FIGMA_API_BASE: baseUrl,
		FIGMA_TOKEN: TOKEN,
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

function frameUrl(key: string, nodeId = NODE_ID): string {
	return `https://www.figma.com/design/${key}/Demo?node-id=${nodeId.replace(":", "-")}`;
}

interface FrameImplHistoryRecord {
	at: string;
	kind: string;
	frameName: string;
	fileKey: string;
	nodeId?: string;
	resolvedCount: number;
	gapCount: number;
	pct: number;
	byReason: Record<string, number>;
	topGaps: { reason: string; requirement: string }[];
}

async function readFrameImplHistory(
	dir: string,
): Promise<FrameImplHistoryRecord[]> {
	const historyPath = join(dir, ".ds-bridge", "history.jsonl");
	let text: string;
	try {
		text = await readFile(historyPath, "utf8");
	} catch {
		return [];
	}
	const records: FrameImplHistoryRecord[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		const record = JSON.parse(trimmed) as FrameImplHistoryRecord;
		if (record.kind === "frame-impl") records.push(record);
	}
	return records;
}

async function historyExists(dir: string): Promise<boolean> {
	try {
		await access(join(dir, ".ds-bridge", "history.jsonl"));
		return true;
	} catch {
		return false;
	}
}

describe("ds-bridge frame-impl (built dist/cli.mjs)", () => {
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

	it("happy path: resolves the frame, prints the on-system pct, and writes the line", async () => {
		const dir = await freshTmp("ds-frame-impl-ok-");
		await seedProject(dir);

		const result = await runCliIn(dir, ["frame-impl", frameUrl(FILE_KEY)]);
		expect(result.code).toBe(0);
		// 2 resolved (Button match + Background exact token) / 2 gaps (Mystery
		// no-registry-match + Accent no-token-match) → 50% implementable.
		expect(result.stdout).toContain("50%");
		expect(result.stdout).toContain("Card / Primary");

		// The frame-impl history line was appended with the rollup.
		const records = await readFrameImplHistory(dir);
		expect(records).toHaveLength(1);
		const record = records[0];
		expect(record?.kind).toBe("frame-impl");
		expect(typeof record?.at).toBe("string");
		expect(record?.frameName).toBe("Card / Primary");
		expect(record?.fileKey).toBe(FILE_KEY);
		expect(record?.nodeId).toBe(NODE_ID);
		expect(record?.resolvedCount).toBe(2);
		expect(record?.gapCount).toBe(2);
		expect(record?.pct).toBe(50);
		expect(record?.byReason["no-registry-match"]).toBe(1);
		expect(record?.byReason["no-token-match"]).toBe(1);
	});

	it("--format json emits the implementability rollup", async () => {
		const dir = await freshTmp("ds-frame-impl-json-");
		await seedProject(dir);

		const result = await runCliIn(dir, [
			"frame-impl",
			frameUrl(FILE_KEY),
			"--format",
			"json",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			pct: number;
			resolvedCount: number;
			gapCount: number;
			byReason: Record<string, number>;
			topGaps: { reason: string; requirement: string }[];
		};
		expect(parsed.pct).toBe(50);
		expect(parsed.resolvedCount).toBe(2);
		expect(parsed.gapCount).toBe(2);
		expect(parsed.topGaps.length).toBeGreaterThan(0);
	});

	it("--no-history suppresses the frame-impl history append", async () => {
		const dir = await freshTmp("ds-frame-impl-nohist-");
		await seedProject(dir);

		const result = await runCliIn(dir, [
			"frame-impl",
			frameUrl(FILE_KEY),
			"--no-history",
		]);
		expect(result.code).toBe(0);
		expect(await historyExists(dir)).toBe(false);
	});

	it("a bad / unparseable URL exits 2 with an actionable message", async () => {
		const dir = await freshTmp("ds-frame-impl-badurl-");
		await seedProject(dir);

		const result = await runCliIn(dir, [
			"frame-impl",
			"https://example.com/not-figma",
		]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("figma");
	});

	it("a missing registry exits 2 with run-registry-build guidance", async () => {
		const dir = await freshTmp("ds-frame-impl-noreg-");
		// Seed tokens but NO registry.
		await seedProject(dir, { registry: false });

		const result = await runCliIn(dir, ["frame-impl", frameUrl(FILE_KEY)]);
		expect(result.code).toBe(2);
		const lower = result.stderr.toLowerCase();
		expect(lower).toContain("registry");
		expect(lower).toContain("registry build");
	});

	it("a missing token source exits 2 with token-source guidance", async () => {
		const dir = await freshTmp("ds-frame-impl-notok-");
		// Seed registry but NO token file.
		await seedProject(dir, { tokens: false });

		const result = await runCliIn(dir, ["frame-impl", frameUrl(FILE_KEY)]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("token");
	});

	it("a missing Figma token exits 2 with PAT setup guidance", async () => {
		const dir = await freshTmp("ds-frame-impl-nopat-");
		await seedProject(dir);

		const result = await runCliIn(dir, ["frame-impl", frameUrl(FILE_KEY)], {
			FIGMA_TOKEN: "",
			CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "",
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("token");
	});

	it("a 401 from the API exits 2 with an auth message", async () => {
		const dir = await freshTmp("ds-frame-impl-401-");
		await seedProject(dir);

		const result = await runCliIn(dir, [
			"frame-impl",
			frameUrl(UNAUTHORIZED_KEY),
		]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("auth");
	});
});
