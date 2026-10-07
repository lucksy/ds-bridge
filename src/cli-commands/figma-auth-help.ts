// Shared "no Figma PAT" guidance for the command groups that need a token
// (registry / impact / frame-impl / handoff / library-health). These five used to
// hand-mirror the same message — the copies' own comments said "mirrors
// handoff/impact" — which is exactly the drift this module removes.
//
// It also corrects the old advice. The previous text told users to set the token
// "via the plugin config dialog (stored in the system keychain)". That alone does
// NOT work: Claude Code does not persist a plugin's `sensitive` userConfig across
// restarts (issue #62442), and the dialog value is not reliably forwarded to the
// CLI subprocess. The durable path is a gitignored `.ds-bridge.env` (auto-loaded by
// cli.ts on every run) or a real FIGMA_TOKEN env var. `scopeNote` is the
// per-command scope/seat tail, kept distinct because each command needs different
// Figma scopes.
export function missingFigmaTokenMessage(scopeNote: readonly string[]): string {
	return [
		"No Figma personal access token configured.",
		"",
		"Give the CLI a Dev/Full-seat PAT. The durable way (survives restarts) is a",
		"gitignored .ds-bridge.env in your project — the CLI auto-loads it on every run:",
		"",
		"  echo 'FIGMA_TOKEN=figd_your_token_here' >> .ds-bridge.env",
		"",
		"Inside Claude Code, /ds-bridge:connect writes that file for you. Setting the",
		"token only in the /plugin configure dialog is not enough — Claude Code drops a",
		"plugin's sensitive value on restart (issue #62442).",
		"",
		...scopeNote,
	].join("\n");
}

/**
 * The message for a token Figma rejected. An expired PAT (Figma: "Token has
 * expired") gets its own fix — Figma PATs expire, and a generic "auth error"
 * sent users hunting for scope or seat problems instead.
 */
export function figmaAuthErrorMessage(result: {
	kind: "auth-error";
	message?: string;
}): string {
	if (result.message !== undefined && /expired/i.test(result.message)) {
		return [
			"Your Figma personal access token has expired.",
			"Create a new one (figma.com → Settings → Security → Personal access tokens),",
			"then save and check it with: ds-bridge config connect --verify",
		].join("\n");
	}
	const reason =
		result.message !== undefined ? ` Figma said: "${result.message}".` : "";
	return `Figma rejected the token (auth error).${reason} Check that FIGMA_TOKEN is a valid Dev/Full-seat personal access token.`;
}
