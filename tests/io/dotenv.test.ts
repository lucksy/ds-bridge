// M1.1 — `.ds-bridge.env` dotenv auto-load (SPEC-personas §6.1). TDD: tests written
// first. Two surfaces under test:
//   • parseDotenv(text) — a PURE KEY=VALUE parser (stdlib-only, never throws).
//   • loadDotenvInto(filePath, env) — the impure apply edge: read the file if it
//     exists, parse it, and assign each key to env[key] ONLY when env[key] is
//     currently unset or empty (real env / live dialog values WIN over the file).
// Testing level 1 (pure parser) + level 2 (real node:fs against a tmp file).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadDotenvInto, parseDotenv } from "../../src/io/dotenv.js";

const tmpDirs: string[] = [];

async function freshTmp(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

afterAll(async () => {
	await Promise.all(
		tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("parseDotenv — pure KEY=VALUE parsing", () => {
	it("parses a simple KEY=VALUE line", () => {
		expect(parseDotenv("FIGMA_TOKEN=figd_abc123")).toEqual({
			FIGMA_TOKEN: "figd_abc123",
		});
	});

	it("parses multiple lines into a map", () => {
		const text = "A=1\nB=2\nC=3";
		expect(parseDotenv(text)).toEqual({ A: "1", B: "2", C: "3" });
	});

	it("skips blank lines and whitespace-only lines", () => {
		const text = "A=1\n\n   \nB=2\n";
		expect(parseDotenv(text)).toEqual({ A: "1", B: "2" });
	});

	it("skips full-line comments (first non-space char is #)", () => {
		const text = "# a comment\nA=1\n   # indented comment\nB=2";
		expect(parseDotenv(text)).toEqual({ A: "1", B: "2" });
	});

	it("does NOT treat a # inside a value as a comment", () => {
		expect(parseDotenv("A=foo#bar")).toEqual({ A: "foo#bar" });
	});

	it("splits on the FIRST '=' — the value may itself contain '='", () => {
		expect(parseDotenv("URL=https://x?a=1&b=2")).toEqual({
			URL: "https://x?a=1&b=2",
		});
	});

	it("trims surrounding whitespace from key and value", () => {
		expect(parseDotenv("  A  =  hello  ")).toEqual({ A: "hello" });
	});

	it("strips exactly one layer of matching double quotes", () => {
		expect(parseDotenv('A="hello"')).toEqual({ A: "hello" });
	});

	it("strips exactly one layer of matching single quotes", () => {
		expect(parseDotenv("A='hello'")).toEqual({ A: "hello" });
	});

	it("strips only ONE layer — inner quotes are preserved", () => {
		expect(parseDotenv("A=\"'inner'\"")).toEqual({ A: "'inner'" });
		expect(parseDotenv("A='\"inner\"'")).toEqual({ A: '"inner"' });
	});

	it("does not strip mismatched surrounding quotes", () => {
		expect(parseDotenv("A=\"hello'")).toEqual({ A: "\"hello'" });
	});

	it("does not strip a lone leading or trailing quote", () => {
		expect(parseDotenv('A="hello')).toEqual({ A: '"hello' });
		expect(parseDotenv('A=hello"')).toEqual({ A: 'hello"' });
	});

	it("yields an empty value for KEY= (and KEY= with quotes)", () => {
		expect(parseDotenv("A=")).toEqual({ A: "" });
		expect(parseDotenv('A=""')).toEqual({ A: "" });
	});

	it("skips a malformed line with no '=' but keeps the valid ones", () => {
		const text = "A=1\nnot a kv line\nB=2";
		expect(parseDotenv(text)).toEqual({ A: "1", B: "2" });
	});

	it("skips a line with an empty key (leading '=')", () => {
		expect(parseDotenv("=value\nA=1")).toEqual({ A: "1" });
	});

	it("never throws on garbage input", () => {
		expect(() => parseDotenv(" \n===\n###\n\n   =   \n")).not.toThrow();
		expect(parseDotenv(" \n===\n###\n\n   =   \n")).toEqual({});
	});

	it("returns {} for an empty string", () => {
		expect(parseDotenv("")).toEqual({});
	});

	it("last assignment wins for a repeated key", () => {
		expect(parseDotenv("A=1\nA=2")).toEqual({ A: "2" });
	});
});

describe("loadDotenvInto — apply into env (real fs)", () => {
	it("fills a key that is currently unset", async () => {
		const dir = await freshTmp("ds-dotenv-unset-");
		const file = join(dir, ".ds-bridge.env");
		await writeFile(file, "FIGMA_TOKEN=figd_from_file\n", "utf8");

		const env: NodeJS.ProcessEnv = {};
		loadDotenvInto(file, env);
		expect(env.FIGMA_TOKEN).toBe("figd_from_file");
	});

	it("fills a key that is currently the empty string", async () => {
		const dir = await freshTmp("ds-dotenv-empty-");
		const file = join(dir, ".ds-bridge.env");
		await writeFile(file, "FIGMA_TOKEN=figd_from_file\n", "utf8");

		const env: NodeJS.ProcessEnv = { FIGMA_TOKEN: "" };
		loadDotenvInto(file, env);
		expect(env.FIGMA_TOKEN).toBe("figd_from_file");
	});

	it("does NOT overwrite a key that is already set (real env wins)", async () => {
		const dir = await freshTmp("ds-dotenv-preset-");
		const file = join(dir, ".ds-bridge.env");
		await writeFile(file, "FIGMA_TOKEN=figd_from_file\n", "utf8");

		const env: NodeJS.ProcessEnv = { FIGMA_TOKEN: "figd_live_value" };
		loadDotenvInto(file, env);
		expect(env.FIGMA_TOKEN).toBe("figd_live_value");
	});

	it("applies a mix: fills unset/empty, leaves preset untouched", async () => {
		const dir = await freshTmp("ds-dotenv-mix-");
		const file = join(dir, ".ds-bridge.env");
		await writeFile(
			file,
			"SET=from_file\nEMPTY=from_file\nUNSET=from_file\n",
			"utf8",
		);

		const env: NodeJS.ProcessEnv = { SET: "live", EMPTY: "" };
		loadDotenvInto(file, env);
		expect(env.SET).toBe("live");
		expect(env.EMPTY).toBe("from_file");
		expect(env.UNSET).toBe("from_file");
	});

	it("is a no-op when the file is missing (never throws)", async () => {
		const dir = await freshTmp("ds-dotenv-missing-");
		const file = join(dir, ".ds-bridge.env");
		const env: NodeJS.ProcessEnv = { EXISTING: "keep" };
		expect(() => loadDotenvInto(file, env)).not.toThrow();
		expect(env).toEqual({ EXISTING: "keep" });
	});

	it("is a no-op when the path is a directory (swallows fs error)", async () => {
		const dir = await freshTmp("ds-dotenv-dir-");
		const env: NodeJS.ProcessEnv = { EXISTING: "keep" };
		// Reading a directory as a file throws EISDIR — must be swallowed.
		expect(() => loadDotenvInto(dir, env)).not.toThrow();
		expect(env).toEqual({ EXISTING: "keep" });
	});

	it("never throws on a garbage/malformed file", async () => {
		const dir = await freshTmp("ds-dotenv-garbage-");
		const file = join(dir, ".ds-bridge.env");
		await writeFile(file, " \n===\nnot a line\n# c\n", "utf8");
		const env: NodeJS.ProcessEnv = {};
		expect(() => loadDotenvInto(file, env)).not.toThrow();
		expect(env).toEqual({});
	});
});
