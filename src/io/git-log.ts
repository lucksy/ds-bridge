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

/** Default real-git exec for the CLI edge — wraps spawnSync. */
export function spawnGitExec(args: string[], cwd: string): GitExecResult {
	const run = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (run.error !== undefined) {
		return { status: -1, stdout: "", stderr: "", error: run.error.message };
	}
	return {
		status: run.status ?? -1,
		stdout: run.stdout ?? "",
		stderr: run.stderr ?? "",
	};
}
