// The shared Figma auth-error message (registry / impact / frame-impl / handoff /
// library-health). An expired PAT used to read as a generic "auth error".
import { describe, expect, it } from "vitest";
import { figmaAuthErrorMessage } from "../../src/cli-commands/figma-auth-help.js";

describe("figmaAuthErrorMessage", () => {
	it("says the token expired and how to replace it", () => {
		const message = figmaAuthErrorMessage({
			kind: "auth-error",
			message: "Token has expired",
		});
		expect(message).toMatch(/expired/i);
		expect(message).toContain("config connect --verify");
	});

	it("passes Figma's reason through for other rejections", () => {
		expect(
			figmaAuthErrorMessage({ kind: "auth-error", message: "Invalid token" }),
		).toContain("Invalid token");
	});

	it("keeps the generic guidance when Figma gave no reason", () => {
		expect(figmaAuthErrorMessage({ kind: "auth-error" })).toContain(
			"Dev/Full-seat personal access token",
		);
	});
});
