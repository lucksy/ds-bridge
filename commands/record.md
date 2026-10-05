---
description: "Record design-system health: run every configured check as one batch and store the system score in history"
argument-hint: "[--figma] [--library-top <n>] [path]"
---

## Record output

!`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs record $ARGUMENTS --format=json 2>&1 || true`

## Your task

The block above is the JSON output of `ds-bridge record` for the user's
arguments (`$ARGUMENTS`). `record` is the unit of time in the analytics series:
it ran every configured check as **one batch** sharing a `runId`, appended each
result to `.ds-bridge/history.jsonl` (v2 envelope: `source`, git sha/branch,
tool version), then stored the composite **system score** with the weights
used. Shape:

```
{
  "runId": "…", "source": "local" | "ci" | "hook", "historyPath": "…",
  "checks": [ { "id", "kind", "status": "recorded" | "skipped" | "failed",
                "exitCode"?, "reason"? }, … ],
  "score": { "score", "subScores": {…}, "weights": {…}, "weightsSource" }
}
```

If the block is not JSON (exit 2: an internal error or an invalid
`.ds-bridge.json`), surface that one error and stop.

Otherwise:

1. **Lead with the score** — `score.score`/100, and which sub-scores fed it
   (`subScores`). Say the weights are stored with the run (`weightsSource`), so
   a later weights change never rewrites this point.
2. **List the checks** — one line each, `recorded` first. A recorded check's
   `exitCode` of `1` means it found something (findings never fail a record
   run). For each `skipped` check, quote its `reason` and name the command that
   un-skips it:
   - Figma checks (`registry-build`, `library-health`) → rerun with `--figma`
     (needs a Figma token + library file key — `/ds-bridge:connect`);
   - `adoption` → `ds-bridge registry build` once, then record again.
3. **Point at the trend.** One point is a reading, not a trend: suggest
   `/ds-bridge:analytics` (the headline), `/ds-bridge:dashboard` (the trends) or
   `report --format exec` (the manager one-pager).
4. **Mention CI once.** To record on every push without anyone remembering, the
   CI recorder runs `record --source ci` and stores the series on a
   `ds-bridge-data` branch (see `docs/ci-recording.md` in the plugin; PR
   scorecard comments are opt-in).

## Rules

- **Never edit code, tokens or Figma.** `record` only appends to
  `.ds-bridge/history.jsonl` (through the CLI's locked writer); it never runs
  `lint --fix` or posts Figma comments.
- **Never invent numbers.** Every figure comes from the JSON above. A skipped
  check has no number — say "not measured", never 0.
- All re-runs go through the CLI:
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs record <path> [--figma] --format=json`.
