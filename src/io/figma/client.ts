// T4.1 — Figma REST client. This is an impure io edge: it performs HTTP. Every
// dependency on the outside world (fetch, sleep, the jitter random source) is
// INJECTABLE so the engines/tests stay deterministic and never hit the network.
//
// Auth is via the `X-Figma-Token` header (NOT `Authorization: Bearer`). Methods
// never throw on bad input or transport failure — they return a discriminated
// `FigmaResult` union so callers branch on `kind`. 429s are retried up to three
// times honoring `Retry-After`, then surface as `rate-limited`.
//
// Verified June 2026 against developers.figma.com/docs/rest-api/.

// ── Minimal response interfaces (only the fields the engines reason about) ──

/** A node in the Figma document tree. Children/optional fields appear by type. */
export interface FigmaNode {
	id: string;
	name: string;
	type: string;
	children?: FigmaNode[];
	boundVariables?: FigmaBoundVariables;
	absoluteBoundingBox?: FigmaBoundingBox;
	layoutMode?: string;
	componentId?: string;
	fills?: FigmaPaint[];
}

export interface FigmaBoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A bound-variable alias, e.g. a fill bound to a color variable. */
export interface FigmaVariableAlias {
	type: "VARIABLE_ALIAS";
	id: string;
}

/** boundVariables maps property names to one or more variable aliases. */
export interface FigmaBoundVariables {
	fills?: FigmaVariableAlias[];
	[property: string]: FigmaVariableAlias | FigmaVariableAlias[] | undefined;
}

export interface FigmaColor {
	r: number;
	g: number;
	b: number;
	a: number;
}

export interface FigmaPaint {
	type: string;
	color?: FigmaColor;
	blendMode?: string;
}

/** GET /v1/files/:key */
export interface FigmaFile {
	name: string;
	lastModified: string;
	version: string;
	role?: string;
	editorType?: string;
	document: FigmaNode;
}

/** GET /v1/files/:key/nodes?ids=… */
export interface FigmaFileNodes {
	name: string;
	lastModified: string;
	version: string;
	nodes: Record<string, { document: FigmaNode } | undefined>;
}

export interface FigmaUser {
	id: string;
	handle: string;
	img_url: string;
}

export interface FigmaContainingFrame {
	name?: string;
	nodeId?: string;
	pageId?: string;
	pageName?: string;
	backgroundColor?: string;
}

/** A published component, as listed by GET /v1/files/:key/components. */
export interface FigmaComponent {
	key: string;
	node_id: string;
	name: string;
	description: string;
	containing_frame?: FigmaContainingFrame;
}

/** GET /v1/files/:key/components */
export interface FigmaComponentsResponse {
	meta: { components: FigmaComponent[] };
}

/** A file version, as listed by GET /v1/files/:key/versions. */
export interface FigmaVersion {
	id: string;
	created_at: string;
	// Autosave checkpoints and Figma-generated versions return `null` here, NOT
	// "" — verified against the live REST API 2026-06-09 (T4.7 smoke). Consumers
	// must coalesce before string ops.
	label: string | null;
	description: string | null;
	user: FigmaUser;
}

/** GET /v1/files/:key/versions */
export interface FigmaVersionsResponse {
	versions: FigmaVersion[];
}

export interface FigmaClientMeta {
	node_id?: string;
	node_offset?: { x: number; y: number };
}

/** A comment, as listed by GET /v1/files/:key/comments. */
export interface FigmaComment {
	id: string;
	message: string;
	client_meta: FigmaClientMeta | null;
	created_at: string;
	resolved_at: string | null;
	user: FigmaUser;
	parent_id?: string;
}

/** GET /v1/files/:key/comments */
export interface FigmaCommentsResponse {
	comments: FigmaComment[];
}

/** GET /v1/images/:key — rendered image URLs keyed by node id. */
export interface FigmaImagesResponse {
	err: string | null;
	images: Record<string, string | null>;
}

export interface FigmaImageOptions {
	format?: "jpg" | "png" | "svg" | "pdf";
	scale?: number;
	svg_include_id?: boolean;
}

// ── Outcome union — never throws ──

export type FigmaResult<T> =
	| { kind: "ok"; data: T }
	| { kind: "auth-error" }
	| { kind: "scope-error"; message: string }
	| { kind: "not-found" }
	| { kind: "rate-limited"; retryAfterSeconds: number }
	| { kind: "network-error"; message: string };

export interface FigmaClient {
	getFile(key: string): Promise<FigmaResult<FigmaFile>>;
	getFileNodes(
		key: string,
		ids: string[],
	): Promise<FigmaResult<FigmaFileNodes>>;
	getComponents(key: string): Promise<FigmaResult<FigmaComponentsResponse>>;
	getVersions(key: string): Promise<FigmaResult<FigmaVersionsResponse>>;
	getComments(key: string): Promise<FigmaResult<FigmaCommentsResponse>>;
	postComment(
		key: string,
		message: string,
		clientMeta?: FigmaClientMeta,
	): Promise<FigmaResult<FigmaComment>>;
	getImages(
		key: string,
		ids: string[],
		opts?: FigmaImageOptions,
	): Promise<FigmaResult<FigmaImagesResponse>>;
}

export interface FigmaClientOptions {
	/** Personal access token (Dev/Full seat). Sent as the X-Figma-Token header. */
	token: string;
	/**
	 * API origin (no `/v1` suffix). Defaults to https://api.figma.com. Overridable
	 * so callers (and integration tests) can point at a local recording server;
	 * the CLI reads the FIGMA_API_BASE env var and passes it through. A trailing
	 * slash is stripped so the joined URL never doubles up.
	 */
	baseUrl?: string;
	/** Injectable fetch; defaults to the global fetch at the edge. */
	fetch?: typeof fetch;
	/** Injectable delay; defaults to a real setTimeout-based sleep at the edge. */
	sleep?: (ms: number) => Promise<void>;
	/** Injectable [0,1) jitter source; defaults to Math.random at the edge. */
	jitter?: () => number;
}

const DEFAULT_BASE_URL = "https://api.figma.com";
const MAX_RETRIES = 3;
/** Fallback wait (seconds) when a 429 omits Retry-After. */
const DEFAULT_RETRY_AFTER_SECONDS = 1;

/** Real timer sleep — only used when no sleep is injected. */
function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Encode figma node ids for an `ids=` query param. Ids are comma-joined and the
 * whole list is percent-encoded, so a node id like "1:2" becomes "1%3A2" and the
 * separator becomes "%2C" — exactly what the Figma API expects in the query.
 */
function joinIds(ids: string[]): string {
	return encodeURIComponent(ids.join(","));
}

/** Parse a Retry-After header (seconds form) into a positive number, or fallback. */
function parseRetryAfter(headers: Headers): number {
	const raw = headers.get("Retry-After");
	if (raw === null) return DEFAULT_RETRY_AFTER_SECONDS;
	const seconds = Number.parseInt(raw, 10);
	return Number.isFinite(seconds) && seconds > 0
		? seconds
		: DEFAULT_RETRY_AFTER_SECONDS;
}

/** True when a 403 body indicates a missing OAuth scope rather than a bad token. */
function mentionsScope(body: unknown): boolean {
	const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
	return /scope/i.test(text);
}

export function createFigmaClient(options: FigmaClientOptions): FigmaClient {
	const fetchImpl = options.fetch ?? fetch;
	const sleep = options.sleep ?? defaultSleep;
	const jitter = options.jitter ?? Math.random;
	const { token } = options;
	const origin = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
	const BASE_URL = `${origin}/v1`;

	const baseHeaders: Record<string, string> = { "X-Figma-Token": token };

	/**
	 * Perform a single request with retry-on-429. Returns either an `ok` result
	 * carrying the parsed JSON, or a typed failure. Never throws.
	 */
	async function request<T>(
		url: string,
		init: RequestInit,
	): Promise<FigmaResult<T>> {
		let lastRetryAfter = DEFAULT_RETRY_AFTER_SECONDS;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
			let response: Response;
			try {
				response = await fetchImpl(url, init);
			} catch (error) {
				return {
					kind: "network-error",
					message: error instanceof Error ? error.message : String(error),
				};
			}

			const { status } = response;

			if (status === 429) {
				lastRetryAfter = parseRetryAfter(response.headers);
				if (attempt < MAX_RETRIES) {
					await sleep(lastRetryAfter * 1000 * (1 + jitter()));
					continue;
				}
				return { kind: "rate-limited", retryAfterSeconds: lastRetryAfter };
			}

			if (status === 401) return { kind: "auth-error" };

			if (status === 403) {
				let body: unknown;
				try {
					body = await response.json();
				} catch {
					body = await response.text().catch(() => "");
				}
				if (mentionsScope(body)) {
					const message =
						typeof body === "object" &&
						body !== null &&
						"err" in body &&
						typeof (body as { err: unknown }).err === "string"
							? (body as { err: string }).err
							: "Token is missing a required scope.";
					return { kind: "scope-error", message };
				}
				return { kind: "auth-error" };
			}

			if (status === 404) return { kind: "not-found" };

			if (!response.ok) {
				return {
					kind: "network-error",
					message: `Figma API responded with status ${status}.`,
				};
			}

			try {
				const data = (await response.json()) as T;
				return { kind: "ok", data };
			} catch (error) {
				return {
					kind: "network-error",
					message: error instanceof Error ? error.message : String(error),
				};
			}
		}

		// Unreachable in practice; the 429 branch returns when retries exhaust.
		return { kind: "rate-limited", retryAfterSeconds: lastRetryAfter };
	}

	function get<T>(url: string): Promise<FigmaResult<T>> {
		return request<T>(url, { method: "GET", headers: { ...baseHeaders } });
	}

	return {
		getFile(key) {
			return get<FigmaFile>(`${BASE_URL}/files/${key}`);
		},

		getFileNodes(key, ids) {
			const url = `${BASE_URL}/files/${key}/nodes?ids=${joinIds(ids)}`;
			return get<FigmaFileNodes>(url);
		},

		getComponents(key) {
			return get<FigmaComponentsResponse>(
				`${BASE_URL}/files/${key}/components`,
			);
		},

		getVersions(key) {
			return get<FigmaVersionsResponse>(`${BASE_URL}/files/${key}/versions`);
		},

		getComments(key) {
			return get<FigmaCommentsResponse>(`${BASE_URL}/files/${key}/comments`);
		},

		postComment(key, message, clientMeta) {
			const body =
				clientMeta === undefined
					? { message }
					: { message, client_meta: clientMeta };
			return request<FigmaComment>(`${BASE_URL}/files/${key}/comments`, {
				method: "POST",
				headers: {
					...baseHeaders,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});
		},

		getImages(key, ids, opts) {
			// Build the query by hand: joinIds already percent-encodes the id list,
			// so we must not re-encode it through URLSearchParams (double-encoding).
			const parts = [`ids=${joinIds(ids)}`];
			if (opts?.format !== undefined) parts.push(`format=${opts.format}`);
			if (opts?.scale !== undefined) parts.push(`scale=${opts.scale}`);
			if (opts?.svg_include_id !== undefined) {
				parts.push(`svg_include_id=${opts.svg_include_id}`);
			}
			return get<FigmaImagesResponse>(
				`${BASE_URL}/images/${key}?${parts.join("&")}`,
			);
		},
	};
}
