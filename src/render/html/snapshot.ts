// M12.1 — committed HTML snapshot normalization (SPEC-personas §7). A snapshot is
// a rendered dashboard with the single non-deterministic byte — the live
// "Generated <iso>" timestamp — replaced by a fixed sentinel, so a content-free
// re-render produces a ZERO-byte diff and a real content change produces a
// reviewable one. The renderer is otherwise fully deterministic and
// path-agnostic (inline CSS/SVG, no absolute paths / run-ids / hashes), so the
// timestamp is the only thing to normalize. PURE.

/** The fixed timestamp sentinel a snapshot carries in place of the live instant. */
export const SNAPSHOT_SENTINEL = "__GENERATED_AT__";

/**
 * Normalize a rendered dashboard for committing as a snapshot: replace the live
 * ISO timestamp in the header's `Generated ` span with {@link SNAPSHOT_SENTINEL}.
 * Idempotent (re-normalizing an already-normalized snapshot is a no-op) and
 * deterministic. Other than the timestamp the render is byte-stable, so this is
 * the whole normalization.
 */
export function normalizeSnapshot(html: string): string {
	return html.replace(
		/(<span class="generated">Generated )[^<]*(<\/span>)/,
		`$1${SNAPSHOT_SENTINEL}$2`,
	);
}
