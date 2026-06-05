// T7.8 usage fixture — the negative control: imports nothing from the registry,
// so it must NEVER appear as a usage site. No color/dimension literals.
export function Unrelated() {
	return <section aria-label="empty" />;
}
