// T5.4 — integration: the built CLI's `registry build` + `registry resolve`.
// Spawns dist/cli.mjs (acceptance is against the bundle, like handoff-cli.test.ts)
// against a local node:http server that serves the recorded Figma fixtures
// (tests/fixtures/figma/{components,file}.json) — never the live network.
// FIGMA_API_BASE points the client at the local server, FIGMA_TOKEN supplies the
// PAT, and CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY supplies the library file key.
//
// The code side of the registry is a copy of the sample-project components dir
// (tests/fixtures/sample-project/components/**) dropped into a fresh tmp project.
//
// Routes:
//   GET /v1/files/:key             -> file.json        (full document)
//   GET /v1/files/:key/components  -> components.json  (published components)
//   GET /v1/files/UNAUTHORIZED/... -> 401              (unused here; parity w/ handoff)
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
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
const componentsFixtureDir = join(
	repoRoot,
	"tests",
	"fixtures",
	"sample-project",
	"components",
);

const fileFixture = readFileSync(join(fixturesDir, "file.json"), "utf8");
const componentsFixture = readFileSync(
	join(fixturesDir, "components.json"),
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
		const method = req.method ?? "GET";

		if (url.includes("/v1/files/UNAUTHORIZED")) {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ err: "Invalid token" }));
			return;
		}

		if (method === "GET" && url === `/v1/files/${FILE_KEY}/components`) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(componentsFixture);
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
const tmpDirs: string[] = [];

async function freshProject(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-bridge-registry-"));
	tmpDirs.push(dir);
	// Drop the sample component library in as the project's code side.
	await cp(componentsFixtureDir, join(dir, "components"), { recursive: true });
	return dir;
}

/** Run the CLI; resolve with code/stdout/stderr whether it exits 0 or not. */
async function runCli(
	args: string[],
	extraEnv?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		FIGMA_API_BASE: baseUrl,
		FIGMA_TOKEN: TOKEN,
		CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: FILE_KEY,
		...extraEnv,
	};
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{ encoding: "utf8", env },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		if (!isExecError(error)) throw error;
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

interface RegistryDoc {
	schemaVersion: number;
	generatedAt: string | null;
	matches: unknown[];
	unmatchedCode: { name: string; nodeId?: string }[];
	unmatchedFigma: { name: string; nodeId: string }[];
}

async function readRegistry(dir: string): Promise<RegistryDoc> {
	const raw = await readFile(join(dir, ".ds-bridge", "registry.json"), "utf8");
	return JSON.parse(raw) as RegistryDoc;
}

describe("ds-bridge registry (built dist/cli.mjs)", () => {
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

	it("build writes a schema-versioned registry.json under .ds-bridge", async () => {
		const dir = await freshProject();
		const result = await runCli(["registry", "build", dir]);
		// Informational: unmatched components are not an operational error.
		expect(result.code).toBe(0);
		const doc = await readRegistry(dir);
		expect(doc.schemaVersion).toBe(1);
		expect(typeof doc.generatedAt).toBe("string");
		// The five sample components land in unmatchedCode (none clears 0.6 vs the
		// two published figma components), and both figma entries are unmatched.
		expect(doc.unmatchedCode.map((c) => c.name).sort()).toEqual([
			"Badge",
			"Button",
			"Card",
			"HeroPanel",
			"IconButton",
		]);
		expect(doc.unmatchedFigma.map((f) => f.nodeId).sort()).toEqual([
			"10:42",
			"10:58",
		]);
	}, 60_000);

	it("C3/M2.1: build appends a parity history line and prints a parity score summary", async () => {
		const dir = await freshProject();
		const result = await runCli(["registry", "build", dir]);
		expect(result.code).toBe(0);
		// The term summary names the parity score (pct + ok/total). The five sample
		// components are all unmatched + both figma entries unmatched → ok 0 of 7.
		expect(result.stdout).toContain("parity score: 0 (0/7)");

		const text = await readFile(
			join(dir, ".ds-bridge", "history.jsonl"),
			"utf8",
		);
		const lines = text.trim().split("\n");
		expect(lines).toHaveLength(1);
		const record = JSON.parse(lines[0] ?? "") as {
			at: string;
			kind: string;
			ok: number;
			total: number;
			score: number;
			missingInCode: number;
			missingInFigma: number;
			propMismatch: number;
		};
		expect(record.kind).toBe("parity");
		expect(record.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(record.ok).toBe(0);
		expect(record.total).toBe(7);
		expect(record.score).toBe(0);
		expect(record.missingInCode).toBe(2);
		expect(record.missingInFigma).toBe(5);
		expect(record.propMismatch).toBe(0);
	}, 60_000);

	it("C3/M2.1: build --format=json also appends the parity history line", async () => {
		const dir = await freshProject();
		const result = await runCli(["registry", "build", dir, "--format=json"]);
		expect(result.code).toBe(0);
		const text = await readFile(
			join(dir, ".ds-bridge", "history.jsonl"),
			"utf8",
		);
		const record = JSON.parse(text.trim()) as { kind: string; total: number };
		expect(record.kind).toBe("parity");
		expect(record.total).toBe(7);
	}, 60_000);

	it("build is deterministic — identical content modulo generatedAt", async () => {
		const dir = await freshProject();
		await runCli(["registry", "build", dir]);
		const first = await readRegistry(dir);
		await runCli(["registry", "build", dir]);
		const second = await readRegistry(dir);
		first.generatedAt = null;
		second.generatedAt = null;
		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
	}, 60_000);

	it("build --format=json prints the RegistryFile to stdout", async () => {
		const dir = await freshProject();
		const result = await runCli(["registry", "build", dir, "--format=json"]);
		expect(result.code).toBe(0);
		const doc = JSON.parse(result.stdout) as RegistryDoc;
		expect(doc.schemaVersion).toBe(1);
		expect(doc.unmatchedFigma.length).toBe(2);
	}, 60_000);

	it("build exits 2 with guidance when no file key is configured", async () => {
		const dir = await freshProject();
		const result = await runCli(["registry", "build", dir], {
			CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "",
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("file key");
	}, 60_000);

	it("build exits 2 with guidance when no token is configured", async () => {
		const dir = await freshProject();
		const result = await runCli(["registry", "build", dir], {
			FIGMA_TOKEN: "",
			CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "",
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("token");
	}, 60_000);

	it("resolve by nodeId finds the figma entry (candidates, exit 1)", async () => {
		const dir = await freshProject();
		await runCli(["registry", "build", dir]);
		const result = await runCli(["registry", "resolve", "10:42", dir]);
		// 10:42 (Button / Primary) is an unmatched figma entry -> candidates.
		expect(result.code).toBe(1);
		expect(result.stdout.toLowerCase()).toContain("candidates");
	}, 60_000);

	it("resolve by name finds the figma entry", async () => {
		const dir = await freshProject();
		await runCli(["registry", "build", dir]);
		const result = await runCli([
			"registry",
			"resolve",
			"Button / Primary",
			dir,
		]);
		expect(result.code).toBe(1);
		expect(result.stdout.toLowerCase()).toContain("candidates");
	}, 60_000);

	it("resolve unknown node exits 1 with a not-found message", async () => {
		const dir = await freshProject();
		await runCli(["registry", "build", dir]);
		const result = await runCli(["registry", "resolve", "99:99", dir]);
		expect(result.code).toBe(1);
		expect(result.stderr.toLowerCase()).toContain("no registry entry");
	}, 60_000);

	it("resolve before build exits 2 with run-build guidance", async () => {
		const dir = await freshProject();
		const result = await runCli(["registry", "resolve", "10:42", dir]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("registry build");
	}, 60_000);
});
