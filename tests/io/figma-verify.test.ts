// verifyConnection — the `config connect --verify` probe. Integration level 2:
// runs the REAL FigmaClient against an INJECTED fetch (never the network), so it
// also locks the /v1/me endpoint and the identity→library probe order. sleep/jitter
// are injected so the 429-retry path resolves instantly and deterministically.
import { describe, expect, it } from "vitest";
import { verifyConnection } from "../../src/io/figma/verify.js";

const BASE = "https://figma.test";
const KEY = "AbCdEf1234567890LibKey";

/** A Response double good enough for the client (status/headers/json/text). */
function jsonResponse(
	body: unknown,
	init?: { status?: number; headers?: Record<string, string> },
): Response {
	const status = init?.status ?? 200;
	const headers = new Headers(init?.headers);
	const text = JSON.stringify(body);
	return {
		ok: status >= 200 && status < 300,
		status,
		headers,
		json: async () => JSON.parse(text),
		text: async () => text,
	} as unknown as Response;
}

/** A fetch double that routes by URL substring and records the calls it saw. */
function routedFetch(routes: { me: Response; file?: Response }): {
	fetch: typeof fetch;
	calls: string[];
} {
	const calls: string[] = [];
	const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
		const url = String(input);
		calls.push(url);
		if (url.includes("/v1/me")) return routes.me;
		if (url.includes("/v1/files/")) {
			if (routes.file === undefined)
				throw new Error(`unexpected file fetch: ${url}`);
			return routes.file;
		}
		throw new Error(`unrouted fetch: ${url}`);
	}) as unknown as typeof fetch;
	return { fetch: fetchImpl, calls };
}

const fast = { sleep: async () => {}, jitter: () => 0 };

describe("verifyConnection", () => {
	it("confirms a valid token and a readable library (and hits /v1/me first)", async () => {
		const { fetch, calls } = routedFetch({
			me: jsonResponse({
				id: "1",
				handle: "jane",
				email: "jane@x.com",
				img_url: "",
			}),
			file: jsonResponse({ name: "DS Library", document: {} }),
		});
		const result = await verifyConnection({
			token: "figd_ok",
			fileKey: KEY,
			baseUrl: BASE,
			fetchImpl: fetch,
			...fast,
		});

		expect(result.ok).toBe(true);
		expect(calls[0]).toContain("/v1/me");
		expect(calls.some((u) => u.includes(`/v1/files/${KEY}`))).toBe(true);
		const text = result.lines.join("\n");
		expect(text).toContain("Token valid");
		expect(text).toContain("jane <jane@x.com>");
		expect(text).toContain("Library readable");
		expect(text).toContain("DS Library");
	});

	it("reports a rejected token (401) and never probes the library", async () => {
		const { fetch, calls } = routedFetch({
			me: jsonResponse({ err: "Invalid token" }, { status: 401 }),
		});
		const result = await verifyConnection({
			token: "figd_bad",
			fileKey: KEY,
			baseUrl: BASE,
			fetchImpl: fetch,
			...fast,
		});

		expect(result.ok).toBe(false);
		expect(result.lines.join("\n")).toContain("401");
		// Identity failed → no file read.
		expect(calls.some((u) => u.includes("/v1/files/"))).toBe(false);
	});

	it("says an expired token expired (Figma's 401 reason)", async () => {
		const { fetch } = routedFetch({
			me: jsonResponse({ err: "Token has expired" }, { status: 401 }),
		});
		const result = await verifyConnection({
			token: "figd_old",
			fileKey: KEY,
			baseUrl: BASE,
			fetchImpl: fetch,
			...fast,
		});
		expect(result.ok).toBe(false);
		expect(result.lines.join("\n")).toMatch(/expired/i);
	});

	it("flags a View-seat throttle (429 on /v1/me) as a seat problem", async () => {
		const { fetch } = routedFetch({
			me: jsonResponse({ err: "rate limited" }, { status: 429 }),
		});
		const result = await verifyConnection({
			token: "figd_view",
			fileKey: KEY,
			baseUrl: BASE,
			fetchImpl: fetch,
			...fast,
		});

		expect(result.ok).toBe(false);
		const text = result.lines.join("\n");
		expect(text).toContain("429");
		expect(text.toLowerCase()).toContain("view-seat");
	});

	it("downgrades to not-ok when the token is valid but the library 404s", async () => {
		const { fetch } = routedFetch({
			me: jsonResponse({ id: "1", handle: "jane", img_url: "" }),
			file: jsonResponse({ err: "Not found" }, { status: 404 }),
		});
		const result = await verifyConnection({
			token: "figd_ok",
			fileKey: KEY,
			baseUrl: BASE,
			fetchImpl: fetch,
			...fast,
		});

		expect(result.ok).toBe(false);
		const text = result.lines.join("\n");
		expect(text).toContain("Token valid");
		expect(text).toContain("404");
	});

	it("verifies identity only when no library key is given", async () => {
		const { fetch, calls } = routedFetch({
			me: jsonResponse({ id: "1", handle: "jane", img_url: "" }),
		});
		const result = await verifyConnection({
			token: "figd_ok",
			baseUrl: BASE,
			fetchImpl: fetch,
			...fast,
		});

		expect(result.ok).toBe(true);
		expect(result.lines.join("\n")).toContain("No library file key set");
		expect(calls.some((u) => u.includes("/v1/files/"))).toBe(false);
	});
});
