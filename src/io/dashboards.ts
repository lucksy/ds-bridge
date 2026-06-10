// M8.2 — the git flat-file dashboard store (SPEC-personas §7). A saved dashboard
// is `<project>/dashboards/<name>.json` (committed, team-canonical) or
// `<name>.local.json` (gitignored, personal — shadows the same-named shared file
// on that machine). Every write goes through the shared `atomicWriteJson` seam
// (M8.1); the selection (view XOR artifacts) is parsed by the shared
// `parseSelectionFile` so a saved dashboard validates exactly like project config.
//
// The advisory fields (persona, report_type, audience, score_weights) ride along:
// `report_type` is the dashboard's DEFAULT render target (the `--format` flag
// always wins), and `score_weights` is render-scoped (read when rendering this
// dashboard, never written back to global config).
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJson, parseSelectionFile } from "../config.js";
import type { ArtifactId } from "../engines/report/catalog.js";
import { validateWeights, type Weights } from "../engines/report/score.js";

const DASHBOARDS_DIR = "dashboards";

/** The valid `report_type` defaults a saved dashboard may declare (SPEC §7). */
const REPORT_TYPES = ["html", "md", "terminal", "site"] as const;
export type DashboardReportType = (typeof REPORT_TYPES)[number];

/** The selection a saved dashboard pins: a preset `view` XOR an `artifacts` list. */
export interface DashboardSelection {
	view?: string;
	artifacts?: readonly string[];
}

/** Optional advisory metadata written alongside the selection (SPEC §7 schema). */
export interface DashboardMeta {
	persona?: string;
	report_type?: DashboardReportType;
	audience?: string;
	/** Per-dashboard weight OVERRIDE (render-scoped, C2) — never written to global. */
	score_weights?: Partial<Weights>;
}

/** A fully-read saved dashboard: its name, resolved selection, and advisory fields. */
export interface DashboardFile {
	name: string;
	selection:
		| { kind: "view"; view: string }
		| { kind: "artifacts"; artifacts: ArtifactId[] };
	reportType?: DashboardReportType;
	audience?: string;
	persona?: string;
	/** The validated partial weight override (render-scoped, C2). */
	scoreWeights?: Partial<Weights>;
}

/** readDashboardFile outcome: a parsed dashboard, a missing name, or a typed error. */
export type ReadDashboardOutcome =
	| { kind: "ok"; dashboard: DashboardFile }
	| { kind: "not-found" }
	| { kind: "invalid"; message: string };

/** One discovered dashboard name + whether a shared and/or local file backs it. */
export interface DashboardEntry {
	name: string;
	hasShared: boolean;
	hasLocal: boolean;
}

/** Absolute path to a dashboard file (`.local.json` when `local`). */
function dashboardPath(dir: string, name: string, local: boolean): string {
	const suffix = local ? ".local.json" : ".json";
	return join(dir, DASHBOARDS_DIR, `${name}${suffix}`);
}

/**
 * Persist a named selection to `dashboards/<name>(.local).json` via the shared
 * atomic seam, creating the directory if needed. `name` leads the object (it
 * becomes the viewLabel); the selection + any advisory meta follow, in the §7
 * schema order. A non-view/non-artifacts selection is a programming error (the
 * caller resolves which side); the writer trusts its input.
 */
export function writeDashboardFile(
	dir: string,
	name: string,
	selection: DashboardSelection,
	opts: { local?: boolean; meta?: DashboardMeta } = {},
): void {
	mkdirSync(join(dir, DASHBOARDS_DIR), { recursive: true });
	const obj: Record<string, unknown> = { name };
	if (selection.view !== undefined) obj.view = selection.view;
	if (selection.artifacts !== undefined)
		obj.artifacts = [...selection.artifacts];
	const meta = opts.meta;
	if (meta?.persona !== undefined) obj.persona = meta.persona;
	if (meta?.report_type !== undefined) obj.report_type = meta.report_type;
	if (meta?.audience !== undefined) obj.audience = meta.audience;
	if (meta?.score_weights !== undefined) obj.score_weights = meta.score_weights;
	atomicWriteJson(dashboardPath(dir, name, opts.local ?? false), obj);
}

/** Parse a dashboard file's text into a {@link DashboardFile}, or a typed error. */
function parseDashboard(
	text: string,
	fallbackName: string,
): ReadDashboardOutcome {
	const selectionOutcome = parseSelectionFile(text);
	if (selectionOutcome.kind === "invalid") {
		return { kind: "invalid", message: selectionOutcome.message };
	}
	// parseSelectionFile already proved the text is a JSON object; re-parse for the
	// advisory fields (it intentionally ignores them).
	const obj = JSON.parse(text) as Record<string, unknown>;

	const selection =
		selectionOutcome.kind === "view"
			? { kind: "view" as const, view: selectionOutcome.view }
			: { kind: "artifacts" as const, artifacts: selectionOutcome.artifacts };

	const dashboard: DashboardFile = {
		name:
			typeof obj.name === "string" && obj.name !== "" ? obj.name : fallbackName,
		selection,
	};

	if (obj.report_type !== undefined) {
		if (!REPORT_TYPES.includes(obj.report_type as DashboardReportType)) {
			return {
				kind: "invalid",
				message: `report_type must be one of ${REPORT_TYPES.join(", ")}`,
			};
		}
		dashboard.reportType = obj.report_type as DashboardReportType;
	}
	if (obj.audience !== undefined) {
		if (typeof obj.audience !== "string") {
			return { kind: "invalid", message: "audience must be a string" };
		}
		dashboard.audience = obj.audience;
	}
	if (obj.persona !== undefined) {
		if (typeof obj.persona !== "string") {
			return { kind: "invalid", message: "persona must be a string" };
		}
		dashboard.persona = obj.persona;
	}
	if (obj.score_weights !== undefined) {
		// Validate for errors (unknown key / non-positive / non-finite), but keep the
		// RAW partial override — the C2 resolver merges it onto defaults at render.
		const weights = validateWeights(obj.score_weights);
		if (weights.kind !== "ok") {
			return {
				kind: "invalid",
				message: `score_weights is invalid (${weights.kind}${"key" in weights ? `: ${weights.key}` : ""})`,
			};
		}
		dashboard.scoreWeights = obj.score_weights as Partial<Weights>;
	}

	return { kind: "ok", dashboard };
}

/**
 * Read a saved dashboard by name, layering a `.local.json` over the same-named
 * `.json` (the personal file shadows the shared one on this machine). Neither
 * present → `not-found`; a parse/validation failure → a typed `invalid`.
 */
export function readDashboardFile(
	dir: string,
	name: string,
): ReadDashboardOutcome {
	const localPath = dashboardPath(dir, name, true);
	const sharedPath = dashboardPath(dir, name, false);
	const path = existsSync(localPath)
		? localPath
		: existsSync(sharedPath)
			? sharedPath
			: undefined;
	if (path === undefined) return { kind: "not-found" };
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return { kind: "not-found" };
	}
	return parseDashboard(text, name);
}

/**
 * List every saved dashboard in `dashboards/`, deduped by basename, with markers
 * for whether a shared (`.json`) and/or local (`.local.json`) file backs each.
 * Sorted by name ascending. A missing directory → []. Non-`.json` files ignored.
 */
export function listDashboards(dir: string): DashboardEntry[] {
	let files: string[];
	try {
		files = readdirSync(join(dir, DASHBOARDS_DIR));
	} catch {
		return []; // no dashboards/ directory yet
	}
	const byName = new Map<string, DashboardEntry>();
	const entryFor = (name: string): DashboardEntry => {
		const existing = byName.get(name);
		if (existing !== undefined) return existing;
		const created = { name, hasShared: false, hasLocal: false };
		byName.set(name, created);
		return created;
	};
	for (const file of files) {
		if (file.endsWith(".local.json")) {
			entryFor(file.slice(0, -".local.json".length)).hasLocal = true;
		} else if (file.endsWith(".json")) {
			entryFor(file.slice(0, -".json".length)).hasShared = true;
		}
	}
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
