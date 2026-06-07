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
import type { DigestModel, MovementKind, MovementRow } from "./digest.js";

const TITLE = "# Design-system digest";

/** The two rendered sections, in order, with their heading + section audience. */
const SECTIONS: { heading: string; audience: "designer" | "developer" }[] = [
	{ heading: "## For designers", audience: "designer" },
	{ heading: "## For developers", audience: "developer" },
];

/** Human label per movement kind (the line's leading noun). */
const MOVEMENT_LABEL: Record<MovementKind, string> = {
	drift: "Drift",
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
	"/ds-bridge:token-check": "review breaking token drift",
	"/ds-bridge:ds-lint --fix": "clear off-system lint violations",
	"/ds-bridge:handoff-qa": "readiness is below the gate",
	"/ds-bridge:a11y-check": "failing contrast pairs need a look",
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

/** Render one movement row: `- Label ▲ <base> → <current>` (or "— new <current>"). */
function renderMovement(row: MovementRow): string {
	const label = MOVEMENT_LABEL[row.kind];
	const current = value(row.kind, row.current);
	if (row.isNew) {
		return `- ${label} ${arrow(row)} new ${current}`;
	}
	const baseline = value(row.kind, row.baseline ?? 0);
	return `- ${label} ${arrow(row)} ${baseline} → ${current}`;
}

/** Render one section's body (heading + movement lines), or undefined when empty. */
function renderSection(
	heading: string,
	sectionAudience: "designer" | "developer",
	movements: MovementRow[],
): string | undefined {
	const lines = movements.filter((m) => inSection(m.audience, sectionAudience));
	if (lines.length === 0) return undefined;
	return [heading, "", ...lines.map(renderMovement)].join("\n");
}

/** Render one action: `N. Run \`<command>\` — <reason>`. */
function renderAction(command: string, index: number): string {
	const reason = ACTION_REASON[command] ?? "see the docs";
	return `${index + 1}. Run \`${command}\` — ${reason}`;
}

/**
 * Render the digest model to audience-segmented markdown. The model is assumed
 * already audience-filtered by the engine; this renderer only splits the rows it
 * is given into the relevant section(s).
 */
export function renderDigestMarkdown(model: DigestModel): string {
	if (model.kind === "quiet") {
		return `${TITLE}\n\n_Quiet week — no design-system movement since ${model.sinceIso}._\n`;
	}

	const blocks: string[] = [
		TITLE,
		`_Window: changes since ${model.sinceIso}._`,
	];

	for (const section of SECTIONS) {
		// A single-audience model renders only its own section (the render-md.ts
		// filter rule): skip a section the chosen audience excludes.
		if (model.audience !== "both" && model.audience !== section.audience) {
			continue;
		}
		const block = renderSection(
			section.heading,
			section.audience,
			model.movements,
		);
		if (block !== undefined) blocks.push(block);
	}

	if (model.actions.length > 0) {
		const actionLines = model.actions.map((a, i) => renderAction(a.command, i));
		blocks.push(["## Actions", "", ...actionLines].join("\n"));
	}

	return `${blocks.join("\n\n")}\n`;
}
