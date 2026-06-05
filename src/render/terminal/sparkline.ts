// T1.7 — single-line unicode sparkline. PURE string building.

// The eight block elevations, lowest to highest.
const TICKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * Render `values` as a single-line sparkline scaled to the series' own
 * min/max. Empty input yields an empty string; a constant series maps to the
 * lowest tick (no divide-by-zero).
 */
export function sparkline(values: number[]): string {
	if (values.length === 0) return "";

	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min;
	const lastTick = TICKS.length - 1;

	return values
		.map((value) => {
			if (range === 0) return TICKS[0];
			const index = Math.round(((value - min) / range) * lastTick);
			return TICKS[index];
		})
		.join("");
}
