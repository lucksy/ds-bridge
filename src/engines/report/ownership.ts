// C9 / M3.6 — ownership-leaderboard engine. PURE: the adoption `byDirectory`
// refs/literals + a set of CODEOWNERS-style ownership rules in → an
// OwnershipRow[] (per-owner on-system %, worst-first) out. No fs/clock/network;
// deterministic; never throws.
//
// Each directory is mapped to ONE owner by matching its path against the rules'
// path globs/prefixes. CODEOWNERS semantics: the LAST matching rule wins (rules
// are evaluated in source order, most-general first, most-specific last), so a
// `src/checkout/**` rule after a `src/**` rule claims the checkout subtree. A
// directory matching no rule buckets into a synthetic `unowned` owner. Refs and
// literals sum per owner; `pct = 100·refs/(refs+literals)` (0 when the
// denominator is 0). Rows sort worst-pct-first, tie broken by owner name asc.
//
// The path matcher supports three forms in a rule's `paths` entry:
//   - `**`     — matches any number of path segments (incl. zero)
//   - `*`      — matches exactly one path segment (no `/`)
//   - plain    — a literal prefix: the directory equals the glob OR is nested
//                under it (so `src/ui` claims `src/ui/button`)
// Matching is anchored at the start; a trailing `/**` (or a plain prefix) lets a
// rule own a whole subtree, mirroring how CODEOWNERS path patterns behave.
import type { OwnerRule } from "../../config.js";
import type { OwnershipRow } from "./types.js";

/** One adoption byDirectory bucket (the C9 engine's input shape). */
export interface DirectoryAdoption {
	dir: string;
	refs: number;
	literals: number;
}

/** The synthetic owner for directories matching no rule. */
const UNOWNED = "unowned";

/** Coerce an unknown to a finite number, else 0 (tolerant on malformed buckets). */
function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Split a path into non-empty segments (collapsing repeated/trailing slashes). */
function segments(path: string): string[] {
	return path.split("/").filter((s) => s.length > 0);
}

/**
 * True when `dir` matches the glob/prefix `pattern`. `**` matches any number of
 * segments; `*` matches exactly one segment; a plain literal segment must match
 * verbatim. A pattern that consumes all its segments while leaving the directory
 * with extra trailing segments still matches ONLY when the pattern ended in `**`
 * OR was a plain prefix (no glob) — both mean "this directory and everything
 * under it". A `*`-terminated pattern matches its exact depth only.
 */
function matchesGlob(dir: string, pattern: string): boolean {
	const dirSegs = segments(dir);
	const patSegs = segments(pattern);
	const hasGlob = pattern.includes("*");

	let di = 0;
	let pi = 0;
	while (pi < patSegs.length) {
		const seg = patSegs[pi];
		if (seg === "**") {
			// `**` at the END matches the rest of the directory (incl. nothing).
			if (pi === patSegs.length - 1) return true;
			// `**` in the MIDDLE: try to match the remaining pattern at each suffix.
			const rest = patSegs.slice(pi + 1);
			for (let start = di; start <= dirSegs.length; start += 1) {
				if (matchSuffix(dirSegs.slice(start), rest)) return true;
			}
			return false;
		}
		if (di >= dirSegs.length) return false;
		if (seg !== "*" && seg !== dirSegs[di]) return false;
		di += 1;
		pi += 1;
	}
	// Pattern fully consumed. Exact-depth match always counts; extra trailing
	// directory segments count only for a plain (glob-less) prefix.
	if (di === dirSegs.length) return true;
	return !hasGlob;
}

/** Match `dirSegs` against a glob-less-or-globbed pattern suffix (helper for mid-`**`). */
function matchSuffix(dirSegs: string[], patSegs: string[]): boolean {
	let di = 0;
	let pi = 0;
	while (pi < patSegs.length) {
		const seg = patSegs[pi];
		if (seg === "**") {
			if (pi === patSegs.length - 1) return true;
			const rest = patSegs.slice(pi + 1);
			for (let start = di; start <= dirSegs.length; start += 1) {
				if (matchSuffix(dirSegs.slice(start), rest)) return true;
			}
			return false;
		}
		if (di >= dirSegs.length) return false;
		if (seg !== "*" && seg !== dirSegs[di]) return false;
		di += 1;
		pi += 1;
	}
	return di === dirSegs.length;
}

/**
 * The owner of `dir` under `ownership`, or `undefined` when no rule matches.
 * CODEOWNERS semantics: the LAST matching rule wins (iterate forward, keep the
 * latest hit). A rule with multiple `paths` matches if ANY of its globs matches.
 */
export function matchOwner(
	dir: string,
	ownership: readonly OwnerRule[],
): string | undefined {
	let owner: string | undefined;
	for (const rule of ownership) {
		if (rule.paths.some((pattern) => matchesGlob(dir, pattern))) {
			owner = rule.owner;
		}
	}
	return owner;
}

/** On-system percentage 100·refs/(refs+literals), half-up rounded; 0 if empty. */
function pct(refs: number, literals: number): number {
	const total = refs + literals;
	return total === 0 ? 0 : Math.round((refs / total) * 100);
}

/**
 * Re-fold the adoption `byDirectory` buckets onto named owners and rank them
 * worst-on-system-% first. Empty `byDirectory` OR empty `ownership` → []. See the
 * module header for the matching + tie-break contract.
 */
export function rollupByOwner(
	byDirectory: readonly DirectoryAdoption[],
	ownership: readonly OwnerRule[],
): OwnershipRow[] {
	if (byDirectory.length === 0 || ownership.length === 0) return [];

	const byOwner = new Map<string, { refs: number; literals: number }>();
	for (const bucket of byDirectory) {
		const owner = matchOwner(bucket.dir, ownership) ?? UNOWNED;
		const acc = byOwner.get(owner) ?? { refs: 0, literals: 0 };
		acc.refs += asNumber(bucket.refs);
		acc.literals += asNumber(bucket.literals);
		byOwner.set(owner, acc);
	}

	return [...byOwner.entries()]
		.map(([owner, { refs, literals }]) => ({
			owner,
			refs,
			literals,
			pct: pct(refs, literals),
		}))
		.sort(
			(a, b) =>
				a.pct - b.pct || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0),
		);
}

/**
 * Parse a CODEOWNERS file's text into ownership rules (the `ownership_file`
 * io-edge form). Grammar (one rule per line): `<path-glob> @owner [@owner2…]`.
 * Comment (`#`) and blank lines are skipped. A multi-owner line expands into one
 * rule per owner, each carrying the same single path glob — so the C9 engine's
 * last-match-wins fold treats every owner of a path as accountable. Source order
 * is preserved (the LAST matching rule wins downstream). A line with a path but
 * no owner is skipped. Pure: text in → rules out; never throws.
 */
export function parseCodeowners(text: string): OwnerRule[] {
	const rules: OwnerRule[] = [];
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		const tokens = line.split(/\s+/).filter((t) => t.length > 0);
		const path = tokens[0];
		const owners = tokens.slice(1);
		if (path === undefined || path === "" || owners.length === 0) continue;
		for (const owner of owners) {
			rules.push({ owner, paths: [path] });
		}
	}
	return rules;
}
