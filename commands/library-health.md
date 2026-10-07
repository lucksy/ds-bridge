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
  "overrideHotspots":   [ { name, nodeId, overriddenProps }, … ],
  "deprecatedUsage":    [ { name, count, … }, … ],
  "detachedCandidates": [ { nodeId, name, heuristic: true }, … ],
  "totals": { "overrideHotspots", "deprecatedUsage", "detachedCandidates" }
}
```

- **Override hotspots** — library components whose instances override many props
  (a sign the component's API doesn't match real usage; candidates for new
  variants/props).
- **Deprecated usage** — instances of components whose names match the
  deprecation pattern, still in use.
- **Detached candidates** — frames that look like detached instances of a library
  component (matched by exact name).

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

## Rules

- **Preserve the detached-candidate caveat VERBATIM** whenever you report that
  number — it is a heuristic:
  `REST cannot truly detect detachment; expect false positives`. Never present
  it as an exact count.
- **Read-only.** This command reports; it never edits the Figma file or tokens.
- All re-runs go through the CLI: change `--file-key` or add `--refresh` and
  rerun `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs library-health …`.
