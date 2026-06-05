// T7.12 — changelog aggregation engine. Merges three change sources (Figma file
// versions, local git commits, a token diff) into one audience-segmented,
// severity-classified, date-sorted list. PURE: the only "now" it knows is the
// injected `since` ISO string; it never touches the clock, fs, network, or env.
//
// The audience/severity classification table lives in the test file (the
// contract). In brief: token diffs concern everyone (both); commits are a
// developer story; labeled Figma versions are a designer story; unlabeled
// (autosave) versions are noise and are filtered out.

// Type-only import keeps this engine pure — no value pulled from the io edge.
import type { FigmaVersion } from "../../io/figma/client.js";
import type { DiffEntry, TokenDiffResult } from "../tokens/diff.js";
import type { Token } from "../tokens/types.js";

/** A local-git commit, normalized. The io reader (T7.14) emits this shape. */
export interface GitCommit {
	hash: string;
	/** Author/commit date as a full ISO-8601 string. */
	dateIso: string;
	/** Full commit message: first line is the subject, body/footers follow. */
	subject: string;
	author: string;
}

export type ChangelogSource = "figma" | "code" | "tokens";
export type ChangelogAudience = "designer" | "developer" | "both";
export type ChangelogSeverity = "breaking" | "notable" | "minor";

export interface ChangelogEntry {
	/** Stable id for dedup/keys: source-prefixed (e.g. "figma:v9", "code:abc1234"). */
	id: string;
	dateIso: string;
	source: ChangelogSource;
	audience: ChangelogAudience;
	severity: ChangelogSeverity;
	title: string;
	detail?: string;
}

export interface AggregateInput {
	versions: FigmaVersion[];
	commits: GitCommit[];
	tokenDiff: TokenDiffResult;
	/** Inclusive lower bound; entries strictly before this instant are dropped. */
	since: string;
}

/** Deterministic ordering weights for the same-date tiebreak. */
const SOURCE_ORDER: Record<ChangelogSource, number> = {
	figma: 0,
	code: 1,
	tokens: 2,
};
const SEVERITY_ORDER: Record<ChangelogSeverity, number> = {
	breaking: 0,
	notable: 1,
	minor: 2,
};

/**
 * Conventional-commit header: `type(scope)!: subject`. Captures the type, an
 * optional scope, an optional bang (breaking marker), and the subject.
 */
const CONVENTIONAL_HEADER = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

/** Normalize any ISO-ish timestamp to a millisecond-precision ISO string. */
function toIso(value: string): string {
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) return value;
	return new Date(ms).toISOString();
}

/** True when `dateIso` is at or after the `since` boundary (inclusive). */
function withinSince(dateIso: string, since: string): boolean {
	const at = Date.parse(dateIso);
	const from = Date.parse(since);
	if (Number.isNaN(at) || Number.isNaN(from)) return true;
	return at >= from;
}

/** A short canonical value preview for token detail lines. */
function valuePreview(token: Token): string {
	const { value } = token;
	if (typeof value === "string" || typeof value === "number")
		return String(value);
	return JSON.stringify(value);
}

/** Map one token diff entry to a changelog entry. Token changes are audience=both. */
function fromDiffEntry(entry: DiffEntry, dateIso: string): ChangelogEntry {
	const severity: ChangelogSeverity =
		entry.impact === "breaking" ? "breaking" : "notable";
	switch (entry.kind) {
		case "added":
			return {
				id: `tokens:added:${entry.token.name}`,
				dateIso,
				source: "tokens",
				audience: "both",
				severity,
				title: `Token added: ${entry.token.name}`,
				detail: `${entry.token.type} = ${valuePreview(entry.token)}`,
			};
		case "removed":
			return {
				id: `tokens:removed:${entry.token.name}`,
				dateIso,
				source: "tokens",
				audience: "both",
				severity,
				title: `Token removed: ${entry.token.name}`,
				detail: `was ${entry.token.type} = ${valuePreview(entry.token)}`,
			};
		case "renamed":
			return {
				id: `tokens:renamed:${entry.from.name}->${entry.to.name}`,
				dateIso,
				source: "tokens",
				audience: "both",
				severity,
				title: `Token renamed: ${entry.from.name} → ${entry.to.name}`,
				detail: `${entry.to.type} = ${valuePreview(entry.to)}`,
			};
		case "value-changed":
			return {
				id: `tokens:value-changed:${entry.after.name}`,
				dateIso,
				source: "tokens",
				audience: "both",
				severity,
				title: `Token changed: ${entry.after.name}`,
				detail: `${valuePreview(entry.before)} → ${valuePreview(entry.after)}`,
			};
		case "meta-changed": {
			const meta = entry.after.description ?? entry.after.group;
			return withDetail(
				{
					id: `tokens:meta-changed:${entry.after.name}`,
					dateIso,
					source: "tokens",
					audience: "both",
					severity,
					title: `Token metadata changed: ${entry.after.name}`,
				},
				meta,
			);
		}
	}
}

/** Attach `detail` only when defined — respects exactOptionalPropertyTypes. */
function withDetail(
	base: Omit<ChangelogEntry, "detail">,
	detail: string | undefined,
): ChangelogEntry {
	return detail === undefined ? base : { ...base, detail };
}

/** Classify a git commit by its conventional-commit header + BREAKING footer. */
function fromCommit(commit: GitCommit): ChangelogEntry {
	const lines = commit.subject.split("\n");
	const header = (lines[0] ?? "").trim();
	const hasBreakingFooter = /(^|\n)BREAKING CHANGE:/.test(commit.subject);

	const match = CONVENTIONAL_HEADER.exec(header);
	let severity: ChangelogSeverity = "minor";
	let title = header;

	if (match) {
		const type = match[1];
		const bang = match[3];
		const subject = match[4] ?? header;
		title = subject;
		if (bang !== undefined || hasBreakingFooter) {
			severity = "breaking";
		} else if (type === "feat") {
			severity = "notable";
		} else if (type === "fix") {
			severity = "minor";
		} else {
			severity = "minor";
		}
	} else if (hasBreakingFooter) {
		severity = "breaking";
	}

	return {
		id: `code:${commit.hash}`,
		dateIso: toIso(commit.dateIso),
		source: "code",
		audience: "developer",
		severity,
		title,
		detail: commit.author,
	};
}

/** Build a designer-facing entry from a labeled Figma version. */
function fromVersion(version: FigmaVersion): ChangelogEntry {
	const description = version.description.trim();
	return withDetail(
		{
			id: `figma:${version.id}`,
			dateIso: toIso(version.created_at),
			source: "figma",
			audience: "designer",
			severity: "notable",
			title: version.label.trim(),
		},
		description === "" ? undefined : version.description,
	);
}

/** Deterministic comparator: date-desc, then source, severity, title (all asc). */
function compareEntries(a: ChangelogEntry, b: ChangelogEntry): number {
	const dateDelta = Date.parse(b.dateIso) - Date.parse(a.dateIso);
	if (dateDelta !== 0) return dateDelta;
	const sourceDelta = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
	if (sourceDelta !== 0) return sourceDelta;
	const sevDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
	if (sevDelta !== 0) return sevDelta;
	if (a.title < b.title) return -1;
	if (a.title > b.title) return 1;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Aggregate Figma versions, git commits, and a token diff into one sorted,
 * audience-segmented changelog. Unlabeled (autosave) Figma versions and any
 * entry dated before `since` are filtered out.
 */
export function aggregateChangelog(input: AggregateInput): ChangelogEntry[] {
	const entries: ChangelogEntry[] = [];

	for (const version of input.versions) {
		if (version.label.trim() === "") continue; // autosave noise
		entries.push(fromVersion(version));
	}

	for (const commit of input.commits) {
		entries.push(fromCommit(commit));
	}

	// Token-diff entries share a single dateIso: the since boundary, since a diff
	// has no per-entry timestamp of its own (it's the delta over the window).
	const tokenDate = toIso(input.since);
	for (const entry of input.tokenDiff.entries) {
		entries.push(fromDiffEntry(entry, tokenDate));
	}

	return entries
		.filter((entry) => withinSince(entry.dateIso, input.since))
		.sort(compareEntries);
}
