// Terminal column width. PURE. `padEnd` pads by UTF-16 units and `[...s]`
// counts code points, but a terminal draws CJK and emoji two columns wide and
// combining marks, ZWJ and variation selectors zero wide, so names from Figma
// ("登録画面", "✅ Checkout") misaligned their columns.

// SGR colour codes (`\x1b[31m` … `\x1b[39m`) take no columns on screen.
const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const ZERO_WIDTH = /\p{Mn}|\p{Me}|[\u200b-\u200d]|\u2060|[\ufe00-\ufe0f]/u;
// Emoji drawn as emoji by default (✅, 🚀) are two columns; text-default
// symbols (❤, ✓) are one.
const EMOJI = /\p{Emoji_Presentation}/u;

/** East Asian Wide / Fullwidth blocks (Hangul, CJK, kana, fullwidth forms). */
function isWide(cp: number): boolean {
	return (
		(cp >= 0x1100 && cp <= 0x115f) ||
		(cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
		(cp >= 0xac00 && cp <= 0xd7a3) ||
		(cp >= 0xf900 && cp <= 0xfaff) ||
		(cp >= 0xfe30 && cp <= 0xfe4f) ||
		(cp >= 0xff00 && cp <= 0xff60) ||
		(cp >= 0xffe0 && cp <= 0xffe6) ||
		(cp >= 0x20000 && cp <= 0x3fffd)
	);
}

/** The number of terminal columns `value` occupies (SGR colour ignored). */
export function displayWidth(value: string): number {
	let width = 0;
	for (const ch of value.replace(ANSI_SGR, "")) {
		const cp = ch.codePointAt(0) ?? 0;
		if (ZERO_WIDTH.test(ch)) continue;
		width += isWide(cp) || EMOJI.test(ch) ? 2 : 1;
	}
	return width;
}

/** `value` padded with spaces to `width` terminal columns (never truncated). */
export function padToWidth(
	value: string,
	width: number,
	alignRight = false,
): string {
	const filler = " ".repeat(Math.max(0, width - displayWidth(value)));
	return alignRight ? filler + value : value + filler;
}
