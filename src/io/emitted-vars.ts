// The custom properties a project's build emits for its tokens (io edge).
//
// Token paths rarely equal CSS names: Figma's Simple Design System emits
// `@size.space.400` as `--sds-size-space-400`. Lint's --fix, its suggestions
// and `tokens parse` must name the variable the build actually writes, so this
// scans the project's CSS / SCSS for custom properties and aligns them with
// the token paths the same way `tokens check` does.
import type { Dirent } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { alignTokenKeys, nameKey } from "../engines/tokens/align-names.js";
import { scanOutputs } from "../engines/tokens/scan-outputs.js";
import type { Token } from "../engines/tokens/types.js";

const EXCLUDED_DIRS = new Set([
	"node_modules",
	".git",
	".ds-bridge",
	"dist",
	"build",
	"out",
	".next",
	"coverage",
	"storybook-static",
]);

function walkStyles(dir: string, acc: string[]): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!EXCLUDED_DIRS.has(entry.name)) walkStyles(full, acc);
		} else if (entry.isFile() && /\.(?:css|scss)$/i.test(entry.name)) {
			acc.push(full);
		}
	}
}

/**
 * A lookup from token to the custom property name (without `--`) the build
 * emits it as; undefined for a token the build does not emit. The lookup
 * itself is undefined when no built output was found, so callers can tell
 * "the build is unknown" from "the build does not emit this token".
 */
export function emittedVarNames(
	projectDir: string,
	tokens: readonly Token[],
): ((token: Token) => string | undefined) | undefined {
	const files: string[] = [];
	walkStyles(projectDir, files);
	const names: string[] = [];
	for (const file of files.sort()) {
		let content: string;
		try {
			content = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const scanned = scanOutputs({ path: file, content });
		if (scanned.kind === "ok") names.push(...scanned.values.map((v) => v.name));
	}
	if (names.length === 0) return undefined;
	const actual = new Map(names.map((n) => [nameKey(n), n]));
	const alignment = alignTokenKeys(
		tokens.map((t) => t.name),
		names,
	);
	return (token) => actual.get(alignment.key(token.name));
}
