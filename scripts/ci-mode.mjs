#!/usr/bin/env node
// Resolve the ds-bridge-record action's mode (record | check | site).
// Dependency-free; used by .github/actions/ds-bridge-record.
//
// Reads INPUT_MODE, EVENT_NAME, REF_NAME, DEFAULT_BRANCH and ALLOW_ANY_REF from
// the environment, prints GitHub annotations on stdout and appends
// `mode=<mode>` to $GITHUB_OUTPUT.
//
//   auto  → pull_request / pull_request_target: check; anything else: record.
//   record only ever records the DEFAULT branch: a workflow_dispatch from a
//   feature branch, a push without a branch filter or a tag push would
//   otherwise append that ref's results to the main-line series. `auto` falls
//   back to check there; an explicit `record` fails. `allow-any-ref: "true"`
//   opts out. When the default branch is unknown (e.g. schedule payloads), a
//   schedule run records (it always runs on the default branch); anything else
//   is checked only.
//
// Exit codes: 0 ok · 1 unknown mode / explicit record on another ref.
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODES = new Set(["record", "check", "site"]);
const PR_EVENTS = new Set(["pull_request", "pull_request_target"]);

/**
 * Pure: the resolved mode plus the annotations to print.
 * @returns {{ mode?: string, error?: string, notes: string[] }}
 */
export function resolveMode({
	mode = "auto",
	event = "",
	ref = "",
	defaultBranch = "",
	allowAnyRef = "false",
}) {
	const notes = [];
	const auto = mode === "auto";
	let resolved = mode;
	if (auto) resolved = PR_EVENTS.has(event) ? "check" : "record";
	if (!MODES.has(resolved)) return { error: `unknown mode '${mode}'`, notes };

	if (event === "pull_request_target") {
		notes.push(
			"::warning::ds-bridge-record under pull_request_target runs with a write token and secrets — do not check out the pull request's head in this job.",
		);
	}

	if (resolved !== "record" || allowAnyRef === "true") {
		return { mode: resolved, notes };
	}
	const onDefault =
		defaultBranch !== "" ? ref === defaultBranch : event === "schedule"; // schedules always run on the default branch
	if (onDefault) return { mode: resolved, notes };

	const where =
		defaultBranch !== ""
			? `'${ref}' is not the default branch '${defaultBranch}'`
			: `the default branch is unknown for a '${event}' run`;
	if (!auto) {
		return {
			error: `refusing to record: ${where}. Record only the default branch, or set allow-any-ref: "true".`,
			notes,
		};
	}
	notes.push(
		`::notice::ds-bridge-record: ${where} — checking only (not recorded to the data branch).`,
	);
	return { mode: "check", notes };
}

const isMain =
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const env = process.env;
	const result = resolveMode({
		mode: env.INPUT_MODE || "auto",
		event: env.EVENT_NAME ?? "",
		ref: env.REF_NAME ?? "",
		defaultBranch: env.DEFAULT_BRANCH ?? "",
		allowAnyRef: env.ALLOW_ANY_REF ?? "false",
	});
	for (const note of result.notes) process.stdout.write(`${note}\n`);
	if (result.error !== undefined) {
		process.stdout.write(`::error::${result.error}\n`);
		process.exit(1);
	}
	if (env.GITHUB_OUTPUT) {
		appendFileSync(env.GITHUB_OUTPUT, `mode=${result.mode}\n`);
	}
	process.stdout.write(`ds-bridge-record: mode ${result.mode}\n`);
}
