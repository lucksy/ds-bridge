// `record` stores a score point only when its own batch measured something,
// and bounds each check with a timeout.
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
	type RecordDeps,
	runRecord,
	stepTimeoutMs,
} from "../../src/cli-commands/record.js";
import { appendHistoryRecord } from "../../src/io/history-writer.js";

const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
afterEach(() => {
	vi.restoreAllMocks();
});

/** A project whose history already holds an (old) score-relevant lint run. */
function project(): string {
	const dir = mkdtempSync(join(tmpdir(), "ds-record-score-"));
	dirs.push(dir);
	mkdirSync(join(dir, ".ds-bridge"), { recursive: true });
	writeFileSync(
		join(dir, ".ds-bridge", "history.jsonl"),
		`${JSON.stringify({
			at: "2026-09-01T00:00:00.000Z",
			kind: "lint",
			byKind: { exact: 1, near: 0, offSystem: 0 },
			adoption: { refs: 90, literals: 10 },
		})}\n`,
		"utf8",
	);
	return dir;
}

const scoreLines = (dir: string) =>
	readFileSync(join(dir, ".ds-bridge", "history.jsonl"), "utf8")
		.split("\n")
		.filter((l) => l.includes('"kind":"score"'));

function record(dir: string, runStep: RecordDeps["runStep"]): unknown {
	let out = "";
	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		out += String(chunk);
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	const code = runRecord(
		dir,
		{ source: "local", figma: false, format: "json" },
		{ runStep, env: { ...process.env, CI: "" }, newRunId: () => "run-1" },
	);
	expect(code).toBe(0);
	return JSON.parse(out);
}

describe("record — the stored score", () => {
	it("stores no score when no check of this batch recorded anything", () => {
		const dir = project();
		const result = record(dir, () => ({
			status: 0,
			stderr: "nothing to do\n",
		}));
		expect(result).toMatchObject({ score: null });
		expect(scoreLines(dir)).toEqual([]);
	});

	it("stores one score when a check of this batch recorded", () => {
		const dir = project();
		let wrote = false;
		const result = record(dir, (args, { env }) => {
			if (args[0] === "lint" && !wrote) {
				wrote = true;
				appendHistoryRecord(
					join(dir, ".ds-bridge"),
					{
						kind: "lint",
						byKind: { exact: 0, near: 0, offSystem: 0 },
						adoption: { refs: 95, literals: 5 },
					},
					{
						env,
						toolVersion: null,
						exec: () => ({ status: 1, stdout: "", stderr: "" }),
					},
				);
			}
			return { status: 0, stderr: "" };
		});
		expect(result).toMatchObject({ score: { score: expect.any(Number) } });
		expect(scoreLines(dir)).toHaveLength(1);
	});
});

describe("stepTimeoutMs", () => {
	it("defaults to 5 minutes and honours a positive override", () => {
		expect(stepTimeoutMs({})).toBe(300_000);
		expect(stepTimeoutMs({ DS_BRIDGE_RECORD_STEP_TIMEOUT_MS: "1500" })).toBe(
			1500,
		);
		for (const bad of ["0", "-1", "soon", ""]) {
			expect(stepTimeoutMs({ DS_BRIDGE_RECORD_STEP_TIMEOUT_MS: bad })).toBe(
				300_000,
			);
		}
	});
});
