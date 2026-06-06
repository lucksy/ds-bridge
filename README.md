# DS Bridge

A Claude Code plugin that connects your design system's Figma library to your
codebase: **token drift detection**, **design-system-aware linting**,
**system-first design-to-code**, and **pre-handoff QA** — with rich terminal
output and a self-contained HTML dashboard.

The brain is a standalone CLI (`ds-bridge`, bundled to a single
`dist/cli.mjs`). Slash commands are thin wrappers over it, so the same engine
runs inside Claude Code, on your machine, and in CI. Works with **Figma
Professional+** (the remote Figma MCP server is available on all plans).

> **Status:** v0.4.0 — spec-driven, strict TDD. See [`SPEC.md`](./SPEC.md)
> (contract), [`PLAN.md`](./PLAN.md) (build strategy), [`TASKS.md`](./TASKS.md)
> (live task tracker). The marketing site under [`website/`](./website) is built
> and live at **<https://ds-bridge.pages.dev>** (Cloudflare Pages).

## Who it serves

- **DS developers** — stop re-deriving tokens and components by hand; catch
  off-system code at the door, before it lands in a PR.
- **DS designers** — validate that designs are machine-readable before handoff;
  see the code impact of token changes.
- **DS managers** — track drift, adoption, and handoff readiness as real metrics
  with offline HTML reports.

The architecture treats **the repo as the source of truth** (W3C / Tokens
Studio / Style Dictionary token files) and uses Figma to *validate designs
against it* — no Enterprise Variables API, Library Analytics, or Code Connect
required.

## Install

DS Bridge ships as a Claude Code plugin. There is **no `npm install` step at
runtime** — the plugin bundles its CLI as `dist/cli.mjs`.

### a) Install as a plugin (git URL via a marketplace)

Claude Code installs plugins from a **marketplace**. Point one at this repo,
then install `ds-bridge` from it:

```bash
# 1. Register this repo as a marketplace (URL, local path, or GitHub repo work)
claude plugin marketplace add <git-url-or-owner/repo>

# 2. Install the plugin from that marketplace
claude plugin install ds-bridge

#    (disambiguate when several marketplaces are configured)
claude plugin install ds-bridge@<marketplace-name>
```

You can pre-seed `userConfig` options non-interactively with repeatable
`--config` flags (validated against the manifest, stored the same way as the
interactive `/plugin configure` flow):

```bash
claude plugin install ds-bridge \
  --config figma_file_key=abc123 \
  --config readiness_threshold=85
```

Useful follow-ups: `claude plugin list`, `claude plugin details ds-bridge`,
`claude plugin update ds-bridge`, `claude plugin uninstall ds-bridge`.

> Run `claude plugin install --help` and `claude plugin marketplace add --help`
> for the exact, current flag set — the CLI is the source of truth.

### b) Local development (no install)

Load the plugin straight from a checkout for the current session — no
marketplace, no install:

```bash
claude --plugin-dir /path/to/ds-bridge
```

`--plugin-dir` is repeatable and also accepts a `.zip`. Inside that session the
slash commands (`/ds-bridge:ds-lint`, …) and the two hooks are live.

### c) Standalone CLI (no Claude Code at all)

Every behavior lives in the bundled CLI, so you can run it directly — handy for
CI gates and scripts:

```bash
node dist/cli.mjs --help
node dist/cli.mjs lint ./src
node dist/cli.mjs tokens check --report
```

`dist/cli.mjs` is committed at release tags only; build it from a fresh checkout
with `npm run build`. Requires **Node ≥ 22**.

## Configuration (`userConfig`)

When you enable the plugin, Claude Code prompts for these options natively (no
`settings.json` hand-editing). They are declared in
[`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json):

| Option | Type | Default | What it does |
|---|---|---|---|
| `figma_file_key` | string | — | Key from your Figma **library file** URL (`…/file/<KEY>/…`). Used by `registry build` and any library-wide audit. |
| `figma_token` | string · **sensitive** | — | Figma personal access token. Stored in the system **keychain**, never in a file. See PAT guidance below. |
| `token_source` | file | auto-detected | Your W3C / Tokens Studio / Style Dictionary entry file. If unset, DS Bridge discovers it from common paths. |
| `report_style` | string | `both` | Report output: `html`, `terminal`, or `both`. |
| `readiness_threshold` | number (0–100) | `80` | The handoff-readiness gate `/ds-bridge:handoff-qa` must clear for a frame to pass. |

**Config resolution order** (highest wins): CLI flags → env vars
(`CLAUDE_PLUGIN_OPTION_*`, `FIGMA_TOKEN`) → project `.ds-bridge.json` →
`userConfig` defaults. A missing token is a typed outcome with an actionable
message, never a crash.

### Figma personal access token (PAT)

- **Seat matters.** Create the PAT from a **Dev or Full seat**. A **View** seat
  is rate-limited to ~6 requests/month on Tier 1 and will trip the limit
  immediately.
- **Required scopes:** `file_content:read`, `library_content:read`,
  `file_versions:read`, `file_comments:read`, `file_comments:write`. (The
  legacy `files:read` scope is deprecated.)
- **Sensitive → keychain.** Because `figma_token` is `sensitive: true`, Claude
  Code stores it in your OS keychain and exposes it to plugin scripts as
  `CLAUDE_PLUGIN_OPTION_FIGMA_TOKEN`. **Never** put it in `.ds-bridge.json` (the
  config loader explicitly ignores a token there and warns).
- **Standalone CLI users** set `FIGMA_TOKEN` in the environment instead; the CLI
  checks both variables.
- **The MCP connection is separate.** The remote Figma MCP server
  (`https://mcp.figma.com/mcp`) authenticates on its own — the REST PAT above
  does not authenticate MCP, and vice versa.

## Commands

All slash commands are namespaced `/ds-bridge:<name>`; each is a thin wrapper
that runs the CLI and interprets its `--format=json` output. The CLI exits
**0** = clean/pass, **1** = findings/below-gate, **2** = usage/config error
(e.g. missing token, no registry, parse failure).

| Slash command | CLI underneath | What it does | Exit codes |
|---|---|---|---|
| `/ds-bridge:ds-lint [--fix] [path]` | `ds-bridge lint [path] [--fix] [--format] [--tokens] [--changed]` | Find hardcoded values that should be design tokens; `--fix` rewrites **exact** matches only (never near-misses). | 0 clean · 1 violations · 2 error |
| `/ds-bridge:token-check [--report] [path]` | `ds-bridge tokens check [path] [--report] [--tokens] [--outputs] [--format]` | Detect drift between the token source and built outputs (stale / missing / orphan); `--report` writes the dashboard. | 0 in-sync · 1 drift · 2 error |
| `/ds-bridge:dashboard [path]` | `ds-bridge report [path] [--open] [--out]` | Render the offline HTML dashboard from `.ds-bridge/history.jsonl`; `--open` launches the browser. | 0 ok · 2 error |
| `/ds-bridge:handoff-qa <url> [--threshold N]` | `ds-bridge handoff <url> [--threshold] [--comment --yes] [--format]` | Score a Figma frame's handoff readiness (0–100); `--comment --yes` posts one Figma comment after confirmation. | 0 ≥ threshold · 1 below · 2 error |
| `/ds-bridge:parity-audit [component]` | `ds-bridge parity [component] [path] [--markdown] [--format]` | Figma ↔ code component parity matrix (missing-in-code / missing-in-figma / prop-mismatch); `--markdown` for a PR table. | 0 all ok · 1 gaps · 2 no registry |

Supporting CLI commands (no slash wrapper of their own):

| CLI command | What it does | Exit codes |
|---|---|---|
| `ds-bridge tokens parse <path> [--format]` | Parse a token file and print its normalized model. | 0 ok · 1 parse error |
| `ds-bridge registry build [path] [--format]` | Scan code components + fetch the Figma library → write `.ds-bridge/registry.json`. | 0 ok · 2 missing token/file-key |
| `ds-bridge registry resolve <nodeNameOrId> [path]` | Resolve a Figma node id or name against the saved registry (used by the planned `figma-impl`). | 0 resolved · 1 unresolved · 2 no registry |

Every command supports `--format=json` (machine-readable, used by skills and
tests), `--format=term` (default; colors, unicode bars), and where applicable
`--report`/`--out` for the HTML dashboard.

The `parity-audit` command can hand off to the **`parity-auditor`** agent
(`model: sonnet`, read-only tools) for a full reconciliation plan. The
`figma-impl` flagship command and its background-knowledge skill are planned for
v1.0.0 (see roadmap) and are **not** shipped at v0.4.0.

## Hooks

Two hooks ship in [`hooks/hooks.json`](./hooks/hooks.json). Both are
fail-quiet — **they always exit 0 and never block your workflow**:

- **`PostToolUse` (matcher `Write|Edit`)** → `scripts/hook-lint.mjs`. After you
  write or edit a file, it lints just that file (≤1.5 s budget). On findings it
  emits a `hookSpecificOutput.additionalContext` summary; on clean files,
  non-lintable files, errors, or timeout it exits silently.
- **`SessionStart`** → `scripts/hook-freshness.mjs`. A cheap staleness probe: if
  your token source changed since the last check (or was never checked) it adds
  one line of context nudging you to run `/ds-bridge:token-check`. Otherwise
  silent. It never runs the linter or spawns the CLI.

## Project state layout

DS Bridge keeps **project state** in the repo (PR-reviewable) and **caches** in
plugin data:

```
<project>/.ds-bridge/
├── registry.json            # component registry (schema-versioned, stable diff order)
├── history.jsonl            # one record per lint/drift run — feeds the dashboard trends
└── reports/
    └── dashboard.html       # latest self-contained HTML report (offline, no CDN)
```

- `.ds-bridge/` is **committed** — registry and run history are reviewable in
  PRs.
- Rebuildable caches (Figma version cursor, REST cache) live under
  `CLAUDE_PLUGIN_DATA` (`~/.claude/plugins/data/<id>/`), which survives plugin
  updates.
- DS Bridge **never** writes to `CLAUDE_PLUGIN_ROOT` (ephemeral across updates).

## Development

```bash
npm run dev            # tsx watch on the CLI entry
npm test               # vitest run
npm run test:watch     # TDD inner loop
npm run test:coverage  # coverage (gate: ≥90% lines on src/engines)
npm run typecheck      # tsc --noEmit
npm run lint           # biome check .
npm run lint:fix       # biome check --write .
npm run build          # tsup → dist/cli.mjs (committed at release tags)
npm run validate       # claude plugin validate . --strict
npm run check          # typecheck + lint + test + validate (pre-commit gate)
```

The marketing site is its own package under [`website/`](./website) (Next.js
static export), live at <https://ds-bridge.pages.dev> — tutorials: <https://ds-bridge.pages.dev/tutorials/>.

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

## Status & roadmap

- **v0.4.0 (today):** `ds-lint`, `token-check`, `dashboard`, `handoff-qa`,
  `parity-audit` slash commands live over a fully-tested CLI; the
  `parity-auditor` agent and two fail-quiet hooks; offline HTML dashboard with
  drift/lint trends; Figma REST client with a nightly live smoke test.
- **v1.0.0 (next):** the flagship `/ds-bridge:figma-impl` (frame → on-system
  code via the registry + a structured gaps report) and headless E2E coverage
  that proves the plugin loads in `claude -p --bare`.
- **Website:** live at <https://ds-bridge.pages.dev> — landing page + ten
  tutorials, deployed from `website/` via Cloudflare Pages.

License: [MIT](./LICENSE)
