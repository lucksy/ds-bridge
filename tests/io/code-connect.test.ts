// Code Connect as ground truth for the registry (real-user finding, Figma's
// Simple Design System): a project that already declares which code component
// implements which Figma component must not be second-guessed by name.
// Covers the three on-disk forms — classic `figma.connect(Comp, url)`, the
// template form (`// url=…` / `// component=…` headers) and batch JSON — and
// `documentUrlSubstitutions` from figma.config.json.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readCodeConnectPins } from "../../src/io/code-connect.js";

describe("readCodeConnectPins", () => {
	it("reads every Code Connect form, substituting document URLs", () => {
		const dir = mkdtempSync(join(tmpdir(), "code-connect-"));
		writeFileSync(
			join(dir, "figma.config.json"),
			JSON.stringify({
				codeConnect: {
					documentUrlSubstitutions: {
						"<FIGMA_BUTTONS_ICON_BUTTON>":
							"https://figma.com/design/KEY?node-id=11-11508",
						"<FIGMA_ICONS_BASE>": "https://figma.com/design/KEY",
					},
				},
			}),
		);
		mkdirSync(join(dir, "src", "figma"), { recursive: true });
		mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
		writeFileSync(
			join(dir, "src", "figma", "IconButton.figma.ts"),
			"// url=<FIGMA_BUTTONS_ICON_BUTTON>\n// component=IconButton\nimport figma from 'figma';\n",
		);
		writeFileSync(
			join(dir, "src", "figma", "Button.figma.tsx"),
			`import figma from "@figma/code-connect";\nfigma.connect(Button, "https://www.figma.com/design/KEY/X?node-id=4185-3778", {});\nfigma.connect(UI.Card, 'https://figma.com/file/KEY?node-id=2142:11380');\n`,
		);
		writeFileSync(
			join(dir, "src", "figma", "Icons.figma.batch.json"),
			JSON.stringify({
				components: [
					{
						url: "<FIGMA_ICONS_BASE>?node-id=68:15551",
						component: "IconActivity",
					},
				],
			}),
		);
		writeFileSync(
			join(dir, "node_modules", "x", "Nope.figma.ts"),
			"figma.connect(Nope, 'https://figma.com/design/K?node-id=1-1')",
		);
		expect(readCodeConnectPins(dir)).toEqual([
			{ codeName: "Button", nodeId: "4185:3778" },
			{ codeName: "Card", nodeId: "2142:11380" },
			{ codeName: "IconActivity", nodeId: "68:15551" },
			{ codeName: "IconButton", nodeId: "11:11508" },
		]);
	});

	it("takes a template's rendered root element over its header metadata", () => {
		// SDS: ButtonDanger.figma.ts says `component=Button` / `id: "Button"`,
		// but renders <ButtonDanger>; DialogBody.figma.ts renders <Dialog>.
		const dir = mkdtempSync(join(tmpdir(), "code-connect-"));
		writeFileSync(
			join(dir, "ButtonDanger.figma.ts"),
			[
				"// url=https://figma.com/design/K?node-id=185-852",
				"// component=Button",
				"export default {",
				'  id: "Button",',
				"  imports: ['import { ButtonDanger } from \"primitives\";'],",
				'  example: figma.code`<ButtonDanger variant="x">Hi</ButtonDanger>`,',
				"};",
			].join("\n"),
		);
		expect(readCodeConnectPins(dir)).toEqual([
			{ codeName: "ButtonDanger", nodeId: "185:852" },
		]);
	});

	it("is empty for a project without Code Connect", () => {
		expect(readCodeConnectPins(mkdtempSync(join(tmpdir(), "no-cc-")))).toEqual(
			[],
		);
	});
});
