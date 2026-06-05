// T5.1 fixture — styled-component export. The local styled stub returns an
// FC whose props are an empty-ish object, so the scanner discovers the name but
// no meaningful props (documented styled fallback: name found, props empty).
declare namespace React {
	type ReactNode = unknown;
	type FC<P> = (props: P) => unknown;
}

const styled: {
	div: (
		strings: TemplateStringsArray,
	) => React.FC<{ children?: React.ReactNode }>;
} = {
	div: () => (props) => props as unknown as JSX.Element,
};

export const HeroPanel = styled.div`
	color: rebeccapurple;
`;
