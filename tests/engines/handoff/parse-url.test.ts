// T4.3 — frame-URL parser (pure, never throws). Table-driven: every accepted
// Figma URL shape resolves to { kind: "ok", fileKey, nodeId? } with the node id
// normalized to the colon form ("1-2" -> "1:2"); every garbage / non-figma /
// keyless input degrades to { kind: "invalid-url" }.
import { describe, expect, it } from "vitest";
import {
	type FigmaUrlOutcome,
	parseFigmaUrl,
} from "../../../src/engines/handoff/parse-url.js";

interface OkCase {
	name: string;
	url: string;
	fileKey: string;
	nodeId?: string;
}

const okCases: OkCase[] = [
	{
		name: "/file/KEY/Title",
		url: "https://www.figma.com/file/ABC123/My-Design",
		fileKey: "ABC123",
	},
	{
		name: "/design/KEY/Title",
		url: "https://www.figma.com/design/ABC123/My-Design",
		fileKey: "ABC123",
	},
	{
		name: "/design/KEY/Title?node-id=1-2 (dash normalized to colon)",
		url: "https://www.figma.com/design/ABC123/My-Design?node-id=1-2",
		fileKey: "ABC123",
		nodeId: "1:2",
	},
	{
		name: "?node-id=1%3A2 (url-encoded colon, kept)",
		url: "https://www.figma.com/design/ABC123/My-Design?node-id=1%3A2",
		fileKey: "ABC123",
		nodeId: "1:2",
	},
	{
		name: "?node-id=1:2 (raw colon)",
		url: "https://www.figma.com/design/ABC123/My-Design?node-id=1:2",
		fileKey: "ABC123",
		nodeId: "1:2",
	},
	{
		name: "branch URL -> fileKey is the branch key",
		url: "https://www.figma.com/file/PARENTKEY/branch/BRANCHKEY/Title",
		fileKey: "BRANCHKEY",
	},
	{
		name: "branch URL on /design with node id",
		url: "https://www.figma.com/design/PARENTKEY/branch/BRANCHKEY/Title?node-id=10-20",
		fileKey: "BRANCHKEY",
		nodeId: "10:20",
	},
	{
		name: "/proto/KEY carries a key too",
		url: "https://www.figma.com/proto/PROTOKEY/Title",
		fileKey: "PROTOKEY",
	},
	{
		name: "/proto/KEY with node id",
		url: "https://www.figma.com/proto/PROTOKEY/Title?node-id=3-4",
		fileKey: "PROTOKEY",
		nodeId: "3:4",
	},
	{
		name: "trailing slash after key",
		url: "https://www.figma.com/file/ABC123/",
		fileKey: "ABC123",
	},
	{
		name: "trailing slash, no title segment",
		url: "https://www.figma.com/design/ABC123/",
		fileKey: "ABC123",
	},
	{
		name: "missing scheme accepted (figma.com/...)",
		url: "figma.com/file/ABC123/My-Design",
		fileKey: "ABC123",
	},
	{
		name: "missing scheme with node id",
		url: "www.figma.com/design/ABC123/My-Design?node-id=5-6",
		fileKey: "ABC123",
		nodeId: "5:6",
	},
	{
		name: "no www subdomain",
		url: "https://figma.com/file/ABC123/My-Design",
		fileKey: "ABC123",
	},
	{
		name: "extra query params alongside node-id",
		url: "https://www.figma.com/design/ABC123/Title?t=abc&node-id=7-8&mode=dev",
		fileKey: "ABC123",
		nodeId: "7:8",
	},
	{
		name: "key followed directly by query (no title, no slash)",
		url: "https://www.figma.com/design/ABC123?node-id=1-2",
		fileKey: "ABC123",
		nodeId: "1:2",
	},
];

const invalidCases: { name: string; url: string }[] = [
	{ name: "empty string", url: "" },
	{ name: "whitespace only", url: "   " },
	{ name: "plain garbage", url: "not a url at all" },
	{ name: "non-figma host", url: "https://example.com/file/ABC123/Title" },
	{
		name: "figma host but unknown path type",
		url: "https://www.figma.com/community/file/ABC123",
	},
	{
		name: "figma /file with no key",
		url: "https://www.figma.com/file/",
	},
	{
		name: "figma /design with no key segment",
		url: "https://www.figma.com/design",
	},
	{
		name: "lookalike host (figma.com.evil.com)",
		url: "https://figma.com.evil.com/file/ABC123/Title",
	},
	{
		name: "host containing figma but not figma.com",
		url: "https://notfigma.com/file/ABC123/Title",
	},
];

describe("parseFigmaUrl", () => {
	for (const c of okCases) {
		it(`accepts ${c.name}`, () => {
			const outcome = parseFigmaUrl(c.url);
			expect(outcome.kind).toBe("ok");
			if (outcome.kind !== "ok") return;
			expect(outcome.fileKey).toBe(c.fileKey);
			expect(outcome.nodeId).toBe(c.nodeId);
		});
	}

	for (const c of invalidCases) {
		it(`rejects ${c.name}`, () => {
			const outcome = parseFigmaUrl(c.url);
			expect(outcome.kind).toBe("invalid-url");
			if (outcome.kind !== "invalid-url") return;
			expect(typeof outcome.message).toBe("string");
			expect(outcome.message.length).toBeGreaterThan(0);
		});
	}

	it("never throws on arbitrary input", () => {
		const inputs: unknown[] = [
			"://///",
			"https://",
			"figma.com",
			"https://www.figma.com",
			"%%%%",
		];
		for (const input of inputs) {
			expect(() => parseFigmaUrl(input as string)).not.toThrow();
		}
	});

	it("is deterministic for the same input", () => {
		const url = "https://www.figma.com/design/ABC123/Title?node-id=1-2";
		const a: FigmaUrlOutcome = parseFigmaUrl(url);
		const b: FigmaUrlOutcome = parseFigmaUrl(url);
		expect(a).toEqual(b);
	});
});
