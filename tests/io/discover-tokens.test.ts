// T1.9 — token source discovery (impure io edge). TDD: tests written first,
// exercised against a real fixture tree under tests/fixtures/discovery/.
// Testing level 2 (integration): real node:fs against golden fixtures.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type DiscoveredSource,
	type DiscoverOutcome,
	discoverTokenSources,
} from "../../src/io/discover-tokens.js";

const discoveryRoot = join(import.meta.dirname, "..", "fixtures", "discovery");

const projectA = join(discoveryRoot, "project-a");
const projectB = join(discoveryRoot, "project-b");
const emptyProject = join(discoveryRoot, "empty-project");

function expectOk(outcome: DiscoverOutcome): DiscoveredSource[] {
	if (outcome.kind !== "ok") {
		throw new Error(`expected ok outcome, got ${outcome.kind}`);
	}
	return outcome.sources;
}

describe("discoverTokenSources — scan (project-a)", () => {
	it("returns an ok outcome", async () => {
		const outcome = await discoverTokenSources(projectA);
		expect(outcome.kind).toBe("ok");
	});

	it("finds both token files and detects their formats", async () => {
		const sources = expectOk(await discoverTokenSources(projectA));
		expect(sources).toEqual([
			{
				path: join(projectA, "tokens", "design-tokens.json"),
				format: "w3c",
			},
			{
				path: join(projectA, "src", "styles", "colors.tokens.json"),
				format: "w3c",
			},
		]);
	});

	it("returns absolute paths", async () => {
		const sources = expectOk(await discoverTokenSources(projectA));
		for (const source of sources) {
			expect(source.path.startsWith("/")).toBe(true);
		}
	});

	it("excludes node_modules even when token-shaped", async () => {
		const sources = expectOk(await discoverTokenSources(projectA));
		const paths = sources.map((s) => s.path);
		expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
	});

	it("skips non-token JSON (src/unrelated.json)", async () => {
		const sources = expectOk(await discoverTokenSources(projectA));
		const paths = sources.map((s) => s.path);
		expect(paths.some((p) => p.endsWith("unrelated.json"))).toBe(false);
	});

	it("orders by path depth (shallower first) then alphabetically", async () => {
		const sources = expectOk(await discoverTokenSources(projectA));
		expect(sources.map((s) => s.path)).toEqual([
			join(projectA, "tokens", "design-tokens.json"),
			join(projectA, "src", "styles", "colors.tokens.json"),
		]);
	});
});

describe("discoverTokenSources — scan (project-b)", () => {
	it("finds the tokens-studio file and skips the non-token config", async () => {
		const sources = expectOk(await discoverTokenSources(projectB));
		expect(sources).toEqual([
			{
				path: join(projectB, "theme", "tokens.json"),
				format: "tokens-studio",
			},
		]);
	});
});

describe("discoverTokenSources — empty project", () => {
	it("returns ok with no sources", async () => {
		const outcome = await discoverTokenSources(emptyProject);
		expect(outcome).toEqual({ kind: "ok", sources: [] });
	});
});

describe("discoverTokenSources — explicit option", () => {
	it("returns exactly the explicit file (format detected), winning over scan", async () => {
		const explicit = join(projectA, "src", "styles", "colors.tokens.json");
		const outcome = await discoverTokenSources(projectA, { explicit });
		expect(outcome).toEqual({
			kind: "ok",
			sources: [{ path: explicit, format: "w3c" }],
		});
	});

	it("resolves a relative explicit path against rootDir", async () => {
		const outcome = await discoverTokenSources(projectA, {
			explicit: "tokens/design-tokens.json",
		});
		expect(outcome).toEqual({
			kind: "ok",
			sources: [
				{
					path: join(projectA, "tokens", "design-tokens.json"),
					format: "w3c",
				},
			],
		});
	});

	it("returns explicit-not-found when the explicit file is missing", async () => {
		const missing = join(projectA, "tokens", "does-not-exist.json");
		const outcome = await discoverTokenSources(projectA, {
			explicit: missing,
		});
		expect(outcome).toEqual({ kind: "explicit-not-found", path: missing });
	});

	it("returns explicit-not-found when explicit points at a non-token file", async () => {
		const unrelated = join(projectA, "src", "unrelated.json");
		const outcome = await discoverTokenSources(projectA, {
			explicit: unrelated,
		});
		expect(outcome).toEqual({ kind: "explicit-not-found", path: unrelated });
	});
});
