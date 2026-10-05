// R3 — rollup source loader (SPEC-rollup §2). Impure io edge: reads a repo's
// history from its working tree, a history file, or a git ref (via the
// injectable `readFileAtRef` seam). Never throws — every failure is a typed
// `missing` / `error` outcome the rollup model turns into a note.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RollupLoad } from "../engines/rollup/rollup.js";
import type { SourceSpec } from "../engines/rollup/sources.js";
import { type GitExec, readFileAtRef } from "./git-log.js";

const HISTORY_REL = join(".ds-bridge", "history.jsonl");
const RECORD_HINT = "run ds-bridge record there to start one.";

function kindOf(path: string): "dir" | "file" | "none" {
	try {
		const s = statSync(path);
		if (s.isDirectory()) return "dir";
		return s.isFile() ? "file" : "none";
	} catch {
		return "none";
	}
}

function readText(file: string, label: string): RollupLoad {
	try {
		return { kind: "ok", text: readFileSync(file, "utf8") };
	} catch (error) {
		// The errno code only — fs messages embed the absolute path.
		const code = (error as NodeJS.ErrnoException).code;
		const detail =
			code ?? (error instanceof Error ? error.message : String(error));
		return { kind: "error", message: `Could not read ${label}: ${detail}` };
	}
}

/**
 * Load one source's history text. Never throws. Every note names the source by
 * `spec.label` (as the user wrote it), falling back to `spec.path`.
 */
export function loadRollupSource(spec: SourceSpec, exec: GitExec): RollupLoad {
	const label = spec.label ?? spec.path;
	const kind = kindOf(spec.path);
	if (spec.ref !== undefined) {
		if (kind !== "dir") {
			return {
				kind: "missing",
				message: `${label} is not a directory (a <path>@<ref> source must be a repo).`,
			};
		}
		const out = readFileAtRef({
			ref: spec.ref,
			path: ".ds-bridge/history.jsonl",
			cwd: spec.path,
			exec,
		});
		if (out.kind === "ok") return out;
		if (out.kind === "missing") {
			return {
				kind: "missing",
				message: `No .ds-bridge/history.jsonl committed at ${spec.ref} in ${label}.`,
			};
		}
		return {
			kind: "error",
			message: `Could not read ${spec.ref} in ${label}: ${out.message || "git error"} — run git fetch in that repo?`,
		};
	}
	if (kind === "file") return readText(spec.path, label);
	if (kind === "dir") {
		const file = join(spec.path, HISTORY_REL);
		if (kindOf(file) !== "file") {
			return {
				kind: "missing",
				message: `No history in ${label} — ${RECORD_HINT}`,
			};
		}
		return readText(file, label);
	}
	return { kind: "missing", message: `${label} does not exist.` };
}
