---
description: "Generate a complete DesignOps health report (fan-out analytics)"
argument-hint: "[--file-key <alias>]"
---

## Analytics rollup (headline)

!`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs analytics 2>&1 || true`

## Your task

This is `/ds-bridge:analytics` — the DesignOps intelligence front door. The block
above is the `ds-bridge analytics` rollup: the deterministic headline replayed
from `.ds-bridge/history.jsonl`. It already contains the computed numbers —
**do not recompute or blend them**:

- **Four headlines** — `Health` (system score, `N/100`), `Import coverage`
  (registry components the code imports, `N%`), `Consistency` (`N/100`),
  `Debt` (a weighted index, `N/100 (level)`, lower is better). Import coverage
  is not the on-system % (the share of styling that uses tokens) — keep the two
  names apart. `not measured` means exactly that — say so, never treat it as 0;
  when it names a command (import coverage needs a registry), pass that command
  on.
- **One line per domain** (`figma`, `code`, `token`, `git`, `score`) — either
  `ok (N sections)` or `no data — run <command>`, naming the command that
  produces that domain's data.

### 1. Read the headline

Summarize the four headlines (quote the numbers as given) and list the
`no data` domains with the command each line names. If the footer says
`Nothing recorded yet — run ds-bridge record.` (every domain is `no data`), the
project has not recorded any checks yet — suggest `/ds-bridge:record` (it runs
`ds-bridge record`: every configured check as one batch, plus the stored system
score), or the full report below, which runs the checks. If the block is an error (exit 2:
invalid `.ds-bridge.json`), surface that one fix and stop. For the per-domain
metrics themselves, run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs analytics --format json`
(the full document, schema `ds-bridge/analytics`) or option (d) below.

### 2. Offer the depth (native prompt — this command runs inline)

Use **AskUserQuestion** to offer:

- **(a) Full DesignOps report** — hand off to the **analytics-planner** subagent via
  the Task tool. It fans out across the Figma, code, token, and git domains
  (running the shipped CLI checks), merges them into one executive report
  (health · adoption · consistency · debt + trend), and lists the worst gaps.
- **(b) Prioritized recommendations** — hand off to the **ds-recommender** subagent
  via the Task tool: an ordered, evidence-cited list of consolidation/cleanup
  actions ("merge N implementations of X", "replace deprecated Y", "tokenize N
  values"), each tracing to a deterministic CLI finding.
- **(c) Manager one-pager** — run
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs report --format exec` and show the
  Markdown verbatim (paste-ready for a monthly update: score + trend, targets,
  top risks, next actions, per-frame handoff readiness, data coverage). For a
  page instead, `report --format exec-html --open`.
- **(d) JSON artifacts** — run
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs analytics --emit all` and list the
  written paths (five per-domain files + `analytics.json` under
  `.ds-bridge/analytics/`, byte-stable and commit-friendly). For spreadsheets,
  mention `ds-bridge history export --format csv` (one row per metric per run).
- **(e) Stop** — headline only.

Whatever they pick, mention once that `/ds-insights` charts the scores and the
live Figma selection in a pane beside the transcript (`/ds-insights --library`
adds library health). If the user looks after several repos, also mention
`/ds-bridge:rollup` (the local org view: repos ranked by system score).

On **(a)** launch `analytics-planner`; on **(b)** launch `ds-recommender`; on
**(c)** and **(d)** run the CLI yourself (no subagent) and paste its output
unchanged. Pass through any `--file-key <alias>` the user gave to the agents so
product-file targets resolve (the `analytics` command itself takes no file key).

## Rules

- **Report only.** This command and every agent it launches read the CLI and
  report; they never edit code, never edit Figma, never run a write path
  (`analytics --emit` writes only its own artifacts under `.ds-bridge/analytics/`,
  and only when the user picks (d)).
- **Never invent numbers.** Every figure traces to a CLI `--format=json` result.
  If a check exits `2` (missing token / file key / registry), surface that one fix
  and stop — do not guess credentials or fabricate metrics.
