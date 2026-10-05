# Recording design-system health in CI

Trends are only as good as their gaps. Instead of depending on someone running a
check locally and committing `.ds-bridge/history.jsonl`, let CI record one
coherent batch on every push to your default branch.

## What runs

`ds-bridge record` is the unit of time in the series. It runs every check that
is configured and needs no network, as one batch sharing a `runId`:

| Check | Runs when |
|---|---|
| `lint .` | always (skipped if no token source is found) |
| `tokens check .` | a token source resolves (skipped otherwise) |
| `a11y .` | a token source with colour pairs resolves |
| `adoption .` | `.ds-bridge/registry.json` exists |
| `registry build .` (→ parity), `library-health` | `--figma` **and** a Figma token + library file key |
| `handoff <url>`, once per `tracked_frames` entry | `--figma` **and** a Figma token (the URL carries the file key) |

### Tracked frames: the designer side of the score

Handoff readiness (15 of the 100 score points), the per-frame readiness trend
and the handoff pass rate only grow when a frame is scored. List the frames
you want measured on every Figma run in `.ds-bridge.json`:

```json
{
  "tracked_frames": [
    "https://www.figma.com/design/<file-key>/<name>?node-id=12-34",
    "https://www.figma.com/design/<file-key>/<name>?node-id=56-78"
  ]
}
```

`record --figma` then runs `handoff <url> --format json` for each one inside
the same `runId`. A frame below the readiness bar is still *recorded* (findings
never fail the run). Every entry must be a Figma URL; a typo is a config error.
With the sample workflow, scheduled runs (`figma: "auto"`) score the tracked
frames weekly once the `FIGMA_TOKEN` secret is set.

`library-health` stores the three hygiene totals plus the **top N components
per signal** (override hotspots by main component, deprecated components with
usage counts, detached candidates by name; `record --library-top <n>`, default
10, `0` = totals only). That is what the dashboard's *Library hotspots trend*
reads to show which components keep getting overridden, which deprecated ones
are going away and which detach spikes come back.

Then it appends one `score` record: the composite, the sub-scores and the
weights used, so a later weights change never rewrites the past. Findings never
fail the run (exit 0); only an internal error exits 2.

Every record carries the v2 envelope:

```json
{"v":2,"at":"2026-10-04T09:12:44.120Z","kind":"lint","source":"ci","git":{"sha":"9f1c2e4…","branch":"main","dirty":false},"tool":{"version":"1.12.0"},"runId":"5b0d…","byKind":{"exact":3,"near":1,"offSystem":0}}
```

## Where the history lives: the `ds-bridge-data` branch

CI history is committed to a separate branch, `ds-bridge-data`, so `main` gets
no bot commits and no merge conflicts. The branch only holds the history file
(at the same repo-relative path, e.g. `.ds-bridge/history.jsonl`).

On each push to the default branch the action:

1. **seeds** the working-tree history from `origin/ds-bridge-data` (creating the
   series from your committed file, or from nothing, on the first run);
2. runs `ds-bridge record --source ci`;
3. **publishes** the file back to `ds-bridge-data` with git plumbing (a
   temporary index and `commit-tree`), pushing `<commit>:refs/heads/ds-bridge-data`.
   The working tree, `HEAD` and the default branch are never written. A
   concurrent push is retried up to three times with an append-only merge, so
   no measurement is lost. The script refuses `main`, `master` and the
   repository's default branch outright.

Read it locally with `git fetch origin ds-bridge-data` and, for example,
`git show origin/ds-bridge-data:.ds-bridge/history.jsonl > /tmp/h.jsonl`, or
render a dashboard from a checkout of that branch.

## Setup

1. Copy [`examples/ds-bridge-record.yml`](../examples/ds-bridge-record.yml) to
   `.github/workflows/ds-bridge-record.yml` in your repository.
2. Pin the action to a ds-bridge **release tag** (tags commit `dist/`, which the
   action runs by default). If you vendor the CLI elsewhere, set the `cli` input
   to its `dist/cli.mjs`.
3. Give the workflow `contents: write` (to publish) and, only if you enable
   comments, `pull-requests: write`.
4. For the Figma checks, set `figma: "true"` (every run) or `figma: "auto"`
   (only when the secret is present — see *Scheduled runs* below) and pass
   `FIGMA_TOKEN` from a secret; the library file key comes from your committed
   `.ds-bridge.json`.

### Inputs

| Input | Default | Meaning |
|---|---|---|
| `path` | `.` | Project directory holding `.ds-bridge/` |
| `data-branch` | `ds-bridge-data` | Branch that stores the CI series (never the default branch) |
| `mode` | `auto` | `auto` (push/schedule/dispatch on the default branch → record; pull_request or any other ref → check), `record`, `check`, `site` (seed + render `site-dir` only — no record, no publish). Only the default branch is ever recorded: `auto` on another ref (a dispatch from a feature branch, an unfiltered push, a tag) only checks, and an explicit `record` there fails |
| `figma` | `"false"` | `"true"`: also run `registry build` + `library-health` and `handoff` for each `tracked_frames` URL; `"auto"`: only when `FIGMA_TOKEN` is set |
| `library-top` | `"10"` | Components per library-health signal stored for the hotspot trends (`record --library-top`, 0–100) |
| `site-dir` | `""` | Render the dashboard site there (`report --format site`), in modes `record` / `site` |
| `digest` | `"false"` | With `site-dir`: also write the manager digest, `digest.html` + `digest.md` |
| `digest-since` | `30d` | The digest window |
| `pr-comment` | `"false"` | Opt in: post/update **one** scorecard comment on the PR |
| `gate` | `"false"` | `report --gate`: fail the PR when a `metric_targets` verdict is red |
| `cli` | action's `dist/cli.mjs` | Path to the CLI bundle, relative to the workspace. Only the CLI changes: the data-branch, mode and comment scripts always come from the action's own ref |
| `github-token` | `github.token` | Token used for the PR comment; only a scorecard comment written by this token's account is ever updated |
| `allow-any-ref` | `"false"` | `"true"`: let `record` record a ref other than the default branch |

## Scheduled runs: Figma trends and a monthly manager digest

Pushes only touch code, so the Figma side (library hygiene, parity) is best
recorded on a **schedule**. The sample workflow adds two crons and a manual
trigger:

```yaml
on:
  schedule:
    - cron: "0 6 * * 1" # weekly: record incl. Figma checks
    - cron: "0 7 1 * *" # monthly: record + Pages site + manager digest
  workflow_dispatch:
```

- **`figma: "auto"`** (scheduled and manual runs in the sample) runs
  `registry build` + `library-health` only when the `FIGMA_TOKEN` secret reaches
  the step — add it under *Settings → Secrets and variables → Actions*. Without
  the secret (a fork, or before you add it) the run degrades to the local checks
  instead of failing. The library file key comes from your committed
  `.ds-bridge.json`. Each weekly point adds to the *Library health trend*, the
  per-component *Library hotspots trend* (`library-top` components per signal)
  and, after `registry build`, the parity trend.
- **The monthly `pages` job** (`needs: record`, `pages: write` + `id-token:
  write`) runs the action with `mode: site`: it seeds `.ds-bridge/history.jsonl`
  from `ds-bridge-data`, renders the dashboard site into `site-dir`, and with
  `digest: "true"` runs `ds-bridge digest --audience manager --since 30d
  --format html` into `site/digest.html` (plus `digest.md` for pasting). The
  job then deploys with `actions/upload-pages-artifact` + `actions/deploy-pages`;
  the action itself never deploys. Enable Pages once (*Settings → Pages →
  Source: GitHub Actions*); the digest lives at
  `https://<owner>.github.io/<repo>/digest.html`.

`digest --audience manager` (alias `managers`) keeps every movement — drift,
lint, on-system %, import coverage, handoff readiness, contrast — in one *For
managers* section, then the same three concrete actions.

For designers the scheduled data feeds three dashboard panels beyond the
library ones: *Frame readiness trend* (each frame's handoff score over time,
frames below the gate first) and *Handoff pass rate* (frames whose latest score
is at or above `readiness_threshold`, over all frames scored, and its trend).
Handoff scores come from `ds-bridge handoff <frame-url>` runs (locally or in
your own workflow); every run is a point.

## Pull requests

On `pull_request` the action seeds and records the same way but **does not
publish** — the PR's measurements stay in the ephemeral runner. With
`pr-comment: "true"` it renders `ds-bridge report --format md --delta
origin/ds-bridge-data` (the PR against the latest default-branch measurements;
current-only on the very first PR) and posts it as one comment, updated in place
on later pushes (it finds its own comment by a hidden marker **and** the token's
account, so a comment someone else starts with the marker is never edited). A
comment that cannot be posted shows as a workflow warning; the `gate` result
still decides the check. Comments are opt-in by design.

Under `pull_request_target` the action only checks and warns: that trigger runs
with a write token and secrets, so never check out the pull request's head in
the same job.

## Hygiene for a committed history

If you also commit `.ds-bridge/history.jsonl` from local runs, add to
`.gitattributes` so concurrent appends merge line-by-line instead of
conflicting:

```gitattributes
.ds-bridge/history.jsonl merge=union
```

ds-bridge never edits `.gitattributes` on its own. To have it add the line for
you, opt in explicitly (idempotent; `--dry-run` previews):

```sh
ds-bridge history init            # or: ds-bridge history init <project-dir> --dry-run
```

and ignore the transient lock file in `.gitignore`:

```gitignore
.ds-bridge/*.lock
```

`ds-bridge history stats` shows what is in the file, `ds-bridge history compact`
removes identical consecutive records (keeping the latest), and `ds-bridge
history migrate` upgrades v1 lines to the v2 envelope.
