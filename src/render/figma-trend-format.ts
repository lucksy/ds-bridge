// F6 — shared text for the Figma/frame trend sections (SPEC-figma-trends §3.4).
// PURE string building, used by BOTH the HTML and the terminal twins so their
// labels, numbers and caveats can never drift apart. No escaping here — the
// HTML renderer escapes every string it embeds.
import type { FrameReadinessTrend } from "../engines/report/frame-readiness-trend.js";
import type { HandoffPassRate } from "../engines/report/handoff-pass-rate.js";
import type {
	HotspotRow,
	HotspotSignal,
	HotspotStatus,
} from "../engines/report/library-hotspots-trend.js";
import { sparkline } from "./terminal/sparkline.js";

/** Signal headings, in render order. */
export const SIGNAL_LABEL: Record<HotspotSignal, string> = {
	overrides: "Overrides",
	deprecated: "Deprecated",
	detached: "Detached — heuristic, REST cannot truly detect detachment",
};

export const SIGNAL_ORDER: readonly HotspotSignal[] = [
	"overrides",
	"deprecated",
	"detached",
];

/** Status words (for hygiene counts, "rising" is the bad direction). */
export const STATUS_LABEL: Record<HotspotStatus, string> = {
	new: "new",
	rising: "▲ rising",
	falling: "▼ falling",
	flat: "= flat",
	resolved: "✓ resolved",
	"below-top": "below top N (not stored)",
};

/** "+3" / "−3" / "±0". */
export function signedDelta(delta: number): string {
	if (delta > 0) return `+${delta}`;
	if (delta < 0) return `−${Math.abs(delta)}`;
	return "±0";
}

/** "9 (+5)", "9", or "—" when unknown. */
export function valueWithDelta(
	latest: number | null,
	delta: number | undefined,
): string {
	if (latest === null) return "—";
	return delta === undefined
		? String(latest)
		: `${latest} (${signedDelta(delta)})`;
}

/** "▁▄█ " (trailing space) for ≥ 2 points, else "" — one point is no trend. */
function sparkPrefix(values: number[]): string {
	return values.length >= 2 ? `${sparkline(values)} ` : "";
}

/** "▁▄█ 9 (+5) · ▲ rising" (name excluded); unknown points are skipped. */
export function hotspotDetail(row: HotspotRow): string {
	const known = row.points
		.map((p) => p.count)
		.filter((c): c is number => c !== null);
	// One known point is no measured change: no "(±0)".
	const delta = known.length > 1 ? row.delta : undefined;
	return `${sparkPrefix(known)}${valueWithDelta(row.latest, delta)} · ${STATUS_LABEL[row.status]}`;
}

/** "a → b" over the trend's dates. */
export function dateSpan(dates: readonly string[]): string {
	return `${dates[0] ?? ""} → ${dates[dates.length - 1] ?? ""}`;
}

/** "1 of 3 frames below the 80 gate" (failing among ALL scored frames). */
export function belowGateMeta(trend: FrameReadinessTrend): string {
	return `${trend.failing} of ${trend.total} frame${trend.total === 1 ? "" : "s"} below the ${trend.threshold} gate`;
}

/** "▁█ 72 (+12) · ✗ below gate" without the name. */
export function frameDetail(
	frame: FrameReadinessTrend["frames"][number],
): string {
	const delta = frame.runs > 1 ? frame.delta : undefined;
	const gate = frame.passing ? "✓ ready" : "✗ below gate";
	return `${sparkPrefix(frame.points.map((p) => p.score))}${valueWithDelta(frame.latest, delta)} · ${gate} · ${frame.runs} run${frame.runs === 1 ? "" : "s"}`;
}

/** "+K more" when the frame list was capped, else undefined. */
export function frameOverflow(trend: FrameReadinessTrend): string | undefined {
	const hidden = trend.total - trend.frames.length;
	return hidden > 0 ? `+${hidden} more` : undefined;
}

/** "2 of 3 frames ≥ 80". */
export function passRateSub(rate: HandoffPassRate): string {
	return `${rate.passing} of ${rate.frames} frame${rate.frames === 1 ? "" : "s"} ≥ ${rate.threshold}`;
}

/** "▁█ 0% → 67% (2026-09-01 → 2026-09-15)" when ≥ 2 days, else undefined. */
export function passRateTrendLine(rate: HandoffPassRate): string | undefined {
	if (rate.trend.length < 2) return undefined;
	const first = rate.trend[0];
	const last = rate.trend[rate.trend.length - 1];
	return `${sparkline(rate.trend.map((p) => p.pct))} ${first?.pct ?? 0}% → ${last?.pct ?? 0}% (${dateSpan(rate.trend.map((p) => p.date))})`;
}
