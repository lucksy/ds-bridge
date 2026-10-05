// R1 (SPEC-rollup §2) — pure source + rollup-config parsing.
import { describe, expect, it } from "vitest";
import {
	defaultName,
	parseRollupConfig,
	parseSourceArg,
	uniqueNames,
} from "../../../src/engines/rollup/sources.js";

const none = () => false;

describe("parseSourceArg", () => {
	it("treats a plain string as a path", () => {
		expect(parseSourceArg("../web", none)).toEqual({ path: "../web" });
	});

	it("splits <path>@<ref> at the LAST @ (refs may contain slashes)", () => {
		expect(parseSourceArg("../ios@origin/ds-bridge-data", none)).toEqual({
			path: "../ios",
			ref: "origin/ds-bridge-data",
		});
		expect(parseSourceArg("a@b@main", none)).toEqual({
			path: "a@b",
			ref: "main",
		});
	});

	it("never splits a string that exists on disk", () => {
		const exists = (p: string) => p === "node_modules/@scope/pkg";
		expect(parseSourceArg("node_modules/@scope/pkg", exists)).toEqual({
			path: "node_modules/@scope/pkg",
		});
	});

	it("keeps a path when either side of the @ is empty", () => {
		expect(parseSourceArg("@main", none)).toEqual({ path: "@main" });
		expect(parseSourceArg("repo@", none)).toEqual({ path: "repo@" });
	});
});

describe("defaultName", () => {
	it("names a directory source by its basename", () => {
		expect(defaultName({ path: "/work/web" })).toBe("web");
		expect(defaultName({ path: "/work/web/" })).toBe("web");
		expect(defaultName({ path: "/work/ios", ref: "origin/main" })).toBe("ios");
	});

	it("keeps a dot in a directory name (only a history extension is stripped)", () => {
		expect(defaultName({ path: "/work/web.app" })).toBe("web.app");
		expect(defaultName({ path: "/work/design-system.web" })).toBe(
			"design-system.web",
		);
		expect(defaultName({ path: "/dump/acme.json" })).toBe("acme");
	});

	it("names a .ds-bridge history file by its repo directory", () => {
		expect(defaultName({ path: "/work/web/.ds-bridge/history.jsonl" })).toBe(
			"web",
		);
	});

	it("names any other file by its basename without extension", () => {
		expect(defaultName({ path: "/dump/acme-history.jsonl" })).toBe(
			"acme-history",
		);
	});
});

describe("uniqueNames", () => {
	it("suffixes duplicates in input order", () => {
		expect(uniqueNames(["web", "ios", "web", "web"])).toEqual([
			"web",
			"ios",
			"web (2)",
			"web (3)",
		]);
	});
});

describe("parseRollupConfig", () => {
	it("parses an array of {name, source, team?}", () => {
		const outcome = parseRollupConfig(
			JSON.stringify([
				{ name: "web", source: "../web" },
				{ name: "ios", source: "../ios@origin/main", team: "Mobile", x: 1 },
			]),
		);
		expect(outcome).toEqual({
			kind: "ok",
			entries: [
				{ name: "web", source: "../web" },
				{ name: "ios", source: "../ios@origin/main", team: "Mobile" },
			],
		});
	});

	it("rejects non-JSON", () => {
		const outcome = parseRollupConfig("{nope");
		expect(outcome.kind).toBe("error");
	});

	it("rejects a non-array", () => {
		const outcome = parseRollupConfig(JSON.stringify({ repos: [] }));
		expect(outcome).toMatchObject({ kind: "error" });
		if (outcome.kind === "error") expect(outcome.message).toMatch(/array/);
	});

	it("names the bad entry index", () => {
		const outcome = parseRollupConfig(
			JSON.stringify([
				{ name: "web", source: "../web" },
				{ name: "", source: "../x" },
			]),
		);
		expect(outcome.kind).toBe("error");
		if (outcome.kind === "error") expect(outcome.message).toMatch(/\[1\]/);
	});

	it("rejects a missing source and a non-string team", () => {
		expect(parseRollupConfig(JSON.stringify([{ name: "a" }])).kind).toBe(
			"error",
		);
		expect(
			parseRollupConfig(JSON.stringify([{ name: "a", source: "b", team: 3 }]))
				.kind,
		).toBe("error");
		expect(parseRollupConfig(JSON.stringify([null])).kind).toBe("error");
	});
});
