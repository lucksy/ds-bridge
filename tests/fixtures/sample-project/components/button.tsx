// T5.1 fixture — plain function component with an inline props type.
// Self-contained React stub so ts-morph resolves prop types structurally
// without the installed React typings (this file is outside the tsc graph).
declare namespace React {
	type ReactNode = unknown;
}

export function Button(props: {
	variant: "primary" | "secondary" | "ghost";
	size?: "sm" | "md" | "lg";
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return props as unknown as JSX.Element;
}
