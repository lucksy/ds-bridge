// Code Connect pairings read from a project (io edge, synchronous).
//
// A project with Figma Code Connect has already declared which code component
// implements which Figma component. The registry takes those pairings as
// ground truth instead of guessing by name (Figma's Simple Design System pairs
// `Dialog` with its Dialog — a name guess picked `DialogClose`). Three forms:
//
//   - classic:  figma.connect(Button, "https://figma.com/design/KEY?node-id=1-2", …)
//   - template: `// url=<FIGMA_BUTTONS_BUTTON>` + `// component=Button` headers
//   - batch:    *.figma.batch.json `{ components: [{ url, component }] }`
//
// URLs may use figma.config.json `codeConnect.documentUrlSubstitutions`. Only
// the node id matters: a duplicated library keeps its node ids.
import type { Dirent } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PinnedPair } from "../engines/registry/match.js";

const EXCLUDED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"coverage",
	"out",
	".next",
	".ds-bridge",
]);

const CODE_CONNECT_FILE = /\.figma\.(?:[cm]?[jt]sx?)$/i;
const BATCH_FILE = /\.figma\.batch\.json$/i;

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** figma.config.json `codeConnect.documentUrlSubstitutions`, longest key first. */
function substitutions(root: string): [string, string][] {
	const text = readText(join(root, "figma.config.json"));
	if (text === undefined) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return [];
	}
	const subs =
		isPlainObject(parsed) && isPlainObject(parsed.codeConnect)
			? parsed.codeConnect.documentUrlSubstitutions
			: undefined;
	if (!isPlainObject(subs)) return [];
	return Object.entries(subs)
		.filter((e): e is [string, string] => typeof e[1] === "string")
		.sort((a, b) => b[0].length - a[0].length);
}

/** The `node-id` of a Figma URL as `1:2`, after substitutions. */
function nodeIdOf(
	url: string,
	subs: readonly [string, string][],
): string | undefined {
	let full = url;
	for (const [key, value] of subs) full = full.split(key).join(value);
	const match = /node-id=(\d+)[:-](\d+)/.exec(decodeURIComponent(full));
	return match === null ? undefined : `${match[1]}:${match[2]}`;
}

function walk(dir: string, acc: string[]): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!EXCLUDED_DIRS.has(entry.name)) walk(full, acc);
		} else if (
			entry.isFile() &&
			(CODE_CONNECT_FILE.test(entry.name) || BATCH_FILE.test(entry.name))
		) {
			acc.push(full);
		}
	}
}

const CLASSIC_RE =
	/figma\.connect\(\s*([A-Za-z_$][\w$.]*)\s*,\s*(["'`])([^"'`]+)\2/g;

function pinsInSource(text: string): { codeName: string; url: string }[] {
	const out: { codeName: string; url: string }[] = [];
	for (const m of text.matchAll(CLASSIC_RE)) {
		const ident = (m[1] as string).split(".").pop() as string;
		out.push({ codeName: ident, url: m[3] as string });
	}
	// Template form: header comments name the URL. The component is the root
	// element the example renders — the header and `id` are free-form labels
	// (SDS's ButtonDanger template says `component=Button`, renders
	// <ButtonDanger>) — then the header, then the id.
	const url = /^\s*\/\/\s*url=(\S+)/m.exec(text)?.[1];
	const component =
		/example\s*:\s*figma\.code\s*`\s*<([A-Z][\w$]*)/.exec(text)?.[1] ??
		/^\s*\/\/\s*component=([A-Za-z_$][\w$]*)/m.exec(text)?.[1] ??
		/\bid:\s*["']([A-Za-z_$][\w$]*)["']/.exec(text)?.[1];
	if (url !== undefined && component !== undefined && out.length === 0) {
		out.push({ codeName: component, url });
	}
	return out;
}

function pinsInBatch(text: string): { codeName: string; url: string }[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return [];
	}
	const components = isPlainObject(parsed) ? parsed.components : undefined;
	if (!Array.isArray(components)) return [];
	return components.flatMap((c) =>
		isPlainObject(c) &&
		typeof c.url === "string" &&
		typeof c.component === "string"
			? [{ codeName: c.component, url: c.url }]
			: [],
	);
}

/** Every Code Connect pairing in the project, sorted by code name then node id. */
export function readCodeConnectPins(root: string): PinnedPair[] {
	const files: string[] = [];
	walk(root, files);
	if (files.length === 0) return [];
	const subs = substitutions(root);
	const seen = new Set<string>();
	const pins: PinnedPair[] = [];
	for (const file of files.sort()) {
		const text = readText(file);
		if (text === undefined) continue;
		const raw = BATCH_FILE.test(file) ? pinsInBatch(text) : pinsInSource(text);
		for (const { codeName, url } of raw) {
			const nodeId = nodeIdOf(url, subs);
			if (nodeId === undefined) continue;
			const key = `${codeName}\u0000${nodeId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			pins.push({ codeName, nodeId });
		}
	}
	return pins.sort((a, b) =>
		a.codeName !== b.codeName
			? a.codeName < b.codeName
				? -1
				: 1
			: a.nodeId < b.nodeId
				? -1
				: a.nodeId > b.nodeId
					? 1
					: 0,
	);
}
