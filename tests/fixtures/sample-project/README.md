# Sample project fixture (T2.1)

A tiny, believable React + CSS project used as the **acceptance data** for Phase 2's
lint engine (T2.2 value extraction / token matching, T2.3 fix planning). Every seeded
violation is catalogued in [`expected-findings.json`](./expected-findings.json) — that
file is the **contract**: T2.2/T2.3 assert their extractor reproduces exactly these
findings (line, col, raw, kind, expected token/candidates) and nothing more.

`tests/engines/lint/fixture-project.test.ts` is a smoke spec that protects the contract
from drift: it verifies every referenced file exists, every line is in range, and the
`raw` literal actually appears at the claimed line **and 1-based column**. It also proves
the seeds are valid color-math-wise (near-miss within deltaE 2.5, off-system beyond it)
using culori `differenceCiede2000`.

## Design tokens

`tokens.json` is a **byte-identical copy** of `tests/fixtures/tokens/w3c/tokens.json`.
The relevant token values the seeds key off:

| Token name (dot path) | Type | Value |
|---|---|---|
| `color.base.blue-500` | color | `#3b82f6` |
| `color.brand.primary` | color | `{color.base.blue-500}` → `#3b82f6` |
| `color.base.gray-100` | color | `#f3f4f6` |
| `color.base.gray-900` | color | `#111827` |
| `color.brand.on-primary` | color | `#ffffff` |
| `space.sm` / `space.md` / `space.lg` | dimension | `8px` / `16px` / `24px` |
| `shadow.card` | shadow | color `#11182733`, 0px / 2px / 8px / 0px |

CSS clean lines reference these via custom properties named after the token paths
(`--color-brand-primary`, `--space-md`, `--color-brand-surface`, `--font-weight-bold`,
`--color-base-gray-900`).

## Seeded violations (7 total)

Columns are **1-based** and point at the start of the **value literal** (tabs count as
one character each, matching the byte offset of the literal on its line).

### `src/button.css`

| Line | Col | Raw | Property | Kind | Why |
|---|---|---|---|---|---|
| 2 | 9 | `#3b82f6` | `color` | **exact** | Identical to `color.brand.primary` (resolved `#3b82f6`). Should be flagged as a literal that maps 1:1 to a token. |
| 3 | 14 | `#3a81f5` | `background` | **near** | Off by deltaE ≈ 0.35 from `#3b82f6` — a near-miss the author almost certainly meant to be `color.brand.primary`. Within the 2.5 threshold, so it surfaces candidates, not an exact match. |
| 4 | 11 | `17px` | `padding` | **near** | Magic spacing value 1px off `space.md` (16px). Surfaces `space.md` as the nearest dimension candidate. |

Line 10 (`color: var(--color-brand-primary);`) and the rest of `.button--ghost` are the
**clean control** lines — token-referencing, must NOT be flagged.

### `src/card.module.css`

| Line | Col | Raw | Property | Kind | Why |
|---|---|---|---|---|---|
| 6 | 24 | `#11182733` | `box-shadow` | **exact** | Identical to the `shadow.card` color (`#11182733`). Exercises extracting a color from inside a shorthand `box-shadow` and matching the shadow token's color. |

All other lines use `var(--…)` custom properties — clean.

### `src/Banner.tsx`

A React component with an inline `style` object — exercises the JSX/TS extraction path.

| Line | Col | Raw | Property | Kind | Why |
|---|---|---|---|---|---|
| 9 | 24 | `"#3b82f6"` | `color` | **exact** | String literal equal to `color.brand.primary`. Col points at the opening quote of the value literal. |
| 9 | 44 | `17` | `padding` | **near** | Numeric literal 17 (interpreted as px in React inline styles) — 1px off `space.md` (16px). |

The `import type { ReactNode }` line is present so the file looks like a real module and
the extractor must ignore imports.

### `src/Hero.tsx`

A `styled-components` template literal — exercises CSS-in-JS extraction.

| Line | Col | Raw | Property | Kind | Why |
|---|---|---|---|---|---|
| 4 | 9 | `#ff00aa` | `color` | **off-system** | A magenta with **no** token within deltaE 2.5 (nearest token color is ≈ 39 away). Must be reported as off-system, with no candidates. |

`padding: var(--space-lg);` on the next line is clean.

### `src/Clean.tsx`

A fully clean component: no color/dimension literals at all (uses a CSS-module class
reference). It is the **negative control** — the extractor must produce **zero** findings
for this file. Intentionally absent from `expected-findings.json`.

## Count discipline

`expected-findings.json` contains **exactly 7** entries — one per seeded violation above
and only those. The smoke spec asserts this count, so adding an accidental literal to a
fixture (or removing a seed) breaks the build until the inventory is reconciled.
