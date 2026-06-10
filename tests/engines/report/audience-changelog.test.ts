// C10 / M2.3 — audience-changelog engine. Test-first: fold the entries of the
// LATEST `changelog` history line into an AudienceChangelog {slices}, one slice
// per audience (designers | developers). The audience-membership rule mirrors
// aggregate.ts: an entry whose audience is "both" counts into BOTH slices. Each
// slice tallies breaking / additive (notable) / cosmetic (minor) and keeps a
// capped, breaking-first `recent[]`. Pure: a raw record (or undefined) in →
// AudienceChangelog out; never throws.
import { describe, expect, it } from "vitest";
import { buildAudienceChangelog } from "../../../src/engines/report/audience-changelog.js";

/** One persisted recent entry, as the changelog line records it. */
function entry(
	audience: "designer" | "developer" | "both",
	severity: "breaking" | "notable" | "minor",
	source: string,
	title: string,
) {
	return { audience, severity, source, title };
}

describe("buildAudienceChangelog", () => {
	it("returns no slices when the record is absent", () => {
		expect(buildAudienceChangelog(undefined)).toEqual({ slices: [] });
	});

	it("returns no slices when the record has an empty recent[] (nothing to slice)", () => {
		const record = {
			at: "2026-06-01T10:00:00.000Z",
			kind: "changelog",
			since: "2026-05-01",
			recent: [],
		};
		expect(buildAudienceChangelog(record)).toEqual({ slices: [] });
	});

	it("counts a developer-only entry into the developers slice only", () => {
		const record = {
			at: "2026-06-01T10:00:00.000Z",
			kind: "changelog",
			recent: [entry("developer", "notable", "code", "add date picker")],
		};
		const result = buildAudienceChangelog(record);
		expect(result.slices).toEqual([
			{
				audience: "developers",
				breaking: 0,
				additive: 1,
				cosmetic: 0,
				recent: ["add date picker"],
			},
		]);
	});

	it("counts a designer-only entry into the designers slice only", () => {
		const record = {
			kind: "changelog",
			recent: [entry("designer", "notable", "figma", "Button hover state")],
		};
		const result = buildAudienceChangelog(record);
		expect(result.slices).toEqual([
			{
				audience: "designers",
				breaking: 0,
				additive: 1,
				cosmetic: 0,
				recent: ["Button hover state"],
			},
		]);
	});

	it("counts a `both` entry into BOTH slices (the aggregate membership rule)", () => {
		const record = {
			kind: "changelog",
			recent: [
				entry("both", "breaking", "tokens", "Token removed: color.brand"),
			],
		};
		const result = buildAudienceChangelog(record);
		// One entry, but it appears in designers AND developers.
		const designers = result.slices.find((s) => s.audience === "designers");
		const developers = result.slices.find((s) => s.audience === "developers");
		expect(designers).toEqual({
			audience: "designers",
			breaking: 1,
			additive: 0,
			cosmetic: 0,
			recent: ["Token removed: color.brand"],
		});
		expect(developers).toEqual({
			audience: "developers",
			breaking: 1,
			additive: 0,
			cosmetic: 0,
			recent: ["Token removed: color.brand"],
		});
	});

	it("maps severities to slice fields: breaking→breaking, notable→additive, minor→cosmetic", () => {
		const record = {
			kind: "changelog",
			recent: [
				entry("developer", "breaking", "code", "drop legacy prop"),
				entry("developer", "notable", "code", "add variant"),
				entry("developer", "minor", "code", "tweak copy"),
			],
		};
		const slice = buildAudienceChangelog(record).slices[0];
		expect(slice).toMatchObject({
			audience: "developers",
			breaking: 1,
			additive: 1,
			cosmetic: 1,
		});
	});

	it("orders recent[] breaking-first within a slice", () => {
		const record = {
			kind: "changelog",
			recent: [
				entry("developer", "minor", "code", "minor-one"),
				entry("developer", "breaking", "code", "breaking-one"),
				entry("developer", "notable", "code", "notable-one"),
			],
		};
		const slice = buildAudienceChangelog(record).slices[0];
		// Breaking floats to the front; the rest keep their source order (stable).
		expect(slice?.recent).toEqual(["breaking-one", "minor-one", "notable-one"]);
	});

	it("caps recent[] per slice (most-severe first survive the cap)", () => {
		const recent = [
			entry("developer", "breaking", "code", "B1"),
			...Array.from({ length: 20 }, (_v, i) =>
				entry("developer", "minor", "code", `m${i}`),
			),
		];
		const slice = buildAudienceChangelog({ kind: "changelog", recent })
			.slices[0];
		// The cap keeps a bounded list, and the breaking entry survives (it sorts first).
		expect(slice?.recent.length).toBeLessThanOrEqual(12);
		expect(slice?.recent[0]).toBe("B1");
		// But the COUNTS reflect every entry, not just the capped recent[].
		expect(slice?.cosmetic).toBe(20);
		expect(slice?.breaking).toBe(1);
	});

	it("emits the designers slice before the developers slice (stable section order)", () => {
		const record = {
			kind: "changelog",
			recent: [
				entry("developer", "notable", "code", "dev"),
				entry("designer", "notable", "figma", "des"),
			],
		};
		const audiences = buildAudienceChangelog(record).slices.map(
			(s) => s.audience,
		);
		expect(audiences).toEqual(["designers", "developers"]);
	});

	it("tolerates malformed entries (non-object / bad fields) without throwing", () => {
		const record = {
			kind: "changelog",
			recent: [
				null,
				42,
				{ audience: "developer", severity: "notable", title: "kept" },
				{ audience: "nonsense", severity: "weird", title: "dropped" },
			],
		};
		const result = buildAudienceChangelog(record);
		const developers = result.slices.find((s) => s.audience === "developers");
		expect(developers?.recent).toEqual(["kept"]);
		// An unknown audience contributes to no slice.
		expect(result.slices.every((s) => !s.recent.includes("dropped"))).toBe(
			true,
		);
	});
});
