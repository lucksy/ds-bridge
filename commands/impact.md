---
description: "Detect breaking Figma library changes and map them to code"
argument-hint: "[--since <versionId>] [--file-key <key>]"
---

## Impact report

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs impact '$ARGUMENTS' --format=json`

## Your task

The block above is the JSON output of `ds-bridge impact` for the user's
arguments (`$ARGUMENTS`). It is the **breaking-change radar**: it compares the
current Figma library's published components against the last snapshot it saw
(the version cursor) and classifies every change.

### Baseline run

If the block has `"baseline": true`, this is the **first** time impact has run
for this library (no cursor existed yet). There is nothing to diff against — the
CLI just captured a baseline snapshot (`componentCount` components at
`versionId`). Tell the user plainly that the baseline is now recorded and that
running `/ds-bridge:impact` again **after** the library changes will show the
diff. Then stop — there is nothing to migrate.

### Diff run

Otherwise the block has `"baseline": false` and these fields:

- `breaking` — `true` when at least one change is classified breaking. This
  drives the CLI exit code (0 none / 1 breaking found).
- `fromVersionId` / `toVersionId` — the cursor's previous version and the newest
  version now observed.
- `diff` — the change buckets, each entry carrying an `impact` of
  `breaking`, `additive`, or `cosmetic`:
  - `added` — `{ name, nodeId, impact }`. New components (always `additive`).
  - `removed` — `{ name, nodeId, impact }`. Components gone from the library
    (always `breaking` — anything importing them breaks).
  - `renamed` — `{ fromName, toName, nodeId, impact }`. A component whose name
    changed (always `breaking` — references to the old name break).
  - `changed` — `{ name, nodeId, descriptionChanged, variantChanges, impact }`.
    A kept component whose shape/description changed. `variantChanges` is a list
    of `{ axis, kind, value? }` where `kind` is `axis-added`, `axis-removed`,
    `value-added`, or `value-removed`. Removing an axis or value is `breaking`;
    adding only is `additive`; a description-only change is `cosmetic`.
- `usage` — the code blast radius (present only when a registry exists). One
  entry per changed Figma name: `{ figmaName, codeName?, importPath?,
  resolution, usages: [{ file, line, importName }], count }`. `count` is the
  number of import sites — "touches N call sites". `resolution` is `matched`
  (mapped to a code component), `unmatched` (in Figma but no code match), or
  `not-in-registry`.
- `registryPresent` — `false` when there is no `.ds-bridge/registry.json`; in
  that case `usage` is empty and you cannot report call-site counts.

### If the command errored

On an operational error (a missing Figma token, a missing file key, or an API
failure) the `impact` command prints a stderr message instead of a report; the
`run-cli.mjs` wrapper on the precondition folds that message into the block so it never
aborts this command (it also keeps the exit-1 "breaking changes found" run from
aborting — that case still carries a full JSON report). If the block is such an
error message rather than a JSON report:

1. Surface the message to the user.
2. Explain the one action that resolves it — for a missing token, create a
   Dev/Full-seat PAT with the `library_content:read` and `file_versions:read`
   scopes; for a missing file key, pass `--file-key <key>` or set the
   `figma_file_key` plugin option.
3. Stop.

### Otherwise, present the impact

1. **Lead with the verdict.** State whether breaking changes were found
   (`breaking: true/false`) and the from→to versions. If `diff` is entirely
   empty, say the library is unchanged since the last snapshot and stop.
2. **List breaking changes first**, then additive, then cosmetic. For each, show
   the component, what changed (the `detail`/`variantChanges`), and — when
   `registryPresent` is true — how many code call sites it touches (the matching
   `usage` entry's `count`), naming the affected files and lines.
3. **Explain each category in one line:**
   - `removed` — the component no longer exists; importing code breaks.
   - `renamed` — the name changed; references to the old name break.
   - `changed` (breaking) — a variant axis or value was removed; props that
     passed the old value break.
   - `changed` (additive) — a new variant axis or value; existing code keeps
     working.
   - `added` — a brand-new component; nothing to migrate, but worth adopting.
4. **If `registryPresent` is false**, note that call-site counts are unavailable
   because there is no component registry, and that running
   `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs registry build` would let a future
   run map changes to code. Do not run it yourself unless the user asks.

### Then, if there are breaking changes

Use **AskUserQuestion** to offer the user a choice (this command runs **inline**,
not in a `context: fork` background task, because `AskUserQuestion` is only
available to inline skills):

- **(a) Draft a migration plan** — for each breaking change, write concrete,
  file-by-file migration steps using the `usage` call sites (which import to
  update, which prop value to replace, which component to swap). Present the plan
  as text for the user to review; do **not** edit any files yet.
- **(b) Show per-component detail** — walk the changes one component at a time
  with every affected `file:line` from `usage`, so the user can triage call site
  by call site.
- **(c) Stop** — report only, change nothing.

## Rules

- **Never edit code or the Figma file yourself** as part of reporting. Drafting a
  migration plan (option a) produces a plan for the user to approve — it does not
  apply edits.
- **Opening a PR with the migration is a future, ask-first action** — never
  initiate it here. Only after the user has reviewed the migration plan and
  **explicitly confirms** may you proceed to apply edits and open a PR; absent
  that confirmation, surface the plan and stop.
- **Never invent changes, counts, or call sites.** Report only what the JSON
  block contains. If it is empty or malformed, say so and stop.
- All re-runs go through the CLI; respect any `--since` or `--file-key` the user
  passed. The cursor advances automatically after a successful run — you do not
  manage it.
