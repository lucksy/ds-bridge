---
description: "Audit Figma<->code component parity"
argument-hint: "[component]"
---

## Parity matrix

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs parity '$ARGUMENTS' --format=json`

## Your task

The block above is the JSON output of `ds-bridge parity` for the user's
arguments (`$ARGUMENTS`). It is a **ParityReport** with these fields:

- `summary` — aggregate counts: `ok`, `propMismatch`, `missingInCode`,
  `missingInFigma`.
- `rows` — one per component, sorted worst-first. Each has:
  - `component` — the component name.
  - `status` — one of `missing-in-code`, `missing-in-figma`, `prop-mismatch`,
    `ok`.
  - `detail` — a one-line explanation of the verdict and the gap.

### If the command errored

On a missing registry the `parity` command prints a stderr message instead of a
ParityReport; the `2>&1 || true` on the precondition folds that message into the
block so it never aborts this command. If the block is that "No registry found …
Run ds-bridge registry build first" message rather than a ParityReport JSON
object:

The parity matrix is built from a component registry that has not been generated
yet. **Do not** write paragraphs and wait for a typed "yes" — get approval
through a native prompt. Immediately call **AskUserQuestion** (available because
this command runs **inline**) with one short question and two options:

- question: "No component registry yet — the parity matrix is built from it.
  Build it now? (scans your components + fetches the Figma library; needs network
  access to Figma)"
- **Build it now** · **Not now**

On **Build it now**, run this with the Bash tool (it inherits the configured
Figma file key and PAT from the plugin environment):

`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs registry build`

If it reports a missing token or file key, surface that one fix (configure it via
`/plugin configure` and restart) and stop. On success, rerun the parity command
and continue below. On **Not now**, stop and report nothing further.

If the block shows any other error (bad path, invalid format), surface the
message and stop.

### Otherwise, summarize the matrix

1. **Report the summary by status with counts.** Lead with the totals:
   how many `ok`, `prop-mismatch`, `missing-in-code`, `missing-in-figma`, and
   the overall component count.
2. **List the worst rows.** Walk the rows top-down (they are already sorted
   worst-first) and show `component — status — detail` for the non-`ok` ones.
   If everything is `ok`, say so and congratulate the user that code and Figma
   are in parity.
3. **Explain each status in one line:**
   - `missing-in-code` — Figma publishes this component but the codebase has no
     match; engineering needs to build it.
   - `missing-in-figma` — the codebase has this component but the Figma library
     does not publish it; design needs to publish it (or it should be retired).
   - `prop-mismatch` — both sides exist but their prop/variant shapes diverge;
     the contracts need to be aligned.
   - `ok` — matched with high shape agreement; nothing to do.

### Then offer next steps

Use **AskUserQuestion** to offer the user a choice (this command runs **inline**,
so `AskUserQuestion` is available):

- **(a) Deep audit** — hand off to the **parity-auditor** subagent for a full
  reconciliation plan: concrete component contracts for `missing-in-code`,
  publishing steps for `missing-in-figma`, and shape diffs for `prop-mismatch`.
  Launch it via the Task tool with the `parity-auditor` agent, passing along any
  `[component]` filter the user gave.
- **(b) Markdown export** — rerun the CLI with `--markdown` for an issue or PR
  description:
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs parity $ARGUMENTS --markdown`.
  Show the resulting GitHub-flavored markdown table so the user can paste it
  straight into an issue or PR body.
- **(c) Stop** — report only, change nothing.

## Rules

- **Never edit code or the Figma file yourself.** This command reports parity
  and, at most, exports a markdown table. All reconciliation is a human decision
  — surface the gaps and the options, don't apply changes.
- **Never invent rows or counts.** Report only what the JSON block contains. If
  it is empty or malformed, say so and stop.
- The only reason to run `registry build` is the registry-missing (`exit 2`)
  case above, and only after telling the user what it does — never silently.
