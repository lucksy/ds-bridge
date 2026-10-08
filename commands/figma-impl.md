---
description: "Implement a Figma frame with on-system code"
argument-hint: "<figma-frame-url>"
---

## Your task

Implement the Figma frame at `$ARGUMENTS` as code, using **only** components from
the design-system registry and **only** exact design tokens. Anything you cannot
resolve to the system is a **gap** — report it, never invent UI. Read the
**design-system-context** skill for the registry/token contract and the
no-invention rule; it governs everything below.

Follow these steps in order. Stop at the first one that fails.

### 0. MCP preflight

Confirm a Figma MCP server is connected and authenticated by calling its
**`whoami`** tool. **Any** connected Figma MCP server counts — the one this plugin
bundles (`plugin:ds-bridge:figma`), the official Figma plugin's, or a claude.ai
Figma connector (tools named like `mcp__figma__whoami`). Try each that is
available and use the first that answers authenticated, for this step and every
figma MCP call below; an unauthenticated server is not a failure while another
one works. Only if **none** answers authenticated, emit these instructions
verbatim and **STOP** (do not proceed, do not guess):

> Connect the Figma MCP server: run `/mcp`, choose **figma**, and
> **authenticate**. The remote server is `https://mcp.figma.com/mcp`. Note: this
> MCP authentication is **separate** from the Figma REST personal access token
> (PAT) used by the ds-bridge CLI — you need both, and connecting one does not
> connect the other.

### 1. Readiness pre-gate

Score the frame's machine-readability first:

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs handoff '$ARGUMENTS' --format=json`

The block above is the `ReadinessReport` for the frame. If it errored (bad URL,
missing token), surface the one fix and stop. Otherwise read `score`. If it is
**below the threshold** (default 80, or the report's redline), warn the user that
a low-readiness frame hardcodes values and detaches components — which produces
gaps instead of code — and use **AskUserQuestion** to offer: **(a)** continue
anyway, or **(b)** stop and fix the frame first. Respect their choice. (This
command runs **inline**, so `AskUserQuestion` is available.)

### 2. Pull design context

Gather the frame's structure and bound variables from the figma MCP:

- **`get_design_context`** — the frame's node tree, layout, and styling.
- **`get_variable_defs`** — the variables/tokens the frame references.
- **`get_metadata`** — node ids and names for resolution.
- **`search_design_system`** — hints for which library component a node uses.

From this, build the list of **requirements**: every component-ish node (with its
`nodeId` + `name`) and every raw style value (with its `property`, `rawValue`, and
`valueKind` of `color` or `dimension`).

### 3. Resolve against the system

The registry maps Figma nodes to code components, and the `registry resolve`
calls below read it. Source it **without rebuilding silently** — get approval
through a native prompt first. Check whether `.ds-bridge/registry.json` exists
(a quick `test -f` with the Bash tool), then call **AskUserQuestion** (available
because this command runs **inline**):

- **Registry missing** → it must be built to proceed. Ask: "No component registry
  yet — it's required to resolve components. Build it now? (scans your components
  + fetches the Figma library; needs network access)" with options **Build it
  now** · **Cancel**. On **Cancel**, stop — resolution is impossible without it.
- **Registry present** → ask whether to refresh: "A component registry already
  exists. Rebuild it to pick up the latest Figma library and code, or use the
  existing one?" with options **Rebuild** · **Use existing**.

To build or rebuild (on **Build it now** / **Rebuild**), run this with the Bash
tool (it inherits the configured Figma file key and PAT from the plugin
environment):

`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs registry build`

If it reports a missing Figma file key or PAT, surface that one fix
(`/plugin configure` + restart) and stop. Then resolve every component node:

- For each component node: `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs registry resolve <nodeId>`.
  - **match** (exit 0) → resolved: use `codeName` + `importPath`. When the match
    carries `replaces` (`{ name, hint }`), the node is an instance of a
    deprecated component whose Figma description names this replacement:
    implement the replacement, applying the `hint` (e.g. `variant=primary`) as
    its props, and list it in the summary as "deprecated X → Y" so the designer
    swaps the instance too. This is a resolution, not a gap.
  - **candidates** (exit 1) → gap `ambiguous-registry-match` (list the
    candidate code names; do **not** pick one).
  - **not-found** (exit 1) → gap `no-registry-match`.
- For each raw value: map it through the token source —
  `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs tokens parse <token-source> --format=json`.
  An exact value hit → resolved `token-exact` (prefer the semantic alias token).
  Within tolerance but not exact → gap `near-token-only` (sign-off required).
  Nothing → gap `no-token-match`.

### 4. Write code — resolved only

Generate the implementation **exclusively** from resolved entries: import each
registered component from its exact `importPath`; reference each exact token by
its `name`. Do not write a component the registry did not match. Do not emit a
raw hex/px because no token matched.

### 5. Emit the gaps report — never invent UI

For everything unresolved, emit the structured **gaps report** (the `findGaps`
engine shape: `{ resolved, gaps }`, each gap carrying `requirement`, `reason`,
`candidates`, `suggestion`) **both** in your response **and** as a comment block
at the top of the generated file, so the gaps travel with the code. Example:

```
/* ds-bridge gaps — DO NOT invent UI for these; resolve with the DS team:
 * - [ambiguous-registry-match] "Card" → candidates: CardPanel, CardSurface
 * - [no-token-match] accent "#ff00aa" → add a token; do not hardcode
 */
```

Never approximate a gap visually. A gap is the correct, honest output.

To **persist** this as a dashboard artifact, run
`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs frame-impl $ARGUMENTS` — it re-runs the
same `findGaps` pass over the frame, prints the on-system % + gaps, and writes a
`frame-impl` history line so the report's frame-implementability section tracks it
over time.

### 6. Next steps

Summarize: what was implemented, and for each gap the concrete action
(publish/build the component, add a token, or get designer sign-off on a near
token). Change nothing in Figma.

## Rules

- **Never invent UI.** Unresolved = gap, always reported, never approximated.
- **Never pick** among ambiguous registry candidates — that is a human decision.
- **Never rebuild the registry without explicit approval** — always ask via the
  AskUserQuestion prompt in step 3 (Rebuild / Use existing), never silently.
- **Never write to Figma.** This command reads design context and generates code.
- Reference the **design-system-context** skill for the full contract.
