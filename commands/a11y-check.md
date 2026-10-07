---
description: "Audit token-level WCAG contrast across modes and surface failing color pairings"
argument-hint: "[path] [--modes <m1,m2>] [--level AA|AAA]"
---

## Contrast audit output

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs a11y '$ARGUMENTS' --format=json`

## Your task

The block above is the JSON output of `ds-bridge a11y` for the user's arguments
(`$ARGUMENTS`). It has the shape:

```
{
  "level": "AA" | "AAA",
  "findings": [ { mode, foreground, background, foregroundValue, backgroundValue,
                  ratio?, required, status, suggestion? }, ... ],
  "summary": { "total", "passed", "failed", "unparseable" }
}
```

Each finding is one foreground/background color pairing audited within one mode:

- `mode` — the theme/mode the pair was evaluated in (e.g. `light`, `dark`, or
  `default` for single-mode token files).
- `foreground` / `background` — the semantic token paths that were paired
  (foreground roles: `text` / `fg` / `on-*` / `foreground`; background roles:
  `bg` / `background` / `surface` / `fill`).
- `foregroundValue` / `backgroundValue` — the resolved color values.
- `ratio` — the computed WCAG 2.1 contrast ratio (omitted when unparseable).
- `required` — the ratio the pair must meet for the chosen `level`
  (AA = 4.5, AAA = 7.0 for normal text).
- `status` — one of:
  - `pass` — meets the required ratio.
  - `fail` — below the required ratio (an accessibility risk).
  - `unparseable` — one of the colors could not be parsed.
- `suggestion` — present only on `fail` findings:
  - `{ "kind": "adjusted", "value": "#…" }` — a nearest-compliant foreground
    color (OKLCH lightness adjusted, hue and chroma preserved) that meets the
    required ratio against the same background.
  - `{ "kind": "none" }` — no lightness-only fix reaches the ratio (the hue's
    chroma caps the achievable contrast).

If the block is empty, shows an error, or `summary.failed` and
`summary.unparseable` are both `0`, report that the audit found no contrast
failures (or surface the error) and stop.

Otherwise:

1. **Summarize per mode.** Group failing findings by `mode` and report, for each
   mode, how many pairs fail and which ones (as `foreground on background —
   ratio:1 < required:1`). Lead with the modes that have the most failures.
2. **Call out unparseable pairs separately** — these are not contrast failures
   but data problems (e.g. a non-color value landed on a color token).
3. **List the concrete suggestions.** For each `fail` with an `adjusted`
   suggestion, show `foreground: <current value> → <suggested value>`. For
   `none` suggestions, note that the pairing needs a design decision (changing
   the background or the hue), not just a lightness tweak.

If any failing finding carries an `adjusted` suggestion, use **AskUserQuestion**
to offer:

- **(a) Apply suggestions to the token source** — for the chosen failing pairs,
  update the foreground token's value to its suggested compliant value, via an
  inline skill/edit. Confirm the exact tokens and values first; never apply more
  than the user approves.
- **(b) Show every finding** — print the full pass/fail list, not just failures.
- **(c) Re-run at a different level** — rerun `ds-bridge a11y` with `--level AAA`
  (or `AA`) to compare.
- **(d) Stop** — report only, change nothing.

## Rules

- **Never auto-apply suggestions.** Suggestions are surfaced for review; only an
  explicit user choice (option a) may edit token values, and only the pairs the
  user approved.
- **Never invent ratios or colors.** Use only the values from the JSON block; if
  a suggestion is `none`, do not fabricate a hex — explain the limitation.
- All re-runs go through the CLI: change `--level` or `--modes` and rerun
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs a11y <path> …`.
