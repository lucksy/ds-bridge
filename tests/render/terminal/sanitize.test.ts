// Terminal output safety: untrusted names (Figma, rollup.json, git stderr)
// must not carry escape sequences to the user's terminal; our own SGR colour
// survives.
import { describe, expect, it } from "vitest";
import { ALL_ARTIFACT_IDS } from "../../../src/engines/report/catalog.js";
import type { ReportData } from "../../../src/engines/report/types.js";
import { buildRollup } from "../../../src/engines/rollup/rollup.js";
import { renderTerminalDashboard } from "../../../src/render/terminal/dashboard.js";
import { renderRollupTerm } from "../../../src/render/terminal/rollup.js";
import {
	terminalCell,
	terminalSafe,
} from "../../../src/render/terminal/sanitize.js";
import { renderTable } from "../../../src/render/terminal/table.js";
import { FULL_REPORT_DATA } from "../../fixtures/report/full-report-data.js";

const ESC = "\u001b";
const OSC52 = `${ESC}]52;c;ZXZpbA==\u0007`; // clipboard write
const TITLE = `${ESC}]0;pwned\u0007`; // window title
const CURSOR = `${ESC}[2A${ESC}[2K`; // up two lines, erase line
// Any C0/C1 control except \n, and any ESC that does not start an SGR `ESC[…m`.
const CONTROL_LEFT =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: detecting control characters is the point.
	/[\u0000-\u0009\u000b-\u001a\u001c-\u001f\u007f-\u009f]|\u001b(?!\[[0-9;]*m)/;
const hasControl = (s: string) => CONTROL_LEFT.test(s);

describe("terminalSafe / terminalCell", () => {
	it("drops OSC, CSI cursor moves, CR and BEL; keeps SGR colour and newlines", () => {
		const red = `${ESC}[31mred${ESC}[39m`;
		const out = terminalSafe(`a${OSC52}b${TITLE}c${CURSOR}d\re\n${red}`);
		expect(out).toBe(`a]52;c;ZXZpbA==b]0;pwnedc[2A[2Kde\n${red}`);
		expect(hasControl(out)).toBe(false);
	});

	it("a cell is one line", () => {
		expect(terminalCell("two\nlines\tand tab")).toBe("two lines and tab");
		expect(terminalCell(`x${TITLE}y`)).toBe("x]0;pwnedy");
	});
});

describe("terminal renderers neutralise hostile names", () => {
	it("renderTable cleans every cell and header", () => {
		const out = renderTable([`name${CURSOR}`], [[`Button${OSC52}`], ["a\nb"]], {
			color: false,
		});
		expect(hasControl(out)).toBe(false);
		expect(out).toContain("a b");
	});

	it("the rollup view cleans repo names and notes", () => {
		const model = buildRollup(
			[
				{
					name: `web${TITLE}`,
					source: "/r/web",
					load: { kind: "missing", message: `gone${CURSOR}\nsecond line` },
				},
			],
			{ nowIso: "2026-10-05T12:00:00.000Z" },
		);
		const out = renderRollupTerm(model);
		expect(hasControl(out)).toBe(false);
		expect(out).toContain("web]0;pwned");
	});

	it("the dashboard cleans every string that reaches it (all sections)", () => {
		// Append escape sequences to every free-text string in the full fixture
		// (component/frame/repo names, debt subjects, recommendations…).
		// Free-text fields only (enums like `level` must stay valid).
		const FREE_TEXT =
			/name|subject|recommendation|label|owner|component|project|requirement|path|file|dir|title|frame/i;
		const poison = (value: unknown, key = ""): unknown => {
			if (typeof value === "string") {
				return FREE_TEXT.test(key) ? `${value}${OSC52}${CURSOR}` : value;
			}
			if (Array.isArray(value)) return value.map((v) => poison(v, key));
			if (value !== null && typeof value === "object") {
				return Object.fromEntries(
					Object.entries(value).map(([k, v]) => [k, poison(v, k)]),
				);
			}
			return value;
		};
		const data = poison(FULL_REPORT_DATA) as ReportData;
		for (const color of [false, true]) {
			const out = renderTerminalDashboard(data, ALL_ARTIFACT_IDS, {
				generatedAt: FULL_REPORT_DATA.generatedAt,
				color,
			});
			expect(out).toContain("]52;c;ZXZpbA=="); // the names still render
			expect(hasControl(out)).toBe(false);
		}
	});
});
