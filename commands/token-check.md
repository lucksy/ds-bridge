---
description: "Check design-token drift between source and built outputs"
argument-hint: "[--report] [path]"
---

## Drift output

!`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs tokens check $ARGUMENTS --format=json`

## Your task

The block above is the JSON output of `ds-bridge tokens check` for the user's
arguments (`$ARGUMENTS`). It has the shape `{ "entries": [...], "inSync": bool }`.
Each entry is one drift finding with these fields:

- `kind` — one of:
  - `stale-output` — the built output value no longer matches its source token
    (severity: error). The output drifted from the design source.
  - `missing-output` — a source token has no corresponding built output yet
    (severity: warn). The output build is behind the source.
  - `orphan-output` — a built output value has no matching source token
    (severity: info). Likely a leftover or hand-edited value.
- `token` — the source token (`name`, `value`) for `stale-output` / `missing-output`.
- `output` — the built output (`name`, `raw`) for `stale-output` / `orphan-output`.

If the block is empty, `inSync` is `true`, or it shows an error, report that the
run found no drift (or surface the error) and stop.

Otherwise:

1. **Summarize counts by kind with severity** — how many `stale-output` (error),
   `missing-output` (warn), and `orphan-output` (info).
2. **List the worst entries first** — lead with `stale-output`, then
   `missing-output`, then `orphan-output`, as `name  kind  detail`.
3. **Explain each drift kind in one line** — stale = output drifted from source;
   missing = source token not yet built into an output; orphan = output with no
   source token.

If any drift exists, use **AskUserQuestion** to offer:

- **(a) Write the HTML report** — rerun the CLI with `--report` so it also emits
  the offline dashboard with the drift trend.
- **(b) Show the full entry list** — print every drift entry, not just the worst.
- **(c) Stop** — report only, change nothing.

## Rules

- **Never regenerate outputs yourself.** This command only *reports* drift. Do
  not rewrite token outputs, run a build, or use Edit/Write to reconcile values.
- Opening a PR with regenerated outputs is a **future, ask-first action** — never
  initiate it here; only surface the drift so the user can decide.
- All re-runs go through the CLI: to write the report, rerun
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs tokens check <path> --report`.
