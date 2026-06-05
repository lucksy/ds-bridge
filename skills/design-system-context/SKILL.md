---
name: design-system-context
description: Use when implementing UI from Figma designs in a project with a design system - explains ds-bridge registry, tokens, and the no-invention rule.
---

# Design System Context

You are implementing UI in a repository that has a **design system** with a
machine-readable contract: a component **registry** and a set of **design
tokens**. ds-bridge turns both into artifacts you can query. Treat them as
**ground truth**. Your job is to assemble the design out of pieces the system
already provides — not to redraw it from a screenshot.

## The artifacts

### 1. The component registry — `.ds-bridge/registry.json`

Built by `ds-bridge registry build`, it pairs every code component with its
Figma component. Shape (`schemaVersion: 1`):

- `matches[]` — confident code↔Figma pairings:
  `{ codeName, importPath, figmaName, nodeId, score }`. These are the components
  you may use. `importPath` is exactly where to import the component from.
- `unmatchedFigma[]` — Figma components with **no** confident code match, each
  with ranked `candidates: [{ codeName, score }]`. A Figma node that lands here
  is **not safe to use** — see ambiguity below.
- `unmatchedCode[]` — code components Figma does not publish (informational).

Resolve a node with `ds-bridge registry resolve <nodeId|name>`:

- **match** (exit 0) — prints the `RegistryMatch`. Use `codeName` + `importPath`.
- **candidates** (exit 1) — prints `{ kind: "candidates", node, candidates }`.
  The node is **ambiguous**: more than one code component could be it. Do **not**
  pick one yourself — this is a gap.
- **not-found** (exit 1, stderr) — the node is in neither bucket. This is a gap.

### 2. The design tokens

Get the normalized token model with:

```
ds-bridge tokens parse <token-source-file> --format=json
```

It prints a `TokenMap` whose `tokens[]` are
`{ name, type, value, aliasOf?, group? }`. `name` is the canonical dot path
(e.g. `color.brand.primary`), `value` is alias-resolved (e.g. `#3b82f6`).

A raw design value (a hex color, a px dimension) is **on-system** only when it
exactly equals a token's canonical value. When two tokens share a value (a
primitive `color.base.blue-500` and the semantic alias `color.brand.primary`
that points at it), **prefer the semantic alias** — that is the token to write.

### 3. The readiness pre-gate — `ds-bridge handoff <frame-url>`

Before implementing, score the frame's machine-readability. A low score means
the design hardcodes values and detaches components — exactly the conditions
that force gaps. A frame below the readiness threshold is likely to produce more
gaps than code; surface that to the user before spending effort.

## THE NO-INVENTION RULE

> **Anything you cannot resolve to a registered component or an exact token is a
> GAP. Report the gap. Never approximate it visually.**

This is the single most important rule. Concretely, you must **never**:

- write a component the registry does not match (no "close enough" lookalikes,
  no hand-rolled copies of a Figma component that exists but is unpublished);
- pick one code component when `resolve` returns **candidates** — ambiguity is a
  gap, not a coin flip;
- emit a raw hex/px value because no token matched — a near token (within deltaE
  2.5 for color, ±1px for dimension) is a **gap**, usable only with explicit
  designer sign-off, and a value with no near token is a hard gap;
- guess a token name, an import path, or a node id.

A gap is not a failure — it is the correct, honest output. It tells the design
system team exactly what to add (publish a component, add a token). Inventing UI
hides that signal and ships off-system code.

## The gaps report you emit

When you finish resolving a frame, emit a structured gaps report. It mirrors the
engine shape (`findGaps`) so it is reviewable and consistent:

```json
{
  "resolved": [
    {
      "requirement": { "kind": "component", "nodeId": "10:42", "name": "Button / Primary" },
      "resolution": { "kind": "registry-match", "codeName": "Button", "importPath": "components/button.tsx" }
    },
    {
      "requirement": { "kind": "token", "property": "background", "rawValue": "#3b82f6", "valueKind": "color" },
      "resolution": { "kind": "token-exact", "tokenName": "color.brand.primary" }
    }
  ],
  "gaps": [
    {
      "requirement": { "kind": "component", "nodeId": "20:7", "name": "Card" },
      "reason": "ambiguous-registry-match",
      "candidates": ["CardPanel", "CardSurface"],
      "suggestion": "Multiple code components could match \"Card\" — pick one with a designer/engineer, don't guess."
    },
    {
      "requirement": { "kind": "token", "property": "accent", "rawValue": "#ff00aa", "valueKind": "color" },
      "reason": "no-token-match",
      "candidates": [],
      "suggestion": "No token matches \"#ff00aa\" — add a token for it; never approximate with a raw value."
    }
  ]
}
```

Gap `reason` values and what each means:

- `no-registry-match` — no code component for this node; build it or publish the
  Figma component, then rebuild the registry.
- `ambiguous-registry-match` — several code components could match; a human picks.
- `no-token-match` — no token at or near this value; add a token.
- `near-token-only` — a token is within tolerance but not exact; usable **only**
  with designer sign-off, otherwise add a token.

## Workflow summary

1. Ensure the registry is fresh (`registry build`) and load the tokens.
2. For every component-ish node, `registry resolve` it. Map every raw value to a
   token. Collect resolved items and gaps.
3. Write code **only** from `resolved` entries — registered components by their
   `importPath`, exact tokens by their `name`.
4. Emit the gaps report (in your response **and** as a code comment block at the
   top of the generated file) so the gaps travel with the code.
5. Offer next steps for each gap; change nothing in Figma.
