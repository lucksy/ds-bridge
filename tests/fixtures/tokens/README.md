# Golden token fixtures (T1.1)

Hand-authored June 2026, shaped after the three formats' official docs:

- **`w3c/`** — W3C Design Tokens Community Group draft (`$value`/`$type`/`$description`,
  group-level `$type` inheritance, `{dot.path}` aliases). One composite (`shadow.card`)
  keeps parsers honest about object values. `invalid-cycle.json` seeds the alias-cycle
  error case shared by parser tests.
- **`tokens-studio/`** — Tokens Studio for Figma export (top-level *sets*, per-token
  `value`/`type`, `$themes` + `$metadata.tokenSetOrder`). Aliases use `{path.in.merged.sets}`.
- **`style-dictionary/`** — Style Dictionary v3 source (`value` leaves, `comment`,
  `{path.value}` references, no explicit types).

Each source file has an `expected.json` twin: the exact `TokenMap` (see
`src/engines/tokens/types.ts`) its parser must produce.

## Normalization decisions encoded in the twins (the contract)

1. `tokens` sorted by `name` (stable diffs).
2. Aliases fully resolved; `aliasOf` records the referenced token's canonical name.
3. `name` = dot path inside the source structure. Tokens Studio set names are NOT part
   of `name`; the set goes in `group`. W3C/SD `group` = first path segment.
4. Values stay as authored post-resolution (raw strings/numbers). Canonical *value*
   normalization (hex case, px/rem, oklch) is T1.5's job, not the parsers'.
5. Tokens Studio type mapping: `spacing|sizing|borderRadius|borderWidth|dimension` →
   `dimension`, `fontWeights` → `fontWeight`, `fontFamilies` → `fontFamily`,
   `color` → `color`, else → `other`.
6. Style Dictionary has no explicit types: category (first segment) heuristics —
   `color` → `color`, `size|space|spacing` → `dimension`, `time` → `duration`,
   unknown → `other`. SD references `{a.b.value}` strip the trailing `.value` for `aliasOf`.
7. W3C `$type` inherits from the nearest ancestor group; per-token `$type` wins.
