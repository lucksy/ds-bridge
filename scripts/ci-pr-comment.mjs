#!/usr/bin/env node
// Post or update the ds-bridge scorecard comment on a pull request.
// Dependency-free (uses the `gh` CLI); used by .github/actions/ds-bridge-record.
//
//   node scripts/ci-pr-comment.mjs --repo owner/name --pr 12 --body-file scorecard.md
//
// Exactly ONE comment per pull request, found by a hidden marker AND written by
// the token's own account — a comment anyone else starts with the marker is
// never edited (and never stops ours from being posted). The body is capped
// below GitHub's 65,536-character limit. A failed post is reported as a
// workflow warning and exit 1, so the caller can tell it apart from the gate.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "<!-- ds-bridge-scorecard -->";
/** The account behind the default GITHUB_TOKEN (`gh api user` is denied to it). */
export const ACTIONS_BOT = "github-actions[bot]";
const MAX_BODY = 65_000;

/**
 * Pure: the id of OUR existing scorecard comment, or undefined.
 * @param {{ id: number, login: string, body: string }[]} comments
 */
export function findOwnComment(comments, login) {
	return comments.find((c) => c.login === login && c.body.startsWith(MARKER))
		?.id;
}

/** Pure: marker + scorecard, truncated with a note when over the limit. */
export function commentBody(scorecard) {
	const body = `${MARKER}\n${scorecard}`;
	if (body.length <= MAX_BODY) return body;
	return `${body.slice(0, MAX_BODY)}\n\n… (truncated — the full scorecard is in the job log)\n`;
}

function gh(args) {
	const run = spawnSync("gh", args, { encoding: "utf8" });
	return {
		ok: run.status === 0,
		stdout: run.stdout ?? "",
		stderr: (run.stderr ?? "").trim() || String(run.error ?? ""),
	};
}

function fail(message) {
	process.stdout.write(`::warning::ds-bridge scorecard comment: ${message}\n`);
	process.exit(1);
}

function main(opts) {
	const { repo, pr } = opts;
	if (!repo || !/^\d+$/.test(pr ?? ""))
		fail("--repo and a numeric --pr are required");
	const scorecard = readFileSync(opts["body-file"], "utf8");

	const me = gh(["api", "user", "--jq", ".login"]);
	const login =
		me.ok && me.stdout.trim() !== "" ? me.stdout.trim() : ACTIONS_BOT;

	const listed = gh([
		"api",
		`repos/${repo}/issues/${pr}/comments`,
		"--paginate",
		"--jq",
		'.[] | {id, login: .user.login, body: (.body // "")[0:64]}',
	]);
	if (!listed.ok) fail(`could not list comments (${listed.stderr})`);
	const comments = listed.stdout
		.split("\n")
		.filter((l) => l.trim() !== "")
		.map((l) => JSON.parse(l));

	const payload = join(
		mkdtempSync(join(tmpdir(), "ds-bridge-comment-")),
		"body.json",
	);
	writeFileSync(
		payload,
		JSON.stringify({ body: commentBody(scorecard) }),
		"utf8",
	);
	const id = findOwnComment(comments, login);
	const posted =
		id !== undefined
			? gh([
					"api",
					"--method",
					"PATCH",
					`repos/${repo}/issues/comments/${id}`,
					"--input",
					payload,
				])
			: gh([
					"api",
					"--method",
					"POST",
					`repos/${repo}/issues/${pr}/comments`,
					"--input",
					payload,
				]);
	if (!posted.ok)
		fail(
			`could not ${id !== undefined ? "update" : "post"} the comment (${posted.stderr})`,
		);
	process.stdout.write(
		`${id !== undefined ? "updated" : "posted"} the scorecard comment\n`,
	);
}

const isMain =
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const opts = {};
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i += 2) {
		if (argv[i]?.startsWith("--")) opts[argv[i].slice(2)] = argv[i + 1];
	}
	main(opts);
}
