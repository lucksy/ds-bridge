// T7.12 — changelog aggregation engine. The audience/severity classification
// rules table IS the contract — spec'd here first, test-driven:
//
// | Input                                          | source | audience  | severity |
// |------------------------------------------------|--------|-----------|----------|
// | token diff: removed / renamed / breaking value | tokens | both      | breaking |
// | token diff: value-changed (additive/cosmetic)  | tokens | both      | notable  |
// | token diff: added                              | tokens | both      | notable  |
// | conventional commit: feat:                     | code   | developer | notable  |
// | conventional commit: fix:                      | code   | developer | minor    |
// | conventional commit: feat!: / BREAKING CHANGE  | code   | developer | breaking |
// | other commit (chore/docs/no prefix)            | code   | developer | minor    |
// | figma version WITH a label                     | figma  | designer  | notable  |
// | figma version WITHOUT a label (autosave)       | —      | —         | filtered |
//
// Entries sort date-desc; the deterministic tiebreak (same dateIso) orders by
// source (figma < code < tokens), then severity (breaking < notable < minor),
// then title. The engine is PURE — no clock, no fs, no env; the since-date is
// an injected ISO string.
import { describe, expect, it } from "vitest";
import {
	aggregateChangelog,
	type ChangelogEntry,
	type GitCommit,
} from "../../../src/engines/changelog/aggregate.js";
import type { TokenDiffResult } from "../../../src/engines/tokens/diff.js";
import type { Token } from "../../../src/engines/tokens/types.js";
import type { FigmaVersion } from "../../../src/io/figma/client.js";

function color(name: string, value: string): Token {
	return { name, type: "color", value };
}

function commit(partial: Partial<GitCommit> & { subject: string }): GitCommit {
	return {
		hash: "abc1234",
		dateIso: "2026-06-01T10:00:00.000Z",
		author: "Dev",
		...partial,
	};
}

function figmaVersion(partial: Partial<FigmaVersion>): FigmaVersion {
	return {
		id: "v1",
		created_at: "2026-06-01T10:00:00Z",
		label: "",
		description: "",
		user: { id: "u1", handle: "Designer", img_url: "" },
		...partial,
	};
}

const NO_DIFF: TokenDiffResult = { entries: [], unchanged: 0 };
const SINCE = "2026-01-01T00:00:00.000Z";

/** Convenience: aggregate with empty inputs except the named one. */
function aggregate(
	overrides: {
		versions?: FigmaVersion[];
		commits?: GitCommit[];
		tokenDiff?: TokenDiffResult;
		since?: string;
	} = {},
): ChangelogEntry[] {
	return aggregateChangelog({
		versions: overrides.versions ?? [],
		commits: overrides.commits ?? [],
		tokenDiff: overrides.tokenDiff ?? NO_DIFF,
		since: overrides.since ?? SINCE,
	});
}

describe("aggregateChangelog — token diff classification", () => {
	it("classifies a removed token as both/breaking", () => {
		const diff: TokenDiffResult = {
			entries: [
				{
					kind: "removed",
					token: color("color.old", "#000"),
					impact: "breaking",
				},
			],
			unchanged: 0,
		};
		const [entry] = aggregate({ tokenDiff: diff });
		expect(entry?.source).toBe("tokens");
		expect(entry?.audience).toBe("both");
		expect(entry?.severity).toBe("breaking");
		expect(entry?.title).toContain("color.old");
	});

	it("classifies a renamed token as both/breaking", () => {
		const diff: TokenDiffResult = {
			entries: [
				{
					kind: "renamed",
					from: color("color.a", "#fff"),
					to: color("color.b", "#fff"),
					impact: "breaking",
				},
			],
			unchanged: 0,
		};
		const [entry] = aggregate({ tokenDiff: diff });
		expect(entry?.severity).toBe("breaking");
		expect(entry?.audience).toBe("both");
	});

	it("classifies a breaking value change as both/breaking", () => {
		const diff: TokenDiffResult = {
			entries: [
				{
					kind: "value-changed",
					before: color("color.primary", "#3b82f6"),
					after: color("color.primary", "#2563eb"),
					impact: "breaking",
				},
			],
			unchanged: 0,
		};
		const [entry] = aggregate({ tokenDiff: diff });
		expect(entry?.severity).toBe("breaking");
		expect(entry?.audience).toBe("both");
	});

	it("classifies a cosmetic value change as both/notable", () => {
		const diff: TokenDiffResult = {
			entries: [
				{
					kind: "value-changed",
					before: color("color.primary", "#3b82f6"),
					after: color("color.primary", "#3B82F6"),
					impact: "cosmetic",
				},
			],
			unchanged: 0,
		};
		const [entry] = aggregate({ tokenDiff: diff });
		expect(entry?.severity).toBe("notable");
		expect(entry?.audience).toBe("both");
	});

	it("classifies an added token as both/notable", () => {
		const diff: TokenDiffResult = {
			entries: [
				{
					kind: "added",
					token: color("color.new", "#abc"),
					impact: "additive",
				},
			],
			unchanged: 0,
		};
		const [entry] = aggregate({ tokenDiff: diff });
		expect(entry?.severity).toBe("notable");
		expect(entry?.audience).toBe("both");
	});

	it("uses the after-name of a value-changed entry for the title", () => {
		const diff: TokenDiffResult = {
			entries: [
				{
					kind: "value-changed",
					before: color("color.primary", "#3b82f6"),
					after: color("color.primary", "#2563eb"),
					impact: "breaking",
				},
			],
			unchanged: 0,
		};
		const [entry] = aggregate({ tokenDiff: diff });
		expect(entry?.title).toContain("color.primary");
		expect(entry?.detail).toContain("#3b82f6");
		expect(entry?.detail).toContain("#2563eb");
	});
});

describe("aggregateChangelog — conventional commit classification", () => {
	it("classifies feat: as developer/notable", () => {
		const [entry] = aggregate({
			commits: [commit({ subject: "feat: add date picker" })],
		});
		expect(entry?.source).toBe("code");
		expect(entry?.audience).toBe("developer");
		expect(entry?.severity).toBe("notable");
		expect(entry?.title).toBe("add date picker");
	});

	it("classifies feat(scope): as developer/notable and strips the scope from the title", () => {
		const [entry] = aggregate({
			commits: [commit({ subject: "feat(ui): add badge" })],
		});
		expect(entry?.audience).toBe("developer");
		expect(entry?.severity).toBe("notable");
		expect(entry?.title).toBe("add badge");
	});

	it("classifies fix: as developer/minor", () => {
		const [entry] = aggregate({
			commits: [commit({ subject: "fix: correct overflow" })],
		});
		expect(entry?.audience).toBe("developer");
		expect(entry?.severity).toBe("minor");
		expect(entry?.title).toBe("correct overflow");
	});

	it("classifies feat!: as developer/breaking", () => {
		const [entry] = aggregate({
			commits: [commit({ subject: "feat!: drop legacy theme API" })],
		});
		expect(entry?.audience).toBe("developer");
		expect(entry?.severity).toBe("breaking");
		expect(entry?.title).toBe("drop legacy theme API");
	});

	it("classifies fix(scope)!: as developer/breaking", () => {
		const [entry] = aggregate({
			commits: [commit({ subject: "fix(api)!: rename prop" })],
		});
		expect(entry?.severity).toBe("breaking");
		expect(entry?.title).toBe("rename prop");
	});

	it("classifies a BREAKING CHANGE footer as developer/breaking", () => {
		const [entry] = aggregate({
			commits: [
				commit({
					subject:
						"refactor: tidy theme\n\nBREAKING CHANGE: theme tokens renamed",
				}),
			],
		});
		expect(entry?.severity).toBe("breaking");
		// Title is the first line only (the subject), footer drives severity.
		expect(entry?.title).toBe("tidy theme");
	});

	it("classifies a non-conventional commit as developer/minor with the raw subject", () => {
		const [entry] = aggregate({
			commits: [commit({ subject: "update readme" })],
		});
		expect(entry?.audience).toBe("developer");
		expect(entry?.severity).toBe("minor");
		expect(entry?.title).toBe("update readme");
	});
});

describe("aggregateChangelog — figma version classification + filtering", () => {
	it("classifies a labeled version as designer/notable", () => {
		const [entry] = aggregate({
			versions: [figmaVersion({ id: "v9", label: "Button hover state" })],
		});
		expect(entry?.source).toBe("figma");
		expect(entry?.audience).toBe("designer");
		expect(entry?.severity).toBe("notable");
		expect(entry?.title).toBe("Button hover state");
	});

	it("filters out unlabeled autosave versions", () => {
		const entries = aggregate({
			versions: [
				figmaVersion({ id: "v9", label: "Button hover state" }),
				figmaVersion({ id: "v8", label: "" }),
			],
		});
		expect(entries).toHaveLength(1);
		expect(entries[0]?.id).not.toBe("v8");
	});

	it("treats a whitespace-only label as unlabeled (filtered)", () => {
		const entries = aggregate({
			versions: [figmaVersion({ id: "v8", label: "   " })],
		});
		expect(entries).toHaveLength(0);
	});

	it("treats a null label (autosave/Figma version) as unlabeled, no crash", () => {
		// The live REST API returns null (not "") for autosave checkpoints — F1.
		const entries = aggregate({
			versions: [figmaVersion({ id: "v7", label: null, description: null })],
		});
		expect(entries).toHaveLength(0);
	});

	it("tolerates a null description on a labeled version (no detail, no crash)", () => {
		const [entry] = aggregate({
			versions: [
				figmaVersion({
					id: "v9",
					label: "Button hover state",
					description: null,
				}),
			],
		});
		expect(entry?.title).toBe("Button hover state");
		expect(entry?.detail).toBeUndefined();
	});

	it("carries the figma version description into the detail", () => {
		const [entry] = aggregate({
			versions: [
				figmaVersion({
					id: "v9",
					label: "Button hover state",
					description: "Added hover + focus variants.",
				}),
			],
		});
		expect(entry?.detail).toBe("Added hover + focus variants.");
	});

	it("normalizes the figma created_at to a full ISO dateIso", () => {
		const [entry] = aggregate({
			versions: [
				figmaVersion({
					id: "v9",
					label: "Release",
					created_at: "2026-06-04T18:22:10Z",
				}),
			],
		});
		// Same instant, normalized to a millisecond-precision ISO string.
		expect(entry?.dateIso).toBe("2026-06-04T18:22:10.000Z");
	});
});

describe("aggregateChangelog — since-date filter", () => {
	it("drops commits dated before the since boundary", () => {
		const entries = aggregate({
			commits: [
				commit({ subject: "feat: kept", dateIso: "2026-06-01T00:00:00.000Z" }),
				commit({ subject: "feat: old", dateIso: "2025-12-01T00:00:00.000Z" }),
			],
			since: "2026-01-01T00:00:00.000Z",
		});
		expect(entries).toHaveLength(1);
		expect(entries[0]?.title).toBe("kept");
	});

	it("keeps an entry dated exactly at the since boundary (inclusive)", () => {
		const entries = aggregate({
			commits: [commit({ subject: "feat: boundary", dateIso: SINCE })],
			since: SINCE,
		});
		expect(entries).toHaveLength(1);
	});

	it("drops figma versions before the since boundary", () => {
		const entries = aggregate({
			versions: [
				figmaVersion({
					id: "old",
					label: "Old",
					created_at: "2025-01-01T00:00:00Z",
				}),
			],
			since: SINCE,
		});
		expect(entries).toHaveLength(0);
	});
});

describe("aggregateChangelog — ordering", () => {
	it("sorts entries date-desc across all sources", () => {
		const entries = aggregate({
			versions: [
				figmaVersion({
					id: "f",
					label: "Mid",
					created_at: "2026-03-01T00:00:00Z",
				}),
			],
			commits: [
				commit({
					subject: "feat: newest",
					dateIso: "2026-05-01T00:00:00.000Z",
				}),
				commit({ subject: "fix: oldest", dateIso: "2026-02-01T00:00:00.000Z" }),
			],
		});
		expect(entries.map((e) => e.title)).toEqual(["newest", "Mid", "oldest"]);
	});

	it("breaks ties deterministically by source then severity then title", () => {
		const date = "2026-06-01T12:00:00.000Z";
		const figmaDate = "2026-06-01T12:00:00Z";
		const diff: TokenDiffResult = {
			entries: [
				{
					kind: "removed",
					token: color("color.z", "#000"),
					impact: "breaking",
				},
			],
			unchanged: 0,
		};
		const entries = aggregate({
			versions: [
				figmaVersion({
					id: "f",
					label: "A figma change",
					created_at: figmaDate,
				}),
			],
			commits: [commit({ subject: "feat: a code change", dateIso: date })],
			tokenDiff: diff,
			since: SINCE,
		});
		// Same instant for all three; tiebreak = source order figma < code < tokens.
		expect(entries.map((e) => e.source)).toEqual(["figma", "code", "tokens"]);
	});

	it("orders same-source, same-date entries by severity then title", () => {
		const date = "2026-06-01T12:00:00.000Z";
		const entries = aggregate({
			commits: [
				commit({ subject: "fix: minor thing", dateIso: date }),
				commit({ subject: "feat!: breaking thing", dateIso: date }),
				commit({ subject: "feat: notable thing", dateIso: date }),
			],
			since: SINCE,
		});
		expect(entries.map((e) => e.severity)).toEqual([
			"breaking",
			"notable",
			"minor",
		]);
	});

	it("is deterministic: same input yields identical output across runs", () => {
		const input = {
			versions: [figmaVersion({ id: "f", label: "Change" })],
			commits: [commit({ subject: "feat: thing" })],
			tokenDiff: NO_DIFF,
			since: SINCE,
		};
		const a = aggregateChangelog(input);
		const b = aggregateChangelog(input);
		expect(a).toEqual(b);
	});
});
