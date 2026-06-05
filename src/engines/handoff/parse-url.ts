// T4.3 — Figma frame-URL parser (PURE: no fs/network/process; never throws).
//
// Figma share URLs come in several shapes — /file, /design, /proto, optional
// /branch/<key> segments, optional ?node-id — sometimes without a scheme when a
// user pastes "figma.com/...". We resolve all of them to a single discriminated
// outcome. The node id is normalized to Figma's canonical colon form ("1-2" and
// "1%3A2" both become "1:2"). Anything that isn't a figma.com URL carrying a key
// degrades to `invalid-url` rather than throwing — bad input is data, not an
// exception.

/** Outcome of parsing a Figma frame URL. Never thrown; always returned. */
export type FigmaUrlOutcome =
	| { kind: "ok"; fileKey: string; nodeId?: string }
	| { kind: "invalid-url"; message: string };

/** Path types that prefix a file key in a Figma URL. */
const KEY_PATH_TYPES = new Set(["file", "design", "proto"]);

/**
 * True only for figma.com and its subdomains (e.g. www.figma.com), never for
 * lookalikes like "figma.com.evil.com" or "notfigma.com".
 */
function isFigmaHost(host: string): boolean {
	const lower = host.toLowerCase();
	return lower === "figma.com" || lower.endsWith(".figma.com");
}

/**
 * Normalize a raw node-id query value to Figma's colon form. The value may
 * arrive dash-separated ("1-2"), already colon-separated ("1:2"), or
 * percent-encoded ("1%3A2"). Returns undefined for an empty value.
 */
function normalizeNodeId(raw: string): string | undefined {
	let value = raw;
	try {
		value = decodeURIComponent(raw);
	} catch {
		// Malformed percent-encoding: fall back to the raw value.
		value = raw;
	}
	if (value.length === 0) return undefined;
	return value.replace(/-/g, ":");
}

const INVALID = (message: string): FigmaUrlOutcome => ({
	kind: "invalid-url",
	message,
});

export function parseFigmaUrl(url: string): FigmaUrlOutcome {
	if (typeof url !== "string") return INVALID("URL must be a string.");

	const trimmed = url.trim();
	if (trimmed.length === 0) return INVALID("URL is empty.");

	// Accept scheme-less inputs ("figma.com/...") by supplying a scheme so the
	// URL parser can do the structural work. https is arbitrary — only the host
	// and path matter to us.
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let parsed: URL;
	try {
		parsed = new URL(withScheme);
	} catch {
		return INVALID(`Not a parseable URL: "${url}".`);
	}

	if (!isFigmaHost(parsed.hostname)) {
		return INVALID(`Not a figma.com URL: "${url}".`);
	}

	const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
	if (segments.length === 0) {
		return INVALID("Figma URL is missing a file key.");
	}

	const [pathType, ...rest] = segments;
	if (pathType === undefined || !KEY_PATH_TYPES.has(pathType)) {
		return INVALID(`Unsupported Figma URL path "/${pathType ?? ""}".`);
	}

	const keySegment = rest[0];
	if (keySegment === undefined || keySegment.length === 0) {
		return INVALID("Figma URL is missing a file key.");
	}

	// Branch URLs nest a second key: /file/<parent>/branch/<branchKey>/... — the
	// branch key is the one we operate against.
	let fileKey: string = keySegment;
	const branchKey = rest[2];
	if (rest[1] === "branch" && branchKey !== undefined && branchKey.length > 0) {
		fileKey = branchKey;
	}

	const nodeIdRaw = parsed.searchParams.get("node-id");
	const nodeId = nodeIdRaw === null ? undefined : normalizeNodeId(nodeIdRaw);

	return nodeId === undefined
		? { kind: "ok", fileKey }
		: { kind: "ok", fileKey, nodeId };
}
