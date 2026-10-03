---
description: "Connect ds-bridge to Figma — save your token so it survives restarts"
argument-hint: ""
---

## Connect ds-bridge to Figma

!`printf 'DS_BRIDGE_CLI=%s\n\n' "${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs"; node "${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs" config persist-token 2>&1 || true`

## Your task

The block starts with a `DS_BRIDGE_CLI=<absolute path>` line (the plugin's CLI,
for the terminal step below), followed by the result of `ds-bridge config
persist-token` — which saves any Figma token **already in this session's
environment** into a gitignored `.ds-bridge.env` (`0600`) that the CLI auto-loads on
every run, so it survives a Claude Code restart.

Why this exists: Claude Code does **not** persist a plugin's `sensitive` config
across restarts (issue #62442). The Figma token typed into `/plugin configure` lives
only in the session it was entered and is lost on restart, so it can't be relied on
by itself. `.ds-bridge.env` is the durable home for it.

Read the `persist-token` result and respond:

1. **Success** — it says `Saved Figma token (figd…XXXX) … to …/.ds-bridge.env`.
   Tell the user ds-bridge is now connected and the token will survive restarts.
   Relay the **masked** token and the file path (never a full token). Then point
   them at the rest of setup:
   - If they haven't set a **library file** yet, have them run
     `ds-bridge config set-library <url-or-key>` (writes the non-secret
     `figma_file_key` to the committed `.ds-bridge.json`, shared by the team).
     Product/consumer files register with `ds-bridge config add-product <alias>
     <url>`.
   - `ds-bridge config show` prints the effective config (token masked) and which
     source won each value — the quickest way to confirm everything resolved.
   - Then the features: `/ds-bridge:ds-docs`, `/ds-bridge:token-check`,
     `/ds-bridge:library-health`, `/ds-bridge:handoff-qa`.

2. **No token reachable** — it says `No Figma token in this session's environment`.
   Nothing was written (expected — the dialog secret usually doesn't reach the CLI).
   The clean way to connect is the plugin's **interactive** command, which prompts
   for the token with the input **hidden** and writes `.ds-bridge.env` for them — the
   PAT never enters this chat or their shell history. Tell the user to run this once
   **in their own terminal** (substitute the real path from the `DS_BRIDGE_CLI=` line
   in the block above):

       node <DS_BRIDGE_CLI> config connect --verify

   It will prompt for the Figma personal access token (hidden), then the library file
   key, write `.ds-bridge.env` (gitignored, `0600`), and then `--verify` pings Figma
   (`/v1/me` + a library read) to confirm the token works and the seat can read
   library content — catching a throttled View-seat token immediately. After it
   finishes, they come back and run `/ds-bridge:ds-docs` (or `/ds-bridge:connect` again to confirm)
   — the CLI loads the file automatically. Mention the token requirements (below).

   Do **not** ask the user to paste their token into the chat, and **never** invent
   one. (Advanced users who prefer it can instead add `FIGMA_TOKEN=figd_…` to
   `.ds-bridge.env` by hand — gitignored — but the interactive command is the
   recommended path.)

3. **Any other error** — surface the message verbatim and stop.

### Figma token requirements

- A **personal access token** from figma.com → Settings → Security → Personal
  access tokens.
- Scopes: at least `file_content:read` and `library_content:read` (handoff QA also
  uses `file_versions:read`, `file_comments:read`, `file_comments:write`).
- Must come from a **Dev or Full seat** — a **View** seat is rate-limited and cannot
  read library content.

## Rules

- **Never print, invent, or echo a real Figma token.** The CLI masks it
  (`figd…last4`); only ever show the masked form.
- `.ds-bridge.env` is the only place the secret is written, and only by
  `config persist-token`, `config connect`, or the user editing it themselves. Never
  write the token into a committed file (`.ds-bridge.json`, source, docs), and never
  collect it through the chat.
- This command only connects credentials — it never fetches Figma data or builds the
  registry. That happens in `/ds-bridge:ds-docs` and friends.
