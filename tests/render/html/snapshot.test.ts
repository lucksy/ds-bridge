// M12.1 — normalizeSnapshot: replace the live timestamp with a fixed sentinel so
// committed snapshots diff cleanly. Pure + idempotent.
import { describe, expect, it } from "vitest";
import {
	normalizeSnapshot,
	SNAPSHOT_SENTINEL,
} from "../../../src/render/html/snapshot.js";

const withTimestamp = (iso: string): string =>
	`<header><span class="generated">Generated ${iso}</span></header>`;

describe("normalizeSnapshot", () => {
	it("replaces the live Generated timestamp with the sentinel", () => {
		const out = normalizeSnapshot(withTimestamp("2026-06-10T12:34:56.000Z"));
		expect(out).toContain(`Generated ${SNAPSHOT_SENTINEL}`);
		expect(out).not.toContain("2026-06-10T12:34:56.000Z");
	});

	it("makes two renders with DIFFERENT timestamps byte-identical", () => {
		const a = normalizeSnapshot(withTimestamp("2026-06-10T00:00:00.000Z"));
		const b = normalizeSnapshot(withTimestamp("2026-06-11T09:09:09.000Z"));
		expect(a).toBe(b);
	});

	it("is idempotent (re-normalizing changes nothing)", () => {
		const once = normalizeSnapshot(withTimestamp("2026-06-10T00:00:00.000Z"));
		expect(normalizeSnapshot(once)).toBe(once);
	});

	it("leaves a document without a timestamp untouched", () => {
		const doc = "<html><body>no header</body></html>";
		expect(normalizeSnapshot(doc)).toBe(doc);
	});
});
