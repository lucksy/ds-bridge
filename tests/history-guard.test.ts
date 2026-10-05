// H11 — the test-isolation guard (SPEC-history-v2 §8.2). Pure snapshot/compare
// helpers used by the vitest globalSetup to fail a run that appends to the
// repository's own .ds-bridge/history.jsonl.
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { historyChangeMessage, snapshotHistory } from "./history-guard.js";

const dirs: string[] = [];
async function freshFile(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ds-hist-guard-"));
	dirs.push(dir);
	return join(dir, "history.jsonl");
}
afterAll(async () => {
	for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

describe("snapshotHistory", () => {
	it("an absent file snapshots as not existing", async () => {
		const file = await freshFile();
		expect(snapshotHistory(file)).toEqual({
			exists: false,
			size: 0,
			sha256: "",
		});
	});

	it("an existing file records size and content hash", async () => {
		const file = await freshFile();
		await writeFile(file, '{"kind":"lint"}\n', "utf8");
		const snap = snapshotHistory(file);
		expect(snap.exists).toBe(true);
		expect(snap.size).toBe(16);
		expect(snap.sha256).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("historyChangeMessage", () => {
	it("is undefined when the file is unchanged", async () => {
		const file = await freshFile();
		await writeFile(file, "a\n", "utf8");
		const before = snapshotHistory(file);
		expect(
			historyChangeMessage(before, snapshotHistory(file), file),
		).toBeUndefined();
	});

	it("is undefined when the file stays absent", async () => {
		const file = await freshFile();
		const before = snapshotHistory(file);
		expect(
			historyChangeMessage(before, snapshotHistory(file), file),
		).toBeUndefined();
	});

	it("names the file and the byte delta when a test appended", async () => {
		const file = await freshFile();
		await writeFile(file, "a\n", "utf8");
		const before = snapshotHistory(file);
		await appendFile(file, '{"kind":"handoff"}\n', "utf8");
		const message = historyChangeMessage(before, snapshotHistory(file), file);
		expect(message).toContain(file);
		expect(message).toContain("+19 bytes");
	});

	it("mentions a concurrent writer as the other possible cause", async () => {
		const file = await freshFile();
		const before = snapshotHistory(file);
		await writeFile(file, "x\n", "utf8");
		const message = historyChangeMessage(before, snapshotHistory(file), file);
		expect(message).toContain(
			"or another process wrote it during the run — rerun in isolation",
		);
	});

	it("flags a file that a test created", async () => {
		const file = await freshFile();
		const before = snapshotHistory(file);
		await writeFile(file, "x\n", "utf8");
		const message = historyChangeMessage(before, snapshotHistory(file), file);
		expect(message).toContain(file);
		expect(message).toContain("created");
	});

	it("flags a same-size rewrite (content hash differs)", async () => {
		const file = await freshFile();
		await writeFile(file, "aa\n", "utf8");
		const before = snapshotHistory(file);
		await writeFile(file, "bb\n", "utf8");
		const message = historyChangeMessage(before, snapshotHistory(file), file);
		expect(message).toContain("rewritten");
	});
});
