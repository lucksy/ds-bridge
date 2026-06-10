// M1.1 — `.ds-bridge.env` dotenv auto-load (SPEC-personas §6.1). A dependency-free,
// stdlib-only KEY=VALUE loader (NOT the `dotenv` npm dep — RULES: stdlib-first).
//
// `resolveConfig` reads only its injected `env` (defaulting to `process.env` at
// each command edge). Hydrating a dotenv file into `process.env` BEFORE the program
// parses argv makes every existing precedence rule work unchanged — the file is a
// restart-survival fallback for `CLAUDE_PLUGIN_OPTION_*` values that don't persist
// across sessions (#62442), not an override.
//
// Security: `.ds-bridge.env` holds the Figma PAT. It MUST be gitignored via an
// explicit `.ds-bridge.env` line (the `.env.*` glob does NOT match it), kept out of
// the published tarball, and written 0600 by the persist-token writer (M1.4). This
// module only READS it; it never writes a secret.
import { readFileSync } from "node:fs";

/**
 * PURE dotenv parser. Splits `text` on newlines and, for each line:
 *   • skips blank / whitespace-only lines;
 *   • skips full-line comments (first non-space char is `#`);
 *   • splits on the FIRST `=` (the value may itself contain `=`);
 *   • trims the key; a missing `=` or an empty key is malformed → skipped;
 *   • trims the value, then strips exactly ONE layer of matching surrounding
 *     single OR double quotes (inner quotes are preserved).
 * Never throws — malformed lines are silently dropped. A repeated key takes its
 * last assignment.
 */
export function parseDotenv(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;

		const eq = line.indexOf("=");
		if (eq === -1) continue; // no '=' → malformed, skip

		const key = line.slice(0, eq).trim();
		if (key === "") continue; // empty key → malformed, skip

		out[key] = stripOneQuoteLayer(line.slice(eq + 1).trim());
	}
	return out;
}

/**
 * Strip exactly one layer of matching surrounding single OR double quotes from an
 * already-trimmed value. A value shorter than two chars, or whose ends don't match
 * a quote pair, is returned unchanged (so inner/mismatched/lone quotes survive).
 */
function stripOneQuoteLayer(value: string): string {
	if (value.length < 2) return value;
	const first = value[0];
	const last = value[value.length - 1];
	if ((first === '"' || first === "'") && first === last) {
		return value.slice(1, -1);
	}
	return value;
}

/**
 * Impure apply edge: if `filePath` exists and is readable, parse it and assign each
 * key to `env[key]` ONLY when `env[key]` is currently undefined or the empty string
 * (real env / live plugin-dialog values WIN over the file). A missing/unreadable
 * file is a no-op. NEVER throws — every fs and parse error is swallowed (fail-quiet:
 * this runs at the top of every CLI invocation and must never break the user).
 */
export function loadDotenvInto(filePath: string, env: NodeJS.ProcessEnv): void {
	let text: string;
	try {
		text = readFileSync(filePath, "utf8");
	} catch {
		return; // missing / unreadable / not a file → no-op
	}

	for (const [key, value] of Object.entries(parseDotenv(text))) {
		const current = env[key];
		if (current === undefined || current === "") {
			env[key] = value;
		}
	}
}
