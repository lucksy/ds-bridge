// T4.7 — Gated live Figma smoke test (fixture-drift detection).
//
// This file is NOT part of the default `tests/**` glob (see vitest.config.ts),
// so `npm test` never runs it. It runs ONLY when invoked explicitly via the
// dedicated e2e config:
//
//   npx vitest run --config vitest.e2e.config.ts e2e/figma-smoke.test.ts
//
// Even then, the whole suite self-skips unless BOTH FIGMA_TOKEN and
// SMOKE_FILE_KEY are present (describe.skipIf below). With no env vars set the
// suite reports as *skipped*, never *failed* — so CI without the secrets is
// green, and a fresh checkout never needs network access to pass.
//
// Purpose: cross-check the SHAPE assumptions our recorded fixtures
// (tests/fixtures/figma/*.json) encode against the live Figma REST API, so
// fixture drift surfaces at release checkpoints C4–C6 + nightly CI — not in
// production (PLAN risk: "Recorded Figma fixtures drift from real API shapes";
// "Gated smoke test never runs → fixture-drift mitigation is theoretical").
//
// We assert structure, not content: the file key points at any small test
// file, so its names/ids will differ from the fixtures. We only verify the
// shapes the engines reason about still hold.
//
// View-seat tolerance (PLAN risk: "View-seat PAT rate limits ~6 req/month"):
// a `rate-limited` outcome is treated as a PASS with a logged warning rather
// than a failure, and the suite keeps its total request budget at <= 3
// (getFile + getComponents + getVersions).

import { describe, expect, it } from "vitest";
import {
	createFigmaClient,
	type FigmaComponent,
	type FigmaFile,
	type FigmaNode,
	type FigmaResult,
	type FigmaVersion,
} from "../src/io/figma/client.js";

const token = process.env.FIGMA_TOKEN ?? "";
const fileKey = process.env.SMOKE_FILE_KEY ?? "";
const gated = token === "" || fileKey === "";

/**
 * Treat a rate-limit outcome as a tolerated PASS (View-seat seats get ~6
 * requests/month on Tier 1). Returns the `ok` data when present, or `undefined`
 * when the call was rate-limited (caller then short-circuits its assertions).
 * Any other non-ok outcome is a hard failure — that is real drift/auth/network
 * trouble the smoke test must surface.
 */
function unwrapOrTolerateRateLimit<T>(
	label: string,
	result: FigmaResult<T>,
): T | undefined {
	if (result.kind === "ok") return result.data;
	if (result.kind === "rate-limited") {
		// View-seat tolerance: do not fail the nightly job on rate limits.
		console.warn(
			`[figma-smoke] ${label}: rate-limited (retry after ${result.retryAfterSeconds}s) — ` +
				"tolerated (View-seat ~6 req/month). Skipping shape checks for this call.",
		);
		return undefined;
	}
	throw new Error(
		`[figma-smoke] ${label}: unexpected outcome "${result.kind}"`,
	);
}

/** True for a plain object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively assert the node-shape assumptions the engines depend on:
 *  - every node has string id/name/type;
 *  - `children`, when present, is an array;
 *  - any `boundVariables` entry's aliases have the VARIABLE_ALIAS shape.
 * Bounded by a node budget so a huge live file can't run forever.
 */
function assertNodeShape(node: FigmaNode, budget: { left: number }): void {
	if (budget.left <= 0) return;
	budget.left -= 1;

	expect(typeof node.id).toBe("string");
	expect(typeof node.name).toBe("string");
	expect(typeof node.type).toBe("string");

	if (node.children !== undefined) {
		expect(Array.isArray(node.children)).toBe(true);
	}

	if (node.boundVariables !== undefined) {
		for (const value of Object.values(node.boundVariables)) {
			if (value === undefined) continue;
			const aliases = Array.isArray(value) ? value : [value];
			for (const alias of aliases) {
				// boundVariables entries our fixtures model carry the alias shape
				// { type: "VARIABLE_ALIAS", id: "VariableID:…" }.
				expect(alias.type).toBe("VARIABLE_ALIAS");
				expect(typeof alias.id).toBe("string");
			}
		}
	}

	for (const child of node.children ?? []) {
		assertNodeShape(child, budget);
	}
}

// describe.skipIf: when the gate is closed the WHOLE suite is reported skipped.
describe.skipIf(gated)("live Figma smoke test (shape drift detection)", () => {
	const client = createFigmaClient({ token });

	it("getFile → document tree matches our fixture shape assumptions", async () => {
		const result = await client.getFile(fileKey);
		const file: FigmaFile | undefined = unwrapOrTolerateRateLimit(
			"getFile",
			result,
		);
		if (file === undefined) return; // rate-limited → tolerated

		// file.json fixture: top-level name/lastModified/version strings + a
		// `document` node whose children is an array (DOCUMENT > CANVAS > …).
		expect(typeof file.name).toBe("string");
		expect(typeof file.lastModified).toBe("string");
		expect(typeof file.version).toBe("string");

		expect(isRecord(file.document)).toBe(true);
		expect(typeof file.document.id).toBe("string");
		expect(typeof file.document.type).toBe("string");
		// document.children is an array (the fixture's DOCUMENT carries CANVAS kids).
		expect(Array.isArray(file.document.children)).toBe(true);

		assertNodeShape(file.document, { left: 2000 });
	});

	it("getComponents → meta.components[] carry key/node_id/name", async () => {
		const result = await client.getComponents(fileKey);
		const data = unwrapOrTolerateRateLimit("getComponents", result);
		if (data === undefined) return; // rate-limited → tolerated

		// components.json fixture: { meta: { components: [{ key, node_id, name, … }] } }.
		expect(isRecord(data.meta)).toBe(true);
		expect(Array.isArray(data.meta.components)).toBe(true);

		for (const component of data.meta.components as FigmaComponent[]) {
			expect(typeof component.key).toBe("string");
			expect(typeof component.node_id).toBe("string");
			expect(typeof component.name).toBe("string");
		}
	});

	it("getVersions → versions[] carry id/created_at and a user.handle", async () => {
		const result = await client.getVersions(fileKey);
		const data = unwrapOrTolerateRateLimit("getVersions", result);
		if (data === undefined) return; // rate-limited → tolerated

		// versions.json fixture: { versions: [{ id, created_at, label, description, user }] }.
		expect(Array.isArray(data.versions)).toBe(true);

		for (const version of data.versions as FigmaVersion[]) {
			expect(typeof version.id).toBe("string");
			expect(typeof version.created_at).toBe("string");
			// label/description may be empty strings (autosave checkpoint), but the
			// keys must exist as strings.
			expect(typeof version.label).toBe("string");
			expect(typeof version.description).toBe("string");
			expect(isRecord(version.user)).toBe(true);
			expect(typeof version.user.handle).toBe("string");
		}
	});
});
