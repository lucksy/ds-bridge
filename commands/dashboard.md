---
description: "Open the ds-bridge dashboard report, compose with --setup, or build one from a description"
argument-hint: "[--setup] [\"free-text view description\"] [path]"
---

## Your task

This command has THREE modes, decided by `$ARGUMENTS`:
- contains `--setup` → **Mode 2** (the persona wizard);
- contains a quoted free-text phrase (a description of the view you want) →
  **Mode 3** (the conversational builder);
- otherwise → **Mode 1** (render).

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
   `/ds-bridge:dashboard --setup` composes a persona view (six personas plus the
   `everything` escape). This is stateless guidance — never nag, never persist
   anything to track it.
6. To see the same history without leaving the session, `/ds-insights` opens
   the insights pane beside the transcript: score trends, and charts of the live
   Figma selection.

### Mode 2 — compose (`--setup`)

Drive the persona-first wizard conversationally, then persist via the CLI. The
options are **data-driven** — built from the live `presets` array, never
hand-authored prose that could drift from the shipped presets.

1. Run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs dashboard list --format=json`
   to get the live catalog (ids, titles, personas), the current view, and the
   **`presets`** array (each entry: `name`, `description`, `artifacts`).
2. Ask the persona question with **AskUserQuestion** — **six** options, one per
   persona preset (every `presets` entry whose `name` is not `everything`),
   using its `description` as the option text and naming a few of its
   `artifacts`. Add a **seventh "Not sure → everything (no setup)"** escape.
   There is **no `mixed` persona** — the escape is `everything`.
   - If they pick `everything`: stop here and say so — an unconfigured repo
     already renders the full catalog, so no config is written.
3. **Capture the file-key model** for the chosen persona (SPEC §2.2):
   - **Producer** (`ds-designer` / `ds-manager` / `ds-engineer`): confirm the
     singular library key `figma_file_key` (env `FIGMA_DESIGN_SYSTEM_FILE`). If
     unset, warn that library-health · parity · a11y · impact · docs are empty
     without it. Never prompt for a product frame URL.
   - **Consumer** (`product-designer` / `product-manager` / `product-engineer`):
     confirm `figma_file_key` as a read-only reference, then pin THEIR product
     file as a named `product_file_keys` entry so handoff-qa / figma-impl /
     frame-impl can target it by alias.
4. Persist the persona view as a **live preset** with exactly one CLI call —
   `… dashboard set --view <persona>` (it writes `dashboard_view` and clears any
   prior `dashboard_artifacts`). Keeping it a live preset means the persona
   auto-gains future enrichment; materialization is reserved for an explicit
   `dashboard save --freeze`. Onboarding writes ONLY `dashboard_view` and any
   `product_file_keys` entry — never `report_style` / `readiness_threshold`.
5. Show the CLI's confirmation output, then offer to render now; if accepted,
   run `… report <path> --open`.

### Mode 3 — build from a description (free-text)

A quoted free-text argument (e.g. `"exec view: score trend + adoption +
breaking calendar, save as exec"`) is a request to BUILD a named dashboard. The
catalog is the only vocabulary — never invent ids.

1. **Ground in the live catalog FIRST.** Run
   `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs dashboard list --format=json` and map
   the phrase to artifact ids **only** by their `id`/`title`/`personas` in that
   JSON. Optionally seed candidates with
   `… dashboard suggest "<phrase>"` (offline, deterministic — no LLM). Emit ONLY
   ids that appear in the JSON.
2. **Preview before saving.** Echo the resolved ordered id list (with titles) +
   the target name and ask the user to confirm. If your confidence is low (the
   phrase is vague, or a token maps to several artifacts), DROP to an
   **AskUserQuestion** built from the catalog rows instead of guessing.
3. **Save through the CLI boundary** — never hand-write the JSON. Run
   `… dashboard save <name> --artifacts <comma,separated,ids>` (add `--local`
   for a personal dashboard). The CLI **re-validates every id**; a hallucinated
   id exits 2 with nearest-match suggestions — relay them verbatim and retry with
   a corrected list. The validation IS the guardrail.
4. Offer to render it: `… report <path> --dashboard <name> --open`.

## Rules

- **Never edit `.ds-bridge.json` by hand** — all writes go through
  `dashboard set` (it validates ids, preserves unrelated keys, and keeps the
  diff minimal). Never hand-edit or fabricate the dashboard HTML either.
- Unknown artifact/preset errors from the CLI carry nearest-match suggestions —
  relay them verbatim rather than guessing.
- The report is offline and self-contained; the user can reopen the printed
  path at any time.
