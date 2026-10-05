// R1 — rollup source + config parsing (SPEC-rollup §2). PURE: strings in →
// typed source specs / config entries out. The only "world" input is the
// injected `exists` predicate, so a real on-disk path is never split at an `@`.

/** One parsed source: a path (dir or history file), optionally pinned to a git ref. */
export interface SourceSpec {
	path: string;
	ref?: string;
	/**
	 * How the user wrote the path (CLI arg / config `source`, without `@ref`).
	 * Loader notes use it instead of the resolved absolute path, so shared
	 * renderings (md / html) never leak local filesystem layout.
	 */
	label?: string;
}

/** One `.ds-bridge/rollup.json` entry. */
export interface RollupConfigEntry {
	name: string;
	source: string;
	team?: string;
}

export type RollupConfigOutcome =
	| { kind: "ok"; entries: RollupConfigEntry[] }
	| { kind: "error"; message: string };

/**
 * Parse a `<path>` or `<path>@<git-ref>` argument. A raw string that exists on
 * disk is always a path; otherwise it splits at the LAST `@` when both sides are
 * non-empty (refs such as `origin/ds-bridge-data` contain slashes, paths rarely
 * contain `@`); otherwise it is a path (missing — the loader notes it).
 */
export function parseSourceArg(
	raw: string,
	exists: (path: string) => boolean,
): SourceSpec {
	if (exists(raw)) return { path: raw };
	const at = raw.lastIndexOf("@");
	if (at > 0 && at < raw.length - 1) {
		return { path: raw.slice(0, at), ref: raw.slice(at + 1) };
	}
	return { path: raw };
}

const HISTORY_EXT = /\.jsonl?$/i;

function segments(path: string): string[] {
	return path.split(/[\\/]+/).filter((s) => s !== "" && s !== ".");
}

/**
 * The display name for a source with no configured name: a directory's
 * basename; for `<repo>/.ds-bridge/<file>` the repo directory; for any other
 * history file (`.json` / `.jsonl`) its basename without that extension. Only a
 * history extension is stripped, so a dotted directory (`web.app`) keeps its name.
 */
export function defaultName(spec: SourceSpec): string {
	const parts = segments(spec.path);
	const last = parts[parts.length - 1] ?? spec.path;
	if (spec.ref === undefined && HISTORY_EXT.test(last)) {
		const parent = parts[parts.length - 2];
		const grand = parts[parts.length - 3];
		if (parent === ".ds-bridge" && grand !== undefined) return grand;
		return last.replace(HISTORY_EXT, "");
	}
	return last;
}

/** Make names unique in input order: the second `web` becomes `web (2)`. */
export function uniqueNames(names: readonly string[]): string[] {
	const seen = new Map<string, number>();
	return names.map((name) => {
		const count = (seen.get(name) ?? 0) + 1;
		seen.set(name, count);
		return count === 1 ? name : `${name} (${count})`;
	});
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

/** Parse `.ds-bridge/rollup.json`: `[{name, source, team?}]`; unknown keys ignored. */
export function parseRollupConfig(text: string): RollupConfigOutcome {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `rollup config is not valid JSON: ${detail}`,
		};
	}
	if (!Array.isArray(parsed)) {
		return {
			kind: "error",
			message:
				'rollup config must be an array of {"name", "source", "team"?} entries.',
		};
	}
	const entries: RollupConfigEntry[] = [];
	for (let i = 0; i < parsed.length; i += 1) {
		const raw: unknown = parsed[i];
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			return {
				kind: "error",
				message: `rollup config [${i}] must be an object.`,
			};
		}
		const entry = raw as Record<string, unknown>;
		if (!nonEmptyString(entry.name)) {
			return {
				kind: "error",
				message: `rollup config [${i}].name must be a non-empty string.`,
			};
		}
		if (!nonEmptyString(entry.source)) {
			return {
				kind: "error",
				message: `rollup config [${i}].source must be a non-empty string.`,
			};
		}
		if (entry.team !== undefined && !nonEmptyString(entry.team)) {
			return {
				kind: "error",
				message: `rollup config [${i}].team must be a non-empty string when set.`,
			};
		}
		const out: RollupConfigEntry = { name: entry.name, source: entry.source };
		if (entry.team !== undefined) out.team = entry.team as string;
		entries.push(out);
	}
	return { kind: "ok", entries };
}
