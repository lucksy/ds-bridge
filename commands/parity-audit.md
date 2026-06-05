---
description: "Audit Figma<->code component parity"
argument-hint: "[component]"
---

## Parity matrix

!`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs parity $ARGUMENTS --format=json`

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

The `parity` command exits `2` (and prints a stderr message instead of JSON)
when there is **no registry** at `.ds-bridge/registry.json`. If the block shows
that "No registry found … Run ds-bridge registry build first" message:

1. Tell the user plainly that the parity matrix is built from a component
   registry that has not been generated yet.
2. **Offer to build it for them.** The build command is
   `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs registry build` — it scans the code
   components and fetches the Figma library, then writes the registry. Note that
   it needs a configured Figma file key and a Dev/Full-seat PAT; if the build
   itself reports a missing token or file key, surface that one fix and stop.
3. After a successful build, rerun the parity command and continue below.

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
