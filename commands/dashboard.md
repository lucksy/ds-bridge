---
description: "Open the ds-bridge dashboard report, or compose your view with --setup"
argument-hint: "[--setup] [path]"
---

## Your task

This command has two modes, decided by whether `$ARGUMENTS` contains `--setup`.
There is no pre-executed output block: run the CLI yourself with the Bash tool.
(Deliberate — M3.1: an eager `` !`…` `` block would fire before you could
branch, opening a stale default report mid-wizard.)

Arguments received: `$ARGUMENTS`

### Mode 1 — render (no `--setup`)

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs report $ARGUMENTS --open`
   (pass the user's path/flags through verbatim; `--view`/`--artifacts` are
   valid passthroughs).
2. If it exits non-zero, surface stderr and stop.
3. Confirm the printed dashboard path and that it opened in the browser.
4. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs dashboard list --format=json`
   for the same path and summarize:
   - which **view** is active (`view.source`: `flags` / `project` / `default`,
     plus `viewName` when set);
   - which enabled sections have data vs. empty states — for empty ones, name
     the command that fills them (drift ← `/ds-bridge:token-check`, lint ←
     `/ds-bridge:ds-lint`, readiness ← `/ds-bridge:handoff-qa`, parity ←
     `/ds-bridge:parity-audit`, a11y ← `/ds-bridge:a11y-check`, impact ←
     `/ds-bridge:impact`).
5. **Once only, and only when** `view.source` is `"default"`: mention that
   `/ds-bridge:dashboard --setup` composes a persona view (owner · engineering ·
   design · consumer). This is stateless guidance — never nag, never persist
   anything to track it.

### Mode 2 — compose (`--setup`)

Drive the wizard conversationally, then persist via the CLI:

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs dashboard list --format=json`
   to get the live catalog (ids, titles, personas) and the current view.
2. Ask the persona question with **AskUserQuestion** — four options built from
   the presets, each description naming its artifacts:
   - **Owner** — drift-trend · parity · a11y (trends that justify the system)
   - **Engineering** — lint-summary · impact · drift-trend (what to fix next)
   - **Design** — readiness · a11y · parity (handoff and library quality)
   - **Consumer** — parity · impact (what is safe to build on)
   (Plain `everything` needs no setup — if they want that, stop here and say
   so; an unconfigured repo already renders everything.)
3. Ask (same AskUserQuestion call or a second one) whether they want to
   **customize** the preset's artifact list. If yes, offer the remaining
   catalog artifacts as multi-select additions/removals.
4. Persist with exactly one CLI call:
   - preset as-is → `… dashboard set --view <preset>`
   - customized → `… dashboard set --artifacts <final,ordered,list>` — and
     relay the CLI's materialization notice: an explicit list will not
     auto-gain artifacts added to presets in future versions.
5. Show the CLI's confirmation output, then offer to render now; if accepted,
   run `… report <path> --open`.

## Rules

- **Never edit `.ds-bridge.json` by hand** — all writes go through
  `dashboard set` (it validates ids, preserves unrelated keys, and keeps the
  diff minimal). Never hand-edit or fabricate the dashboard HTML either.
- Unknown artifact/preset errors from the CLI carry nearest-match suggestions —
  relay them verbatim rather than guessing.
- The report is offline and self-contained; the user can reopen the printed
  path at any time.
