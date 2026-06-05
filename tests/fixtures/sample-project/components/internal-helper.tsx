// T5.1 fixture — a non-exported component. The scanner must NOT report this:
// only exported components belong in the registry.
declare namespace React {
	type ReactNode = unknown;
}

interface InternalHelperProps {
	value: string;
}

function InternalHelper(props: InternalHelperProps) {
	return props as unknown as JSX.Element;
}

// Used internally only; never exported.
const _used = InternalHelper;
void _used;
