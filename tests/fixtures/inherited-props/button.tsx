import type { HtmlAttributes } from "./types/html";

// shadcn-style: inherited HTML attributes + the component's own API.
export function Button(
	props: HtmlAttributes & {
		variant?: "default" | "outline";
		asChild?: boolean;
	},
) {
	return <button type="button" id={props.id} data-variant={props.variant} />;
}

// cva-style variant helper: callable, but not a component.
export function buttonVariants(options?: { variant?: "default" | "outline" }) {
	return options?.variant ?? "default";
}

// A component whose props are ONLY inherited attributes (shadcn Label-like).
export function Label(props: HtmlAttributes) {
	return <span id={props.id} />;
}
