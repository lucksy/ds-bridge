// A1 — adoption tally engine (PURE: no fs/network/process).
// Two pure pieces feed the "on-system %" ratio: var(--…) references = on-system,
// extracted color/dimension literals = off-system, pct = refs / (refs + literals),
// over css/scss files and the inline styles of .tsx/.jsx files (style objects,
// styled templates). Originally css/scss only (SPEC-adoption §1); widened in
// v1.16 because a JSX app read "100% on-system" beside its inline literals.
// Tailwind class utilities remain out of scope. countTokenRefs supplies the numerator;
// tallyAdoption folds per-file {refs, literals} into totals + a worst-first
// byDirectory leaderboard. Never throws; best-effort on malformed input.
//
// Stripper decision (SPEC-adoption §3): we REUSE the extractor's blankComments
// rather than building a second masker here. blankComments was extended in
// extract.ts to also blank SCSS // line comments and string contents, so a
// commented-out or string-embedded var(--x) is masked identically to the way the
// literal extractor masks it — one canonical truth for "what counts as code",
// no risk of the numerator and denominator disagreeing about a comment.

import { blankComments, styleRegions } from "./extract.js";

/** Count `var(--name)` token references in CSS/SCSS, ignoring comments + strings. */
export function countTokenRefs(css: string): number {
	// Mask comments + string interiors first, then count custom-property var() refs.
	const masked = blankComments(css);
	// var( … --name … ) — require a `--` custom property inside the parens.
	const refRe = /\bvar\s*\(\s*--[\w-]+/gi;
	let count = 0;
	while (refRe.exec(masked) !== null) count += 1;
	return count;
}

/**
 * Count `var(--name)` token references inside a JSX/TSX file's inline styles
 * (style objects and styled templates) — the on-system side of the inline
 * values the linter extracts. References elsewhere (plain strings, Tailwind
 * class names) are not inline styles and do not count.
 */
export function countInlineStyleTokenRefs(source: string): number {
	const refRe = /\bvar\s*\(\s*--[\w-]+/gi;
	let count = 0;
	for (const region of styleRegions(source)) {
		const body = source.slice(region.start, region.end);
		count += [...body.matchAll(refRe)].length;
	}
	return count;
}

/** Per-file adoption counts (css/scss and inline JSX styles). */
export interface FileAdoption {
	path: string;
	refs: number;
	literals: number;
}

/** One directory bucket in the leaderboard. */
export interface DirectoryAdoption {
	dir: string;
	refs: number;
	literals: number;
}

/** Totals + worst-pct-first directory breakdown. */
export interface AdoptionTally {
	totals: { refs: number; literals: number };
	byDirectory: DirectoryAdoption[];
}

/** Maximum directory rows retained in byDirectory (worst-first survive). */
const BY_DIRECTORY_CAP = 20;

/** dirname of a forward-slash path; "" when the path has no directory segment. */
function dirnameOf(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? "" : path.slice(0, slash);
}

/** on-system pct (refs / (refs + literals)); 0 when the denominator is 0. */
function pct(refs: number, literals: number): number {
	const denom = refs + literals;
	return denom === 0 ? 0 : refs / denom;
}

/**
 * Fold per-file counts into totals + a directory leaderboard. byDirectory is
 * sorted worst-pct first, ties broken by directory path ascending, capped at 20;
 * directories with no refs and no literals are excluded. Deterministic.
 */
export function tallyAdoption(files: FileAdoption[]): AdoptionTally {
	const totals = { refs: 0, literals: 0 };
	const byDir = new Map<string, DirectoryAdoption>();

	for (const file of files) {
		totals.refs += file.refs;
		totals.literals += file.literals;
		const dir = dirnameOf(file.path);
		const bucket = byDir.get(dir);
		if (bucket === undefined) {
			byDir.set(dir, { dir, refs: file.refs, literals: file.literals });
		} else {
			bucket.refs += file.refs;
			bucket.literals += file.literals;
		}
	}

	const byDirectory = [...byDir.values()]
		.filter((d) => d.refs + d.literals > 0)
		.sort((a, b) => {
			const pa = pct(a.refs, a.literals);
			const pb = pct(b.refs, b.literals);
			if (pa !== pb) return pa - pb; // worst (lowest) pct first
			return a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0; // tie: path asc
		})
		.slice(0, BY_DIRECTORY_CAP);

	return { totals, byDirectory };
}
