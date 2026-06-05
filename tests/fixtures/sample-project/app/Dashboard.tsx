// T7.8 usage fixture — imports Button (twice used) and Card. Exercises multiple
// call sites of one import within a single file and a second imported component.
// No color/dimension literals (keeps the lint golden count stable).
import { Button } from "../components/button.tsx";
import { Card } from "../components/card.tsx";

export function Dashboard() {
	return (
		<Card title="Overview" elevated>
			<Button variant="primary">Refresh</Button>
			<Button variant="secondary">Cancel</Button>
		</Card>
	);
}
