// T7.18 — MDX renderer. PURE: no fs/network/process; deterministic; NEVER
// throws. Builds one MDX page per ComponentDoc as a string the docs CLI writes
// to disk. Sections, in order:
//   - frontmatter: title + status ("documented" when no gaps, else "gaps")
//   - H1 component name
//   - import snippet (only when there is a code importPath)
//   - Props table (or an empty-state note)
//   - Variants list (or an empty-state note)
//   - Figma section (only when the doc has a figma side): description or note,
//     plus the node id
//   - Gaps callout (a GitHub-flavored `> [!WARNING]` admonition) when gaps exist
//
// See tests/engines/docs/render-mdx.test.ts for the pinned golden output.
import type { ComponentDoc, DocGap } from "./merge.js";

/** Frontmatter status derived from whether the doc has any gaps. */
function statusOf(doc: ComponentDoc): "documented" | "gaps" {
	return doc.gaps.length > 0 ? "gaps" : "documented";
}

/** Escape a markdown table cell: pipes would break the column layout. */
function escapeCell(text: string): string {
	return text.replace(/\|/g, "\\|");
}

/** The import-snippet block, or undefined when there is no code side. */
function renderImport(doc: ComponentDoc): string | undefined {
	if (doc.code.importPath.length === 0) return undefined;
	return [
		"```tsx",
		`import { ${doc.name} } from "${doc.code.importPath}";`,
		"```",
	].join("\n");
}

/** The Props section: a table, or an empty-state note. */
function renderProps(doc: ComponentDoc): string {
	const { props } = doc.code;
	if (props.length === 0) {
		return ["## Props", "", "_No props documented._"].join("\n");
	}
	const rows = props.map(
		(prop) =>
			`| \`${escapeCell(prop.name)}\` | \`${escapeCell(prop.type)}\` | ${
				prop.required ? "yes" : "no"
			} |`,
	);
	return [
		"## Props",
		"",
		"| Prop | Type | Required |",
		"| --- | --- | --- |",
		...rows,
	].join("\n");
}

/** The Variants section: a bullet list per axis, or an empty-state note. */
function renderVariants(doc: ComponentDoc): string {
	const axes = Object.keys(doc.code.variants).sort();
	if (axes.length === 0) {
		return ["## Variants", "", "_No variants._"].join("\n");
	}
	const lines = axes.map((axis) => {
		const values = (doc.code.variants[axis] ?? [])
			.map((value) => `\`${value}\``)
			.join(", ");
		return `- **${axis}**: ${values}`;
	});
	return ["## Variants", "", ...lines].join("\n");
}

/** The Figma section, or undefined when the doc has no figma side. */
function renderFigma(doc: ComponentDoc): string | undefined {
	const figma = doc.figma;
	if (figma === undefined) return undefined;
	const body =
		figma.description.length > 0
			? figma.description
			: "_No Figma description authored._";
	return ["## Figma", "", body, "", `Node: \`${figma.nodeId}\``].join("\n");
}

/** One human-readable line explaining a gap, for the callout. */
function explainGap(gap: DocGap): string {
	switch (gap) {
		case "missing-figma-description":
			return "The matched Figma component has no authored description.";
		case "unmatched-in-figma":
			return "The codebase has this component but the Figma library does not publish a match.";
		case "unmatched-in-code":
			return "Figma publishes this component but no code component matches it.";
	}
}

/** The gaps callout, or undefined when there are no gaps. */
function renderGaps(doc: ComponentDoc): string | undefined {
	if (doc.gaps.length === 0) return undefined;
	const lines = doc.gaps.map((gap) => `> - ${explainGap(gap)}`);
	return [
		"> [!WARNING]",
		"> This component has documentation gaps:",
		...lines,
	].join("\n");
}

/**
 * Render a single ComponentDoc as an MDX page. Sections are joined with a blank
 * line between them; the output ends with a trailing newline.
 */
export function renderComponentMdx(doc: ComponentDoc): string {
	const sections: string[] = [
		["---", `title: ${doc.name}`, `status: ${statusOf(doc)}`, "---"].join("\n"),
		`# ${doc.name}`,
	];

	const importBlock = renderImport(doc);
	if (importBlock !== undefined) sections.push(importBlock);

	sections.push(renderProps(doc));
	sections.push(renderVariants(doc));

	const figmaBlock = renderFigma(doc);
	if (figmaBlock !== undefined) sections.push(figmaBlock);

	const gapsBlock = renderGaps(doc);
	if (gapsBlock !== undefined) sections.push(gapsBlock);

	return `${sections.join("\n\n")}\n`;
}
