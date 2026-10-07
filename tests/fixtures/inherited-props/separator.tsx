import type { SeparatorPrimitiveProps } from "./types/html";

// shadcn-style: the radix prop it destructures is part of its API.
export function Separator({
	orientation = "horizontal",
	...props
}: SeparatorPrimitiveProps) {
	return <hr aria-orientation={orientation} id={props.id} />;
}
