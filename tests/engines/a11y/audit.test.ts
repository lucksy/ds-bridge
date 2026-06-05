// T7.2 — token-pair contrast audit engine. Test-first: role-heuristic pairing,
// mode-aware audit, per-pair ratios, nearest-compliant OKLCH suggestions,
// deterministic ordering, typed findings. Pure (no I/O).
import { describe, expect, it } from "vitest";
import {
	auditContrast,
	type ModeTokenMap,
	pairColorTokens,
} from "../../../src/engines/a11y/audit.js";
import { contrastRatio } from "../../../src/engines/a11y/contrast.js";
import type { Token, TokenMap } from "../../../src/engines/tokens/types.js";

function color(name: string, value: string): Token {
	return { name, type: "color", value };
}

/** A token map with one mode's worth of semantic colors. */
function makeMap(tokens: Token[]): TokenMap {
	return { format: "tokens-studio", tokens };
}

describe("pairColorTokens role heuristics", () => {
	it("pairs foreground roles (text|fg|on-*|foreground) with background roles (bg|background|surface|fill)", () => {
		const map = makeMap([
			color("text.primary", "#1f2937"),
			color("color.bg.default", "#ffffff"),
			color("spacing.unused", "#000000"), // neither role → ignored as a role
		]);
		const pairs = pairColorTokens(map);
		const keys = pairs.map((p) => `${p.foreground.name}__${p.background.name}`);
		expect(keys).toContain("text.primary__color.bg.default");
	});

	it("treats on-* tokens as foreground and surface/fill as background", () => {
		const map = makeMap([
			color("button.on-primary", "#ffffff"),
			color("button.surface", "#3b82f6"),
		]);
		const pairs = pairColorTokens(map);
		expect(pairs).toHaveLength(1);
		expect(pairs[0]?.foreground.name).toBe("button.on-primary");
		expect(pairs[0]?.background.name).toBe("button.surface");
	});

	it("produces a deterministic order (by fg name, then bg name)", () => {
		const map = makeMap([
			color("text.b", "#000000"),
			color("text.a", "#000000"),
			color("bg.y", "#ffffff"),
			color("bg.x", "#ffffff"),
		]);
		const pairs = pairColorTokens(map);
		const keys = pairs.map((p) => `${p.foreground.name}|${p.background.name}`);
		const sorted = [...keys].sort();
		expect(keys).toEqual(sorted);
	});

	it("ignores non-color tokens entirely", () => {
		const map = makeMap([
			{ name: "text.size", type: "dimension", value: "16px" },
			color("text.primary", "#1f2937"),
			color("bg.default", "#ffffff"),
		]);
		const pairs = pairColorTokens(map);
		expect(pairs).toHaveLength(1);
	});
});

describe("auditContrast", () => {
	const lightTokens = [
		color("text.primary", "#1f2937"), // 14.68 on white → pass
		color("text.muted", "#9ca3af"), // 2.54 on white → fail
		color("bg.default", "#ffffff"),
	];

	it("emits one finding per pair per mode with the computed ratio", () => {
		const modes: ModeTokenMap[] = [
			{ mode: "light", map: makeMap(lightTokens) },
		];
		const report = auditContrast(modes, { level: "AA" });
		expect(report.findings.length).toBe(2); // text.primary, text.muted vs bg.default
		const primary = report.findings.find(
			(f) => f.foreground === "text.primary",
		);
		expect(primary?.mode).toBe("light");
		expect(primary?.ratio).toBeCloseTo(14.68, 1);
		expect(primary?.status).toBe("pass");
	});

	it("marks under-threshold pairs as fail and over-threshold as pass (AA normal=4.5)", () => {
		const modes: ModeTokenMap[] = [
			{ mode: "light", map: makeMap(lightTokens) },
		];
		const report = auditContrast(modes, { level: "AA" });
		const muted = report.findings.find((f) => f.foreground === "text.muted");
		expect(muted?.status).toBe("fail");
		expect(muted?.required).toBe(4.5);
	});

	it("attaches a nearest-compliant OKLCH suggestion to failing pairs that meets the required ratio", () => {
		const modes: ModeTokenMap[] = [
			{ mode: "light", map: makeMap(lightTokens) },
		];
		const report = auditContrast(modes, { level: "AA" });
		const muted = report.findings.find((f) => f.foreground === "text.muted");
		expect(muted?.status).toBe("fail");
		expect(muted?.suggestion?.kind).toBe("adjusted");
		if (muted?.suggestion?.kind === "adjusted") {
			const suggested = muted.suggestion.value;
			// the suggested foreground meets the required ratio against the bg
			const ratio = contrastRatio(suggested, "#ffffff");
			expect(ratio).not.toBeUndefined();
			expect(ratio ?? 0).toBeGreaterThanOrEqual(4.5);
		}
	});

	it("passing pairs carry no suggestion", () => {
		const modes: ModeTokenMap[] = [
			{ mode: "light", map: makeMap(lightTokens) },
		];
		const report = auditContrast(modes, { level: "AA" });
		const primary = report.findings.find(
			(f) => f.foreground === "text.primary",
		);
		expect(primary?.suggestion).toBeUndefined();
	});

	it("audits each mode independently (same pair can pass in one mode, fail in another)", () => {
		const modes: ModeTokenMap[] = [
			{
				mode: "light",
				map: makeMap([
					color("text.primary", "#1f2937"), // dark text on white → pass
					color("bg.default", "#ffffff"),
				]),
			},
			{
				mode: "dark",
				map: makeMap([
					color("text.primary", "#374151"), // dark-ish text on near-black → fail
					color("bg.default", "#111827"),
				]),
			},
		];
		const report = auditContrast(modes, { level: "AA" });
		const light = report.findings.find((f) => f.mode === "light");
		const dark = report.findings.find((f) => f.mode === "dark");
		expect(light?.status).toBe("pass");
		expect(dark?.status).toBe("fail");
	});

	it("orders findings deterministically by mode, then foreground, then background", () => {
		const modes: ModeTokenMap[] = [
			{
				mode: "zeta",
				map: makeMap([color("text.x", "#000000"), color("bg.a", "#ffffff")]),
			},
			{
				mode: "alpha",
				map: makeMap([color("text.x", "#000000"), color("bg.a", "#ffffff")]),
			},
		];
		const report = auditContrast(modes, { level: "AA" });
		const order = report.findings.map(
			(f) => `${f.mode}|${f.foreground}|${f.background}`,
		);
		expect(order).toEqual([...order].sort());
	});

	it("uses the AAA threshold (7.0 normal) when level is AAA", () => {
		const modes: ModeTokenMap[] = [
			{
				mode: "light",
				map: makeMap([
					color("text.primary", "#595959"), // 7.00 on white
					color("bg.default", "#ffffff"),
				]),
			},
		];
		const report = auditContrast(modes, { level: "AAA" });
		const f = report.findings[0];
		expect(f?.required).toBe(7.0);
		expect(f?.status).toBe("pass"); // 7.0047 ≥ 7.0
	});

	it("summary counts passes and failures across all modes", () => {
		const modes: ModeTokenMap[] = [
			{ mode: "light", map: makeMap(lightTokens) },
		];
		const report = auditContrast(modes, { level: "AA" });
		expect(report.summary.passed).toBe(1);
		expect(report.summary.failed).toBe(1);
		expect(report.summary.total).toBe(2);
	});

	it("records an unparseable foreground/background as a typed finding, not a throw", () => {
		const modes: ModeTokenMap[] = [
			{
				mode: "light",
				map: makeMap([
					color("text.weird", "var(--whatever)"),
					color("bg.default", "#ffffff"),
				]),
			},
		];
		const report = auditContrast(modes, { level: "AA" });
		const f = report.findings[0];
		expect(f?.status).toBe("unparseable");
		expect(f?.suggestion).toBeUndefined();
	});
});
