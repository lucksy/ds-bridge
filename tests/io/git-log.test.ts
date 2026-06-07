// T7.14 — local git-log reader (impure io edge). The subprocess is INJECTED so
// these unit tests never shell out to a real git — they feed canned `git log`
// output and assert the parse. (The CLI integration test exercises a real temp
// repo for end-to-end determinism.)
//
// The reader runs `git log` with a record/field control-character format so
// subjects containing any punctuation (including the field separator's textual
// cousins) never corrupt the parse: fields are split on \x1f (unit separator)
// and records on \x1e (record separator).
import { describe, expect, it } from "vitest";
import {
	GIT_LOG_FIELD_SEP,
	GIT_LOG_RECORD_SEP,
	type GitExec,
	readFileAtRef,
	readGitLog,
} from "../../src/io/git-log.js";

/** Build one canned record in the reader's expected field order. */
function record(fields: {
	hash: string;
	dateIso: string;
	author: string;
	subject: string;
}): string {
	return [fields.hash, fields.dateIso, fields.author, fields.subject].join(
		GIT_LOG_FIELD_SEP,
	);
}

/** Join canned records into a single git-log stdout blob. */
function stdout(records: string[]): string {
	return records.map((r) => `${r}${GIT_LOG_RECORD_SEP}`).join("");
}

/** A GitExec double that returns canned output and records the args it saw. */
function fakeExec(result: {
	stdout?: string;
	status?: number;
	error?: string;
}): { exec: GitExec; calls: { args: string[]; cwd: string }[] } {
	const calls: { args: string[]; cwd: string }[] = [];
	const exec: GitExec = (args, cwd) => {
		calls.push({ args, cwd });
		return {
			status: result.status ?? 0,
			stdout: result.stdout ?? "",
			stderr: "",
			...(result.error !== undefined ? { error: result.error } : {}),
		};
	};
	return { exec, calls };
}

describe("readGitLog — parsing", () => {
	it("parses a single commit record into a GitCommit", () => {
		const { exec } = fakeExec({
			stdout: stdout([
				record({
					hash: "abc1234",
					dateIso: "2026-06-04T18:22:10+00:00",
					author: "Avery Nakamura",
					subject: "feat: add date picker",
				}),
			]),
		});
		const result = readGitLog({ exec, cwd: "/repo", since: "2026-01-01" });
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.commits).toEqual([
			{
				hash: "abc1234",
				dateIso: "2026-06-04T18:22:10+00:00",
				author: "Avery Nakamura",
				subject: "feat: add date picker",
			},
		]);
	});

	it("parses multiple records in order", () => {
		const { exec } = fakeExec({
			stdout: stdout([
				record({
					hash: "aaa",
					dateIso: "2026-06-04T10:00:00+00:00",
					author: "A",
					subject: "feat: newer",
				}),
				record({
					hash: "bbb",
					dateIso: "2026-06-01T10:00:00+00:00",
					author: "B",
					subject: "fix: older",
				}),
			]),
		});
		const result = readGitLog({ exec, cwd: "/repo", since: "2026-01-01" });
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.commits.map((c) => c.hash)).toEqual(["aaa", "bbb"]);
	});

	it("preserves a multi-line subject (body + footers) intact", () => {
		const subject =
			"refactor: tidy theme\n\nBREAKING CHANGE: theme tokens renamed";
		const { exec } = fakeExec({
			stdout: stdout([
				record({
					hash: "ccc",
					dateIso: "2026-06-04T10:00:00+00:00",
					author: "C",
					subject,
				}),
			]),
		});
		const result = readGitLog({ exec, cwd: "/repo", since: "2026-01-01" });
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.commits[0]?.subject).toBe(subject);
	});

	it("returns an empty list when git produces no output", () => {
		const { exec } = fakeExec({ stdout: "" });
		const result = readGitLog({ exec, cwd: "/repo", since: "2026-01-01" });
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.commits).toEqual([]);
	});

	it("ignores trailing whitespace / a stray final newline", () => {
		const { exec } = fakeExec({
			stdout: `${stdout([
				record({
					hash: "ddd",
					dateIso: "2026-06-04T10:00:00+00:00",
					author: "D",
					subject: "chore: bump",
				}),
			])}\n`,
		});
		const result = readGitLog({ exec, cwd: "/repo", since: "2026-01-01" });
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.commits).toHaveLength(1);
	});
});

describe("readGitLog — invocation", () => {
	it("invokes git log with --since and the control-char pretty format in cwd", () => {
		const { exec, calls } = fakeExec({ stdout: "" });
		readGitLog({ exec, cwd: "/my/repo", since: "2026-01-01" });
		expect(calls).toHaveLength(1);
		const call = calls[0];
		expect(call?.cwd).toBe("/my/repo");
		expect(call?.args[0]).toBe("log");
		expect(call?.args).toContain("--since=2026-01-01");
		// The pretty format carries both separators so the parse is unambiguous.
		const pretty = call?.args.find((a) => a.startsWith("--pretty="));
		expect(pretty).toBeDefined();
		expect(pretty).toContain(GIT_LOG_FIELD_SEP);
		expect(pretty).toContain(GIT_LOG_RECORD_SEP);
	});
});

describe("readGitLog — failure modes (typed, never throws)", () => {
	it("returns not-a-repo when git exits non-zero", () => {
		const { exec } = fakeExec({ status: 128 });
		const result = readGitLog({
			exec,
			cwd: "/not/a/repo",
			since: "2026-01-01",
		});
		expect(result.kind).toBe("not-a-repo");
	});

	it("returns git-unavailable when the exec itself errors (ENOENT)", () => {
		const { exec } = fakeExec({ status: -1, error: "spawn git ENOENT" });
		const result = readGitLog({ exec, cwd: "/repo", since: "2026-01-01" });
		expect(result.kind).toBe("git-unavailable");
	});

	it("skips a malformed record that is missing required fields", () => {
		const { exec } = fakeExec({
			stdout: `bad-record-no-separators${GIT_LOG_RECORD_SEP}${record({
				hash: "good",
				dateIso: "2026-06-04T10:00:00+00:00",
				author: "G",
				subject: "feat: real",
			})}${GIT_LOG_RECORD_SEP}`,
		});
		const result = readGitLog({ exec, cwd: "/repo", since: "2026-01-01" });
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		// Only the well-formed record survives.
		expect(result.commits.map((c) => c.hash)).toEqual(["good"]);
	});
});

/**
 * Two-step GitExec double for readFileAtRef: the helper runs
 * `git rev-parse --show-prefix` then `git show`. This double dispatches a canned
 * result per first-arg (mirroring the canned-output style of fakeExec) and
 * records every call so the prefix path-joining and cwd seam can be asserted.
 */
type FakeStep = {
	stdout?: string;
	stderr?: string;
	status?: number;
	error?: string;
};

function fakeShowExec(steps: { revParse?: FakeStep; show?: FakeStep }): {
	exec: GitExec;
	calls: { args: string[]; cwd: string }[];
} {
	const calls: { args: string[]; cwd: string }[] = [];
	const exec: GitExec = (args, cwd) => {
		calls.push({ args, cwd });
		const step = args[0] === "rev-parse" ? steps.revParse : steps.show;
		return {
			status: step?.status ?? 0,
			stdout: step?.stdout ?? "",
			stderr: step?.stderr ?? "",
			...(step?.error !== undefined ? { error: step.error } : {}),
		};
	};
	return { exec, calls };
}

describe("readFileAtRef — invocation (the injectable git seam)", () => {
	it("rev-parses the prefix then shows <ref>:<prefix><path> in the given cwd", () => {
		const { exec, calls } = fakeShowExec({
			revParse: { stdout: "" },
			show: { stdout: "line one\nline two\n" },
		});
		const result = readFileAtRef({
			ref: "origin/main",
			path: ".ds-bridge/history.jsonl",
			cwd: "/target/dir",
			exec,
		});
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") return;
		expect(result.text).toBe("line one\nline two\n");
		expect(calls).toHaveLength(2);
		expect(calls[0]?.args).toEqual(["rev-parse", "--show-prefix"]);
		expect(calls[0]?.cwd).toBe("/target/dir");
		// Root cwd → empty prefix → no prefix prepended to the pathspec.
		expect(calls[1]?.args).toEqual([
			"show",
			"origin/main:.ds-bridge/history.jsonl",
		]);
		expect(calls[1]?.cwd).toBe("/target/dir");
	});

	it("prepends the repo-root-relative prefix when cwd is a subdirectory", () => {
		// A non-root cwd (e.g. a web/ subpackage) → rev-parse reports "web/" and the
		// pathspec must be ROOT-relative: <ref>:web/.ds-bridge/history.jsonl.
		const { exec, calls } = fakeShowExec({
			revParse: { stdout: "web/\n" },
			show: { stdout: "data\n" },
		});
		const result = readFileAtRef({
			ref: "abc123",
			path: ".ds-bridge/history.jsonl",
			cwd: "/repo/web",
			exec,
		});
		expect(result.kind).toBe("ok");
		expect(calls[1]?.args).toEqual([
			"show",
			"abc123:web/.ds-bridge/history.jsonl",
		]);
	});
});

describe("readFileAtRef — classifier (stderr-string only, never throws)", () => {
	it("classifies the does-not-exist-in stderr as missing", () => {
		const { exec } = fakeShowExec({
			revParse: { stdout: "" },
			show: {
				status: 128,
				stderr:
					"fatal: path '.ds-bridge/history.jsonl' does not exist in 'origin/main'\n",
			},
		});
		const result = readFileAtRef({
			ref: "origin/main",
			path: ".ds-bridge/history.jsonl",
			cwd: "/repo",
			exec,
		});
		expect(result.kind).toBe("missing");
	});

	it("classifies the exists-on-disk-but-not-in stderr as missing (the realistic case: committed .ds-bridge/ exists on disk)", () => {
		const { exec } = fakeShowExec({
			revParse: { stdout: "" },
			show: {
				status: 128,
				stderr:
					"fatal: path '.ds-bridge/history.jsonl' exists on disk, but not in 'origin/main'\n",
			},
		});
		const result = readFileAtRef({
			ref: "origin/main",
			path: ".ds-bridge/history.jsonl",
			cwd: "/repo",
			exec,
		});
		expect(result.kind).toBe("missing");
	});

	it("classifies an invalid object name (bad ref) as git-error", () => {
		const { exec } = fakeShowExec({
			revParse: { stdout: "" },
			show: {
				status: 128,
				stderr: "fatal: invalid object name 'nope'.\n",
			},
		});
		const result = readFileAtRef({
			ref: "nope",
			path: ".ds-bridge/history.jsonl",
			cwd: "/repo",
			exec,
		});
		expect(result.kind).toBe("git-error");
		if (result.kind !== "git-error") return;
		expect(result.message).toContain("invalid object name");
	});

	it("classifies a bad-revision stderr as git-error", () => {
		const { exec } = fakeShowExec({
			revParse: { stdout: "" },
			show: {
				status: 128,
				stderr: "fatal: bad revision 'HEAD~999'\n",
			},
		});
		const result = readFileAtRef({
			ref: "HEAD~999",
			path: ".ds-bridge/history.jsonl",
			cwd: "/repo",
			exec,
		});
		expect(result.kind).toBe("git-error");
	});

	it("classifies an ambiguous-argument stderr as git-error", () => {
		const { exec } = fakeShowExec({
			revParse: { stdout: "" },
			show: {
				status: 128,
				stderr: "fatal: ambiguous argument 'foo': unknown revision\n",
			},
		});
		const result = readFileAtRef({
			ref: "foo",
			path: ".ds-bridge/history.jsonl",
			cwd: "/repo",
			exec,
		});
		expect(result.kind).toBe("git-error");
	});

	it("classifies a not-a-git-repository failure (from rev-parse) as git-error", () => {
		const { exec, calls } = fakeShowExec({
			revParse: {
				status: 128,
				stderr:
					"fatal: not a git repository (or any of the parent directories)\n",
			},
		});
		const result = readFileAtRef({
			ref: "origin/main",
			path: ".ds-bridge/history.jsonl",
			cwd: "/not/a/repo",
			exec,
		});
		expect(result.kind).toBe("git-error");
		// rev-parse failed → never reaches `git show`.
		expect(calls).toHaveLength(1);
	});

	it("classifies an unrecognized stderr conservatively as git-error", () => {
		const { exec } = fakeShowExec({
			revParse: { stdout: "" },
			show: {
				status: 128,
				stderr: "fatal: something nobody anticipated\n",
			},
		});
		const result = readFileAtRef({
			ref: "origin/main",
			path: ".ds-bridge/history.jsonl",
			cwd: "/repo",
			exec,
		});
		expect(result.kind).toBe("git-error");
	});

	it("classifies error!==undefined (git absent, status -1) as git-error — mirrors readGitLog's ENOENT case", () => {
		const { exec } = fakeShowExec({
			revParse: { stdout: "" },
			show: { status: -1, error: "spawn git ENOENT" },
		});
		const result = readFileAtRef({
			ref: "origin/main",
			path: ".ds-bridge/history.jsonl",
			cwd: "/repo",
			exec,
		});
		expect(result.kind).toBe("git-error");
		if (result.kind !== "git-error") return;
		expect(result.message).toContain("ENOENT");
	});

	it("classifies git-absent at the rev-parse step (status -1, error set) as git-error without reaching show", () => {
		const { exec, calls } = fakeShowExec({
			revParse: { status: -1, error: "spawn git ENOENT" },
		});
		const result = readFileAtRef({
			ref: "origin/main",
			path: ".ds-bridge/history.jsonl",
			cwd: "/repo",
			exec,
		});
		expect(result.kind).toBe("git-error");
		if (result.kind !== "git-error") return;
		expect(result.message).toContain("ENOENT");
		// rev-parse never ran git → never reaches `git show`.
		expect(calls).toHaveLength(1);
	});
});
