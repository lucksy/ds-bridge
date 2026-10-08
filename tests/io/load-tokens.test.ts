// The shared token loader: a broken secondary mode must not take down every
// command (real-user finding, Figma's Simple Design System — its brand_b_light
// mode aliases a palette the export never wrote).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTokens } from "../../src/io/load-tokens.js";

const modes = (values: Record<string, string>) => ({
	$extensions: { "com.figma.x": { modes: values } },
});

describe("loadTokens — a broken non-default mode", () => {
	it("keeps that mode, the broken token falling back to its default, with a warning", () => {
		const dir = mkdtempSync(join(tmpdir(), "load-tokens-"));
		const file = join(dir, "tokens.json");
		writeFileSync(
			file,
			JSON.stringify({
				palette: { white: { $type: "color", $value: "#ffffff" } },
				color: {
					bg: {
						$type: "color",
						$value: "{palette.white}",
						...modes({
							light: "{palette.white}",
							dark: "#111111",
							brand: "{palette.missing}",
						}),
					},
				},
			}),
		);
		const outcome = loadTokens(file);
		expect(outcome.kind).toBe("ok");
		if (outcome.kind !== "ok") return;
		expect(outcome.modes?.map((m) => m.mode)).toEqual([
			"light",
			"brand",
			"dark",
		]);
		const brand = outcome.modes?.find((m) => m.mode === "brand");
		expect(brand?.map.tokens.find((t) => t.name === "color.bg")?.value).toBe(
			"#ffffff",
		);
		expect(outcome.warnings.join("\n")).toMatch(
			/mode "brand": color\.bg keeps its default value — alias references unknown token "palette\.missing"/,
		);
	});

	it("does not warn about Figma STRING / BOOLEAN variable types", () => {
		const dir = mkdtempSync(join(tmpdir(), "load-tokens-"));
		const file = join(dir, "tokens.json");
		writeFileSync(
			file,
			JSON.stringify({
				device: {
					name: { $type: "string", $value: "desktop" },
					on: { $type: "boolean", $value: true },
					what: { $type: "unknown", $value: "x" },
				},
			}),
		);
		const outcome = loadTokens(file);
		expect(outcome.kind === "ok" && outcome.warnings).toEqual([]);
	});
});

describe("loadTokens — valid DTCG types it does not compare", () => {
	it("reads cubicBezier / transition / border without a warning per token", () => {
		const dir = mkdtempSync(join(tmpdir(), "load-tokens-"));
		const file = join(dir, "tokens.json");
		writeFileSync(
			file,
			JSON.stringify({
				easing: { linear: { $type: "cubicBezier", $value: [0, 0, 1, 1] } },
				motion: {
					fade: { $type: "transition", $value: { duration: "100ms" } },
				},
			}),
		);
		const outcome = loadTokens(file);
		expect(outcome.kind === "ok" && outcome.warnings).toEqual([]);
	});
});
