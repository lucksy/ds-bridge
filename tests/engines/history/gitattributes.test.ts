// H12 — pure `ensureUnionMerge` (SPEC-history-v2 §8.3): the opt-in
// `.ds-bridge/history.jsonl merge=union` line for a project's .gitattributes.
import { describe, expect, it } from "vitest";
import {
	ensureUnionMerge,
	UNION_MERGE_LINE,
} from "../../../src/engines/history/gitattributes.js";

describe("ensureUnionMerge", () => {
	it("the line is the documented snippet", () => {
		expect(UNION_MERGE_LINE).toBe(".ds-bridge/history.jsonl merge=union");
	});

	it("an absent file is created with just the line", () => {
		expect(ensureUnionMerge(undefined)).toEqual({
			changed: true,
			text: `${UNION_MERGE_LINE}\n`,
		});
	});

	it("an empty file gets the line", () => {
		expect(ensureUnionMerge("")).toEqual({
			changed: true,
			text: `${UNION_MERGE_LINE}\n`,
		});
	});

	it("appends after existing rules (trailing newline kept)", () => {
		expect(ensureUnionMerge("*.png binary\n")).toEqual({
			changed: true,
			text: `*.png binary\n${UNION_MERGE_LINE}\n`,
		});
	});

	it("adds a separating newline when the file lacks a trailing one", () => {
		expect(ensureUnionMerge("*.png binary")).toEqual({
			changed: true,
			text: `*.png binary\n${UNION_MERGE_LINE}\n`,
		});
	});

	it("an exact line already present → unchanged, byte-identical", () => {
		const text = `* text=auto\n${UNION_MERGE_LINE}\n`;
		expect(ensureUnionMerge(text)).toEqual({ changed: false, text });
	});

	it("an equivalent line (whitespace, extra attributes) counts as present", () => {
		const text = "  .ds-bridge/history.jsonl\t-diff   merge=union  \n";
		expect(ensureUnionMerge(text)).toEqual({ changed: false, text });
	});

	it("a commented-out line does not count", () => {
		const text = `# ${UNION_MERGE_LINE}\n`;
		expect(ensureUnionMerge(text)).toEqual({
			changed: true,
			text: `${text}${UNION_MERGE_LINE}\n`,
		});
	});

	it("a different merge driver or another pattern does not count", () => {
		const text =
			".ds-bridge/history.jsonl merge=binary\n.ds-bridge/other.jsonl merge=union\n";
		expect(ensureUnionMerge(text)).toEqual({
			changed: true,
			text: `${text}${UNION_MERGE_LINE}\n`,
		});
	});

	it("preserves CRLF files' content and appends with the file's line ending", () => {
		expect(ensureUnionMerge("*.png binary\r\n")).toEqual({
			changed: true,
			text: `*.png binary\r\n${UNION_MERGE_LINE}\r\n`,
		});
	});

	describe("effective value: the last matching merge setting wins (§8.4)", () => {
		const appended = (text: string) => ({
			changed: true,
			text: `${text}${UNION_MERGE_LINE}\n`,
		});

		it("a later -merge on the same pattern overrides union → appended", () => {
			const text = `${UNION_MERGE_LINE}\n.ds-bridge/history.jsonl -merge\n`;
			expect(ensureUnionMerge(text)).toEqual(appended(text));
		});

		it("a later merge=binary / !merge / binary macro overrides union → appended", () => {
			for (const attr of ["merge=binary", "!merge", "binary", "merge"]) {
				const text = `${UNION_MERGE_LINE}\n.ds-bridge/history.jsonl ${attr}\n`;
				expect(ensureUnionMerge(text)).toEqual(appended(text));
			}
		});

		it("a later broader pattern that unsets merge overrides union → appended", () => {
			for (const pattern of [
				".ds-bridge/**",
				".ds-bridge/*",
				"/.ds-bridge/history.jsonl",
				"**/history.jsonl",
				"*.jsonl",
				"*",
			]) {
				const text = `${UNION_MERGE_LINE}\n${pattern} -merge\n`;
				expect(ensureUnionMerge(text)).toEqual(appended(text));
			}
		});

		it("an override before the union line does not matter → present", () => {
			const text = `* -merge\n.ds-bridge/** binary\n${UNION_MERGE_LINE}\n`;
			expect(ensureUnionMerge(text)).toEqual({ changed: false, text });
		});

		it("the last merge token within one line wins", () => {
			const lose = ".ds-bridge/history.jsonl merge=union -merge\n";
			expect(ensureUnionMerge(lose)).toEqual(appended(lose));
			const win = ".ds-bridge/history.jsonl -merge merge=union\n";
			expect(ensureUnionMerge(win)).toEqual({ changed: false, text: win });
		});

		it("a broader pattern setting merge=union counts as present", () => {
			const text = "*.jsonl merge=union\n";
			expect(ensureUnionMerge(text)).toEqual({ changed: false, text });
		});

		it("non-matching patterns and lines without merge attributes are ignored", () => {
			const text = `${UNION_MERGE_LINE}\n*.png -merge\nother/** -merge\n* text=auto\n.ds-bridge/history.jsonl -diff\n`;
			expect(ensureUnionMerge(text)).toEqual({ changed: false, text });
		});

		it("[attr] macro definitions are not patterns", () => {
			const text = `${UNION_MERGE_LINE}\n[attr]nomerge -merge\n`;
			expect(ensureUnionMerge(text)).toEqual({ changed: false, text });
		});
	});
});
