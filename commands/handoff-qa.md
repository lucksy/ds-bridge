---
description: "Score a Figma frame's handoff readiness"
argument-hint: "<figma-frame-url> [--threshold N]"
---

## Readiness report

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs handoff '$ARGUMENTS' --format=json`

## Your task

The block above is the JSON output of `ds-bridge handoff` for the user's
arguments (`$ARGUMENTS`). It is a **ReadinessReport** with these fields:

- `score` — an integer 0–100. Think of it as a **gauge**: a needle that sweeps
  from 0 (not machine-readable at all) to 100 (clean design-to-code handoff).
  The **threshold** (default 80, or whatever `--threshold N` the user passed) is
  the redline on that gauge — at or above it the frame passes the handoff gate,
  **unless `blockers` is non-empty**; below it the frame needs work before it
  ships to engineering.
- `blockers` — findings that fail the gate **whatever the score**: today, an
  instance of a deprecated component (`reason: "deprecated-component"`, with a
  `fix`). A frame at 95 with one blocker does **not** pass.
- `stats` — rollup counts that explain the score: `totalNodes`,
  `boundCoverage` and `autoLayoutCoverage` (fractions 0–1), `instanceCount`,
  `detachedSuspects`, `deprecatedInstances` (instances of components whose name
  marks them deprecated/legacy), `textNodes` and `typedTextCoverage` (fraction
  0–1 of text layers using a text style or bound type variables), `badNames`.
- `deductions` — the per-node point losses, worst-first. Each has:
  - `rule` — one of `var-binding`, `auto-layout`, `component`, `typography`,
    `naming`.
  - `nodeId`, `nodeName` — which layer lost the points.
  - `points` — how much this node subtracted from 100.
  - `fix` — the concrete remedy.

If the block shows an error (e.g. an invalid URL, a missing token, or a Figma
API failure), surface that message to the user, explain the one action that
resolves it (for a missing token: create a Dev/Full-seat PAT with the listed
scopes), and stop.

Otherwise:

1. **Present the score against the gauge.** State the score out of 100 and
   whether it is above or below the threshold, framed as the gauge mental model
   ("the needle sits at 90 of 100; the redline is 80, so this frame passes").
   If `blockers` is non-empty, say first and plainly that the frame is
   **blocked** regardless of the score, and list each blocker with its `fix`.
2. **Group the deductions by rule.** For each rule that appears
   (`var-binding`, `auto-layout`, `component`, `typography`, `naming`), list the affected
   layers and the shared `fix`, summing the points lost to that rule. Lead with
   the rule that cost the most points.
3. **Explain each rule briefly** in handoff terms:
   - `var-binding` — fills/strokes hardcoded instead of bound to variables, so
     generated code gets raw hex instead of token references.
   - `auto-layout` — frames without auto layout become absolute-positioned code
     instead of flex/stack.
   - `component` — a component-named layer that is detached, not a live
     instance, so it won't map to the coded component.
   - `typography` — text with no text style (or bound type variables), so code
     gets raw font sizes instead of the type scale.
   - `naming` — default names ("Frame 12") yield meaningless code identifiers.

### Then, if the frame fails the gate (below the threshold, or blocked)

Use **AskUserQuestion** to offer the user a choice (this command runs **inline**,
not in a `context: fork` background task, because `AskUserQuestion` is only
available to inline skills):

- **(a) Post a summary as a Figma comment** — rerun the CLI with `--comment
  --yes`, i.e.
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs handoff '$ARGUMENTS' --comment --yes`.
  Tell the user plainly that this **writes a comment to the Figma file** (the
  score plus the top deductions), so the designer sees the findings in context.
- **(b) Show per-node detail** — walk the deductions one node at a time with the
  exact `nodeName`, `points`, and `fix`, so the user can triage layer by layer.
- **(c) Stop** — report only, change nothing.

If the score is at or above the threshold and there are no blockers, congratulate the user that the frame
passes the handoff gate and note any remaining low-cost deductions they could
still tidy up — but do not offer to post a comment unless they ask.

## Rules

- **Never edit the Figma file yourself.** The only write path is rerunning the
  CLI with `--comment --yes`, and only after the user explicitly chooses option
  (a). Posting a comment is a write to Figma — always confirm intent first.
- **Never invent a score or deductions.** Report only what the JSON block
  contains. If it is empty or malformed, say so and stop.
- Respect the user's `--threshold` if they passed one; otherwise the CLI's
  configured default (80) is the redline.
