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
| `versions.json` | `GET /v1/files/:key/versions` | `{ versions: [{ id, created_at, label, description, user }, …] }`. The second entry has empty `label`/`description` (autosave checkpoint). |
| `comments.json` | `GET /v1/files/:key/comments` | `{ comments: [{ id, message, client_meta, created_at, user, resolved_at: null }, …] }`. Includes a reply (`parent_id` set). |

## Auth & rate-limit notes (SPEC §1 "Figma REST" row)

- Auth header is **`X-Figma-Token`** — NOT `Authorization: Bearer`.
- Scopes are granular (`file_content:read`, `library_content:read`, `file_versions:read`,
  `file_comments:read`/`file_comments:write`); the deprecated `files:read` is avoided.
- Rate limits depend on **seat type**. A View seat is ~6 requests/month on Tier 1, so the
  PAT must come from a **Dev/Full seat**. A `429` carries a `Retry-After` header (seconds);
  the client honors it with injected sleep + jitter.

## Drift mitigation (PLAN risk: "Recorded Figma fixtures drift from real API shapes")

T4.7's gated live smoke test cross-checks these recorded shapes against the live API
(when secrets are present) so fixture drift surfaces at release checkpoints C4–C6, not in
production. This README's capture date + endpoint map is the record that smoke test verifies against.
