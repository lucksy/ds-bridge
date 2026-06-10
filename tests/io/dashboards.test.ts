// M8.2 — the git flat-file dashboard store (SPEC-personas §7). writeDashboardFile
// persists a named selection (view XOR artifacts) to dashboards/<name>.json (or
// .local.json), readDashboardFile parses it back (layering .local over .json),
// and listDashboards globs the directory, deduping by basename with shared/local
// markers. Advisory fields (persona, report_type, audience, score_weights) ride
// along; score_weights is render-scoped (read here, never written to global).

import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	listDashboards,
	readDashboardFile,
	writeDashboardFile,
} from "../../src/io/dashboards.js";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ds-dash-store-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

/** Hand-write a dashboards/<file> with arbitrary JSON for read-path specs. */
function seedDashboard(file: string, obj: unknown): void {
	mkdirSync(join(dir, "dashboards"), { recursive: true });
	writeFileSync(
		join(dir, "dashboards", file),
		`${JSON.stringify(obj, null, 2)}\n`,
		"utf8",
	);
}

describe("writeDashboardFile", () => {
	it("writes dashboards/<name>.json with name + a view selection", async () => {
		writeDashboardFile(dir, "exec", { view: "ds-manager" }, {});
		const text = await readFile(join(dir, "dashboards", "exec.json"), "utf8");
		const obj = JSON.parse(text) as Record<string, unknown>;
		expect(obj.name).toBe("exec");
		expect(obj.view).toBe("ds-manager");
		expect(obj.artifacts).toBeUndefined();
		// name leads the object (becomes the viewLabel).
		expect(Object.keys(obj)[0]).toBe("name");
	});

	it("writes an artifacts selection", async () => {
		writeDashboardFile(
			dir,
			"exec",
			{ artifacts: ["system-score", "parity"] },
			{},
		);
		const obj = JSON.parse(
			await readFile(join(dir, "dashboards", "exec.json"), "utf8"),
		) as Record<string, unknown>;
		expect(obj.artifacts).toEqual(["system-score", "parity"]);
		expect(obj.view).toBeUndefined();
	});

	it("--local writes dashboards/<name>.local.json", async () => {
		writeDashboardFile(dir, "mine", { view: "ds-designer" }, { local: true });
		const text = await readFile(
			join(dir, "dashboards", "mine.local.json"),
			"utf8",
		);
		expect(JSON.parse(text).name).toBe("mine");
	});

	it("persists advisory meta (persona, report_type, audience, score_weights)", async () => {
		writeDashboardFile(
			dir,
			"exec",
			{ view: "ds-manager" },
			{
				meta: {
					persona: "ds-manager",
					report_type: "md",
					audience: "both",
					score_weights: { lint: 30 },
				},
			},
		);
		const obj = JSON.parse(
			await readFile(join(dir, "dashboards", "exec.json"), "utf8"),
		) as Record<string, unknown>;
		expect(obj.report_type).toBe("md");
		expect(obj.score_weights).toEqual({ lint: 30 });
	});
});

describe("readDashboardFile", () => {
	it("reads a view selection", () => {
		seedDashboard("exec.json", { name: "exec", view: "ds-manager" });
		const out = readDashboardFile(dir, "exec");
		expect(out.kind).toBe("ok");
		if (out.kind === "ok") {
			expect(out.dashboard.name).toBe("exec");
			expect(out.dashboard.selection).toEqual({
				kind: "view",
				view: "ds-manager",
			});
		}
	});

	it("reads an artifacts selection + advisory fields", () => {
		seedDashboard("exec.json", {
			name: "exec",
			artifacts: ["system-score", "parity"],
			report_type: "terminal",
			score_weights: { lint: 30 },
			audience: "both",
			persona: "ds-engineer",
		});
		const out = readDashboardFile(dir, "exec");
		expect(out.kind).toBe("ok");
		if (out.kind === "ok") {
			expect(out.dashboard.selection).toEqual({
				kind: "artifacts",
				artifacts: ["system-score", "parity"],
			});
			expect(out.dashboard.reportType).toBe("terminal");
			expect(out.dashboard.scoreWeights).toEqual({ lint: 30 });
			expect(out.dashboard.audience).toBe("both");
			expect(out.dashboard.persona).toBe("ds-engineer");
		}
	});

	it("returns not-found for a missing name", () => {
		expect(readDashboardFile(dir, "nope").kind).toBe("not-found");
	});

	it("returns invalid for a bad selection (unknown id)", () => {
		seedDashboard("bad.json", { name: "bad", artifacts: ["parityy"] });
		const out = readDashboardFile(dir, "bad");
		expect(out.kind).toBe("invalid");
		if (out.kind === "invalid") expect(out.message).toContain("parity");
	});

	it("returns invalid for an unknown report_type", () => {
		seedDashboard("bad.json", {
			name: "bad",
			view: "ds-manager",
			report_type: "pdf",
		});
		expect(readDashboardFile(dir, "bad").kind).toBe("invalid");
	});

	it("layers .local over .json (the personal file shadows the shared)", () => {
		seedDashboard("exec.json", { name: "exec", view: "ds-manager" });
		seedDashboard("exec.local.json", { name: "exec", view: "ds-designer" });
		const out = readDashboardFile(dir, "exec");
		expect(out.kind).toBe("ok");
		if (out.kind === "ok") {
			expect(out.dashboard.selection).toEqual({
				kind: "view",
				view: "ds-designer",
			});
		}
	});
});

describe("listDashboards", () => {
	it("returns [] when there is no dashboards directory", () => {
		expect(listDashboards(dir)).toEqual([]);
	});

	it("globs names, deduping by basename with shared/local markers", () => {
		seedDashboard("exec.json", { name: "exec", view: "ds-manager" });
		seedDashboard("exec.local.json", { name: "exec", view: "ds-designer" });
		seedDashboard("team.json", { name: "team", artifacts: ["parity"] });
		seedDashboard("mine.local.json", { name: "mine", view: "ds-designer" });
		const entries = listDashboards(dir);
		expect(entries.map((e) => e.name)).toEqual(["exec", "mine", "team"]);
		const exec = entries.find((e) => e.name === "exec");
		expect(exec).toEqual({ name: "exec", hasShared: true, hasLocal: true });
		const team = entries.find((e) => e.name === "team");
		expect(team).toEqual({ name: "team", hasShared: true, hasLocal: false });
		const mine = entries.find((e) => e.name === "mine");
		expect(mine).toEqual({ name: "mine", hasShared: false, hasLocal: true });
	});
});
