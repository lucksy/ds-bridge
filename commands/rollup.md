---
description: "Org view across repos: rank several repos' recorded design-system history by System Score (local only)"
argument-hint: "[sources...] [--config <file>]"
---

## Org rollup

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs rollup '$ARGUMENTS' --format md`

## Your task

The block above is `ds-bridge rollup` for the user's arguments (`$ARGUMENTS`),
rendered as Markdown. It ranks several repos from their **already-recorded**
history — it ran no checks, fetched nothing and wrote nothing. Each source is a
repo directory, a `history.jsonl` file, or `<path>@<git-ref>` (for example
`../web@origin/ds-bridge-data`, the branch the CI recorder writes). With no
sources it reads `.ds-bridge/rollup.json`:

```json
[
  { "name": "web", "source": "../web" },
  { "name": "ios", "source": "../ios@origin/ds-bridge-data", "team": "Mobile" }
]
```

**If the block is an error** (exit 2: no sources and no `.ds-bridge/rollup.json`,
a bad config, or a bad flag), explain the two ways to name repos — pass them as
arguments, or create `.ds-bridge/rollup.json` as above — and stop. Do not write
the config yourself unless the user asks.

Otherwise:

1. **Show the Markdown verbatim** — it is paste-ready for a PR comment, a step
   summary or a monthly update. Do not recompute or re-rank anything.
2. **Summarize in two or three lines:** the mean and size-weighted score, the
   top and bottom repo, and any stale repos (`Stale repos`).
3. **Relay every note** on a repo row (missing history, a v1-only history, a
   ref that could not be read). For a `<path>@<ref>` source the data is only as
   fresh as that clone's last fetch — suggest `git fetch origin ds-bridge-data`
   in that repo.
4. **Offer the drill-down:** `ds-bridge report <repo> --view org` renders that
   repo's dashboard. It uses the repo's own score weights and working-tree
   history, so its score can differ from the rollup row (which uses the default
   weights for every repo, so the ranking is like-for-like).

For a shareable page, rerun with `--format html --out <file>` (offline, one
file); for scripts, `--format json`.

## Rules

- **Local only.** Never fetch, clone or write into a source repo, and never run
  checks on its behalf; the rollup reads history that was already recorded.
- **Never invent numbers.** A "—" is unmeasured, never 0. Every figure comes
  from the block above.
- All re-runs go through the CLI:
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs rollup [sources...] [--config <file>] --format md`.
