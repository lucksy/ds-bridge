// M9.2 — deterministic NL→artifact matching for the conversational dashboard
// builder. Pure: a free-text phrase in → ranked catalog matches out, by token
// substring against id+title plus a fuzzy id fallback (suggestArtifactIds). No
// I/O, no LLM, no throws. The CLI `dashboard suggest "<phrase>"` is a thin wrapper.
import { describe, expect, it } from "vitest";
import { matchPhrase } from "../../../src/engines/report/nl-match.js";

describe("matchPhrase", () => {
	it("matches by title/id token (adoption trend → adoption-trend)", () => {
		const ids = matchPhrase("adoption trend").map((m) => m.id);
		expect(ids).toContain("adoption-trend");
	});

	it("matches a two-word title (breaking calendar → breaking-calendar)", () => {
		const ids = matchPhrase("show me the breaking calendar").map((m) => m.id);
		expect(ids).toContain("breaking-calendar");
	});

	it("a shared token surfaces every artifact that carries it", () => {
		const ids = matchPhrase("score").map((m) => m.id);
		expect(ids).toContain("system-score");
		expect(ids).toContain("score-velocity");
	});

	it("ranks stronger (more-token) matches first, catalog order breaking ties", () => {
		const matches = matchPhrase("score velocity");
		// score-velocity carries BOTH tokens → outranks system-score (one token).
		expect(matches[0]?.id).toBe("score-velocity");
	});

	it("recovers from a typo via the fuzzy id fallback (parityy → parity)", () => {
		const ids = matchPhrase("parityy").map((m) => m.id);
		expect(ids).toContain("parity");
	});

	it("ignores sub-3-char noise tokens and returns [] for an all-noise phrase", () => {
		expect(matchPhrase("go to it")).toEqual([]);
	});

	it("returns [] for an empty phrase", () => {
		expect(matchPhrase("")).toEqual([]);
	});

	it("is deterministic for identical input", () => {
		expect(matchPhrase("adoption trend breaking calendar")).toEqual(
			matchPhrase("adoption trend breaking calendar"),
		);
	});

	it("never throws on punctuation / mixed case", () => {
		expect(() =>
			matchPhrase("Score-Trend!! (adoption), please?"),
		).not.toThrow();
	});
});
