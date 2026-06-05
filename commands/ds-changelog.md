---
description: "Audience-segmented changelog from git, Figma versions, and token changes"
argument-hint: "[--since <date>] [--audience designers|developers|both]"
---

## Changelog data

!`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs changelog $ARGUMENTS --format=json`

## Your task

The block above is the JSON output of `ds-bridge changelog` for the user's
arguments (`$ARGUMENTS`). It has the shape `{ "since": "<date>", "entries": [...] }`.
Each entry is one change with these fields:

- `dateIso` — when the change happened (ISO timestamp).
- `source` — where it came from:
  - `figma` — a labeled Figma file version (a designer-published milestone;
    unlabeled autosaves are already filtered out).
  - `code` — a local git commit (classified by its conventional-commit type).
  - `tokens` — a design-token change (added / removed / renamed / value change).
- `audience` — who the change matters to: `designer`, `developer`, or `both`.
- `severity` — `breaking`, `notable`, or `minor`.
- `title` — the one-line summary.
- `detail` — optional extra context (the author, the before→after value, etc.).

If the block shows an error (the command exits `2` and prints a stderr message
instead of JSON — e.g. "not a git repository" or a bad `--format`/`--audience`),
surface that one message, explain the fix, and stop. The Figma side is optional:
if no token / file key is configured the run is still valid — it just contains
`code` and `tokens` entries only, and that is fine to report.

If `entries` is empty, tell the user there were no changes in the selected window
(mention the `since` date) and stop.

Otherwise:

1. **Split by audience.** Produce two sections — **For designers** (entries whose
   `audience` is `designer` or `both`) and **For developers** (entries whose
   `audience` is `developer` or `both`). A `both` entry appears under each.
2. **Within each section, group by date (newest first)** and lead each line with
   the severity, e.g. `[breaking] Token removed: color.old — was color = #000`.
3. **Call out breaking changes first** in each section so they are impossible to
   miss.

If the user passed `--audience designers` or `--audience developers`, the JSON is
already filtered to that audience — render only that one section.

### Then offer next steps

Use **AskUserQuestion** to offer the user a choice (this command runs **inline**,
so `AskUserQuestion` is available):

- **(a) Markdown export** — rerun the CLI with `--format=md` for a paste-ready,
  audience-segmented document:
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs changelog $ARGUMENTS --format=md`.
  Show the resulting markdown so the user can drop it into a release note, a PR
  description, or a wiki page.
- **(b) Post to Confluence or Slack** — **model-led, ask-first only.** ds-bridge
  has **no** Confluence/Slack integration of its own and will not gain one here.
  If the user picks this, first generate the markdown export (option a), then ask
  the user to **explicitly confirm the exact destination** (which Confluence space
  + page, or which Slack channel). Only after that confirmation may you use a
  separately-configured MCP server or tool the user already has to post it, and
  you must show the user the exact content you are about to send and get a final
  go-ahead. If no such tool is available, say so plainly and hand the user the
  markdown to post themselves. **Never** post on a guess, and never invent a
  destination.
- **(c) Stop** — report only, change nothing.

## Rules

- **This command only reports.** It reads git history and (optionally) Figma
  versions; it writes nothing to the repo, Figma, Confluence, or Slack on its own.
- **Posting anywhere is always ask-first and confirmation-gated.** Generate the
  content, show it, name the destination, and get an explicit yes before any
  external post — and only through a tool the user has already configured. There
  is no built-in poster, so never imply ds-bridge will publish for them.
- **Never invent entries, dates, or severities.** Report only what the JSON block
  contains. If it is empty or malformed, say so and stop.
- All re-runs go through the CLI (`--format=md` for export); do not hand-build the
  changelog from memory.
