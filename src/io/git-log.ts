// T7.14 — local git-log reader. Impure io edge: it shells out to `git log`.
// The subprocess is INJECTABLE (the `exec` fn) so the parse logic is unit-tested
// against canned output and never depends on a real git in unit tests. No
// GitHub API — code-side history is purely local git (SPEC §11.4).
//
// Output is requested with a control-character pretty format: fields are joined
// with the ASCII unit separator (\x1f) and records terminated with the record
// separator (\x1e). These bytes never occur in commit messages, so a subject
// containing any punctuation parses unambiguously.
import { spawnSync } from "node:child_process";
import type { GitCommit } from "../engines/changelog/aggregate.js";

/** ASCII unit separator — between fields of one commit record. */
export const GIT_LOG_FIELD_SEP = "\x1f";
/** ASCII record separator — terminates each commit record. */
export const GIT_LOG_RECORD_SEP = "\x1e";

/** Field order in the pretty format: hash, author-date (ISO strict), author, subject+body. */
const PRETTY_FORMAT = `--pretty=format:%H${GIT_LOG_FIELD_SEP}%aI${GIT_LOG_FIELD_SEP}%an${GIT_LOG_FIELD_SEP}%B${GIT_LOG_RECORD_SEP}`;

/** The result of running the injected git subprocess. */
export interface GitExecResult {
	/** Exit status; -1 (or any negative) signals the process never ran. */
	status: number;
	stdout: string;
	stderr: string;
	/** Present when spawning failed entirely (e.g. git not installed). */
	error?: string;
}

/** Injectable git runner: given args and a cwd, returns the run result. */
export type GitExec = (args: string[], cwd: string) => GitExecResult;

export interface ReadGitLogInput {
	/** Injectable subprocess runner; the CLI passes a real spawnSync wrapper. */
	exec: GitExec;
	/** Repository directory to run `git log` in. */
	cwd: string;
	/** `--since` boundary (any git-understood date string, e.g. an ISO date). */
	since: string;
}

export type ReadGitLogResult =
	| { kind: "ok"; commits: GitCommit[] }
	| { kind: "not-a-repo" }
	| { kind: "git-unavailable"; message: string };

/** Parse one record's fields into a GitCommit, or undefined when malformed. */
function parseRecord(record: string): GitCommit | undefined {
	const fields = record.split(GIT_LOG_FIELD_SEP);
	if (fields.length < 4) return undefined;
	const [hash, dateIso, author, ...subjectParts] = fields;
	if (
		hash === undefined ||
		hash === "" ||
		dateIso === undefined ||
		author === undefined
	) {
		return undefined;
	}
	// %B can itself contain field-sep-free newlines; re-join in case a body line
	// ever held a stray separator (defensive — git's %B never emits \x1f).
	const subject = subjectParts.join(GIT_LOG_FIELD_SEP).replace(/\n+$/, "");
	return { hash, dateIso, author, subject };
}

/**
 * Read local git commits since a date. Never throws — a missing repo or absent
 * git surface as typed outcomes the CLI translates to exit codes.
 */
export function readGitLog(input: ReadGitLogInput): ReadGitLogResult {
	const args = ["log", `--since=${input.since}`, PRETTY_FORMAT];
	const run = input.exec(args, input.cwd);

	if (run.error !== undefined) {
		return { kind: "git-unavailable", message: run.error };
	}
	if (run.status !== 0) {
		return { kind: "not-a-repo" };
	}

	const commits: GitCommit[] = [];
	for (const raw of run.stdout.split(GIT_LOG_RECORD_SEP)) {
		const record = raw.replace(/^\n+/, "");
		if (record.trim() === "") continue;
		const commit = parseRecord(record);
		if (commit !== undefined) commits.push(commit);
	}
	return { kind: "ok", commits };
}

export interface ReadFileAtRefInput {
	/** Git revision to read from (e.g. a base branch like `origin/main`). */
	ref: string;
	/** Path to read, given relative to the caller's `cwd` (e.g. `.ds-bridge/history.jsonl`). */
	path: string;
	/**
	 * The directory to run git in. This MUST be the caller-resolved target
	 * directory (the report command's resolved `[path]`), NOT `process.cwd()`.
	 *
	 * The changelog command's `processCwd()` precedent (changelog.ts:83) is WRONG
	 * for this helper: report can target a repo elsewhere on disk, so anchoring to
	 * the process cwd would `git show` the wrong repository — or none at all. We
	 * anchor to the caller's targetDir so the committed `.ds-bridge/` we compare
	 * against is the one inside the repo the report actually describes.
	 *
	 * Because `cwd` may be a subdirectory of the repo, the pathspec for `git show`
	 * must be repo-ROOT-relative: we first `git rev-parse --show-prefix` to learn
	 * the cwd's offset from the root and prepend it to `path`.
	 */
	cwd: string;
	/** Injectable subprocess runner; the CLI passes the real spawnSync wrapper. */
	exec: GitExec;
}

export type ReadFileAtRefResult =
	| { kind: "ok"; text: string }
	| { kind: "missing" }
	| { kind: "git-error"; message: string };

/**
 * Classify a failed `git show`/`git rev-parse` run into a typed outcome from its
 * STDERR STRING ONLY (per SPEC §1.1, empirically critic-tested: every failure
 * exits 128 identically, so the exit code carries no signal — the stderr text
 * is the only discriminator).
 *
 * - `error !== undefined` (git absent, status −1) → git-error.
 * - stderr contains `does not exist in` OR `exists on disk, but not in` → missing
 *   (the file simply isn't committed at that ref; the second string is the
 *   realistic case since the committed `.ds-bridge/` dir exists on disk).
 * - stderr names a repo/ref problem (`not a git repository` / `invalid object
 *   name` / `bad revision` / `ambiguous argument`) → git-error.
 * - any unrecognized stderr → git-error (conservative: never silently treat an
 *   unknown failure as a benign missing-baseline).
 */
function classifyGitFailure(run: GitExecResult): {
	kind: "missing" | "git-error";
	message: string;
} {
	if (run.error !== undefined) {
		return { kind: "git-error", message: run.error };
	}
	const stderr = run.stderr;
	if (
		stderr.includes("does not exist in") ||
		stderr.includes("exists on disk, but not in")
	) {
		return { kind: "missing", message: stderr };
	}
	// All other stderr — known repo/ref problems and anything unrecognized — is a
	// git-error. (We don't need to enumerate the known strings to decide: they all
	// map to git-error, exactly like the conservative default.)
	return { kind: "git-error", message: stderr.trim() };
}

/**
 * Read a file's committed contents at a git ref through the injectable `GitExec`
 * seam — used to fetch the base ref's `.ds-bridge/` state for the scorecard delta
 * (SPEC §1.1). Two-step: `git rev-parse --show-prefix` to make the pathspec
 * repo-root-relative, then `git show <ref>:<prefix><path>`.
 *
 * Never throws: a missing file, a bad ref, a non-repo cwd, or an absent git all
 * surface as typed outcomes the caller translates to exit codes (missing →
 * no-baseline note, exit 0; git-error → exit 2).
 */
export function readFileAtRef(input: ReadFileAtRefInput): ReadFileAtRefResult {
	const { ref, path, cwd, exec } = input;
	// The ref comes from the CLI or a committed rollup.json. A leading "-"
	// would make `git show` read it as an OPTION (e.g. `--output=<file>` writes
	// a file); whitespace, ":" or control characters are never part of a ref.
	if (!isSafeRef(ref)) {
		return { kind: "git-error", message: `"${ref}" is not a valid git ref` };
	}

	const prefixRun = exec(["rev-parse", "--show-prefix"], cwd);
	if (prefixRun.error !== undefined || prefixRun.status !== 0) {
		const { kind, message } = classifyGitFailure(prefixRun);
		return kind === "missing" ? { kind: "missing" } : { kind, message };
	}
	// `--show-prefix` prints "" at the root and "<subdir>/\n" otherwise.
	const prefix = prefixRun.stdout.trim();

	const showRun = exec(["show", `${ref}:${prefix}${path}`], cwd);
	if (showRun.error !== undefined || showRun.status !== 0) {
		const { kind, message } = classifyGitFailure(showRun);
		return kind === "missing" ? { kind: "missing" } : { kind, message };
	}
	return { kind: "ok", text: showRun.stdout };
}

/**
 * A ref safe to pass to git as a revision: non-empty, not option-like (no
 * leading "-"), and free of whitespace, ":" and control characters.
 */
export function isSafeRef(ref: string): boolean {
	return (
		ref !== "" && !ref.startsWith("-") && !/[\s:\u0000-\u001f\u007f]/.test(ref)
	);
}

/** stdout cap for one git run (256 MiB) — well above any realistic history. */
export const GIT_MAX_BUFFER = 256 * 1024 * 1024;

/** Default real-git exec for the CLI edge — wraps spawnSync. */
export function spawnGitExec(args: string[], cwd: string): GitExecResult {
	// Node's spawnSync default maxBuffer is 1 MiB; a CI history on a data branch
	// passes that after a few thousand records (`git show <ref>:history.jsonl`).
	const run = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		maxBuffer: GIT_MAX_BUFFER,
	});
	if (run.error !== undefined) {
		return { status: -1, stdout: "", stderr: "", error: run.error.message };
	}
	return {
		status: run.status ?? -1,
		stdout: run.stdout ?? "",
		stderr: run.stderr ?? "",
	};
}
