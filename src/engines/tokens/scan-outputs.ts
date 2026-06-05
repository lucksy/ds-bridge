// T3.3 — platform-output scanner: built CSS custom props / TS theme objects
// back into a flat value map for code-side drift comparison (T3.4). Pure.

export interface OutputValue {
	/** CSS: custom-prop name without leading "--". TS: dotted object path. */
	name: string;
	raw: string;
}

export type ScanOutcome =
	| { kind: "ok"; values: OutputValue[]; warnings: string[] }
	| { kind: "unsupported-file"; path: string };

const CSS_EXTENSIONS = [".css", ".scss"];
const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];

export function scanOutputs(file: {
	path: string;
	content: string;
}): ScanOutcome {
	const lower = file.path.toLowerCase();
	if (CSS_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
		return finish(scanCss(file.content), []);
	}
	if (TS_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
		const { values, warnings } = scanTsTheme(file.content);
		return finish(values, warnings);
	}
	return { kind: "unsupported-file", path: file.path };
}

function finish(values: OutputValue[], warnings: string[]): ScanOutcome {
	values.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return { kind: "ok", values, warnings };
}

// ---------- CSS custom properties ----------

const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const CUSTOM_PROP_RE = /--([A-Za-z0-9_-]+)\s*:\s*([^;}]+)/g;

function scanCss(content: string): OutputValue[] {
	const stripped = content.replace(CSS_COMMENT_RE, "");
	const values: OutputValue[] = [];
	for (const match of stripped.matchAll(CUSTOM_PROP_RE)) {
		const name = match[1];
		const rawValue = match[2];
		if (name === undefined || rawValue === undefined) continue;
		const raw = rawValue.replace(/!important/g, "").trim();
		if (raw !== "") values.push({ name, raw });
	}
	return values;
}

// ---------- TS theme objects (lightweight literal walker, no deps) ----------

const THEME_EXPORT_RE = /export\s+const\s+[\w$]+(?:\s*:\s*[^={]+?)?\s*=\s*\{/;

function scanTsTheme(content: string): {
	values: OutputValue[];
	warnings: string[];
} {
	const start = THEME_EXPORT_RE.exec(content);
	if (start === null) return { values: [], warnings: [] };

	const values: OutputValue[] = [];
	const warnings: string[] = [];
	let i = start.index + start[0].length; // just past the opening "{"

	function skipTrivia(): void {
		for (;;) {
			while (i < content.length && /\s/.test(content[i] as string)) i += 1;
			if (content.startsWith("//", i)) {
				const nl = content.indexOf("\n", i);
				i = nl === -1 ? content.length : nl + 1;
				continue;
			}
			if (content.startsWith("/*", i)) {
				const end = content.indexOf("*/", i + 2);
				i = end === -1 ? content.length : end + 2;
				continue;
			}
			return;
		}
	}

	function parseString(): string | undefined {
		const quote = content[i];
		if (quote !== '"' && quote !== "'" && quote !== "`") return undefined;
		let out = "";
		i += 1;
		while (i < content.length) {
			const ch = content[i] as string;
			if (ch === "\\") {
				out += content[i + 1] ?? "";
				i += 2;
				continue;
			}
			if (ch === quote) {
				i += 1;
				return out;
			}
			out += ch;
			i += 1;
		}
		return undefined; // unterminated
	}

	/** Skip a non-literal expression up to the enclosing "," or "}" at depth 0. */
	function skipExpression(): void {
		let depth = 0;
		while (i < content.length) {
			const ch = content[i] as string;
			if (ch === '"' || ch === "'" || ch === "`") {
				parseString();
				continue;
			}
			if (ch === "(" || ch === "[" || ch === "{") depth += 1;
			if (ch === ")" || ch === "]") depth -= 1;
			if (ch === "}") {
				if (depth === 0) return; // let the object parser consume it
				depth -= 1;
			}
			if (ch === "," && depth === 0) return;
			i += 1;
		}
	}

	function parseObjectBody(prefix: string): void {
		for (;;) {
			skipTrivia();
			if (i >= content.length) return;
			if (content[i] === "}") {
				i += 1;
				return;
			}
			if (content[i] === ",") {
				i += 1;
				continue;
			}

			// key: identifier or quoted string
			let key: string | undefined;
			if (content[i] === '"' || content[i] === "'") {
				key = parseString();
			} else {
				const m = /^[\w$-]+/.exec(content.slice(i));
				if (m !== null) {
					key = m[0];
					i += m[0].length;
				}
			}
			if (key === undefined) {
				warnings.push(`unparseable key near offset ${i} — stopping theme scan`);
				return;
			}
			skipTrivia();
			if (content[i] !== ":") {
				warnings.push(`expected ":" after key "${key}" — skipping`);
				skipExpression();
				continue;
			}
			i += 1; // consume ":"
			skipTrivia();

			const name = prefix === "" ? key : `${prefix}.${key}`;
			const ch = content[i];
			if (ch === "{") {
				i += 1;
				parseObjectBody(name);
			} else if (ch === '"' || ch === "'" || ch === "`") {
				const value = parseString();
				if (value !== undefined) values.push({ name, raw: value });
			} else {
				const num = /^-?\d+(?:\.\d+)?/.exec(content.slice(i));
				if (num !== null) {
					values.push({ name, raw: num[0] });
					i += num[0].length;
				} else {
					warnings.push(`non-literal value for "${name}" — skipped`);
					skipExpression();
				}
			}
		}
	}

	parseObjectBody("");
	return { values, warnings };
}
