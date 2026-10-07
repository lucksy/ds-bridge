// T4.1 — Figma REST client (impure io edge). TDD: tests written first.
// Testing level 2 (integration): the client runs against recorded fixtures
// (tests/fixtures/figma/*.json) and synthetic error responses through an
// INJECTED fetch — never the live network. Determinism: sleep + jitter are
// injected so retry timing is asserted exactly (jitter: () => 0).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	createFigmaClient,
	type FigmaClient,
	type FigmaResult,
} from "../../src/io/figma/client.js";

const fixturesDir = join(import.meta.dirname, "..", "fixtures", "figma");

function loadFixture(name: string): unknown {
	return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

const fileFixture = loadFixture("file.json");
const fileNodesFixture = loadFixture("file-nodes.json");
const componentsFixture = loadFixture("components.json");
const versionsFixture = loadFixture("versions.json");
const commentsFixture = loadFixture("comments.json");

const FILE_KEY = "ABcdEFghIJklMNopQRstUV";
const TOKEN = "figd_synthetic_test_token";

/** Build a Response-like object good enough for the client (json/text/headers/status). */
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

/** A fetch double that records calls and returns queued responses in order. */
function sequencedFetch(responses: Response[]): {
	fetch: typeof fetch;
	calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	let index = 0;
	const fetchImpl = (async (
		input: Parameters<typeof globalThis.fetch>[0],
		init?: RequestInit,
	) => {
		calls.push({ url: String(input), init });
		const response = responses[index];
		index += 1;
		if (response === undefined) {
			throw new Error(`unexpected fetch call #${index}`);
		}
		return response;
	}) as unknown as typeof fetch;
	return { fetch: fetchImpl, calls };
}

/** A fetch double that always returns the same single response. */
function singleFetch(response: Response): {
	fetch: typeof fetch;
	calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const fetchImpl = (async (
		input: Parameters<typeof globalThis.fetch>[0],
		init?: RequestInit,
	) => {
		calls.push({ url: String(input), init });
		return response;
	}) as unknown as typeof fetch;
	return { fetch: fetchImpl, calls };
}

/** A fetch double that rejects (network failure). */
function rejectingFetch(message: string): {
	fetch: typeof fetch;
	calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const fetchImpl = (async (
		input: Parameters<typeof globalThis.fetch>[0],
		init?: RequestInit,
	) => {
		calls.push({ url: String(input), init });
		throw new Error(message);
	}) as unknown as typeof fetch;
	return { fetch: fetchImpl, calls };
}

const noopSleep = async (): Promise<void> => {};
const zeroJitter = (): number => 0;

function makeClient(
	fetchImpl: typeof globalThis.fetch,
	overrides?: {
		sleep?: (ms: number) => Promise<void>;
		jitter?: () => number;
	},
): FigmaClient {
	return createFigmaClient({
		token: TOKEN,
		fetch: fetchImpl,
		sleep: overrides?.sleep ?? noopSleep,
		jitter: overrides?.jitter ?? zeroJitter,
	});
}

function expectOk<T>(result: FigmaResult<T>): T {
	if (result.kind !== "ok") {
		throw new Error(`expected ok result, got ${result.kind}`);
	}
	return result.data;
}

function headerValue(
	init: RequestInit | undefined,
	name: string,
): string | null {
	const headers = new Headers(init?.headers);
	return headers.get(name);
}

describe("createFigmaClient — auth header", () => {
	it("sends X-Figma-Token (not Authorization/Bearer)", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(fileFixture));
		await makeClient(fetch).getFile(FILE_KEY);
		const init = calls[0]?.init;
		expect(headerValue(init, "X-Figma-Token")).toBe(TOKEN);
		expect(headerValue(init, "Authorization")).toBeNull();
	});

	it("never sends a Bearer-style Authorization header", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(fileFixture));
		await makeClient(fetch).getComponents(FILE_KEY);
		const headers = new Headers(calls[0]?.init?.headers);
		let foundBearer = false;
		headers.forEach((value) => {
			if (value.toLowerCase().includes("bearer")) foundBearer = true;
		});
		expect(foundBearer).toBe(false);
	});
});

describe("createFigmaClient — URLs", () => {
	it("getFile hits /v1/files/:key", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(fileFixture));
		await makeClient(fetch).getFile(FILE_KEY);
		expect(calls[0]?.url).toBe(`https://api.figma.com/v1/files/${FILE_KEY}`);
	});

	it("getFileNodes comma-joins encodeURIComponent'd ids in the query", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(fileNodesFixture));
		await makeClient(fetch).getFileNodes(FILE_KEY, ["1:2", "1:7"]);
		expect(calls[0]?.url).toBe(
			`https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=1%3A2%2C1%3A7`,
		);
	});

	it("getComponents hits /v1/files/:key/components", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(componentsFixture));
		await makeClient(fetch).getComponents(FILE_KEY);
		expect(calls[0]?.url).toBe(
			`https://api.figma.com/v1/files/${FILE_KEY}/components`,
		);
	});

	it("getVersions hits /v1/files/:key/versions", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(versionsFixture));
		await makeClient(fetch).getVersions(FILE_KEY);
		expect(calls[0]?.url).toBe(
			`https://api.figma.com/v1/files/${FILE_KEY}/versions`,
		);
	});

	it("getComments hits /v1/files/:key/comments", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(commentsFixture));
		await makeClient(fetch).getComments(FILE_KEY);
		expect(calls[0]?.url).toBe(
			`https://api.figma.com/v1/files/${FILE_KEY}/comments`,
		);
	});

	it("getImages comma-joins ids and passes opts as query params", async () => {
		const { fetch, calls } = singleFetch(
			jsonResponse({ err: null, images: { "1:2": "https://img/1.png" } }),
		);
		await makeClient(fetch).getImages(FILE_KEY, ["1:2", "1:7"], {
			format: "png",
			scale: 2,
		});
		const url = calls[0]?.url ?? "";
		expect(url.startsWith(`https://api.figma.com/v1/images/${FILE_KEY}?`)).toBe(
			true,
		);
		expect(url).toContain("ids=1%3A2%2C1%3A7");
		expect(url).toContain("format=png");
		expect(url).toContain("scale=2");
	});
});

describe("createFigmaClient — 200 typed data", () => {
	it("getFile returns ok with a typed FigmaFile", async () => {
		const { fetch } = singleFetch(jsonResponse(fileFixture));
		const data = expectOk(await makeClient(fetch).getFile(FILE_KEY));
		expect(data.name).toBe("DS Bridge — Demo Library");
		expect(data.lastModified).toBe("2026-06-04T18:22:10Z");
		expect(data.version).toBe("5012345678901234567");
		expect(data.document.type).toBe("DOCUMENT");
		const canvas = data.document.children?.[0];
		const frame = canvas?.children?.[0];
		expect(frame?.type).toBe("FRAME");
		expect(frame?.layoutMode).toBe("VERTICAL");
		expect(frame?.absoluteBoundingBox?.width).toBe(320);
		expect(frame?.boundVariables?.fills?.[0]?.id).toBe("VariableID:1:2");
		const instance = frame?.children?.find((n) => n.type === "INSTANCE");
		expect(instance?.componentId).toBe("10:42");
	});

	it("getFileNodes returns ok with the nodes map keyed by id", async () => {
		const { fetch } = singleFetch(jsonResponse(fileNodesFixture));
		const data = expectOk(
			await makeClient(fetch).getFileNodes(FILE_KEY, ["1:2", "1:7"]),
		);
		expect(data.nodes["1:2"]?.document.id).toBe("1:2");
		expect(data.nodes["1:7"]?.document.componentId).toBe("10:42");
	});

	it("getComponents returns ok with typed FigmaComponent[]", async () => {
		const { fetch } = singleFetch(jsonResponse(componentsFixture));
		const data = expectOk(await makeClient(fetch).getComponents(FILE_KEY));
		expect(data.meta.components).toHaveLength(2);
		const first = data.meta.components[0];
		expect(first?.key).toBe("9c1b8f4e2d6a7b3c5e0f1a2b3c4d5e6f7a8b9c0d");
		expect(first?.node_id).toBe("10:42");
		expect(first?.name).toBe("Button / Primary");
		expect(first?.containing_frame?.name).toBe("Buttons");
	});

	it("getVersions returns ok with typed FigmaVersion[]", async () => {
		const { fetch } = singleFetch(jsonResponse(versionsFixture));
		const data = expectOk(await makeClient(fetch).getVersions(FILE_KEY));
		expect(data.versions).toHaveLength(2);
		expect(data.versions[0]?.id).toBe("5012345678901234567");
		expect(data.versions[0]?.label).toBe("Button hover state");
		expect(data.versions[0]?.user.handle).toBe("Avery Nakamura");
	});

	it("getComments returns ok with typed FigmaComment[]", async () => {
		const { fetch } = singleFetch(jsonResponse(commentsFixture));
		const data = expectOk(await makeClient(fetch).getComments(FILE_KEY));
		expect(data.comments).toHaveLength(2);
		expect(data.comments[0]?.id).toBe("3001");
		expect(data.comments[0]?.client_meta?.node_id).toBe("1:2");
		expect(data.comments[0]?.resolved_at).toBeNull();
	});
});

describe("createFigmaClient — rate limiting (429)", () => {
	it("retries after Retry-After seconds with sleep(retryAfter*1000*(1+jitter))", async () => {
		const sleep = vi.fn(async () => {});
		const { fetch } = sequencedFetch([
			jsonResponse({}, { status: 429, headers: { "Retry-After": "3" } }),
			jsonResponse(fileFixture),
		]);
		const result = await makeClient(fetch, { sleep, jitter: () => 0 }).getFile(
			FILE_KEY,
		);
		expect(result.kind).toBe("ok");
		expect(sleep).toHaveBeenCalledTimes(1);
		// 3 seconds * 1000 * (1 + 0) = 3000
		expect(sleep).toHaveBeenCalledWith(3000);
	});

	it("applies jitter to the wait: retryAfter*1000*(1+jitter)", async () => {
		const sleep = vi.fn(async () => {});
		const { fetch } = sequencedFetch([
			jsonResponse({}, { status: 429, headers: { "Retry-After": "2" } }),
			jsonResponse(fileFixture),
		]);
		await makeClient(fetch, { sleep, jitter: () => 0.5 }).getFile(FILE_KEY);
		// 2 * 1000 * (1 + 0.5) = 3000
		expect(sleep).toHaveBeenCalledWith(3000);
	});

	it("succeeds after a single retry (429 then 200)", async () => {
		const { fetch, calls } = sequencedFetch([
			jsonResponse({}, { status: 429, headers: { "Retry-After": "1" } }),
			jsonResponse(fileFixture),
		]);
		const result = await makeClient(fetch).getFile(FILE_KEY);
		expect(result.kind).toBe("ok");
		expect(calls).toHaveLength(2);
	});

	it("gives up after 3 retries and returns rate-limited", async () => {
		const sleep = vi.fn(async () => {});
		// initial + 3 retries = 4 attempts, all 429
		const { fetch, calls } = sequencedFetch([
			jsonResponse({}, { status: 429, headers: { "Retry-After": "5" } }),
			jsonResponse({}, { status: 429, headers: { "Retry-After": "5" } }),
			jsonResponse({}, { status: 429, headers: { "Retry-After": "5" } }),
			jsonResponse({}, { status: 429, headers: { "Retry-After": "5" } }),
		]);
		const result = await makeClient(fetch, { sleep, jitter: () => 0 }).getFile(
			FILE_KEY,
		);
		expect(result.kind).toBe("rate-limited");
		if (result.kind === "rate-limited") {
			expect(result.retryAfterSeconds).toBe(5);
		}
		expect(calls).toHaveLength(4);
		expect(sleep).toHaveBeenCalledTimes(3);
	});

	it("defaults retryAfterSeconds when Retry-After header is absent", async () => {
		const sleep = vi.fn(async () => {});
		const { fetch } = sequencedFetch([
			jsonResponse({}, { status: 429 }),
			jsonResponse({}, { status: 429 }),
			jsonResponse({}, { status: 429 }),
			jsonResponse({}, { status: 429 }),
		]);
		const result = await makeClient(fetch, { sleep, jitter: () => 0 }).getFile(
			FILE_KEY,
		);
		expect(result.kind).toBe("rate-limited");
		if (result.kind === "rate-limited") {
			expect(result.retryAfterSeconds).toBeGreaterThan(0);
		}
	});
});

describe("createFigmaClient — auth / scope / not-found errors", () => {
	it("401 -> auth-error", async () => {
		const { fetch } = singleFetch(
			jsonResponse({ err: "Invalid token" }, { status: 401 }),
		);
		const result = await makeClient(fetch).getFile(FILE_KEY);
		expect(result.kind).toBe("auth-error");
	});

	it("401 keeps Figma's own error text (e.g. an expired token)", async () => {
		const { fetch } = singleFetch(
			jsonResponse({ status: 401, err: "Token has expired" }, { status: 401 }),
		);
		const result = await makeClient(fetch).getFile(FILE_KEY);
		expect(result).toEqual({
			kind: "auth-error",
			message: "Token has expired",
		});
	});

	it("403 without scopes mention -> auth-error", async () => {
		const { fetch } = singleFetch(
			jsonResponse({ err: "Forbidden" }, { status: 403 }),
		);
		const result = await makeClient(fetch).getFile(FILE_KEY);
		expect(result.kind).toBe("auth-error");
	});

	it("403 mentioning scopes -> scope-error with message", async () => {
		const { fetch } = singleFetch(
			jsonResponse(
				{ err: "Token missing required scope: file_content:read" },
				{ status: 403 },
			),
		);
		const result = await makeClient(fetch).getFile(FILE_KEY);
		expect(result.kind).toBe("scope-error");
		if (result.kind === "scope-error") {
			expect(result.message).toContain("scope");
		}
	});

	it("404 -> not-found", async () => {
		const { fetch } = singleFetch(
			jsonResponse({ err: "Not found" }, { status: 404 }),
		);
		const result = await makeClient(fetch).getFile(FILE_KEY);
		expect(result.kind).toBe("not-found");
	});
});

describe("createFigmaClient — network errors", () => {
	it("fetch rejection -> network-error with the message", async () => {
		const { fetch } = rejectingFetch("ECONNREFUSED");
		const result = await makeClient(fetch).getFile(FILE_KEY);
		expect(result.kind).toBe("network-error");
		if (result.kind === "network-error") {
			expect(result.message).toContain("ECONNREFUSED");
		}
	});

	it("does not throw on a non-JSON 200 body (degrades to network-error)", async () => {
		const badResponse = {
			ok: true,
			status: 200,
			headers: new Headers(),
			json: async () => {
				throw new Error("Unexpected token");
			},
			text: async () => "<html>not json</html>",
		} as unknown as Response;
		const { fetch } = singleFetch(badResponse);
		const result = await makeClient(fetch).getFile(FILE_KEY);
		expect(result.kind).toBe("network-error");
	});
});

describe("createFigmaClient — postComment", () => {
	it("POSTs JSON { message } with content-type application/json", async () => {
		const created = {
			id: "4001",
			message: "Looks on-system now.",
			client_meta: null,
			created_at: "2026-06-05T10:00:00Z",
			resolved_at: null,
			user: { id: "1", handle: "Bot", img_url: "" },
		};
		const { fetch, calls } = singleFetch(jsonResponse(created));
		const result = await makeClient(fetch).postComment(
			FILE_KEY,
			"Looks on-system now.",
		);
		expect(result.kind).toBe("ok");
		const init = calls[0]?.init;
		expect(init?.method).toBe("POST");
		expect(calls[0]?.url).toBe(
			`https://api.figma.com/v1/files/${FILE_KEY}/comments`,
		);
		expect(headerValue(init, "Content-Type")).toContain("application/json");
		expect(JSON.parse(String(init?.body))).toEqual({
			message: "Looks on-system now.",
		});
	});

	it("includes client_meta in the body when provided", async () => {
		const { fetch, calls } = singleFetch(
			jsonResponse({
				id: "4002",
				message: "Pinned note.",
				client_meta: { node_id: "1:2" },
				created_at: "2026-06-05T10:05:00Z",
				resolved_at: null,
				user: { id: "1", handle: "Bot", img_url: "" },
			}),
		);
		await makeClient(fetch).postComment(FILE_KEY, "Pinned note.", {
			node_id: "1:2",
		});
		const body = JSON.parse(String(calls[0]?.init?.body));
		expect(body).toEqual({
			message: "Pinned note.",
			client_meta: { node_id: "1:2" },
		});
	});

	it("still sends X-Figma-Token on POST", async () => {
		const { fetch, calls } = singleFetch(
			jsonResponse({
				id: "4003",
				message: "hi",
				client_meta: null,
				created_at: "2026-06-05T10:06:00Z",
				resolved_at: null,
				user: { id: "1", handle: "Bot", img_url: "" },
			}),
		);
		await makeClient(fetch).postComment(FILE_KEY, "hi");
		expect(headerValue(calls[0]?.init, "X-Figma-Token")).toBe(TOKEN);
	});
});

describe("createFigmaClient — baseUrl override (T4.5)", () => {
	it("defaults to https://api.figma.com when no baseUrl is given", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(fileFixture));
		await makeClient(fetch).getFile(FILE_KEY);
		expect(calls[0]?.url).toBe(`https://api.figma.com/v1/files/${FILE_KEY}`);
	});

	it("uses a custom baseUrl for every method when provided", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(fileFixture));
		const client = createFigmaClient({
			token: TOKEN,
			fetch,
			baseUrl: "http://127.0.0.1:51234",
		});
		await client.getFile(FILE_KEY);
		expect(calls[0]?.url).toBe(`http://127.0.0.1:51234/v1/files/${FILE_KEY}`);
	});

	it("strips a trailing slash from a custom baseUrl (no double slash)", async () => {
		const { fetch, calls } = singleFetch(jsonResponse(fileNodesFixture));
		const client = createFigmaClient({
			token: TOKEN,
			fetch,
			baseUrl: "http://127.0.0.1:51234/",
		});
		await client.getFileNodes(FILE_KEY, ["1:2"]);
		expect(calls[0]?.url).toBe(
			`http://127.0.0.1:51234/v1/files/${FILE_KEY}/nodes?ids=1%3A2`,
		);
	});

	it("routes postComment through the custom baseUrl", async () => {
		const { fetch, calls } = singleFetch(
			jsonResponse({
				id: "c1",
				message: "hi",
				client_meta: null,
				created_at: "2026-06-05T10:00:00Z",
				resolved_at: null,
				user: { id: "1", handle: "Bot", img_url: "" },
			}),
		);
		const client = createFigmaClient({
			token: TOKEN,
			fetch,
			baseUrl: "http://127.0.0.1:51234",
		});
		await client.postComment(FILE_KEY, "hi");
		expect(calls[0]?.url).toBe(
			`http://127.0.0.1:51234/v1/files/${FILE_KEY}/comments`,
		);
	});
});

describe("createFigmaClient — defaults at the edge", () => {
	it("works without injected fetch/sleep/jitter (uses defaults) when fetch provided only", async () => {
		// The factory must not require sleep/jitter; defaults exist at the edge.
		const { fetch } = singleFetch(jsonResponse(fileFixture));
		const client = createFigmaClient({ token: TOKEN, fetch });
		const result = await client.getFile(FILE_KEY);
		expect(result.kind).toBe("ok");
	});
});
