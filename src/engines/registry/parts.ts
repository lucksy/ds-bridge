// Compound components. PURE; deterministic; never throws. shadcn/radix-style
// libraries export a component and its parts from one file — `Card`,
// `CardHeader`, `CardTitle` — so a registry lists every part as a component.
// Parity and import coverage both judge components, not exports: a part is a
// code component exported from the SAME file as another code component whose
// name it extends (`CardHeader` → `Card`, `DialogContent` → `Dialog`).

/** One code-side export: its name and the file it comes from. */
export interface CodeExport {
	name: string;
	importPath: string;
}

/** The parent (longest same-file name prefix) of `entry`, or undefined. */
export function compoundParent(
	entry: CodeExport,
	all: readonly CodeExport[],
): string | undefined {
	let parent: string | undefined;
	for (const other of all) {
		if (other.importPath !== entry.importPath || other.name === entry.name) {
			continue;
		}
		const next = entry.name.charAt(other.name.length);
		if (!entry.name.startsWith(other.name) || !/[A-Z]/.test(next)) continue;
		if (parent === undefined || other.name.length > parent.length) {
			parent = other.name;
		}
	}
	return parent;
}

/** The registry's code exports, matched first then unmatched-code. */
export function codeExports(registry: {
	matches?: readonly { codeName: string; importPath: string }[];
	unmatchedCode?: readonly { name: string; importPath: string }[];
}): CodeExport[] {
	const matches = Array.isArray(registry?.matches) ? registry.matches : [];
	const unmatched = Array.isArray(registry?.unmatchedCode)
		? registry.unmatchedCode
		: [];
	return [
		...matches.map((m) => ({ name: m.codeName, importPath: m.importPath })),
		...unmatched.map((u) => ({ name: u.name, importPath: u.importPath })),
	];
}

/** The top-level component an export belongs to (itself when not a part). */
export function componentOf(
	entry: CodeExport,
	all: readonly CodeExport[],
): string {
	// Walk up: DialogContentHeader → DialogContent → Dialog.
	let name = entry.name;
	for (let guard = 0; guard < 8; guard += 1) {
		const parent = compoundParent({ name, importPath: entry.importPath }, all);
		if (parent === undefined) return name;
		name = parent;
	}
	return name;
}
