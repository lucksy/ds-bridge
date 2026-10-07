// Connection verification for `config connect --verify` (closes the silent
// View-seat / revoked-token trap, gap #5). Two probes over the existing injectable
// FigmaClient — never the live network in tests:
//   1. GET /v1/me   — cheapest proof the token is VALID (not revoked/mistyped) and
//      who it belongs to. A View-seat PAT is throttled so hard it often 429s here.
//   2. GET /v1/files/<key> — only when a library key is known. This is where a seat
//      that CAN authenticate but CANNOT read library content shows up (403/429),
//      i.e. the real "wrong seat" signal /v1/me alone can't give.
// Pure-ish: all I/O goes through the injected client, so it returns a structured
// {ok, lines} the caller prints. Never throws.
import { createFigmaClient } from "./client.js";

export interface VerifyConnectionOptions {
	/** The PAT to test. Sent as X-Figma-Token by the client. */
	token: string;
	/** The library file key to probe for read access; skipped when absent. */
	fileKey?: string;
	/** Injectable fetch (tests pass a double); defaults to global fetch. */
	fetchImpl?: typeof fetch;
	/** API origin override (FIGMA_API_BASE); defaults to https://api.figma.com. */
	baseUrl?: string;
	/** Injectable delay forwarded to the client (tests pass a no-op for fast 429s). */
	sleep?: (ms: number) => Promise<void>;
	/** Injectable [0,1) jitter forwarded to the client; defaults to Math.random. */
	jitter?: () => number;
}

export interface VerifyConnectionResult {
	/** True only when the token is valid AND (if a key was given) the file is readable. */
	ok: boolean;
	/** Human-readable report lines, in order, for the caller to print. */
	lines: string[];
}

/**
 * Verify a token against Figma: identity first, then library read access when a
 * key is supplied. Returns a structured report; the caller decides exit code.
 */
export async function verifyConnection(
	opts: VerifyConnectionOptions,
): Promise<VerifyConnectionResult> {
	const client = createFigmaClient({
		token: opts.token,
		...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
		...(opts.fetchImpl !== undefined ? { fetch: opts.fetchImpl } : {}),
		...(opts.sleep !== undefined ? { sleep: opts.sleep } : {}),
		...(opts.jitter !== undefined ? { jitter: opts.jitter } : {}),
	});
	const lines: string[] = [];

	const me = await client.getMe();
	switch (me.kind) {
		case "ok": {
			const who = me.data.email
				? `${me.data.handle} <${me.data.email}>`
				: me.data.handle;
			lines.push(`✓ Token valid — authenticated as ${who}.`);
			break;
		}
		case "auth-error":
			lines.push(
				me.message !== undefined && /expired/i.test(me.message)
					? "✗ Token expired (401) — create a new personal access token and connect it again."
					: "✗ Token rejected (401) — it is invalid, revoked, expired, or mistyped.",
			);
			return { ok: false, lines };
		case "scope-error":
			lines.push(`✗ Token is missing a required scope: ${me.message}`);
			return { ok: false, lines };
		case "rate-limited":
			lines.push(
				`✗ Rate-limited (429) on /v1/me — retry after ${me.retryAfterSeconds}s. ` +
					"A View-seat PAT is throttled this hard; create the token from a Dev or Full seat.",
			);
			return { ok: false, lines };
		case "not-found":
			lines.push(
				"✗ Unexpected 404 from /v1/me — is FIGMA_API_BASE pointed somewhere odd?",
			);
			return { ok: false, lines };
		case "network-error":
			lines.push(`✗ Could not reach Figma: ${me.message}`);
			return { ok: false, lines };
	}

	// Token is valid. Without a library key there is nothing more to prove.
	if (opts.fileKey === undefined || opts.fileKey === "") {
		lines.push(
			"ℹ No library file key set, so library read access wasn't checked. " +
				"Set one with `config set-library <url|key>`.",
		);
		return { ok: true, lines };
	}

	const file = await client.getFile(opts.fileKey);
	switch (file.kind) {
		case "ok":
			lines.push(
				`✓ Library readable — "${file.data.name}" (${opts.fileKey}). Your seat can read library content.`,
			);
			return { ok: true, lines };
		case "auth-error":
			lines.push(
				`⚠ Authenticated, but cannot read file ${opts.fileKey} (403) — the token lacks ` +
					"file_content:read or your seat can't access this file.",
			);
			return { ok: false, lines };
		case "scope-error":
			lines.push(
				`⚠ Authenticated, but the token is missing a scope for file reads: ${file.message}`,
			);
			return { ok: false, lines };
		case "rate-limited":
			lines.push(
				`⚠ Authenticated, but reading the library was rate-limited (429, retry ${file.retryAfterSeconds}s) ` +
					"— the classic View-seat throttle. Use a Dev/Full-seat PAT.",
			);
			return { ok: false, lines };
		case "not-found":
			lines.push(
				`⚠ Authenticated, but file ${opts.fileKey} was not found (404). Double-check the library file key.`,
			);
			return { ok: false, lines };
		case "network-error":
			lines.push(
				`⚠ Authenticated, but the library read failed: ${file.message}`,
			);
			return { ok: false, lines };
	}
}
