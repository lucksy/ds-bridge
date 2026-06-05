// Toolchain smoke spec (T0.2) — proves the test runner works.
// Deleted in T1.1 when real engine tests land.
import { describe, expect, it } from "vitest";

describe("toolchain", () => {
	it("runs a spec", () => {
		expect(1 + 1).toBe(2);
	});
});
