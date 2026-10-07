// Token files are JSON — or JSON5, which Style Dictionary v4 reads natively and
// large DTCG systems use for comments and unquoted keys (GitHub Primer ships its
// whole source as *.json5). One parser for every token read keeps the two in step.
import JSON5 from "json5";

/** True for a filename a token source may use: `*.json` or `*.json5`. */
export function isTokenFileName(name: string): boolean {
	return name.endsWith(".json") || name.endsWith(".json5");
}

/** Parse token-file text; `*.json5` files are read as JSON5. Throws on bad input. */
export function parseTokenText(text: string, path: string): unknown {
	return path.endsWith(".json5") ? JSON5.parse(text) : JSON.parse(text);
}
