---
description: "Assess the Figma library's hygiene: override hotspots, deprecated usage, and detached-instance candidates"
argument-hint: "[--file-key <keyOrAlias>] [--refresh]"
---

## Library health output

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs library-health '$ARGUMENTS' --format=json`

## Your task

The block above is the JSON output of `ds-bridge library-health` for the user's
arguments (`$ARGUMENTS`). It crawls the design-system Figma library's node tree
(cached; pass `--refresh` to re-crawl, `--file-key <key|alias>` to target a
specific file) and has the shape:

```
{
  "overrideHotspots":   [ { nodeId, name, componentName, overrideCount, fields }, … ],
  "deprecatedUsage":    [ { componentName, count }, … ],
  "detachedCandidates": [ { nodeId, name, heuristic: true }, … ],
  "totals": { "overrideHotspots", "deprecatedUsage", "detachedCandidates", "placedInstances" },
  "truncated": true   // only when a list is capped below its total
}
```

- **Override hotspots** — placed instances that override their component's
  design (`fields`: fills, strokes, visibility…), named by their component set
  (`componentName`). Instances inside the library's own component definitions,
  prototype/annotation fields and private helpers (`_Note`) are not counted.
  Group by `componentName` for "which components drift": many instances of one
  component overriding the same fields suggests a missing variant/prop.
- **Deprecated usage** — instances of components whose names match the
  deprecation pattern, still in use.
- **Detached candidates** — frames that look like detached instances of a library
  component: they carry its exact layers (`name:TYPE` of the direct children,
  with at least one content layer), however they were renamed, or share its name
  and most of its layers. Still a heuristic (`heuristic: true`) — verify.

If the block is empty or shows an error (e.g. no `figma_file_key`/token), surface
the error + the remedy (set `figma_file_key`, export `FIGMA_TOKEN`, or pass
`--file-key`) and stop.

Otherwise:

1. **Lead with the totals**, worst-first: override hotspots, then deprecated
   usage, then detached candidates.
2. **Name the worst offenders** in each non-empty list (component/frame name +
   the count or overridden props), so the producer knows exactly what to fix.
3. **Point at the dashboard.** Note that the `library-health` and
   `library-health-trend` panels in `/ds-bridge:dashboard` track these counts
   over time, and `library-hotspots-trend` tracks the top components per
   signal (each run stores the top 10; `--top <n>` changes it) — so a designer
   can see whether a specific component is getting better or worse (run
   `ds-bridge report` to render them).
4. **Recurring hotspots are a conversation.** A component overridden run after
   run may be missing a use case rather than being misused. Point at
   `/ds-bridge:exceptions`, which lists recurring hotspots with their owner and
   decision (or *needs an owner*) and helps log one in `.ds-bridge.json`.

## Rules

- **Preserve the detached-candidate caveat VERBATIM** whenever you report that
  number — it is a heuristic:
  `REST cannot truly detect detachment; expect false positives`. Never present
  it as an exact count.
- **Read-only.** This command reports; it never edits the Figma file or tokens.
- All re-runs go through the CLI: change `--file-key` or add `--refresh` and
  rerun `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs library-health …`.
