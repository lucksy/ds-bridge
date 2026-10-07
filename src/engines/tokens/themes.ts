// Tokens Studio `$themes` → per-mode token documents. Pure. A themed export
// keeps one set per mode (light/dark, brand A/B); parsing the whole document
// merges sets, so per-mode consumers (a11y contrast, mode-aware drift) parse
// one sub-document per theme instead.

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A Tokens Studio theme as read for mode derivation. */
export interface StudioTheme {
	name: string;
	selectedTokenSets: Record<string, string>;
}

/** Read the `$themes` array of a Tokens Studio document, or undefined. */
export function readThemes(source: unknown): StudioTheme[] | undefined {
	if (!isPlainObject(source)) return undefined;
	const raw = source.$themes;
	if (!Array.isArray(raw)) return undefined;
	const themes: StudioTheme[] = [];
	for (const entry of raw) {
		if (!isPlainObject(entry)) continue;
		const name = entry.name;
		const sets = entry.selectedTokenSets;
		if (typeof name !== "string" || !isPlainObject(sets)) continue;
		const selected: Record<string, string> = {};
		for (const [setName, state] of Object.entries(sets)) {
			if (typeof state === "string") selected[setName] = state;
		}
		themes.push({ name, selectedTokenSets: selected });
	}
	return themes.length > 0 ? themes : undefined;
}

/**
 * Build the sub-document for one Tokens Studio theme: only its non-disabled
 * sets, in their declared order, so the per-mode parse sees mode-specific
 * values (set merging would otherwise collapse same-named tokens across modes).
 */
export function themeSubDocument(
	source: Record<string, unknown>,
	theme: StudioTheme,
): Record<string, unknown> {
	const sets = Object.entries(theme.selectedTokenSets)
		.filter(([, state]) => state !== "disabled")
		.map(([setName]) => setName)
		.filter((setName) => isPlainObject(source[setName]));
	const doc: Record<string, unknown> = {};
	for (const setName of sets) doc[setName] = source[setName];
	doc.$metadata = { tokenSetOrder: sets };
	return doc;
}
