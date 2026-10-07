---
description: "Find hardcoded design values that should be design tokens"
argument-hint: "[--fix] [path]"
---

## Lint output

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs lint '$ARGUMENTS' --format=json`

## Your task

The block above is the JSON output of `ds-bridge lint` for the user's arguments
(`$ARGUMENTS`). Each entry is one finding with these fields:

- `file`, `line`, `col` — where the raw value lives.
- `raw` — the hardcoded value (e.g. `#3b82f6`, `17px`).
- `property` — the CSS property / style prop it was used in.
- `kind` — one of:
  - `exact` — the value equals a design token exactly. Safe to auto-fix.
  - `near` — the value is close to a token but not identical. Needs a human
    judgement call (the original may be intentional, or a token may be missing).
  - `off-system` — no token is close; likely a true off-system value.
- `expectedToken` — the matching token name (present for `exact`).
- `expectedCandidates` — ranked near-token names (present for `near`).

If the block is empty (`[]`) or shows an error, report that the run found no
findings (or surface the error) and stop.

Otherwise:

1. **Summarize counts by kind** — how many `exact`, `near`, and `off-system`.
2. **List the findings** as `file:line:col  raw -> suggestion`, where the
   suggestion is the `expectedToken` for exact matches, or the top
   `expectedCandidates` entry for near matches.
3. **Explain near vs exact** briefly: exact matches are byte-for-byte token
   equivalents and are safe to rewrite automatically; near matches only resemble
   a token and may be deliberate, so they are never auto-fixed.

If any `near` findings exist, use **AskUserQuestion** to offer:

- **(a) Apply exact fixes** — rerun the CLI with `--fix` (only ever rewrites
  exact matches).
- **(b) Walk through near-misses** — review each near finding one at a time and
  decide whether to adopt the candidate token or leave the value.
- **(c) Stop** — report only, change nothing.

If there are no near findings but there are exact findings, you may offer to
apply exact fixes directly.

## Rules

- `--fix` ONLY ever rewrites `exact` matches. It never touches `near` or
  `off-system` findings.
- **Never edit files yourself.** All changes go through the CLI: to apply fixes,
  rerun `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs lint <path> --fix`. Do not use
  Edit/Write to rewrite values directly.
- For near-misses you adopt, still apply them through the CLI or by guiding the
  user — confirm the token name from `expectedCandidates` before changing
  anything.
