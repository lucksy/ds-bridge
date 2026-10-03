---
description: "Generate a complete DesignOps health report (fan-out analytics)"
argument-hint: "[--file-key <alias>]"
---

## System score (headline)

!`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs report --format=md 2>&1 | head -40 || true`

## Your task

This is `/ds-bridge:analytics` — the DesignOps intelligence front door. The block
above is the markdown scorecard replayed from `.ds-bridge/history.jsonl` (system
score + the latest check results). It is the **headline only**; the full report is
a fan-out across every design-system domain.

### 1. Read the headline

Summarize the composite system score and any obvious gaps from the block. If the
block is empty or says "No data yet", the project has not run any checks — note
that the full report below will populate history as it runs.

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
- **(c) Stop** — headline only.

Whatever they pick, mention once that `/ds-insights` charts the scores and the
live Figma selection in a pane beside the transcript (`/ds-insights --library`
adds library health).

On **(a)** launch `analytics-planner`; on **(b)** launch `ds-recommender`. Pass
through any `--file-key <alias>` the user gave so product-file targets resolve.

## Rules

- **Report only.** This command and every agent it launches read the CLI and
  report; they never edit code, never edit Figma, never run a write path.
- **Never invent numbers.** Every figure traces to a CLI `--format=json` result.
  If a check exits `2` (missing token / file key / registry), surface that one fix
  and stop — do not guess credentials or fabricate metrics.
