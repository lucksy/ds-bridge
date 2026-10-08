// D2 — digest markdown renderer (SPEC-digest §2). Pure string building (the
// changelog render-md.ts precedent): a typed DigestModel in → paste-anywhere
// markdown out. No I/O, no clock; the model's `sinceIso` is the only date, named
// in the window header. The exact multi-line output IS the contract — see
// digest-md.test.ts.
//
// Layout: an H1 title, a one-line window header naming the since boundary, then
// audience-segmented sections (## For designers / ## For developers, membership =
// section-audience or `both`, the render-md.ts:53 rule — a model already filtered
// to one audience renders just that section), each section's movement lines
// (▲▼= arrows, "new" for a first-in-window kind), and a numbered Actions block
// (the engine already capped it at 3). A `quiet` model collapses to the title
// plus a single italic one-liner.
import type {
	ChangelogAudience,
	// (type-only) — verbatim reuse of the changelog audience vocabulary.
} from "../changelog/aggregate.js";
import type {
	DigestAction,
	DigestModel,
	MovementKind,
	MovementRow,
} from "./digest.js";

/** The two rendered sections, in order, with their heading + section audience. */
const SECTIONS: { heading: string; audience: "designer" | "developer" }[] = [
	{ heading: "For designers", audience: "designer" },
	{ heading: "For developers", audience: "developer" },
];

/** Human label per movement kind (the line's leading noun). */
const MOVEMENT_LABEL: Record<MovementKind, string> = {
	drift: "Stale tokens",
	lint: "Lint violations",
	"on-system": "On-system",
	coverage: "Import coverage",
	readiness: "Readiness",
	a11y: "Contrast",
};

/** Kinds whose metric is a percentage (renders a trailing %). */
const PERCENT_KINDS: ReadonlySet<MovementKind> = new Set<MovementKind>([
	"on-system",
	"coverage",
	"a11y",
]);

/** A fixed human reason per action command (the trailing "— …" clause). */
const ACTION_REASON: Record<string, string> = {
	"ds-bridge tokens check": "review breaking token drift",
	"ds-bridge handoff <frame-url>": "readiness is below the gate",
	"ds-bridge a11y": "failing contrast pairs need a look",
	"ds-bridge adoption": "import coverage is below 100%",
};

/** The movement arrow: ▲ up, ▼ down, = flat. A new row uses an em-dash placeholder. */
function arrow(row: MovementRow): string {
	if (row.isNew) return "—";
	switch (row.direction) {
		case "up":
			return "▲";
		case "down":
			return "▼";
		case "flat":
			return "=";
	}
}

/** Format one metric value, with a trailing % for percentage kinds. */
function value(kind: MovementKind, n: number): string {
	return PERCENT_KINDS.has(kind) ? `${n}%` : `${n}`;
}

/** The membership rule: section-audience or `both` (render-md.ts:53). */
function inSection(
	rowAudience: ChangelogAudience,
	sectionAudience: "designer" | "developer",
): boolean {
	return rowAudience === sectionAudience || rowAudience === "both";
}

/** Render one movement row: `Label ▲ <base> → <current>` (or "— new <current>"). */
function movementText(row: MovementRow): string {
	const label = MOVEMENT_LABEL[row.kind];
	const current = value(row.kind, row.current);
	if (row.isNew) {
		return `${label} ${arrow(row)} new ${current}`;
	}
	const baseline = value(row.kind, row.baseline ?? 0);
	return `${label} ${arrow(row)} ${baseline} → ${current}`;
}

/**
 * Render one action (unnumbered). Off-system lint reads as what to do with an
 * accurate verb (`lint --fix` never touches off-system values — D6); every
 * other action is `Run \`<command>\` — <reason>`.
 */
function actionText(action: DigestAction): string {
	if (action.command === "ds-bridge lint") {
		const n = action.count ?? 0;
		const values = n === 1 ? "value" : "values";
		const count = n > 0 ? `${n} ` : "";
		const tokens = n === 1 ? "token" : "tokens";
		return `Snap ${count}off-system ${values} to an existing token, or add the missing ${tokens} (run \`ds-bridge lint\` to list them)`;
	}
	const reason = ACTION_REASON[action.command] ?? "see the docs";
	return `Run \`${action.command}\` — ${reason}`;
}

/** D6 — the window boundary as a date (YYYY-MM-DD), not a raw instant. */
function sinceDate(sinceIso: string): string {
	return /^\d{4}-\d{2}-\d{2}/.test(sinceIso) ? sinceIso.slice(0, 10) : sinceIso;
}

/**
 * F7 — which digest to lay out. `undefined` is the audience-segmented digest
 * (D2, unchanged); `"manager"` is ONE section listing every movement once
 * (SPEC-figma-trends §4 — the engine model is the `both` audience).
 */
export type DigestView = "manager" | undefined;

/** The renderer-neutral digest: both the markdown and the HTML page read this. */
export interface DigestDocument {
	title: string;
	/** "Window: changes since …." (absent for a quiet digest). */
	window?: string;
	/** The quiet one-liner (only for a quiet digest). */
	quiet?: string;
	sections: { heading: string; lines: string[] }[];
	/** Action sentences, in order (inline code in backticks). */
	actions: string[];
}

/**
 * Lay the model out as a structured document. The model is assumed already
 * audience-filtered by the engine; the default view splits its rows into the
 * relevant designer/developer section(s), the manager view keeps one section.
 */
export function digestDocument(
	model: DigestModel,
	view?: DigestView,
): DigestDocument {
	const title = "Design-system digest";
	if (model.kind === "quiet") {
		return {
			title,
			// The manager view backs a monthly (any-window) digest: window-neutral.
			quiet: `${view === "manager" ? "Quiet period" : "Quiet week"} — no design-system movement since ${sinceDate(model.sinceIso)}.`,
			sections: [],
			actions: [],
		};
	}
	const sections: DigestDocument["sections"] = [];
	if (view === "manager") {
		if (model.movements.length > 0) {
			sections.push({
				heading: "For managers",
				lines: model.movements.map(movementText),
			});
		}
	} else {
		for (const section of SECTIONS) {
			// A single-audience model renders only its own section (the
			// render-md.ts filter rule): skip a section the chosen audience excludes.
			if (model.audience !== "both" && model.audience !== section.audience) {
				continue;
			}
			const lines = model.movements.filter((m) =>
				inSection(m.audience, section.audience),
			);
			if (lines.length === 0) continue;
			sections.push({
				heading: section.heading,
				lines: lines.map(movementText),
			});
		}
	}
	return {
		title,
		window: `Window: changes since ${sinceDate(model.sinceIso)}.`,
		sections,
		actions: model.actions.map(actionText),
	};
}

/**
 * Render the digest model to markdown (audience-segmented by default; one
 * `## For managers` section with `view = "manager"`).
 */
export function renderDigestMarkdown(
	model: DigestModel,
	view?: DigestView,
): string {
	const doc = digestDocument(model, view);
	if (doc.quiet !== undefined) {
		return `# ${doc.title}\n\n_${doc.quiet}_\n`;
	}
	const blocks: string[] = [`# ${doc.title}`, `_${doc.window ?? ""}_`];
	for (const section of doc.sections) {
		blocks.push(
			[`## ${section.heading}`, "", ...section.lines.map((l) => `- ${l}`)].join(
				"\n",
			),
		);
	}
	if (doc.actions.length > 0) {
		blocks.push(
			["## Actions", "", ...doc.actions.map((a, i) => `${i + 1}. ${a}`)].join(
				"\n",
			),
		);
	}
	return `${blocks.join("\n\n")}\n`;
}
