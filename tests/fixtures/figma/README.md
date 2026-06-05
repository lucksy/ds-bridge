# Figma REST fixtures (synthetic)

**Provenance:** synthetic, hand-authored JSON. **No real Figma data, file keys, user IDs, or tokens.**
Shaped per the official Figma REST API documentation at <https://developers.figma.com/docs/rest-api/>.

- **Capture date:** 2026-06-05
- **API surface modeled:** `/v1` endpoints
- **Synthetic file key used in tests:** `ABcdEFghIJklMNopQRstUV`

## Endpoint → fixture map

| Fixture | Endpoint | Shape notes |
|---|---|---|
| `file.json` | `GET /v1/files/:key` | `name`, `lastModified`, `version`, plus `document` tree `DOCUMENT > CANVAS > FRAME > children (RECTANGLE / TEXT / INSTANCE)`. Several nodes carry `boundVariables.fills[] = { type: "VARIABLE_ALIAS", id: "VariableID:1:2" }`, `absoluteBoundingBox`, solid `fills`, some frames carry `layoutMode`, and `INSTANCE` nodes carry `componentId`. |
| `file-nodes.json` | `GET /v1/files/:key/nodes?ids=1:2,1:7` | `{ nodes: { "1:2": { document: {…} }, "1:7": { document: {…} } } }`. Each entry wraps the node subtree under `document`. |
| `components.json` | `GET /v1/files/:key/components` | `{ meta: { components: [{ key, node_id, name, description, containing_frame }, …] } }`. |
| `components-before.json` | `GET /v1/files/:key/components` (snapshot A) | Same shape as `components.json`. Baseline inventory for the impact diff engine. See "Impact two-snapshot fixtures" below. |
| `components-after.json` | `GET /v1/files/:key/components` (snapshot B) | Same shape; the later inventory seeded with one of every diff category against `components-before.json`. |
| `versions.json` | `GET /v1/files/:key/versions` | `{ versions: [{ id, created_at, label, description, user }, …] }`. The second entry has empty `label`/`description` (autosave checkpoint). |
| `comments.json` | `GET /v1/files/:key/comments` | `{ comments: [{ id, message, client_meta, created_at, user, resolved_at: null }, …] }`. Includes a reply (`parent_id` set). |

## Auth & rate-limit notes (SPEC §1 "Figma REST" row)

- Auth header is **`X-Figma-Token`** — NOT `Authorization: Bearer`.
- Scopes are granular (`file_content:read`, `library_content:read`, `file_versions:read`,
  `file_comments:read`/`file_comments:write`); the deprecated `files:read` is avoided.
- Rate limits depend on **seat type**. A View seat is ~6 requests/month on Tier 1, so the
  PAT must come from a **Dev/Full seat**. A `429` carries a `Retry-After` header (seconds);
  the client honors it with injected sleep + jitter.

## Impact two-snapshot fixtures (T7.6)

`components-before.json` and `components-after.json` are two published-component
snapshots of the same synthetic library, used as the acceptance data for the
impact (breaking-change radar) engine (T7.7 diff). They are seeded so the diff
between them contains **exactly one of every category** the engine classifies:

| Category | Component | node_id | Detail |
|---|---|---|---|
| **added** | `Card / Default` | `10:90` | Only in *after*; a brand-new standalone component in a new `Cards` frame. |
| **removed** | `Input / Text` | `10:58` | Only in *before*; dropped from the library. |
| **renamed** | `Avatar` → `Avatar / User` | `10:70` | Same `node_id`, name changed to a clearly similar name (shares the `Avatar` token). |
| **variant-prop change** | `Badge` set | `9:4` (set) / `10:82` (new child) | *before* has `Size=sm`, `Size=md`; *after* adds `Size=lg`. The set frame `Badge` is unchanged; its variant axis gains a value. |
| **unchanged** | `Button / Primary` | `10:42` | Byte-identical across snapshots (the negative control). |

Variant children carry their variant name (`Size=sm` …) as the component `name`
and share a `containing_frame.name` of `Badge` — the same shape `scan-figma.ts`
merges into a single component-set model. `tests/engines/impact/fixtures.test.ts`
is the smoke spec that protects these seeds from drift; it asserts each category
at the raw-node level without importing the diff engine.

## Drift mitigation (PLAN risk: "Recorded Figma fixtures drift from real API shapes")

T4.7's gated live smoke test cross-checks these recorded shapes against the live API
(when secrets are present) so fixture drift surfaces at release checkpoints C4–C6, not in
production. This README's capture date + endpoint map is the record that smoke test verifies against.
