// Terminal output safety. Names reach the terminal from untrusted places —
// Figma component and frame names, rollup.json repo names, git stderr — and a
// raw ESC/OSC/CSI sequence in one can set the window title, write the
// clipboard (OSC 52) or move the cursor to hide or forge rows. PURE.
//
// Our own output colours text with SGR sequences (`ESC[…m`), so those are
// kept; every other C0/C1 control character (incl. a lone ESC, CR, BEL) is
// dropped. `\n` and `\t` stay in multi-line text; a table cell is one line.

const CONTROL = new RegExp(
	// SGR colour (kept) | newline/tab | any other C0, DEL or C1 control (dropped)
	`${String.fromCharCode(27)}\\[[0-9;]*m|[\\n\\t]|[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]`,
	"g",
);

/** Multi-line terminal text with every control sequence but SGR colour removed. */
export function terminalSafe(text: string): string {
	return text.replace(CONTROL, (match) =>
		match.length > 1 || match === "\n" || match === "\t" ? match : "",
	);
}

/** One table cell: {@link terminalSafe}, with newlines and tabs as spaces. */
export function terminalCell(text: string): string {
	return text.replace(CONTROL, (match) =>
		match.length > 1 ? match : match === "\n" || match === "\t" ? " " : "",
	);
}
