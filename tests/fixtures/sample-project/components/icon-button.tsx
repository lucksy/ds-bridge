// T5.1 fixture — forwardRef component with an interface props type.
declare namespace React {
	type ReactNode = unknown;
	function forwardRef<T, P>(
		render: (props: P, ref: T) => unknown,
	): (props: P) => unknown;
}

interface IconButtonProps {
	icon: string;
	label: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
	(props, _ref) => {
		return props as unknown as JSX.Element;
	},
);
