// Dashboard timeline — the header control that switches the dashboard between
// its current state and earlier days. Script-free: one hidden radio per state
// sits before the header and the state bodies, the timeline's <label>s select a
// radio, and generated `:checked ~` rules show that state's body and "as of"
// text. Keyboard: Tab to the group, arrow keys move between days. PURE.
import { escapeHtml } from "./dashboard.js";

/** One state on the timeline, oldest first; the last one is "Now". */
export interface TimelineStop {
	/** Radio id, e.g. `tl-3` / `tl-now`. */
	id: string;
	/** Short label under the dot, e.g. "3 Oct" / "Now". */
	label: string;
	/** Full label for the tooltip and the radio's accessible name. */
	title: string;
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/** "2026-10-03" → { short: "3 Oct", long: "3 Oct 2026" }; other text passes through. */
export function dayLabels(day: string): { short: string; long: string } {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	const month = match !== null ? MONTHS[Number(match[2]) - 1] : undefined;
	if (match === null || month === undefined) return { short: day, long: day };
	const date = Number(match[3]);
	return { short: `${date} ${month}`, long: `${date} ${month} ${match[1]}` };
}

/** The hidden radios, placed before the header (the `~` rules need that). */
export function timelineRadios(stops: readonly TimelineStop[]): string {
	const last = stops.length - 1;
	return stops
		.map(
			(stop, i) =>
				`<input type="radio" name="tl" class="tl-radio" id="${stop.id}"${i === last ? " checked" : ""} />`,
		)
		.join("");
}

/** The header timeline: one labelled dot per state, oldest → Now. */
export function timelineNav(stops: readonly TimelineStop[]): string {
	const items = stops
		.map(
			(stop) =>
				`<li><label for="${stop.id}" title="${escapeHtml(stop.title)}"><span class="dot"></span><span class="tl-label">${escapeHtml(stop.label)}</span><span class="sr">${escapeHtml(stop.title)}</span></label></li>`,
		)
		.join("");
	return `<nav class="timeline" aria-label="Dashboard history"><ol>${items}</ol></nav>`;
}

/**
 * The per-state rules: show the checked state's body (`.tl-sN`) and "as of"
 * text (`.tl-gN`), mark its dot, and hide the "Generated" line for past states.
 */
export function timelineStyle(stops: readonly TimelineStop[]): string {
	const rules = stops.map(
		(stop, i) =>
			`#${stop.id}:checked ~ .tl-s${i}{display:block}` +
			`#${stop.id}:checked ~ header .tl-g${i}{display:inline}` +
			`#${stop.id}:checked ~ header label[for="${stop.id}"]{color:var(--bar-text)}` +
			`#${stop.id}:checked ~ header label[for="${stop.id}"] .dot{background:var(--bar-accent);border-color:var(--bar-accent);transform:scale(1.3)}` +
			`#${stop.id}:focus-visible ~ header label[for="${stop.id}"]{outline:2px solid var(--bar-accent);outline-offset:2px}`,
	);
	const past = stops
		.slice(0, -1)
		.map((stop) => `#${stop.id}:checked ~ header .generated`);
	if (past.length > 0) rules.push(`${past.join(",")}{display:none}`);
	return rules.join("\n");
}

/**
 * The dashboard header: logo + title far left, the timeline column in the
 * middle, view + Generated far right. Dashboard page only.
 */
export const HEADER_STYLE = `
header.dash .bar.top {
	display: grid;
	/* Equal side columns keep the timeline centred and still while the right
	   side's text changes with the selected state. */
	grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
	align-items: center;
	gap: 10px 24px;
	/* Full window width: the logo sits at the far left, Generated at the far
	   right, whatever the content column's width. */
	max-width: none;
	padding: 14px 24px;
}
header.dash .brand { display: flex; align-items: center; gap: 10px; min-width: 0; justify-self: start; }
header.dash .brand .logo { flex: none; border-radius: 7px; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16); }
header.dash .brand h1 { flex: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
header.dash .bar-meta { display: flex; align-items: center; gap: 12px; justify-self: end; white-space: nowrap; }
@media (max-width: 780px) {
	header.dash .bar.top { grid-template-columns: minmax(0, 1fr); gap: 8px; }
	header.dash .brand h1 { flex: 0 1 auto; min-width: 0; font-size: 18px; }
	header.dash .bar-meta { justify-self: start; flex-wrap: wrap; white-space: normal; }
}
`;

/** The timeline control and state switching; only on a page with a timeline. */
export const TIMELINE_STYLE = `
header.dash .tl-asof { display: none; color: var(--bar-accent); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
/* A fixed-width strip that scrolls when the stops overflow:
   - rtl scroll container, so it opens scrolled to the newest end ("Now");
     the list itself reads left-to-right;
   - both ends fade to transparent (mask). The list is padded by the fade
     width, so a stop scrolled fully to either end is never faded — only
     stops that continue off-strip are. */
.timeline {
	--tl-fade: 32px;
	justify-self: center;
	width: max-content;
	max-width: min(560px, 100%);
	min-width: 0;
	overflow-x: auto;
	overscroll-behavior-x: contain;
	scrollbar-width: none;
	direction: rtl;
	-webkit-mask-image: linear-gradient(to right, transparent, #000 var(--tl-fade), #000 calc(100% - var(--tl-fade)), transparent);
	mask-image: linear-gradient(to right, transparent, #000 var(--tl-fade), #000 calc(100% - var(--tl-fade)), transparent);
}
.timeline::-webkit-scrollbar { display: none; }
.timeline ol {
	list-style: none;
	margin: 0;
	padding: 0 var(--tl-fade);
	display: flex;
	position: relative;
	direction: ltr;
	width: max-content;
}
.timeline ol::before {
	content: "";
	position: absolute;
	left: calc(var(--tl-fade) + 24px);
	right: calc(var(--tl-fade) + 24px);
	top: 10px;
	height: 2px;
	background: rgba(255, 255, 255, 0.16);
}
.timeline label {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 5px;
	min-width: 48px;
	padding: 2px 4px;
	border-radius: 6px;
	cursor: pointer;
	color: var(--bar-subtle);
	font-size: 11px;
	font-weight: 600;
	line-height: 1.2;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}
.timeline label:hover { color: var(--bar-text); }
.timeline .dot {
	width: 12px;
	height: 12px;
	margin-top: 3px;
	border-radius: 50%;
	background: var(--bar);
	border: 2px solid var(--bar-subtle);
	transition: transform 120ms ease;
}
.timeline label:hover .dot { border-color: var(--bar-text); }
.tl-radio { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tl-state { display: none; }
.tl-note {
	margin: 0 0 16px;
	padding: 10px 14px;
	border-radius: 10px;
	background: var(--accent-soft);
	color: var(--text);
	font-size: 13px;
}
@media (max-width: 780px) {
	.timeline { justify-self: stretch; max-width: 100%; }
	.timeline ol { margin: 0 auto; }
}
@media (prefers-reduced-motion: reduce) { .timeline .dot { transition: none; } }
`;
