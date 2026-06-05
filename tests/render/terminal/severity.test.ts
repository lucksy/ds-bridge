// T1.7 — terminal severity coloring + shouldColor env detection.
import { describe, expect, it } from "vitest";
import {
	severityColor,
	shouldColor,
} from "../../../src/render/terminal/severity.js";

describe("shouldColor", () => {
	it("returns true for a TTY with no overriding env", () => {
		expect(shouldColor({}, true)).toBe(true);
	});

	it("returns false for a non-TTY with no overriding env", () => {
		expect(shouldColor({}, false)).toBe(false);
	});

	it("disables color when NO_COLOR is present and non-empty", () => {
		expect(shouldColor({ NO_COLOR: "1" }, true)).toBe(false);
		expect(shouldColor({ NO_COLOR: "anything" }, true)).toBe(false);
	});

	it("ignores an empty NO_COLOR (per the spec it must be non-empty)", () => {
		expect(shouldColor({ NO_COLOR: "" }, true)).toBe(true);
	});

	it("NO_COLOR wins over FORCE_COLOR", () => {
		expect(shouldColor({ NO_COLOR: "1", FORCE_COLOR: "1" }, true)).toBe(false);
	});

	it("forces color when FORCE_COLOR is set, even without a TTY", () => {
		expect(shouldColor({ FORCE_COLOR: "1" }, false)).toBe(true);
		expect(shouldColor({ FORCE_COLOR: "true" }, false)).toBe(true);
	});

	it("treats FORCE_COLOR=0 / false as disabling the force", () => {
		expect(shouldColor({ FORCE_COLOR: "0" }, false)).toBe(false);
		expect(shouldColor({ FORCE_COLOR: "false" }, false)).toBe(false);
	});

	it("disables color under CI when not explicitly forced", () => {
		expect(shouldColor({ CI: "true" }, true)).toBe(false);
	});

	it("FORCE_COLOR overrides CI", () => {
		expect(shouldColor({ CI: "true", FORCE_COLOR: "1" }, true)).toBe(true);
	});
});

describe("severityColor", () => {
	it("returns plain text when color is off", () => {
		expect(severityColor("error", "boom", { color: false })).toBe("boom");
		expect(severityColor("warn", "careful", { color: false })).toBe("careful");
		expect(severityColor("info", "fyi", { color: false })).toBe("fyi");
		expect(severityColor("ok", "good", { color: false })).toBe("good");
	});

	it("wraps text in the level's ANSI color when color is on", () => {
		expect(severityColor("error", "boom", { color: true })).toBe(
			"[31mboom[39m",
		);
		expect(severityColor("warn", "careful", { color: true })).toBe(
			"[33mcareful[39m",
		);
		expect(severityColor("info", "fyi", { color: true })).toBe("[36mfyi[39m");
		expect(severityColor("ok", "good", { color: true })).toBe("[32mgood[39m");
	});
});
