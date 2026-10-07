export interface ChipProps {
	kind?: "assist" | "filter";
	label: string;
}

export function Chip({ kind = "assist", label }: ChipProps) {
	return <span className={`m3-chip m3-chip--${kind}`}>{label}</span>;
}
