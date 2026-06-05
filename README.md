# DS Bridge

A Claude Code plugin that connects your design-system's Figma library to your codebase:
token drift detection, design-system-aware linting, system-first design-to-code, and
pre-handoff QA.

> **Status:** early development — spec-driven, strict TDD.
> See [`SPEC.md`](./SPEC.md) (contract), [`PLAN.md`](./PLAN.md) (build strategy),
> [`TASKS.md`](./TASKS.md) (live task tracker).

## What it will do

| Command | Purpose |
|---|---|
| `/ds-bridge:ds-lint` | Find hardcoded values that should be design tokens |
| `/ds-bridge:token-check` | Detect drift between token source and built outputs |
| `/ds-bridge:handoff-qa` | Score a Figma frame's handoff readiness (0–100) |
| `/ds-bridge:parity-audit` | Figma ↔ code component parity matrix |
| `/ds-bridge:figma-impl` | Frame → on-system code via your component registry |
| `/ds-bridge:dashboard` | Self-contained HTML dashboard with trend charts |

The brain is a standalone CLI (`ds-bridge`) — slash commands are thin wrappers.
Works with Figma Professional+ (remote MCP available on all plans).

## Development

```bash
npm test               # vitest run
npm run check          # typecheck + lint + test + validate
```

## Live Figma smoke test

`e2e/figma-smoke.test.ts` cross-checks the **shapes** our recorded Figma REST
fixtures (`tests/fixtures/figma/*.json`) assume against the **live** Figma API,
so fixture drift surfaces early instead of in production. It asserts structure
(arrays, `id`/`name`/`type` strings, `VARIABLE_ALIAS` shape, `key`/`node_id`/`name`
on components) — never content — and keeps its request budget at ≤ 3 calls
(`getFile` + `getComponents` + `getVersions`).

It is **not** part of `npm test` (the default config only globs `tests/**`).
It is wired to the release checkpoints **C4–C6** and runs **nightly** in CI
(`figma-smoke` job, `cron: "0 3 * * *"`, plus manual `workflow_dispatch`). The
test self-skips unless **both** secrets are present, so CI stays green with or
without them configured.

### Setup

Provide two values as env vars (locally) or repository secrets (in CI):

- `FIGMA_TOKEN` — a Figma personal access token from a **Dev or Full seat**
  (a **View** seat is rate-limited to ~6 requests/month on Tier 1 and will
  trip the limit immediately). Required scopes:
  `file_content:read`, `library_content:read`, `file_versions:read`,
  `file_comments:read`, `file_comments:write`.
  A `rate-limited` outcome is **tolerated** — the test logs a warning and
  passes (View-seat tolerance) rather than failing the nightly job.
- `SMOKE_FILE_KEY` — the key of **any small Figma test file** you can read
  (the file's contents don't matter; only its shapes are checked).

### Run it locally

```bash
FIGMA_TOKEN=figd-… SMOKE_FILE_KEY=abc123 \
  npx vitest run --config vitest.e2e.config.ts e2e/figma-smoke.test.ts
```

With no env vars set the same command reports the suite as **skipped** (exit 0),
never failed.

License: [MIT](./LICENSE)
