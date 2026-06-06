---
description: "Generate component MDX docs + llms.txt from the registry and tokens"
argument-hint: "[component] [--out <dir>]"
---

## Generated docs

!`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs docs $ARGUMENTS --format=json`

## Your task

The block above is the JSON output of `ds-bridge docs` for the user's arguments
(`$ARGUMENTS`). On success it is a **DocsResult** with these fields:

- `outDir` — the directory the MDX pages were written to.
- `llmsPath` — the path to the generated `llms.txt` system summary.
- `pages` — one per documented component. Each has:
  - `component` — the component name (its MDX file is `<component>.mdx` in `outDir`).
  - `path` — the absolute path of the written MDX page.
  - `gaps` — typed documentation gaps for that component (possibly empty). Each
    gap is one of:
    - `missing-figma-description` — the matched Figma component has no authored
      description, so the page's Figma section is empty.
    - `unmatched-in-figma` — the codebase has this component but the Figma library
      does not publish a match.
    - `unmatched-in-code` — Figma publishes this component but no code component
      matches it.

### If the command errored

The `docs` command exits `2` (and prints a stderr message instead of JSON) on an
operational error. Handle these cases:

1. **No registry.** If the block shows "No registry found … Run ds-bridge
   registry build first": tell the user plainly that docs are generated from a
   component registry that has not been built yet. **Offer to build it** with
   `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs registry build` — it scans the code
   components and fetches the Figma library, then writes the registry. Note it
   needs a configured Figma file key and a Dev/Full-seat PAT; if the build itself
   reports a missing token or file key, surface that one fix and stop. After a
   successful build, rerun this command and continue below.
2. **Component not found.** If the block shows "No component named … Candidates:
   …": tell the user the named component is not in the registry and list the
   candidate names from the message so they can retry with a valid one.
3. **Any other error** (bad path, invalid format): surface the message and stop.

### Otherwise, summarize what was generated

1. **Report the totals.** Lead with how many pages were written and where
   (`outDir`), and note the `llms.txt` path. Report the total gap count across
   all pages.
2. **List the components with gaps.** Walk `pages` and, for each component whose
   `gaps` is non-empty, show `component — gaps` with the one-line meaning of each
   gap (from the list above). If every page is gap-free, say so and congratulate
   the user that code and Figma are fully documented and in sync.
3. **Never invent pages, gaps, or counts.** Report only what the JSON block
   contains. If it is empty or malformed, say so and stop.

### Then offer next steps

The generated docs currently live under `outDir` (by default
`.ds-bridge/docs/`), which is plugin working state — not the project's real
documentation tree. Use **AskUserQuestion** to offer the user a choice (this
command runs **inline**, so `AskUserQuestion` is available):

- **(a) Copy into the project docs** — copy the generated MDX pages and
  `llms.txt` into the project's real documentation directory. **Only do this
  behind this explicit confirmation.** When the user picks this option, ask
  (also via AskUserQuestion, or accept it from their reply) for the destination
  directory — do **not** guess a docs path. Then copy the files from `outDir`
  into that directory, reporting exactly which files were written.
- **(b) Leave them in place** — keep the docs under `outDir` and change nothing
  in the project tree. Report the `outDir` path so the user can review or move
  them manually.
- **(c) Stop** — report only, change nothing.

## Rules

- **Never copy generated docs into the project's real docs directory without
  explicit user confirmation** via the AskUserQuestion choice above. The default
  output under `.ds-bridge/docs/` is working state; promoting it into the project
  tree is a human decision.
- **Never edit component code or the Figma file yourself.** This command
  generates documentation and reports gaps — closing the gaps (authoring Figma
  descriptions, building or retiring components) is a human decision.
- The only reason to run `registry build` is the registry-missing (`exit 2`)
  case above, and only after telling the user what it does — never silently.
