// T7.9 — integration: the built CLI's `impact` command.
// Spawns dist/cli.mjs (acceptance is against the bundle, like handoff-cli.test.ts)
// against a local node:http server that serves recorded Figma fixtures
// (components-before/after.json + versions.json) — never the live network.
// FIGMA_API_BASE points the client at the local server; FIGMA_TOKEN supplies the
// PAT; CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY supplies the file key.
//
// The version cursor (last-seen component snapshot + versionId) is cached under
// CLAUDE_PLUGIN_DATA/impact-cursor.json (env set) else <cwd>/.ds-bridge/cache/.
// The diff is the cached snapshot vs a fresh fetch. Routes:
//   GET /v1/files/:key/components -> components-after.json   (the fresh inventory)
//   GET /v1/files/:key/versions   -> versions.json
//   GET /v1/files/UNAUTHORIZED/... -> 401
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

// The BEFORE inventory is seeded into the cursor as a model (see beforeSnapshot);
// the server only ever serves the AFTER inventory (the "fresh" fetch).
const afterFixture = readFileSync(
	join(fixturesDir, "components-after.json"),
	"utf8",
);
const versionsFixture = readFileSync(
	join(fixturesDir, "versions.json"),
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

function makeServer(): Server {
	return createServer((req, res) => {
		const url = req.url ?? "";
		const method = req.method ?? "GET";

		if (url.includes(`/v1/files/${UNAUTHORIZED_KEY}`)) {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ err: "Invalid token" }));
			return;
		}

		if (method === "GET" && url === `/v1/files/${FILE_KEY}/components`) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(afterFixture);
			return;
		}

		if (method === "GET" && url === `/v1/files/${FILE_KEY}/versions`) {
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
		// Default: no plugin-data dir, so the cursor falls back to .ds-bridge/cache.
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

/** One stored component model in the cursor snapshot (FigmaComponentModel-shaped). */
interface SnapshotModel {
	name: string;
	nodeId: string;
	description: string;
	variantProps: Record<string, string[]>;
	source: "published" | "inline";
}

/** The cursor shape persisted between runs. */
interface ImpactCursor {
	fileKey: string;
	versionId: string;
	capturedAt: string;
	snapshot: SnapshotModel[];
}

/** Seed a cursor file (the cached baseline snapshot) at the fallback path. */
async function seedCursor(cwd: string, cursor: ImpactCursor): Promise<void> {
	const dir = join(cwd, ".ds-bridge", "cache");
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, "impact-cursor.json"),
		`${JSON.stringify(cursor, null, 2)}\n`,
		"utf8",
	);
}

/** Read the persisted cursor at the fallback path (or undefined). */
async function readCursor(cwd: string): Promise<ImpactCursor | undefined> {
	try {
		const text = await readFile(
			join(cwd, ".ds-bridge", "cache", "impact-cursor.json"),
			"utf8",
		);
		return JSON.parse(text) as ImpactCursor;
	} catch {
		return undefined;
	}
}

/**
 * The BEFORE inventory as scan-figma would model it (the cursor snapshot shape).
 * Variant children sharing a containing_frame ("Badge") merge into one set model
 * keyed by the lowest child nodeId; standalone components map straight through.
 * Mirrors buildFigmaComponentModel so the seeded baseline is faithful.
 */
function beforeSnapshot(): SnapshotModel[] {
	return [
		{
			name: "Avatar",
			nodeId: "10:70",
			description: "Round user avatar.",
			variantProps: {},
			source: "published",
		},
		{
			name: "Badge",
			nodeId: "10:80",
			description: "Small status badge.",
			variantProps: { Size: ["md", "sm"] },
			source: "published",
		},
		{
			name: "Button / Primary",
			nodeId: "10:42",
			description: "Primary call-to-action button.",
			variantProps: {},
			source: "published",
		},
		{
			name: "Input / Text",
			nodeId: "10:58",
			description: "Single-line text input.",
			variantProps: {},
			source: "published",
		},
	];
}

describe("ds-bridge impact (built dist/cli.mjs)", () => {
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

	it("first run with no cursor captures a baseline and exits 0", async () => {
		const dir = await freshTmp("ds-impact-baseline-");
		const result = await runCli(dir, ["impact"]);
		expect(result.code).toBe(0);
		expect(result.stdout.toLowerCase()).toContain("baseline");
		// The cursor is written for next time.
		const cursor = await readCursor(dir);
		expect(cursor?.fileKey).toBe(FILE_KEY);
		expect(cursor?.snapshot.length).toBeGreaterThan(0);
		expect(typeof cursor?.capturedAt).toBe("string");
	});

	it("diffs a seeded baseline against the fresh fetch and finds breaking changes (exit 1)", async () => {
		const dir = await freshTmp("ds-impact-diff-");
		await seedCursor(dir, {
			fileKey: FILE_KEY,
			versionId: "5009876543210987654",
			capturedAt: "2026-06-01T00:00:00.000Z",
			snapshot: beforeSnapshot(),
		});
		const result = await runCli(dir, ["impact", "--format=json"]);
		// A removed component (Input / Text) is breaking -> exit 1.
		expect(result.code).toBe(1);
		const parsed = JSON.parse(result.stdout) as {
			breaking: boolean;
			diff: {
				added: { name: string }[];
				removed: { name: string }[];
				renamed: { fromName: string; toName: string }[];
				changed: { name: string; impact: string }[];
			};
		};
		expect(parsed.breaking).toBe(true);
		expect(parsed.diff.removed.map((c) => c.name)).toContain("Input / Text");
		expect(parsed.diff.added.map((c) => c.name)).toContain("Card / Default");
		expect(parsed.diff.renamed.map((r) => r.toName)).toContain("Avatar / User");
		// Badge gained a Size=lg variant -> a changed/additive entry.
		expect(parsed.diff.changed.map((c) => c.name)).toContain("Badge");
	});

	it("term format lists changed components with their classification", async () => {
		const dir = await freshTmp("ds-impact-term-");
		await seedCursor(dir, {
			fileKey: FILE_KEY,
			versionId: "5009876543210987654",
			capturedAt: "2026-06-01T00:00:00.000Z",
			snapshot: beforeSnapshot(),
		});
		const result = await runCli(dir, ["impact"]);
		expect(result.code).toBe(1);
		const out = result.stdout.toLowerCase();
		expect(out).toContain("breaking");
		expect(result.stdout).toContain("Input / Text");
		expect(result.stdout).toContain("Card / Default");
	});

	it("T7.22: a diff run appends one impact history line; a baseline run appends none", async () => {
		const dir = await freshTmp("ds-impact-history-");
		await seedCursor(dir, {
			fileKey: FILE_KEY,
			versionId: "5009876543210987654",
			capturedAt: "2026-06-01T00:00:00.000Z",
			snapshot: beforeSnapshot(),
		});
		const result = await runCli(dir, ["impact", "--format=json"]);
		expect(result.code).toBe(1);

		const text = await readFile(
			join(dir, ".ds-bridge", "history.jsonl"),
			"utf8",
		);
		const lines = text.trim().split("\n");
		expect(lines).toHaveLength(1);
		const record = JSON.parse(lines[0] ?? "") as {
			at: string;
			kind: string;
			breaking: number;
			additive: number;
			cosmetic: number;
			touchedCallSites: number;
		};
		expect(record.kind).toBe("impact");
		expect(record.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(record.breaking).toBeGreaterThan(0);
		expect(record.touchedCallSites).toBe(0);

		// Baseline run (fresh dir, no cursor) must NOT append history.
		const baselineDir = await freshTmp("ds-impact-history-baseline-");
		const baseline = await runCli(baselineDir, ["impact", "--format=json"]);
		expect(baseline.code).toBe(0);
		await expect(
			readFile(join(baselineDir, ".ds-bridge", "history.jsonl"), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("T7.24: a RENAMED component's call sites are looked up by its old name", async () => {
		const dir = await freshTmp("ds-impact-renamed-usage-");
		// Registry maps the figma name "Avatar" (the fromName of the seeded
		// rename Avatar -> "Avatar / User") to a code component with one import.
		await mkdir(join(dir, ".ds-bridge"), { recursive: true });
		await writeFile(
			join(dir, ".ds-bridge", "registry.json"),
			`${JSON.stringify({
				schemaVersion: 1,
				generatedAt: "2026-06-01T00:00:00.000Z",
				matches: [
					{
						codeName: "Avatar",
						importPath: "components/avatar.tsx",
						figmaName: "Avatar",
						nodeId: "9:1",
						score: 0.97,
					},
				],
				unmatchedCode: [],
				unmatchedFigma: [],
			})}\n`,
			"utf8",
		);
		await mkdir(join(dir, "components"), { recursive: true });
		await writeFile(
			join(dir, "components", "avatar.tsx"),
			"export function Avatar() {\n\treturn null;\n}\n",
			"utf8",
		);
		await mkdir(join(dir, "app"), { recursive: true });
		await writeFile(
			join(dir, "app", "Profile.tsx"),
			'import { Avatar } from "../components/avatar";\n\nexport function Profile() {\n\treturn Avatar();\n}\n',
			"utf8",
		);
		await seedCursor(dir, {
			fileKey: FILE_KEY,
			versionId: "5009876543210987654",
			capturedAt: "2026-06-01T00:00:00.000Z",
			snapshot: beforeSnapshot(),
		});

		const result = await runCli(dir, ["impact", "--format=term"]);
		expect(result.code).toBe(1);
		const renamedRow = result.stdout
			.split("\n")
			.find((line) => line.includes("renamed"));
		expect(renamedRow).toBeDefined();
		// The usage map is keyed by the fromName ("Avatar") — the renamed row
		// must surface its call sites, not "no call sites".
		expect(renamedRow).toContain("touches 1 call site");
	}, 30_000); // ts-morph project load is slow under full-suite parallelism

	it("updates the cursor after a successful diff run", async () => {
		const dir = await freshTmp("ds-impact-cursor-update-");
		await seedCursor(dir, {
			fileKey: FILE_KEY,
			versionId: "old-version",
			capturedAt: "2026-06-01T00:00:00.000Z",
			snapshot: beforeSnapshot(),
		});
		await runCli(dir, ["impact", "--format=json"]);
		const cursor = await readCursor(dir);
		// The newest version from versions.json becomes the new cursor versionId.
		expect(cursor?.versionId).toBe("5012345678901234567");
		// The snapshot now reflects the AFTER inventory (Card present, Input gone).
		const names = cursor?.snapshot.map((s) => s.name) ?? [];
		expect(names).toContain("Card / Default");
		expect(names).not.toContain("Input / Text");
	});

	it("stores the cursor under CLAUDE_PLUGIN_DATA when that env is set", async () => {
		const dir = await freshTmp("ds-impact-plugindata-");
		const dataDir = await freshTmp("ds-impact-data-");
		const result = await runCli(dir, ["impact"], {
			CLAUDE_PLUGIN_DATA: dataDir,
		});
		expect(result.code).toBe(0);
		// Nothing written to the fallback path inside cwd.
		expect(await readCursor(dir)).toBeUndefined();
		// Cursor lives under the plugin-data dir.
		const text = await readFile(join(dataDir, "impact-cursor.json"), "utf8");
		const cursor = JSON.parse(text) as ImpactCursor;
		expect(cursor.fileKey).toBe(FILE_KEY);
	});

	it("a 401 from the API exits 2 with an auth message", async () => {
		const dir = await freshTmp("ds-impact-401-");
		const result = await runCli(dir, ["impact"], {
			CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: UNAUTHORIZED_KEY,
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("auth");
	});

	it("a missing token exits 2 with PAT setup guidance", async () => {
		const dir = await freshTmp("ds-impact-notoken-");
		const result = await runCli(dir, ["impact"], {
			FIGMA_TOKEN: "",
			CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN: "",
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("token");
	});

	it("a missing file key exits 2 with guidance", async () => {
		const dir = await freshTmp("ds-impact-nokey-");
		const result = await runCli(dir, ["impact"], {
			CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "",
		});
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("file key");
	});

	it("rejects an unknown --format with exit 2", async () => {
		const dir = await freshTmp("ds-impact-badfmt-");
		const result = await runCli(dir, ["impact", "--format=xml"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("format");
	});

	it("M1.3: --file-key resolves a product_file_keys alias to its mapped key", async () => {
		const dir = await freshTmp("ds-impact-alias-");
		// Map an alias "checkout" → the served FILE_KEY in the project file.
		await writeFile(
			join(dir, ".ds-bridge.json"),
			`${JSON.stringify({ product_file_keys: { checkout: FILE_KEY } }, null, 2)}\n`,
			"utf8",
		);
		// Point the default file key at something the server does NOT serve, so a
		// successful baseline proves the alias (not the default) drove the fetch.
		const result = await runCli(dir, ["impact", "--file-key=checkout"], {
			CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "UNSERVED_DEFAULT_KEY",
		});
		expect(result.code).toBe(0);
		const cursor = await readCursor(dir);
		expect(cursor?.fileKey).toBe(FILE_KEY);
	});

	it("M1.3: --file-key passes a raw figma key straight through", async () => {
		const dir = await freshTmp("ds-impact-rawkey-");
		const result = await runCli(dir, ["impact", `--file-key=${FILE_KEY}`], {
			CLAUDE_PLUGIN_OPTION_FIGMA_FILE_KEY: "UNSERVED_DEFAULT_KEY",
		});
		expect(result.code).toBe(0);
		const cursor = await readCursor(dir);
		expect(cursor?.fileKey).toBe(FILE_KEY);
	});

	it("M1.3: an unknown --file-key alias exits 2 with a nearest-match suggestion", async () => {
		const dir = await freshTmp("ds-impact-badalias-");
		await writeFile(
			join(dir, ".ds-bridge.json"),
			`${JSON.stringify({ product_file_keys: { checkout: FILE_KEY } }, null, 2)}\n`,
			"utf8",
		);
		const result = await runCli(dir, ["impact", "--file-key=chekcout"]);
		expect(result.code).toBe(2);
		expect(result.stderr.toLowerCase()).toContain("chekcout");
		// Nearest-match suggestion plus the available-alias list.
		expect(result.stderr).toContain("checkout");
	});
});
