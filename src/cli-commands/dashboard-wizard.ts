// M2.3 — the `dashboard setup` interactive wizard (split from dashboard.ts up
// front, per SPEC-measure §4). Pure-ish orchestration over INJECTED streams:
// `node:readline/promises` (Node core — zero new deps) reading from `input`,
// prompting on `output`, persisting through the sanctioned writeProjectConfig.
//
// This is the codebase's first ASYNC injection pattern (the sync git-log.ts
// exec precedent does not transfer). Tests drive it with canned PassThrough
// streams across every interactive path; the spawned-CLI integration covers
// exactly the non-TTY → exit 2 case (a spawned CLI is never a TTY).
//
// Flow: numbered preset list → pick → customize? (y/N) → add/remove loop
// (show current selection; 'add <id>' / 'remove <id>' / 'done') → confirm →
// writeProjectConfig → print the resulting view + offer `report --open`.
//
// Outcomes (exitCode mirrors the composer convention — 0 success / 2 abort):
//   - non-TTY → exit 2 BEFORE any prompt, pointing at `dashboard set`
//   - EOF (Ctrl-D / piped stdin ends) mid-flow → exit 2, config UNTOUCHED
//   - confirm declined → exit 0, config untouched
import { createInterface, type Interface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { writeProjectConfig } from "../config.js";
import {
	type ArtifactId,
	lookupArtifact,
} from "./../engines/report/catalog.js";
import {
	PRESET_NAMES,
	PRESETS,
	type PresetName,
} from "./../engines/report/presets.js";

/**
 * A line reader over a readline interface that distinguishes a real (possibly
 * empty) submitted line from end-of-input. `readline/promises`'s own `question`
 * resolves with "" on close, conflating the two; we instead consume the
 * interface's `'line'` events into a queue and let a pending read reject with
 * {@link EofError} the moment `'close'` fires with the queue drained. This is
 * fully deterministic with canned streams (no timers, no question-vs-close race).
 */
class LineReader {
	private readonly queue: string[] = [];
	private waiting:
		| { resolve: (line: string) => void; reject: (e: Error) => void }
		| undefined;
	private closed = false;

	constructor(rl: Interface) {
		rl.on("line", (line: string) => {
			if (this.waiting !== undefined) {
				const { resolve } = this.waiting;
				this.waiting = undefined;
				resolve(line);
			} else {
				this.queue.push(line);
			}
		});
		rl.on("close", () => {
			this.closed = true;
			if (this.waiting !== undefined) {
				const { reject } = this.waiting;
				this.waiting = undefined;
				reject(new EofError());
			}
		});
	}

	/** Resolve with the next line, or reject with {@link EofError} at end of input. */
	next(): Promise<string> {
		const buffered = this.queue.shift();
		if (buffered !== undefined) return Promise.resolve(buffered);
		if (this.closed) return Promise.reject(new EofError());
		return new Promise<string>((resolve, reject) => {
			this.waiting = { resolve, reject };
		});
	}
}

/** Injected dependencies — every I/O edge is a parameter, for deterministic tests. */
export interface WizardDeps {
	input: Readable;
	output: Writable;
	/** Project directory whose `.ds-bridge.json` is written on confirm. */
	cwd: string;
	/** False for piped/redirected stdin — a wizard needs a real terminal. */
	isTTY: boolean;
}

/** The wizard's terminal outcome — only the process exit code escapes. */
export interface WizardOutcome {
	exitCode: number;
}

/** Sentinel thrown internally when a prompt hits end-of-input (Ctrl-D / pipe). */
class EofError extends Error {}

/**
 * Write a prompt, then read one line, rejecting with {@link EofError} if the
 * stream ends first. The prompt is written explicitly (not via `rl.question`)
 * so the {@link LineReader} owns line delivery and EOF is unambiguous.
 */
async function ask(
	reader: LineReader,
	output: Writable,
	prompt: string,
): Promise<string> {
	output.write(prompt);
	return reader.next();
}

/** Render the current selection for the customize loop (ordered, comma-joined). */
function selectionLine(ids: readonly ArtifactId[]): string {
	return ids.length > 0 ? ids.join(", ") : "(empty)";
}

/** Pick a preset by number, re-prompting on out-of-range / non-numeric input. */
async function pickPreset(
	reader: LineReader,
	output: Writable,
): Promise<PresetName> {
	output.write("Pick a dashboard view:\n");
	PRESET_NAMES.forEach((name, index) => {
		output.write(`  ${index + 1}) ${name}\n`);
	});
	for (;;) {
		const answer = (await ask(reader, output, "View number: ")).trim();
		const n = Number(answer);
		if (Number.isInteger(n) && n >= 1 && n <= PRESET_NAMES.length) {
			const picked = PRESET_NAMES[n - 1];
			if (picked !== undefined) return picked;
		}
		output.write(
			`Please enter a number between 1 and ${PRESET_NAMES.length}.\n`,
		);
	}
}

/** A y/N prompt: 'y'/'yes' (case-insensitive) → true, anything else → false. */
function isYes(answer: string): boolean {
	const a = answer.trim().toLowerCase();
	return a === "y" || a === "yes";
}

/**
 * Drive the add/remove loop from a materialized starting list. Returns the
 * edited ordered list when the user types 'done'. Unknown ids are reported
 * (with suggestions) and the loop continues; idempotent add/remove print a
 * notice. Throws {@link EofError} on stream end.
 */
async function customizeLoop(
	reader: LineReader,
	output: Writable,
	start: readonly ArtifactId[],
): Promise<ArtifactId[]> {
	let selection: ArtifactId[] = [...start];
	for (;;) {
		output.write(`Current selection: ${selectionLine(selection)}\n`);
		const raw = (
			await ask(reader, output, "add <id> / remove <id> / done: ")
		).trim();
		if (raw.toLowerCase() === "done") return selection;

		const [verb, ...rest] = raw.split(/\s+/);
		const target = rest.join("");
		const command = verb?.toLowerCase();
		if ((command !== "add" && command !== "remove") || target === "") {
			output.write("Type 'add <id>', 'remove <id>', or 'done'.\n");
			continue;
		}

		const outcome = lookupArtifact(target);
		if (outcome.kind === "unknown") {
			const hint =
				outcome.suggestions.length > 0
					? ` — did you mean ${outcome.suggestions.join(", ")}?`
					: "";
			output.write(`Unknown artifact id "${target}"${hint}\n`);
			continue;
		}
		const id = outcome.artifact.id;

		if (command === "add") {
			if (selection.includes(id)) {
				output.write(`"${id}" is already selected — no change.\n`);
			} else {
				selection.push(id);
			}
		} else {
			if (!selection.includes(id)) {
				output.write(`"${id}" is not selected — no change.\n`);
			} else {
				selection = selection.filter((existing) => existing !== id);
			}
		}
	}
}

/**
 * Run the setup wizard. See the module header for the full flow and the exit
 * code contract. Never throws — every domain outcome maps to an exit code.
 */
export async function runSetupWizard(deps: WizardDeps): Promise<WizardOutcome> {
	const { input, output, cwd, isTTY } = deps;

	if (!isTTY) {
		output.write(
			"The setup wizard needs an interactive terminal. " +
				"Use `ds-bridge dashboard set --view <preset>` (or --artifacts) instead.\n",
		);
		return { exitCode: 2 };
	}

	const rl = createInterface({ input, output });
	const reader = new LineReader(rl);
	try {
		const preset = await pickPreset(reader, output);

		const customize = isYes(
			await ask(reader, output, `Customize the "${preset}" view? (y/N) `),
		);

		let chosen:
			| { kind: "view"; view: PresetName }
			| { kind: "artifacts"; artifacts: ArtifactId[] };
		if (customize) {
			const edited = await customizeLoop(reader, output, PRESETS[preset]);
			chosen = { kind: "artifacts", artifacts: edited };
		} else {
			chosen = { kind: "view", view: preset };
		}

		const summary =
			chosen.kind === "view"
				? `preset "${chosen.view}"`
				: `artifacts ${selectionLine(chosen.artifacts)}`;
		const confirmed = isYes(
			await ask(reader, output, `Save ${summary}? (y/N) `),
		);
		if (!confirmed) {
			output.write("No changes made.\n");
			return { exitCode: 0 };
		}

		if (chosen.kind === "view") {
			writeProjectConfig(cwd, {
				dashboard_view: chosen.view,
				dashboard_artifacts: undefined,
			});
		} else {
			writeProjectConfig(cwd, {
				dashboard_artifacts: chosen.artifacts,
				dashboard_view: undefined,
			});
		}

		output.write(`Saved. Your dashboard view is now ${summary}.\n`);
		output.write("Render it now? ds-bridge report --open\n");
		return { exitCode: 0 };
	} catch (error) {
		if (error instanceof EofError) {
			// EOF mid-flow: nothing was written (writes happen only after confirm).
			output.write("\nAborted — no changes made.\n");
			return { exitCode: 2 };
		}
		throw error;
	} finally {
		rl.close();
	}
}
