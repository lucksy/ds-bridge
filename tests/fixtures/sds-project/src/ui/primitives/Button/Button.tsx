export function Button({ size }: { size?: "small" | "medium" }) {
	return <button type="button" data-size={size} />;
}
