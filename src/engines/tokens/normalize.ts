// T1.5 — canonical value normalization. Many author spellings, one comparable form.
import { formatHex, formatHex8, parse } from "culori";

/**
 * Normalize any CSS color spelling (hex/rgb/hsl/oklch/named) to canonical
 * lowercase hex: 6-digit when opaque, 8-digit when alpha < 1.
 * Returns undefined for non-colors.
 */
export function normalizeColor(raw: string): string | undefined {
	if (raw === "") return undefined;
	const parsed = parse(raw);
	if (parsed === undefined) return undefined;
	const alpha = parsed.alpha ?? 1;
	return alpha < 1 ? formatHex8(parsed) : formatHex(parsed);
}

export interface NormalizedDimension {
	px: number;
}

export interface DimensionOptions {
	/** Root font size used to convert rem. Default 16. */
	remBase?: number;
}

const PX_RE = /^(-?\d+(?:\.\d+)?)px$/;
const REM_RE = /^(-?\d+(?:\.\d+)?)rem$/;
const UNITLESS_RE = /^(-?\d+(?:\.\d+)?)$/;

/**
 * Normalize a dimension value to canonical px. Accepts px, rem, unitless
 * numeric strings (Tokens Studio spacing), and plain numbers.
 * Returns undefined for anything else (%, ms, colors, keywords).
 */
export function normalizeDimension(
	raw: string | number,
	options?: DimensionOptions,
): NormalizedDimension | undefined {
	const remBase = options?.remBase ?? 16;
	if (typeof raw === "number") {
		return Number.isFinite(raw) ? { px: raw } : undefined;
	}
	const trimmed = raw.trim();
	const px = PX_RE.exec(trimmed);
	if (px?.[1] !== undefined) return { px: Number(px[1]) };
	const rem = REM_RE.exec(trimmed);
	if (rem?.[1] !== undefined) return { px: Number(rem[1]) * remBase };
	const unitless = UNITLESS_RE.exec(trimmed);
	if (unitless?.[1] !== undefined) return { px: Number(unitless[1]) };
	return undefined;
}
