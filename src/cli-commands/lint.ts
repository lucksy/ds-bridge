// T2.5 — `ds-bridge lint [path]` command builder. The first user-facing value.
// Impure edge: walks the filesystem, reads files, resolves the token source, and
// (for --fix) writes files back. All pure work is delegated to the lint engine
// trio (extract/match/fix) and the token parsers. Outcomes are typed: bad input
// becomes an exit code + actionable stderr, never a thrown stack trace.
//
// Exit codes: 0 clean · 1 findings remain · 2 operational error (bad path, no
// token source, unreadable git/files).
import { spawnSync } from "node:child_process";
import type { Dirent } from "node:fs";
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "../config.js";
import {
	type AdoptionTally,
	countInlineStyleTokenRefs,
	countTokenRefs,
	tallyAdoption,
} from "../engines/lint/adoption.js";
import {
	type ExtractedLiteral,
	extractLiterals,
} from "../engines/lint/extract.js";
import {
	applyEdits,
	type Finding,
	planFixes,
	type TextEdit,
} from "../engines/lint/fix.js";
import {
	buildCompositeColorLookup,
	isLintable,
	type LiteralMatch,
	matchLiteral,
} from "../engines/lint/match.js";
import { buildTokenIndex } from "../engines/tokens/token-index.js";
import type { TokenMap } from "../engines/tokens/types.js";
import { appendHistoryRecord } from "../io/history-writer.js";
import { loadTokens } from "../io/load-tokens.js";
import { findTokenSource } from "../io/token-set.js";
import {
	renderTable,
	type Severity,
	severityColor,
	shouldColor,
} from "../render/terminal/index.js";

type LintFormat = "json" | "term";

/** Directories never walked for lintable source files. */
const EXCLUDED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"out",
	".next",
	"coverage",
]);

const LINTABLE_EXTENSIONS = [".css", ".scss", ".tsx", ".jsx"];

/** A finding kind maps to a severity for term coloring. */
const KIND_SEVERITY: Record<LiteralMatch["kind"], Severity> = {
	exact: "error",
	near: "warn",
	"off-system": "info",
};

/**
 * The css/scss-scoped adoption block on a directory lint line (A2 / SPEC-adoption
 * §2). Optional: absent on old lines and on single-file (hook) runs, so old
 * readers (report reads only `byKind`) are unaffected.
 */
interface LintAdoption {
	refs: number;
	literals: number;
	byDirectory: AdoptionTally["byDirectory"];
}

/**
 * One appended lint history record (read back by `report` for the lint-by-type
 * section). Mirrors the tokens-check append pattern in tokens.ts.
 */
interface LintHistoryRecord {
	at: string;
	kind: "lint";
	byKind: {
		exact: number;
		near: number;
		offSystem: number;
	};
	adoption?: LintAdoption;
}

/** Tally findings into the by-kind history shape (offSystem is camelCased). */
function countByKind(findings: ReportFinding[]): LintHistoryRecord["byKind"] {
	const byKind = { exact: 0, near: 0, offSystem: 0 };
	for (const finding of findings) {
		if (finding.match.kind === "exact") byKind.exact += 1;
		else if (finding.match.kind === "near") byKind.near += 1;
		else byKind.offSystem += 1;
	}
	return byKind;
}

/**
 * Compute the css/scss-scoped adoption block for a directory run.
 *
 * SCOPE: `var(--…)` references are on-system, extracted color/dimension literals
 * are off-system, over css/scss files AND the inline styles of .tsx/.jsx files
 * (style objects, styled templates — the same regions the extractor reads, so
 * references and literals are counted over one scope). SPEC-adoption §1 first
 * excluded TSX because counting its literals without its references would bias
 * the ratio; counting both removes that bias, and a JSX app no longer reads
 * "100% on-system" beside its inline literals. Tailwind class utilities are
 * still out of scope.
 *
 * refs per file = token refs over a RE-READ of the file (the --fix path has
 * already rewritten files on disk, so the re-read reflects post-fix state).
 * literals per file = the count of findings the run produced for that file.
 */
function computeAdoption(
	files: { abs: string; rel: string }[],
	findings: ReportFinding[],
): LintAdoption {
	const scoped = files.filter((f) => isCssLike(f.rel) || isJsxLike(f.rel));
	// literals per in-scope file = number of findings on that file.
	const literalsByFile = new Map<string, number>();
	for (const finding of findings) {
		const rel = finding.literal.file;
		literalsByFile.set(rel, (literalsByFile.get(rel) ?? 0) + 1);
	}

	const perFile = scoped.map((file) => {
		let refs = 0;
		try {
			const text = readFileSync(file.abs, "utf8");
			refs = isCssLike(file.rel)
				? countTokenRefs(text)
				: countInlineStyleTokenRefs(text);
		} catch {
			refs = 0; // best-effort: an unreadable file contributes nothing
		}
		return {
			path: file.rel,
			refs,
			literals: literalsByFile.get(file.rel) ?? 0,
		};
	});

	const tally = tallyAdoption(perFile);
	return {
		refs: tally.totals.refs,
		literals: tally.totals.literals,
		byDirectory: tally.byDirectory,
	};
}

/** True for .tsx/.jsx paths (their inline styles are in the ratio). */
function isJsxLike(path: string): boolean {
	const lower = path.toLowerCase();
	return lower.endsWith(".tsx") || lower.endsWith(".jsx");
}

/** True for css/scss paths. */
function isCssLike(path: string): boolean {
	const lower = path.toLowerCase();
	return lower.endsWith(".css") || lower.endsWith(".scss");
}

/**
 * Append ONE lint history line to <targetDir>/.ds-bridge/history.jsonl.
 *
 * Only called for a DIRECTORY lint — a single-file lint (the PostToolUse hook,
 * which fires on every edit) stays side-effect-free so the log is not polluted
 * with per-keystroke noise. A `--fix` run appends its POST-fix state (the
 * findings after fixes are applied) so the log reflects the file on disk.
 *
 * `files` is the in-scope file list; the css/scss subset is re-read to attach the
 * adoption block (A2). Old readers ignore the extra field (report reads `byKind`).
 */
function appendLintHistory(
	targetDir: string,
	findings: ReportFinding[],
	files: { abs: string; rel: string }[],
): void {
	const stateDir = join(targetDir, ".ds-bridge");
	const record: LintHistoryRecord = {
		at: new Date().toISOString(),
		kind: "lint",
		byKind: countByKind(findings),
		adoption: computeAdoption(files, findings),
	};
	appendHistoryRecord(stateDir, record);
}

/** Process-level outcome of a lint run, before exit-code translation. */
interface LintCommandError {
	kind: "error";
	message: string;
}

/** A built token model paired with the lookup helpers the matcher needs. */
interface TokenContext {
	map: TokenMap;
	index: ReturnType<typeof buildTokenIndex>;
	compositeColors: ReturnType<typeof buildCompositeColorLookup>;
}

/** A finding enriched with the relative path for reporting. */
interface ReportFinding {
	literal: ExtractedLiteral;
	match: LiteralMatch;
}

function hasExtension(name: string): boolean {
	const lower = name.toLowerCase();
	return LINTABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Recursively collect lintable file absolute paths under `dir`. */
function walkLintableFiles(dir: string, acc: string[]): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (EXCLUDED_DIRS.has(entry.name)) continue;
			walkLintableFiles(full, acc);
			continue;
		}
		if (entry.isFile() && hasExtension(entry.name) && !isDocsOnly(entry.name))
			acc.push(full);
	}
}

/**
 * Storybook stories and Code Connect templates (`*.stories.tsx`,
 * `*.figma.tsx`) document the system; their demo padding is not product code.
 */
function isDocsOnly(name: string): boolean {
	return /\.(?:stories|story|figma)\.[jt]sx?$/i.test(name);
}

/**
 * Resolve the token source path for a target dir, honoring the precedence:
 *   --tokens flag > .ds-bridge.json token_source in the target dir > discovery.
 * Returns an absolute path, or an error outcome when none is found.
 */
function resolveTokenSource(
	targetDir: string,
	flagTokens: string | undefined,
): { kind: "ok"; path: string } | LintCommandError {
	// 1. Explicit --tokens flag wins. A relative path resolves against the user's
	// cwd (standard CLI convention for a file argument), not the lint target dir.
	if (flagTokens !== undefined) {
		const abs = isAbsolute(flagTokens)
			? flagTokens
			: resolve(process.cwd(), flagTokens);
		if (!existsSync(abs)) {
			return {
				kind: "error",
				message: `Token source "${abs}" (from --tokens) does not exist.`,
			};
		}
		return { kind: "ok", path: abs };
	}

	// 2. .ds-bridge.json token_source in the target dir.
	const configPath = join(targetDir, ".ds-bridge.json");
	if (existsSync(configPath)) {
		let projectFileText: string | undefined;
		try {
			projectFileText = readFileSync(configPath, "utf8");
		} catch {
			projectFileText = undefined;
		}
		if (projectFileText !== undefined) {
			const resolved = resolveConfig({ projectFileText });
			if (resolved.kind === "ok" && resolved.config.tokenSource !== undefined) {
				const src = resolved.config.tokenSource;
				const abs = isAbsolute(src) ? src : resolve(targetDir, src);
				if (existsSync(abs)) return { kind: "ok", path: abs };
				return {
					kind: "error",
					message: `token_source "${abs}" from .ds-bridge.json does not exist.`,
				};
			}
		}
	}

	// 3. Discovery: the token file (or multi-file token folder) under the target dir.
	const discovered = findTokenSource(targetDir);
	if (discovered !== undefined) return { kind: "ok", path: discovered };

	return {
		kind: "error",
		message:
			`No design-token source found for "${targetDir}".\n` +
			"Pass one with --tokens <file>, set token_source in .ds-bridge.json, " +
			"or add a conventional token file (tokens.json, design-tokens.json, *.tokens.json).",
	};
}

/** Parse the token source (file or folder) into a TokenMap, or an error outcome. */
function loadTokenMap(
	tokenPath: string,
): { kind: "ok"; map: TokenMap } | LintCommandError {
	const loaded = loadTokens(tokenPath);
	if (loaded.kind === "error") return loaded;
	return { kind: "ok", map: loaded.map };
}

/**
 * True for a file a tool generated — a built token output such as Style
 * Dictionary's "Do not edit directly, this file was auto-generated." Its
 * values ARE the tokens, so linting it only reports the system against itself.
 */
/**
 * True for a stylesheet that is a token build output even without a banner
 * (GitHub Primer's theme CSS has none): every declaration in it is a custom
 * property, and nearly all of them name a source token.
 */
function isTokenOutputFile(
	absPath: string,
	tokenKeys: ReadonlySet<string>,
): boolean {
	if (!/\.(css|scss)$/i.test(absPath)) return false;
	let text: string;
	try {
		text = readFileSync(absPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
	} catch {
		return false;
	}
	const declarations = [...text.matchAll(/(?:^|[{;])\s*([\w-]+)\s*:/g)]
		.map((m) => m[1] as string)
		.filter((name) => !name.startsWith("--"));
	const customProps = [...text.matchAll(/(?:^|[{;])\s*--([\w-]+)\s*:/g)].map(
		(m) => (m[1] as string).toLowerCase(),
	);
	if (customProps.length === 0 || declarations.length > 0) return false;
	const named = customProps.filter((name) => tokenKeys.has(name)).length;
	return named / customProps.length >= 0.8;
}

function isGeneratedFile(absPath: string): boolean {
	let head: string;
	try {
		head = readFileSync(absPath, "utf8").slice(0, 600);
	} catch {
		return false;
	}
	return /auto-?generated|do not edit|generated by|@generated/i.test(head);
}

/** Lint a single file's content into findings. Unreadable files surface as an error. */
function lintFile(
	absPath: string,
	relPath: string,
	tokens: TokenContext,
): { kind: "ok"; findings: ReportFinding[] } | LintCommandError {
	let content: string;
	try {
		content = readFileSync(absPath, "utf8");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			kind: "error",
			message: `Could not read "${absPath}": ${detail}`,
		};
	}
	const literals = extractLiterals({ path: relPath, content });
	const findings: ReportFinding[] = [];
	for (const literal of literals) {
		if (!isLintable(literal, tokens.index)) continue;
		const match = matchLiteral(literal, tokens.index, {
			compositeColors: tokens.compositeColors,
		});
		findings.push({ literal, match });
	}
	return { kind: "ok", findings };
}

/** Names of the candidate tokens for a near match, top-ranked first. */
function candidateNames(match: LiteralMatch): string[] {
	return match.kind === "near"
		? match.candidates.map((candidate) => candidate.token.name)
		: [];
}

interface JsonFinding {
	file: string;
	line: number;
	col: number;
	raw: string;
	property: string;
	kind: LiteralMatch["kind"];
	expectedToken?: string;
	expectedCandidates?: string[];
}

/** Shape a finding for --format=json, aligned with expected-findings.json fields. */
function toJsonFinding(finding: ReportFinding): JsonFinding {
	const base: JsonFinding = {
		file: finding.literal.file,
		line: finding.literal.line,
		col: finding.literal.col,
		raw: finding.literal.raw,
		property: finding.literal.property,
		kind: finding.match.kind,
	};
	if (finding.match.kind === "exact") {
		base.expectedToken = finding.match.token.name;
	} else if (finding.match.kind === "near") {
		base.expectedCandidates = candidateNames(finding.match);
	}
	return base;
}

/** Human-readable suggestion text for a finding. */
function suggestionFor(match: LiteralMatch): string {
	switch (match.kind) {
		case "exact":
			return `use token ${match.token.name}`;
		case "near": {
			const names = candidateNames(match).join(", ");
			return `near token(s): ${names}`;
		}
		case "off-system":
			return "no matching token (off-system)";
	}
}

/** Render the per-file findings + summary table for --format=term. */
function renderTerm(findings: ReportFinding[], color: boolean): string {
	const blocks: string[] = [];

	// Group by file in encounter order.
	const byFile = new Map<string, ReportFinding[]>();
	for (const finding of findings) {
		const bucket = byFile.get(finding.literal.file);
		if (bucket === undefined) byFile.set(finding.literal.file, [finding]);
		else bucket.push(finding);
	}

	for (const [file, fileFindings] of byFile) {
		const lines = [severityColor("ok", file, { color })];
		for (const finding of fileFindings) {
			const { literal, match } = finding;
			const severity = KIND_SEVERITY[match.kind];
			const position = `${literal.file}:${literal.line}:${literal.col}`;
			const label = severityColor(severity, match.kind, { color });
			lines.push(
				`  ${position}  ${label}  ${literal.property}: ${literal.raw} — ${suggestionFor(match)}`,
			);
		}
		blocks.push(lines.join("\n"));
	}

	// Summary table of counts by kind.
	const counts: Record<LiteralMatch["kind"], number> = {
		exact: 0,
		near: 0,
		"off-system": 0,
	};
	for (const finding of findings) counts[finding.match.kind] += 1;
	const rows = (Object.keys(counts) as LiteralMatch["kind"][]).map((kind) => [
		severityColor(KIND_SEVERITY[kind], kind, { color }),
		String(counts[kind]),
	]);
	const table = renderTable(["kind", "count"], rows, { color });

	const total = findings.length;
	const heading = `${total} finding${total === 1 ? "" : "s"}`;

	return [heading, "", ...blocks, "", table].join("\n");
}

/** Files changed vs HEAD, per `git diff --name-only HEAD` in `targetDir`. */
function changedFiles(
	targetDir: string,
): { kind: "ok"; files: Set<string> } | LintCommandError {
	const result = spawnSync("git", ["diff", "--name-only", "HEAD"], {
		cwd: targetDir,
		encoding: "utf8",
	});
	if (result.error !== undefined || result.status !== 0) {
		return {
			kind: "error",
			message:
				`Could not list changed files in "${targetDir}" — not a git repository ` +
				"(or git is unavailable). Run without --changed, or lint inside a repo.",
		};
	}
	// git reports paths relative to the repo root; resolve against targetDir.
	const files = new Set(
		result.stdout
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.map((rel) => resolve(targetDir, rel)),
	);
	return { kind: "ok", files };
}

interface LintOptions {
	fix: boolean;
	format: LintFormat;
	tokens: string | undefined;
	changed: boolean;
}

/** Apply fix edits to files in place; returns the count of files changed. */
function applyFixes(
	editsByFile: Map<string, TextEdit[]>,
): { kind: "ok"; changed: number } | LintCommandError {
	let changed = 0;
	for (const [absPath, edits] of editsByFile) {
		let content: string;
		try {
			content = readFileSync(absPath, "utf8");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return {
				kind: "error",
				message: `Could not read "${absPath}": ${detail}`,
			};
		}
		const next = applyEdits(content, edits);
		if (next === content) continue;
		try {
			writeFileSync(absPath, next, "utf8");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return {
				kind: "error",
				message: `Could not write "${absPath}": ${detail}`,
			};
		}
		changed += 1;
	}
	return { kind: "ok", changed };
}

/**
 * Lint all in-scope files, returning per-file findings keyed by absolute path,
 * or an error outcome on the first unreadable file.
 */
function lintAll(
	files: { abs: string; rel: string }[],
	tokens: TokenContext,
): { kind: "ok"; findings: ReportFinding[] } | LintCommandError {
	const all: ReportFinding[] = [];
	for (const file of files) {
		const result = lintFile(file.abs, file.rel, tokens);
		if (result.kind === "error") return result;
		all.push(...result.findings);
	}
	return { kind: "ok", findings: all };
}

function fail(message: string): void {
	process.stderr.write(`${message}\n`);
	process.exitCode = 2;
}

/** Register the `lint` command on the program. Wiring entry for cli.ts. */
export function registerLintCommand(program: Command): void {
	program
		.command("lint")
		.description("Find raw values that should be design tokens")
		.argument("[path]", "file or directory to lint", ".")
		.option("--fix", "rewrite fixable exact matches to var() in place", false)
		.option("--format <format>", "output format: term | json", "term")
		.option("--tokens <file>", "explicit token source file")
		.option("--changed", "limit to files changed vs git HEAD", false)
		.action((path: string, options: LintOptions) => {
			const format = options.format as LintFormat;
			if (format !== "json" && format !== "term") {
				fail(
					`Unknown --format "${options.format}". Expected "json" or "term".`,
				);
				return;
			}

			const targetPath = resolve(path);
			if (!existsSync(targetPath)) {
				fail(`Path "${targetPath}" does not exist.`);
				return;
			}

			// A single FILE path lints just that file (used by the PostToolUse hook).
			// Token discovery then bases on the user's cwd, not the file's parent —
			// so an edited file deep in src/ still finds the project's tokens.
			const stat = statSync(targetPath);
			const isFile = stat.isFile();
			if (isFile && !hasExtension(targetPath)) {
				fail(
					`Path "${targetPath}" is not a lintable file (expected ${LINTABLE_EXTENSIONS.join(", ")}).`,
				);
				return;
			}
			const targetDir = isFile ? process.cwd() : targetPath;

			// Token source resolution (flag > .ds-bridge.json > discovery). A
			// sub-directory of the project (`lint src` from the root) has no token
			// file of its own: resolve from the cwd project instead, which then also
			// owns the history line and the reported paths.
			let projectDir = targetDir;
			let tokenSource = resolveTokenSource(targetDir, options.tokens);
			const cwd = process.cwd();
			if (
				tokenSource.kind === "error" &&
				!isFile &&
				options.tokens === undefined &&
				targetDir !== cwd &&
				isInside(targetDir, cwd) &&
				!existsSync(join(targetDir, ".ds-bridge.json"))
			) {
				const fromProject = resolveTokenSource(cwd, undefined);
				if (fromProject.kind === "ok") {
					tokenSource = fromProject;
					projectDir = cwd;
				}
			}
			if (tokenSource.kind === "error") {
				fail(tokenSource.message);
				return;
			}

			const loaded = loadTokenMap(tokenSource.path);
			if (loaded.kind === "error") {
				fail(loaded.message);
				return;
			}

			const tokens: TokenContext = {
				map: loaded.map,
				index: buildTokenIndex(loaded.map.tokens),
				compositeColors: buildCompositeColorLookup(loaded.map.tokens),
			};

			// File scope: a single file lints only itself; a directory walks for
			// lintable files, optionally restricted to --changed.
			const walked: string[] = [];
			if (isFile) walked.push(targetPath);
			else walkLintableFiles(targetDir, walked);
			// Generated outputs (built token CSS) are the system, not usage of it.
			const tokenKeys = new Set(
				loaded.map.tokens.map((t) => t.name.toLowerCase().replace(/\./g, "-")),
			);
			for (let i = walked.length - 1; i >= 0; i--) {
				const file = walked[i] as string;
				if (isGeneratedFile(file) || isTokenOutputFile(file, tokenKeys)) {
					walked.splice(i, 1);
				}
			}

			let inScope = walked;
			if (options.changed) {
				const changed = changedFiles(targetDir);
				if (changed.kind === "error") {
					fail(changed.message);
					return;
				}
				inScope = walked.filter((abs) => changed.files.has(abs));
			}

			const files = inScope
				.map((abs) => ({ abs, rel: toRelative(projectDir, abs) }))
				.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

			const linted = lintAll(files, tokens);
			if (linted.kind === "error") {
				fail(linted.message);
				return;
			}

			// --fix: apply fixable exact edits, then re-lint to compute exit code.
			// A directory --fix run records its POST-fix state inside runFix.
			if (options.fix) {
				runFix(files, tokens, linted.findings, isFile ? undefined : projectDir);
				return;
			}

			emitReport(linted.findings, format);
			// History: only a DIRECTORY lint records a line — a single-file lint
			// (the PostToolUse hook) must stay side-effect-free. The in-scope file
			// list threads in so the line carries the css/scss adoption block (A2).
			if (!isFile) {
				const adoption = computeAdoption(files, linted.findings);
				appendLintHistory(projectDir, linted.findings, files);
				// On-system summary line — directory runs only, term format only.
				if (format === "term") emitAdoptionSummary(adoption);
			}
			process.exitCode = linted.findings.length > 0 ? 1 : 0;
		});
}

/** True when `child` is `parent` or lies beneath it. */
function isInside(child: string, parent: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Relative path for reporting (forward slashes), abs path falls back to itself. */
function toRelative(targetDir: string, abs: string): string {
	const rel = relative(targetDir, abs);
	return rel.split(sep).join("/");
}

/**
 * Print the on-system summary line (directory term runs only). The pct is
 * refs / (refs + literals) over css/scss and inline styles — see the scope note
 * on computeAdoption. Zero values yields 0%.
 */
function emitAdoptionSummary(adoption: LintAdoption): void {
	const total = adoption.refs + adoption.literals;
	const pct = total === 0 ? 0 : Math.round((adoption.refs / total) * 100);
	process.stdout.write(
		`on-system: ${pct}% of css/scss + inline style values (${adoption.refs} token refs / ${total})\n`,
	);
}

/** Print findings in the requested format. */
function emitReport(findings: ReportFinding[], format: LintFormat): void {
	if (format === "json") {
		const json = findings.map(toJsonFinding);
		process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
		return;
	}
	const color = shouldColor(process.env, Boolean(process.stdout.isTTY));
	process.stdout.write(`${renderTerm(findings, color)}\n`);
}

/**
 * Apply fixes, report files changed, then re-lint for the exit code. When
 * `historyDir` is set (a directory run, not a single file) the POST-fix
 * re-linted state is appended to the history log.
 */
function runFix(
	files: { abs: string; rel: string }[],
	tokens: TokenContext,
	findings: ReportFinding[],
	historyDir: string | undefined,
): void {
	// planFixes works on relative-path literals; map edits back to absolute paths.
	const relToAbs = new Map(files.map((f) => [f.rel, f.abs]));
	const engineFindings: Finding[] = findings.map((f) => ({
		literal: f.literal,
		match: f.match,
	}));
	const edits = planFixes(engineFindings);

	const editsByFile = new Map<string, TextEdit[]>();
	for (const edit of edits) {
		const abs = relToAbs.get(edit.file);
		if (abs === undefined) continue;
		const bucket = editsByFile.get(abs);
		if (bucket === undefined) editsByFile.set(abs, [edit]);
		else bucket.push(edit);
	}

	const applied = applyFixes(editsByFile);
	if (applied.kind === "error") {
		fail(applied.message);
		return;
	}
	process.stdout.write(
		`Changed ${applied.changed} file${applied.changed === 1 ? "" : "s"}.\n`,
	);

	// Re-lint to see what remains.
	const relinted = lintAll(files, tokens);
	if (relinted.kind === "error") {
		fail(relinted.message);
		return;
	}
	const remaining = relinted.findings.filter((f) => f.match.kind !== "exact");
	const stillExact = relinted.findings.filter((f) => f.match.kind === "exact");
	// near/off-system always count as remaining; composite exacts are unfixable
	// (planFixes skips them) so any leftover exact also keeps the exit non-zero.
	const hasRemaining = remaining.length > 0 || stillExact.length > 0;
	// History: one POST-fix line for a directory run (single-file runs pass
	// undefined and stay side-effect-free). The re-read inside computeAdoption
	// reflects the POST-fix files on disk. The summary line mirrors a plain run.
	if (historyDir !== undefined) {
		const adoption = computeAdoption(files, relinted.findings);
		appendLintHistory(historyDir, relinted.findings, files);
		emitAdoptionSummary(adoption);
	}
	process.exitCode = hasRemaining ? 1 : 0;
}
