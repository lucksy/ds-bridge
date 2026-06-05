// T1.7 — severity coloring + color-enable detection.
// PURE: severityColor takes an explicit { color } option and never reads the
// environment itself. shouldColor takes an injected env + isTTY so callers at
// the impure edge decide once and pass a boolean down.
import pc from "picocolors";

/** Forced-on color instance: we gate on the caller's boolean, not pc's own env sniffing. */
const colors = pc.createColors(true);

export type Severity = "error" | "warn" | "info" | "ok";

export interface ColorOptions {
	color: boolean;
}

const PALETTE: Record<Severity, (input: string) => string> = {
	error: (s) => colors.red(s),
	warn: (s) => colors.yellow(s),
	info: (s) => colors.cyan(s),
	ok: (s) => colors.green(s),
};

/**
 * Wrap `text` in the ANSI color for `level` when `color` is on; return it
 * unchanged otherwise. error→red, warn→yellow, info→cyan, ok→green.
 */
export function severityColor(
	level: Severity,
	text: string,
	opts: ColorOptions,
): string {
	if (!opts.color) return text;
	return PALETTE[level](text);
}

const FORCE_OFF = new Set(["0", "false"]);

/**
 * Decide whether ANSI color should be emitted, given an injected environment
 * map and whether the output stream is a TTY.
 *
 * Precedence: NO_COLOR (non-empty) disables → FORCE_COLOR (non-"0"/"false")
 * enables → CI disables → otherwise follow isTTY.
 */
export function shouldColor(
	env: Record<string, string | undefined>,
	isTTY: boolean,
): boolean {
	const noColor = env.NO_COLOR;
	if (noColor !== undefined && noColor !== "") return false;

	const force = env.FORCE_COLOR;
	if (force !== undefined && force !== "" && !FORCE_OFF.has(force)) return true;

	if (env.CI !== undefined && env.CI !== "") return false;

	return isTTY;
}
