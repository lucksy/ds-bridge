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

License: [MIT](./LICENSE)
