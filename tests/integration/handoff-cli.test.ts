// T4.5 — integration: the built CLI's `handoff <url>` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like report-cli.test.ts)
// against a local node:http server that serves the recorded Figma fixtures
// (tests/fixtures/figma/*.json) — never the live network. FIGMA_API_BASE points
// the client at the local server and FIGMA_TOKEN supplies the PAT.
//
// Routes:
//   GET  /v1/files/:key            -> file.json        (full document)
//   GET  /v1/files/:key/nodes      -> file-nodes.json  (node subtree)
//   POST /v1/files/:key/comments   -> 200 { id: "c1" } (echoes the body for asserts)
//   GET  /v1/files/UNAUTHORIZED/... -> 401              (token failure route)
import { execFile } from "node:child_process";
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

const fileFixture = readFileSync(join(fixturesDir, "file.json"), "utf8");
const fileNodesFixture = readFileSync(
	join(fixturesDir, "file-nodes.json"),
	"utf8",
);

const FILE_KEY = "ABcdEFghIJklMNopQRstUV";
const UNAUTHORIZED_KEY = "UNAUTHORIZED";
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

/** The last comment POST body the server received, for assertion. */
interface CommentCapture {
	body: { message?: string } | undefined;
}
const captured: CommentCapture = { body: undefined };

/** Read the captured body through a function so flow analysis keeps the full type. */
function lastComment(): { message?: string } | undefined {
	return captured.body;
}

function makeServer(): Server {
	return createServer((req, res) => {
		const url = req.url ?? "";
		const method = req.method ?? "GET";

		// 401 route: any request whose key is UNAUTHORIZED.
		if (url.includes(`/v1/files/${UNAUTHORIZED_KEY}`)) {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ err: "Invalid token" }));
			return;
		}

		if (method === "POST" && url === `/v1/files/${FILE_KEY}/comments`) {
			const chunks: Buffer[] = [];
			req.on("data", (chunk: Buffer) => chunks.push(chunk));
			req.on("end", () => {
				const raw = Buffer.concat(chunks).toString("utf8");
				try {
					captured.body = JSON.parse(raw) as { message?: string };
				} catch {
					captured.body = undefined;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						id: "c1",
						message: captured.body?.message ?? "",
						client_meta: null,
						created_at: "2026-06-05T10:00:00Z",
						resolved_at: null,
						user: { id: "1", handle: "Bot", img_url: "" },
					}),
				);
			});
			return;
		}

		if (method === "GET" && url.startsWith(`/v1/files/${FILE_KEY}/nodes`)) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(fileNodesFixture);
			return;
		}

		if (method === "GET" && url === `/v1/files/${FILE_KEY}`) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(fileFixture);
			return;
		}

		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ err: "Not found" }));
	});
}

let server: Server;
let baseUrl: string;

/**
 * A throwaway cwd for runs that do not care where history lands. handoff
 * appends to <cwd>/.ds-bridge/history.jsonl, so the default must never be the
 * repo root (H11 — SPEC-history-v2 §8.2; the globalSetup guard enforces it).
 */
let sandboxCwd: string;

/** Run the CLI; resolve with code/stdout/stderr whether it exits 0 or not. */
async function runCli(
	args: string[],
	extraEnv?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
	return runCliIn(sandboxCwd, args, extraEnv);
}

/** Run the CLI with an explicit working directory (for cwd-relative history). */
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

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

/** One parsed handoff history record (the T5.5b append shape). */
interface HandoffHistoryRecord {
	at: string;
	kind: string;
	score: number;
	frameName: string;
	deductions: { rule: string; points: number }[];
}

/** Read + parse the handoff records in <dir>/.ds-bridge/history.jsonl (or []). */
async function readHandoffHistory(
	dir: string,
): Promise<HandoffHistoryRecord[]> {
	const historyPath = join(dir, ".ds-bridge", "history.jsonl");
	let text: string;
	try {
		text = await readFile(historyPath, "utf8");
	} catch {
		return [];
	}
	const records: HandoffHistoryRecord[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		const record = JSON.parse(trimmed) as HandoffHistoryRecord;
		if (record.kind === "handoff") records.push(record);
	}
	return records;
}

/** True when <dir>/.ds-bridge/history.jsonl exists. */
async function historyExists(dir: string): Promise<boolean> {
	try {
		await access(join(dir, ".ds-bridge", "history.jsonl"));
		return true;
	} catch {
		return false;
	}
}

function fileUrl(key: string, nodeId?: string): string {
	const base = `https://www.figma.com/design/${key}/Demo`;
	return nodeId === undefined ? base : `${base}?node-id=${nodeId}`;
}

describe("ds-bridge handoff (built dist/cli.mjs)", () => {
	beforeAll(async () => {
		server = makeServer();
		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", () => resolve());
		});
		const address = server.address() as AddressInfo;
		baseUrl = `http://127.0.0.1:${address.port}`;
		sandboxCwd = await freshTmp("ds-handoff-cwd-");
	}, 120_000);

	afterAll(async () => {
		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});
		await Promise.all(
			tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("scores the full file deterministically (90) and exits 0 at threshold 80", async () => {
		const result = await runCli([
			"handoff",
			fileUrl(FILE_KEY),
			"--threshold",
			"80",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("90");
	});

	it("uses readiness_threshold from the project's .ds-bridge.json when no --threshold is passed", async () => {
		const project = await freshTmp("ds-handoff-project-");
		await writeFile(
			join(project, ".ds-bridge.json"),
			JSON.stringify({ readiness_threshold: 95 }),
		);
		const result = await runCliIn(project, ["handoff", fileUrl(FILE_KEY)]);
		// Score 90 < project gate 95 → the gate fails.
		expect(result.code).toBe(1);
	});

	it("threshold 95 fails the gate (exit 1) on a score of 90", async () => {
		const result = await runCli([
			"handoff",
			fileUrl(FILE_KEY),
			"--threshold",
			"95",
		]);
		expect(result.code).toBe(1);
	});

	it("--format=json emits a ReadinessReport with score, deductions, and stats", async () => {
		const result = await runCli([
			"handoff",
			fileUrl(FILE_KEY),
			"--threshold",
			"80",
			"--format=json",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			score: number;
			deductions: { rule: string; nodeId: string; points: number }[];
			stats: { totalNodes: number; instanceCount: number };
		};
		expect(parsed.score).toBe(90);
		expect(parsed.stats.totalNodes).toBe(6);
		expect(parsed.stats.instanceCount).toBe(1);
		expect(parsed.deductions.length).toBeGreaterThan(0);
		expect(parsed.deductions[0]?.rule).toBe("component");
	});

	it("a node-id URL scores the subtree via getFileNodes", async () => {
		// file-nodes.json node 1:2 is Card/Primary FRAME + one bound RECTANGLE.
		const result = await runCli([
			"handoff",
			fileUrl(FILE_KEY, "1-2"),
			"--threshold",
			"0",
			"--format=json",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			stats: { totalNodes: number };
		};
		// Subtree has fewer nodes than the full 6-node document.
		expect(parsed.stats.totalNodes).toBe(2);
	});

	it("a 401 from the API exits 2 with an auth message", async () => {
		const result = await runCli(["handoff", fileUrl(UNAUTHORIZED_KEY)]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("auth");
	});

	it("an invalid URL exits 2 with an actionable message", async () => {
		const result = await runCli(["handoff", "https://example.com/not-figma"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("figma");
	});

	it("a missing token exits 2 with PAT setup guidance", async () => {
		const result = await runCli(["handoff", fileUrl(FILE_KEY)], {
			FIGMA_TOKEN: "",
			CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "",
		});
		expect(result.code).toBe(2);
		const lower = result.stderr.toLowerCase();
		expect(lower).toContain("token");
		// Mentions the required scopes and the Dev/Full seat caveat.
		expect(lower).toContain("file_content:read");
		expect(lower).toContain("seat");
	});

	it("--comment --yes posts the deductions as one Figma comment", async () => {
		captured.body = undefined;
		const result = await runCli([
			"handoff",
			fileUrl(FILE_KEY),
			"--threshold",
			"95",
			"--comment",
			"--yes",
		]);
		// The gate still drives the exit code (score 90 < 95 -> exit 1).
		expect(result.code).toBe(1);
		const posted = lastComment();
		expect(posted).toBeDefined();
		const message = posted?.message ?? "";
		// The comment carries the score and at least the top deduction's rule/fix.
		expect(message).toContain("90");
		expect(message.toLowerCase()).toContain("component");
	});

	it("--comment without --yes in non-TTY refuses to comment but still reports", async () => {
		captured.body = undefined;
		const result = await runCli([
			"handoff",
			fileUrl(FILE_KEY),
			"--threshold",
			"80",
			"--comment",
		]);
		// Reports (exit 0 at threshold 80) but does NOT post.
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("90");
		expect(lastComment()).toBeUndefined();
		expect(result.stderr.toLowerCase()).toContain("--yes");
	});

	it("T5.5b: writes a handoff history line (score 90) under cwd/.ds-bridge", async () => {
		const dir = await freshTmp("ds-handoff-hist-");
		const result = await runCliIn(dir, [
			"handoff",
			fileUrl(FILE_KEY),
			"--threshold",
			"80",
		]);
		expect(result.code).toBe(0);

		const records = await readHandoffHistory(dir);
		expect(records.length).toBe(1);
		const record = records[0];
		expect(record?.kind).toBe("handoff");
		expect(record?.score).toBe(90);
		// The scored root is the file document.
		expect(record?.frameName).toBe("Document");
		// Top 3 deductions, each carrying a rule + points; the worst is "component".
		expect(record?.deductions.length).toBeGreaterThan(0);
		expect(record?.deductions.length).toBeLessThanOrEqual(3);
		expect(record?.deductions[0]?.rule).toBe("component");
		expect(typeof record?.deductions[0]?.points).toBe("number");
		expect(typeof record?.at).toBe("string");
		expect(record?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("T5.5b: a node-id URL records the subtree frame name", async () => {
		const dir = await freshTmp("ds-handoff-hist-node-");
		const result = await runCliIn(dir, [
			"handoff",
			fileUrl(FILE_KEY, "1-2"),
			"--threshold",
			"0",
		]);
		expect(result.code).toBe(0);

		const records = await readHandoffHistory(dir);
		expect(records.length).toBe(1);
		expect(records[0]?.frameName).toBe("Card / Primary");
	});

	it("H7: the handoff line carries the frame identity (fileKey + nodeId)", async () => {
		const dir = await freshTmp("ds-handoff-hist-id-");
		await runCliIn(dir, [
			"handoff",
			fileUrl(FILE_KEY, "1-2"),
			"--threshold",
			"0",
		]);
		const text = await readFile(
			join(dir, ".ds-bridge", "history.jsonl"),
			"utf8",
		);
		const record = JSON.parse(text.trim()) as Record<string, unknown>;
		expect(record.fileKey).toBe(FILE_KEY);
		expect(record.nodeId).toBe("1:2");

		const whole = await freshTmp("ds-handoff-hist-id-file-");
		await runCliIn(whole, ["handoff", fileUrl(FILE_KEY), "--threshold", "0"]);
		const fileRecord = JSON.parse(
			(
				await readFile(join(whole, ".ds-bridge", "history.jsonl"), "utf8")
			).trim(),
		) as Record<string, unknown>;
		expect(fileRecord.fileKey).toBe(FILE_KEY);
		expect(fileRecord).not.toHaveProperty("nodeId");
	});

	it("T5.5b: --no-history suppresses the history append", async () => {
		const dir = await freshTmp("ds-handoff-nohist-");
		const result = await runCliIn(dir, [
			"handoff",
			fileUrl(FILE_KEY),
			"--threshold",
			"80",
			"--no-history",
		]);
		expect(result.code).toBe(0);
		// Nothing written to disk.
		expect(await historyExists(dir)).toBe(false);
	});
});
