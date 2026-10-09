---
description: "Review recurring exceptions: components overridden run after run, who owns each conversation, and what was decided"
argument-hint: "[path]"
---

## Recurring exceptions

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.mjs report '$ARGUMENTS' --artifacts=exceptions-review --format=json`

## Your task

The block above is `ds-bridge report --artifacts exceptions-review --format json`.
Read `data.exceptionsReview` (absent = nothing listed yet):

```
{
  "dates": [ "YYYY-MM-DD", … ],            // recorded library-health runs
  "rows": [ { signal, name, runs, latest, state, owner?, decision?, note?, reviewBy? }, … ],
  "totals": { needsOwner, overdue, inReview, decided, resolved, notSeen }
}
```

A **recurring exception** is a component that shows up as an override hotspot
(or deprecated usage / detached candidate) on 2+ recorded runs and is not back
to zero. One-off deviations are left out on purpose. The idea: a deviation that
keeps coming back is a **conversation to have**, not a failure. Either the
implementation needs fixing, or the component is missing a real use case and
should evolve.

`state` is one of:

- `needs-owner`: recurring, nobody has logged an owner or a decision yet.
- `overdue`: logged, but its `review_by` date has passed and it is still present.
- `investigating`, `fix-implementation`, `evolve-component`: the logged decision.
- `resolved`: logged, and the component's count is back to 0, so the entry can be closed.
- `not-seen`: logged, but the name matches no stored hotspot (typo, or below the stored top N).

If `data.exceptionsReview` is absent, say there is nothing recurring yet. Recurring
needs at least two `library-health` runs with stored top-N lists (`ds-bridge
library-health`, or `ds-bridge record --figma`). Then stop.

Otherwise:

1. **Lead with the queue.** Start with the `needs-owner` rows (name, signal, latest
   count, "seen in N of M runs"), then `overdue`, then the rest grouped by state.
2. **Frame each `needs-owner` row as a question, not a fault.** For example: "Card
   is overridden on every recorded run. Does the implementation need fixing, or
   is Card missing a use case?"
3. **Offer to log the decision.** For each `needs-owner` row the user wants to
   triage, ask for the owner (a person or team handle), the decision
   (`investigating` | `fix-implementation` | `evolve-component`), an optional
   one-line note, and an optional review date. Then show the exact entry you
   would add to the `exceptions` array in `.ds-bridge.json`:

   ```json
   { "component": "Card", "owner": "@checkout-design", "decision": "evolve-component",
     "note": "Needs a compact layout for order lists", "review_by": "2026-11-15" }
   ```

   Optional `"signal": "overrides" | "deprecated" | "detached"` scopes an entry
   to one signal (absent = all).
4. **Suggest cleanup.** `resolved` rows can be removed from the config, `overdue`
   rows need a new review date or decision, and `not-seen` rows probably have a
   misspelled component name.

## Rules

- **Exceptions never hide drift.** Logging an entry changes no count and no
  score. Say this whenever you log one, so nobody expects the number to improve
  just because an exception was written down.
- **Edit `.ds-bridge.json` only after the user confirms the exact entry.** Keep
  every other key byte-for-byte, and append to the existing `exceptions` array.
  After the edit, re-run the block's command to show the updated queue.
- Do not invent owners or decisions. Those come from the people involved.
