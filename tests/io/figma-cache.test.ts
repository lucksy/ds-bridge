// L2 — figma response cache helper. Unit level: every effectful dependency
// (fs ops, clock, env, cwd) is INJECTED so the path-resolution + TTL logic is
// asserted against a fake in-memory fs and fixed `now` numbers — NO real Date,
// NO real disk. Precedent: the inline impact.ts cursor helpers
// (impact.ts:136-166, CLAUDE_PLUGIN_DATA env then .ds-bridge/cache/ fallback);
// there is no shared cache module, so this is the first member.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type CacheFs,
	cachePath,
	readCache,
	writeCache,
} from "../../src/io/figma/cache.js";

const KEY = "ABcdEFghIJklMNopQRstUV";

/**
 * An in-memory fake of the injectable fs surface. Records mkdir calls and
 * tolerates a configurable write failure so the swallow-on-failure path is
 * exercised without touching a real disk.
 */
function fakeFs(
	seed: Record<string, string> = {},
	opts: { failWrite?: boolean } = {},
): CacheFs & {
	files: Map<string, string>;
	mkdirCalls: string[];
} {
	const files = new Map<string, string>(Object.entries(seed));
	const mkdirCalls: string[] = [];
	return {
		files,
		mkdirCalls,
		exists: (path) => files.has(path),
		read: (path) => {
			const value = files.get(path);
			if (value === undefined) throw new Error(`ENOENT: ${path}`);
			return value;
		},
		mkdir: (path) => {
			mkdirCalls.push(path);
		},
		write: (path, content) => {
			if (opts.failWrite) throw new Error("EACCES: write denied");
			files.set(path, content);
		},
	};
}

describe("cachePath", () => {
	it("resolves under CLAUDE_PLUGIN_DATA/figma when the env is set", () => {
		const path = cachePath({
			key: KEY,
			env: { CLAUDE_PLUGIN_DATA: "/data" },
			cwd: "/repo",
		});
		expect(path).toBe(join("/data", "figma", `library-${KEY}.json`));
	});

	it("falls back to <cwd>/.ds-bridge/cache when the env is unset", () => {
		const path = cachePath({ key: KEY, env: {}, cwd: "/repo" });
		expect(path).toBe(
			join("/repo", ".ds-bridge", "cache", `library-${KEY}.json`),
		);
	});

	it("treats an empty CLAUDE_PLUGIN_DATA as unset (cwd fallback)", () => {
		const path = cachePath({
			key: KEY,
			env: { CLAUDE_PLUGIN_DATA: "" },
			cwd: "/repo",
		});
		expect(path).toBe(
			join("/repo", ".ds-bridge", "cache", `library-${KEY}.json`),
		);
	});
});

describe("readCache", () => {
	it("returns a hit with data + age when fresh", () => {
		const path = cachePath({ key: KEY, env: {}, cwd: "/repo" });
		const fs = fakeFs({
			[path]: JSON.stringify({ stampedAtMs: 1000, data: { name: "Lib" } }),
		});
		const result = readCache({
			key: KEY,
			env: {},
			cwd: "/repo",
			fs,
			now: 1500,
			ttlMs: 1000,
		});
		expect(result).toEqual({ kind: "hit", data: { name: "Lib" }, ageMs: 500 });
	});

	it("returns a miss when the file is absent", () => {
		const result = readCache({
			key: KEY,
			env: {},
			cwd: "/repo",
			fs: fakeFs(),
			now: 1500,
			ttlMs: 1000,
		});
		expect(result).toEqual({ kind: "miss" });
	});

	it("returns a miss when the file is corrupt / unparseable", () => {
		const path = cachePath({ key: KEY, env: {}, cwd: "/repo" });
		const fs = fakeFs({ [path]: "{ not json" });
		const result = readCache({
			key: KEY,
			env: {},
			cwd: "/repo",
			fs,
			now: 1500,
			ttlMs: 1000,
		});
		expect(result).toEqual({ kind: "miss" });
	});

	it("returns a miss when the parsed shape lacks stampedAtMs", () => {
		const path = cachePath({ key: KEY, env: {}, cwd: "/repo" });
		const fs = fakeFs({ [path]: JSON.stringify({ data: { name: "Lib" } }) });
		const result = readCache({
			key: KEY,
			env: {},
			cwd: "/repo",
			fs,
			now: 1500,
			ttlMs: 1000,
		});
		expect(result).toEqual({ kind: "miss" });
	});

	it("returns stale with age when now-stampedAtMs exceeds ttlMs", () => {
		const path = cachePath({ key: KEY, env: {}, cwd: "/repo" });
		const fs = fakeFs({
			[path]: JSON.stringify({ stampedAtMs: 1000, data: { name: "Lib" } }),
		});
		const result = readCache({
			key: KEY,
			env: {},
			cwd: "/repo",
			fs,
			now: 5000,
			ttlMs: 1000,
		});
		expect(result).toEqual({ kind: "stale", ageMs: 4000 });
	});

	it("treats age exactly equal to ttlMs as a hit (boundary)", () => {
		const path = cachePath({ key: KEY, env: {}, cwd: "/repo" });
		const fs = fakeFs({
			[path]: JSON.stringify({ stampedAtMs: 1000, data: { name: "Lib" } }),
		});
		const result = readCache({
			key: KEY,
			env: {},
			cwd: "/repo",
			fs,
			now: 2000,
			ttlMs: 1000,
		});
		expect(result).toEqual({ kind: "hit", data: { name: "Lib" }, ageMs: 1000 });
	});

	it("never throws when fs.read fails unexpectedly (treated as miss)", () => {
		const path = cachePath({ key: KEY, env: {}, cwd: "/repo" });
		const fs: CacheFs = {
			exists: () => true,
			read: () => {
				throw new Error("EIO");
			},
			mkdir: () => {},
			write: () => {},
		};
		expect(() =>
			readCache({ key: KEY, env: {}, cwd: "/repo", fs, now: 1, ttlMs: 1 }),
		).not.toThrow();
		expect(
			readCache({ key: KEY, env: {}, cwd: "/repo", fs, now: 1, ttlMs: 1 }),
		).toEqual({ kind: "miss" });
		expect(path).toContain("library-");
	});
});

describe("writeCache", () => {
	it("mkdir -p the parent dir and writes the stamped envelope", () => {
		const fs = fakeFs();
		const path = cachePath({ key: KEY, env: {}, cwd: "/repo" });
		writeCache({
			key: KEY,
			env: {},
			cwd: "/repo",
			fs,
			now: 4242,
			data: { name: "Lib" },
		});
		expect(fs.mkdirCalls).toEqual([join("/repo", ".ds-bridge", "cache")]);
		expect(JSON.parse(fs.files.get(path) ?? "")).toEqual({
			stampedAtMs: 4242,
			data: { name: "Lib" },
		});
	});

	it("round-trips: a write is read back as a fresh hit", () => {
		const fs = fakeFs();
		writeCache({
			key: KEY,
			env: { CLAUDE_PLUGIN_DATA: "/data" },
			cwd: "/repo",
			fs,
			now: 1000,
			data: { name: "Lib", count: 3 },
		});
		const result = readCache({
			key: KEY,
			env: { CLAUDE_PLUGIN_DATA: "/data" },
			cwd: "/repo",
			fs,
			now: 1200,
			ttlMs: 1000,
		});
		expect(result).toEqual({
			kind: "hit",
			data: { name: "Lib", count: 3 },
			ageMs: 200,
		});
	});

	it("swallows a write failure silently — never throws", () => {
		const fs = fakeFs({}, { failWrite: true });
		expect(() =>
			writeCache({
				key: KEY,
				env: {},
				cwd: "/repo",
				fs,
				now: 1,
				data: { name: "Lib" },
			}),
		).not.toThrow();
		// Nothing persisted → a subsequent read is a miss.
		expect(
			readCache({ key: KEY, env: {}, cwd: "/repo", fs, now: 2, ttlMs: 1 }),
		).toEqual({ kind: "miss" });
	});

	it("swallows an mkdir failure silently — never throws", () => {
		const fs: CacheFs = {
			exists: () => false,
			read: () => {
				throw new Error("ENOENT");
			},
			mkdir: () => {
				throw new Error("EACCES: mkdir denied");
			},
			write: () => {},
		};
		expect(() =>
			writeCache({
				key: KEY,
				env: {},
				cwd: "/repo",
				fs,
				now: 1,
				data: { name: "Lib" },
			}),
		).not.toThrow();
	});
});
