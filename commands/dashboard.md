---
description: "Open the ds-bridge dashboard report"
argument-hint: "[path]"
---

## Report output

!`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs report $ARGUMENTS --open`

## Your task

The block above is the output of `ds-bridge report` for the user's arguments
(`$ARGUMENTS`). The command renders an offline, self-contained HTML dashboard
from the project's `.ds-bridge/history.jsonl`, writes it to a file, prints that
file path on stdout, and (via `--open`) launches it in the browser.

If the block shows an error, surface it and stop. Otherwise:

1. **Confirm the path printed** — state where the dashboard was written and that
   it should now be open in the browser.
2. **Summarize which sections have data vs. empty states** — the dashboard's
   sections are driven by history records:
   - **Drift trend** — populated by `tokens-check` runs (`/ds-bridge:token-check`).
     Empty until at least one drift check has been recorded.
   - **Lint violations by type** — populated by `lint` runs
     (`/ds-bridge:ds-lint`). Empty until at least one lint has been recorded.
   If a section has no records yet, name the command that fills it so the user
   knows what to run next.

## Rules

- **Never regenerate the dashboard yourself.** This command only opens the report
  the CLI produced; do not hand-edit the HTML or fabricate sections.
- All re-runs go through the CLI: to refresh, rerun
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs report <path> --open`.
- The report is offline and self-contained — no network or CDN is needed to view
  it; the user can reopen the printed path at any time.
