export function Button(props: { variant?: "default" | "outline" }) {
	return <button type="button" data-variant={props.variant} />;
}
