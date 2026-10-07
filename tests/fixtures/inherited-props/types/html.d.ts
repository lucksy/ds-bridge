// Stand-in for @types/react's HTML attribute interfaces: compiled declarations
// a component inherits wholesale (React.ComponentProps<"button">).
export interface HtmlAttributes {
	id?: string;
	autoCapitalize?: "off" | "none" | "on" | "sentences" | "words";
	translate?: "yes" | "no";
}

// Stand-in for a radix primitive's props (shadcn wraps these).
export interface SeparatorPrimitiveProps extends HtmlAttributes {
	orientation?: "horizontal" | "vertical";
	decorative?: boolean;
}
