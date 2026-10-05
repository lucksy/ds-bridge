/**
 * A rendered dashboard page with its earlier timeline states removed: the head,
 * header and the current ("Now") state. A dashboard over several days of
 * history also carries its earlier states for the header timeline; assertions
 * about the current dashboard read this. A page without a timeline is returned
 * whole.
 */
export function currentState(html: string): string {
	const marker = '<div class="wrap tl-state ';
	const first = html.indexOf(marker);
	if (first === -1) return html;
	return html.slice(0, first) + html.slice(html.lastIndexOf(marker));
}
