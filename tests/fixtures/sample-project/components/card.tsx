// T5.1 fixture — typed const component via React.FC<CardProps>.
declare namespace React {
	type ReactNode = unknown;
	type FC<P> = (props: P) => unknown;
}

interface CardProps {
	title: string;
	elevated?: boolean;
}

export const Card: React.FC<CardProps> = (props) => {
	return props as unknown as JSX.Element;
};
