// T7.8 usage fixture — imports + uses the Button component from the registry.
// Deliberately free of any color/dimension literals so the lint golden count
// (which copies the whole sample-project) is unaffected by this additive file.
import { Button } from "../components/button.tsx";

export function PrimaryCta() {
	return (
		<Button variant="primary" size="md">
			Save
		</Button>
	);
}
