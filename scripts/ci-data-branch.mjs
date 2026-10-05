#!/usr/bin/env node
// H8 — CI history store on a data branch (SPEC-history-v2 §4, PLAN §6.2).
// Dependency-free; used by .github/actions/ds-bridge-record.
//
//   node scripts/ci-data-branch.mjs seed    --branch ds-bridge-data --file .ds-bridge/history.jsonl
//   node scripts/ci-data-branch.mjs publish --branch ds-bridge-data --file .ds-bridge/history.jsonl \
//        [--default-branch main] [--remote origin] [--message "…"]
//
// seed:    fetch <remote>/<branch>; if it holds the history file (same repo-
//          relative path), copy it over the working-tree file so `record`
//          appends to the CI series. Missing branch → the working-tree file (or
//          nothing) is the start. Saves {tip, seeded} to a state file for publish.
// publish: commit the history file onto <branch> with git PLUMBING — a temporary
//          index seeded from the branch tip (other files on the branch are kept),
//          hash-object + update-index + write-tree + commit-tree — then push
//          <commit>:refs/heads/<branch>. The working tree, HEAD and the default
//          branch are never touched. A rejected push (someone else recorded) is
//          retried up to 3 times by re-fetching and appending OUR new lines onto
//          the remote file (append-only merge). Refuses main/master/the default
//          branch outright.
//
// Exit codes: 0 ok (incl. nothing to publish) · 1 refused / failed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_ATTEMPTS = 3;

/** Parse `--key value` pairs after the subcommand. */
export function parseArgs(argv) {
	const [command, ...rest] = argv;
	const opts = {};
	for (let i = 0; i < rest.length; i += 1) {
		const key = rest[i];
		if (!key.startsWith("--")) continue;
		opts[key.slice(2)] = rest[i + 1];
		i += 1;
	}
	return { command, opts };
}

/** A data branch must be a plain branch name that is never the default branch. */
export function validateDataBranch(branch, defaultBranch) {
	if (typeof branch !== "string" || branch.trim() === "") {
		return "a --branch is required";
	}
	if (branch.startsWith("-") || /[\s~^:?*[\\]|\.\.|@\{/.test(branch)) {
		return `"${branch}" is not a valid branch name`;
	}
	const forbidden = new Set(["main", "master"]);
	if (defaultBranch) forbidden.add(defaultBranch);
	if (forbidden.has(branch)) {
		return `refusing to write history to "${branch}" — the data branch must not be the default branch`;
	}
	return undefined;
}

/**
 * Append-only merge for a retried push: the remote moved on since we seeded, so
 * re-apply OUR appended lines (current minus the seeded prefix) onto the
 * remote's file. If current does not start with the seed (should not happen),
 * fall back to the lines of current that the seed did not contain.
 */
export function appendOnlyMerge(remoteText, seededText, currentText) {
	let appended;
	if (currentText.startsWith(seededText)) {
		appended = currentText.slice(seededText.length);
	} else {
		const seen = new Set(seededText.split("\n"));
		appended = currentText
			.split("\n")
			.filter((l) => l.trim() !== "" && !seen.has(l))
			.map((l) => `${l}\n`)
			.join("");
	}
	const base =
		remoteText === "" || remoteText.endsWith("\n")
			? remoteText
			: `${remoteText}\n`;
	return base + appended;
}

function git(args, { cwd, input, env } = {}) {
	const run = spawnSync("git", args, {
		cwd,
		input,
		encoding: "utf8",
		env: { ...process.env, ...env },
	});
	return {
		ok: run.status === 0,
		stdout: (run.stdout ?? "").trim(),
		raw: run.stdout ?? "",
		stderr: (run.stderr ?? "").trim(),
	};
}

function die(message) {
	process.stderr.write(`ci-data-branch: ${message}\n`);
	process.exit(1);
}

function context(opts) {
	const remote = opts.remote ?? "origin";
	const branch = opts.branch;
	const file = resolve(opts.file ?? ".ds-bridge/history.jsonl");
	const top = git(["rev-parse", "--show-toplevel"]);
	if (!top.ok) die("not inside a git repository");
	const relpath = relative(top.stdout, file).split(sep).join("/");
	if (relpath.startsWith("..")) die(`--file ${file} is outside the repository`);
	const state =
		opts.state ??
		join(process.env.RUNNER_TEMP ?? tmpdir(), "ds-bridge-data-seed.json");
	return { remote, branch, file, relpath, top: top.stdout, state };
}

/** Fetch the data branch; return its tip sha, or null when it does not exist. */
function fetchTip(ctx) {
	const ref = `refs/remotes/${ctx.remote}/${ctx.branch}`;
	const fetched = git([
		"fetch",
		"--no-tags",
		"--quiet",
		ctx.remote,
		`+refs/heads/${ctx.branch}:${ref}`,
	]);
	if (!fetched.ok) return null;
	const tip = git(["rev-parse", "--verify", "--quiet", ref]);
	return tip.ok && tip.stdout !== "" ? tip.stdout : null;
}

function fileAt(tip, relpath) {
	if (tip === null) return null;
	const shown = git(["show", `${tip}:${relpath}`]);
	return shown.ok ? shown.raw : null;
}

function seed(opts) {
	const ctx = context(opts);
	const problem = validateDataBranch(ctx.branch, opts["default-branch"]);
	if (problem) die(problem);
	const tip = fetchTip(ctx);
	const remoteText = fileAt(tip, ctx.relpath);
	if (remoteText !== null) {
		mkdirSync(dirname(ctx.file), { recursive: true });
		writeFileSync(ctx.file, remoteText, "utf8");
	}
	const seeded = existsSync(ctx.file) ? readFileSync(ctx.file, "utf8") : "";
	writeFileSync(ctx.state, JSON.stringify({ tip, seeded }), "utf8");
	process.stdout.write(
		remoteText !== null
			? `seeded ${ctx.relpath} from ${ctx.remote}/${ctx.branch} (${tip.slice(0, 7)})\n`
			: `no history on ${ctx.remote}/${ctx.branch} yet — starting from the working tree\n`,
	);
}

function publish(opts) {
	const ctx = context(opts);
	const problem = validateDataBranch(ctx.branch, opts["default-branch"]);
	if (problem) die(problem);
	if (!existsSync(ctx.file)) {
		process.stdout.write(`nothing to publish: ${ctx.relpath} does not exist\n`);
		return;
	}
	const current = readFileSync(ctx.file, "utf8");
	let saved = { tip: null, seeded: "" };
	if (existsSync(ctx.state)) {
		try {
			saved = JSON.parse(readFileSync(ctx.state, "utf8"));
		} catch {
			// no usable seed state — treat as an unseeded start
		}
	}

	const identity = {
		GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "github-actions[bot]",
		GIT_AUTHOR_EMAIL:
			process.env.GIT_AUTHOR_EMAIL ??
			"41898282+github-actions[bot]@users.noreply.github.com",
		GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "github-actions[bot]",
		GIT_COMMITTER_EMAIL:
			process.env.GIT_COMMITTER_EMAIL ??
			"41898282+github-actions[bot]@users.noreply.github.com",
	};
	const head = git(["rev-parse", "--short", "HEAD"]);
	const message =
		opts.message ??
		`ds-bridge: record history${head.ok ? ` (${head.stdout})` : ""} [skip ci]`;
	const index = join(
		process.env.RUNNER_TEMP ?? tmpdir(),
		`ds-bridge-data-index-${process.pid}`,
	);

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		const tip = fetchTip(ctx);
		const content =
			tip !== null && tip !== saved.tip
				? appendOnlyMerge(fileAt(tip, ctx.relpath) ?? "", saved.seeded, current)
				: current;

		const blob = git(["hash-object", "-w", "--stdin"], { input: content });
		if (!blob.ok) die(`hash-object failed: ${blob.stderr}`);
		const env = { GIT_INDEX_FILE: index };
		const read = git(
			tip !== null ? ["read-tree", tip] : ["read-tree", "--empty"],
			{
				env,
			},
		);
		if (!read.ok) die(`read-tree failed: ${read.stderr}`);
		const added = git(
			[
				"update-index",
				"--add",
				"--cacheinfo",
				`100644,${blob.stdout},${ctx.relpath}`,
			],
			{ env },
		);
		if (!added.ok) die(`update-index failed: ${added.stderr}`);
		const tree = git(["write-tree"], { env });
		if (!tree.ok) die(`write-tree failed: ${tree.stderr}`);

		if (tip !== null) {
			const tipTree = git(["rev-parse", `${tip}^{tree}`]);
			if (tipTree.ok && tipTree.stdout === tree.stdout) {
				process.stdout.write(`${ctx.branch} already up to date\n`);
				return;
			}
		}
		const commit = git(
			[
				"commit-tree",
				tree.stdout,
				...(tip !== null ? ["-p", tip] : []),
				"-m",
				message,
			],
			{ env: identity },
		);
		if (!commit.ok) die(`commit-tree failed: ${commit.stderr}`);

		const pushed = git([
			"push",
			"--quiet",
			ctx.remote,
			`${commit.stdout}:refs/heads/${ctx.branch}`,
		]);
		if (pushed.ok) {
			process.stdout.write(
				`published ${ctx.relpath} to ${ctx.remote}/${ctx.branch} (${commit.stdout.slice(0, 7)})\n`,
			);
			return;
		}
		process.stderr.write(
			`ci-data-branch: push attempt ${attempt} rejected (${pushed.stderr.split("\n")[0]}); retrying\n`,
		);
	}
	die(`could not publish to ${ctx.branch} after ${MAX_ATTEMPTS} attempts`);
}

const isMain =
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const { command, opts } = parseArgs(process.argv.slice(2));
	if (command === "seed") seed(opts);
	else if (command === "publish") publish(opts);
	else
		die(
			"usage: ci-data-branch.mjs <seed|publish> --branch <name> --file <path>",
		);
}
