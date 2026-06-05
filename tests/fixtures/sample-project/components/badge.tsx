// T5.1 fixture — HOC-wrapped export. withTooltip is a local higher-order
// component; its generic signature preserves the inner component's props, so a
// resolver that follows the call's return type still recovers BadgeProps.
declare namespace React {
	type ReactNode = unknown;
	type FC<P> = (props: P) => unknown;
}

interface BadgeProps {
	tone: "info" | "success" | "danger";
	text: string;
}

function withTooltip<P>(Inner: React.FC<P>): React.FC<P> {
	return (props: P) => Inner(props);
}

const BadgeInner = (props: BadgeProps) => props as unknown as JSX.Element;

export const Badge = withTooltip(BadgeInner);
