// M7.3 — the persona-first `dashboard setup` interactive wizard. Pure-ish
// orchestration over INJECTED streams: `node:readline/promises` (Node core —
// zero new deps) reading from `input`, prompting on `output`, persisting through
// the sanctioned writeProjectConfig.
//
// This is the codebase's first ASYNC injection pattern (the sync git-log.ts
// exec precedent does not transfer). Tests drive it with canned PassThrough
// streams across every interactive path; the spawned-CLI integration covers
// exactly the non-TTY → exit 2 case (a spawned CLI is never a TTY).
//
// Flow (SPEC-personas §2.1/§2.2): numbered persona list (the seven presets) →
// pick → `everything` escape needs no setup (exit 0, no write) → capture the
// per-side file-key model (producer confirms the singular library key; consumer
// pins a `product_file_keys` alias) → confirm → writeProjectConfig writing ONLY
// `dashboard_view` (a LIVE preset) + any `product_file_keys` (never report_style
// / readiness_threshold, §2.1) → echo the persona's changelog/digest audience
// default (§2.3 — derived, not a config key) + offer `report --open`.
//
// Outcomes (exitCode mirrors the composer convention — 0 success / 2 abort):
//   - non-TTY → exit 2 BEFORE any prompt, pointing at `dashboard set`
//   - EOF (Ctrl-D / piped stdin ends) mid-flow → exit 2, config UNTOUCHED
//   - confirm declined → exit 0, config untouched
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { writeProjectConfig } from "../config.js";
import { PRESET_NAMES, type PresetName } from "./../engines/report/presets.js";

/** The three producer personas (govern the DS library) vs. the three consumers. */
const PRODUCER_PERSONAS = new Set<PresetName>([
	"ds-designer",
	"ds-manager",
	"ds-engineer",
]);

/**
 * The changelog/digest `--audience` default per persona (SPEC-personas §2.3):
 * designer-side → designers, engineer-side → developers, governance/PM → both.
 * Echoed by the wizard; the skill derives the same default from `dashboard_view`
 * — it is NOT persisted as a config key.
 */
const PERSONA_AUDIENCE: Record<
	Exclude<PresetName, "everything">,
	"designers" | "developers" | "both"
> = {
	"ds-designer": "designers",
	"ds-manager": "both",
	"ds-engineer": "developers",
	"product-designer": "designers",
	"product-manager": "both",
	"product-engineer": "developers",
};

const PROJECT_FILE_NAME = ".ds-bridge.json";

/** Read the existing `product_file_keys` map (alias→key), or {} when absent. */
function readExistingProductFileKeys(dir: string): Record<string, string> {
	try {
		const raw = JSON.parse(
			readFileSync(join(dir, PROJECT_FILE_NAME), "utf8"),
		) as unknown;
		if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
			const pfk = (raw as Record<string, unknown>).product_file_keys;
			if (typeof pfk === "object" && pfk !== null && !Array.isArray(pfk)) {
				const out: Record<string, string> = {};
				for (const [alias, key] of Object.entries(pfk)) {
					if (typeof key === "string") out[alias] = key;
				}
				return out;
			}
		}
	} catch {
		// Missing / unreadable / non-JSON → no existing entries.
	}
	return {};
}

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
 * Capture the per-side file-key model (SPEC-personas §2.2). Producer personas
 * confirm the singular library `figma_file_key` (warn if unset — it is env-tier,
 * never written here). Consumer personas pin THEIR product file as a named
 * `product_file_keys` alias, merged onto any existing map. Returns the
 * product_file_keys map to write, or undefined when none was pinned.
 * Throws {@link EofError} on stream end.
 */
async function captureFileKeys(
	reader: LineReader,
	output: Writable,
	cwd: string,
	persona: Exclude<PresetName, "everything">,
): Promise<Record<string, string> | undefined> {
	if (PRODUCER_PERSONAS.has(persona)) {
		const hasKey = isYes(
			await ask(
				reader,
				output,
				"Is your DS library file key configured (FIGMA_DESIGN_SYSTEM_FILE / figma_file_key)? (y/N) ",
			),
		);
		if (!hasKey) {
			output.write(
				"Heads up: library-health, parity, a11y, impact, and docs stay empty until figma_file_key is set.\n",
			);
		}
		return undefined; // producers never write a product file key
	}

	// Consumer: pin their product file under a named alias (or skip on blank).
	const alias = (
		await ask(
			reader,
			output,
			"Name an alias for your product Figma file (e.g. web), or leave blank to skip: ",
		)
	).trim();
	if (alias === "") return undefined;
	const key = (
		await ask(reader, output, `Figma file key for "${alias}": `)
	).trim();
	if (key === "") {
		output.write("No file key entered — skipping the product file pin.\n");
		return undefined;
	}
	return { ...readExistingProductFileKeys(cwd), [alias]: key };
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
				"Use `ds-bridge dashboard set --view <preset>` instead.\n",
		);
		return { exitCode: 2 };
	}

	const rl = createInterface({ input, output });
	const reader = new LineReader(rl);
	try {
		const preset = await pickPreset(reader, output);

		// The `everything` escape needs no config — an unconfigured repo already
		// renders the full catalog (SPEC §2.1 step 2).
		if (preset === "everything") {
			output.write(
				"`everything` needs no setup — an unconfigured repo already renders the full catalog.\n",
			);
			return { exitCode: 0 };
		}

		const productFileKeys = await captureFileKeys(reader, output, cwd, preset);

		const confirmed = isYes(
			await ask(reader, output, `Save the "${preset}" view? (y/N) `),
		);
		if (!confirmed) {
			output.write("No changes made.\n");
			return { exitCode: 0 };
		}

		// Onboarding writes ONLY dashboard_view (a LIVE preset, clearing any prior
		// artifacts/default) + product_file_keys — never report_style /
		// readiness_threshold (SPEC §2.1).
		writeProjectConfig(cwd, {
			dashboard_view: preset,
			dashboard_artifacts: undefined,
			dashboard_default: undefined,
			...(productFileKeys !== undefined
				? { product_file_keys: productFileKeys }
				: {}),
		});

		output.write(`Saved. Your dashboard view is now "${preset}".\n`);
		output.write(
			`Default --audience for ${preset}: ${PERSONA_AUDIENCE[preset]} (changelog/digest).\n`,
		);
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
