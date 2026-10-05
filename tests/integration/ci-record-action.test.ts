// H8 — guard the CI recorder (SPEC-history-v2 §4, PLAN §6.2/§6.3): the composite
// action and the sample workflow pin the load-bearing pieces so an edit can't
// silently start pushing to the default branch or posting unasked PR comments.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const actionPath = join(
	repoRoot,
	".github",
	"actions",
	"ds-bridge-record",
	"action.yml",
);
const examplePath = join(repoRoot, "examples", "ds-bridge-record.yml");
const docPath = join(repoRoot, "docs", "ci-recording.md");

describe(".github/actions/ds-bridge-record/action.yml (H8)", () => {
	it("is a composite action with the documented inputs and safe defaults", async () => {
		const yml = await readFile(actionPath, "utf8");
		expect(yml).toContain("using: composite");
		for (const input of [
			"path:",
			"data-branch:",
			"mode:",
			"figma:",
			"pr-comment:",
			"gate:",
			"cli:",
			"github-token:",
		]) {
			expect(yml).toContain(input);
		}
		expect(yml).toMatch(/data-branch:[\s\S]*?default: ds-bridge-data/);
		// PR comments are opt-in (PLAN §6.3).
		expect(yml).toMatch(/pr-comment:[\s\S]*?default: "false"/);
	});

	it("seeds from the data branch, records with --source ci, publishes via the script", async () => {
		const yml = await readFile(actionPath, "utf8");
		expect(yml).toContain('ci-data-branch.mjs" seed');
		expect(yml).toContain("record");
		expect(yml).toContain("--source ci");
		expect(yml).toContain('ci-data-branch.mjs" publish');
		expect(yml).toContain("--default-branch");
		// Publishing only happens in record mode (push), never on pull_request.
		expect(yml).toMatch(/if: steps\.ctx\.outputs\.mode == 'record'/);
	});

	it("never pushes to the default branch itself", async () => {
		const yml = await readFile(actionPath, "utf8");
		expect(yml).not.toMatch(/git push/);
		expect(yml).not.toMatch(/push origin (main|master)/);
	});

	it("comments the scorecard delta against the data branch, once (marker-updated)", async () => {
		const yml = await readFile(actionPath, "utf8");
		expect(yml).toContain("--format md");
		expect(yml).toContain('--delta "origin/$DATA_BRANCH"');
		// The comment itself (marker, own-account only) lives in the script.
		expect(yml).toContain('ci-pr-comment.mjs" --repo "$REPO" --pr "$PR"');
		expect(yml).toMatch(/inputs\.pr-comment == 'true'/);
	});
});

describe("examples/ds-bridge-record.yml (H8)", () => {
	it("runs on push to the default branch and on pull requests with node 22", async () => {
		const yml = await readFile(examplePath, "utf8");
		expect(yml).toMatch(/push:\s*\n\s*branches: \[main\]/);
		expect(yml).toContain("pull_request:");
		expect(yml).toContain("node-version: 22");
		expect(yml).toContain("contents: write");
		expect(yml).toContain("ds-bridge-record");
		expect(yml).toContain("cancel-in-progress: false");
	});
});

describe("docs/ci-recording.md (H8)", () => {
	it("documents the data branch, the merge=union line and the opt-in comment", async () => {
		const md = await readFile(docPath, "utf8");
		expect(md).toContain("ds-bridge-data");
		expect(md).toContain(".ds-bridge/history.jsonl merge=union");
		expect(md).toContain("pr-comment");
		expect(md).toContain("ds-bridge record");
	});
});

// ---------- F8 — scheduled runs: figma auto, top-N, site + manager digest ----------

describe("action.yml — scheduled runs (F8)", () => {
	it("declares the scheduled-run inputs with safe defaults", async () => {
		const yml = await readFile(actionPath, "utf8");
		for (const input of [
			"library-top:",
			"site-dir:",
			"digest:",
			"digest-since:",
		]) {
			expect(yml).toContain(input);
		}
		// The digest stays opt-in; the window defaults to a month.
		expect(yml).toMatch(/\n {2}digest:[\s\S]*?default: "false"/);
		expect(yml).toMatch(/digest-since:[\s\S]*?default: 30d/);
		expect(yml).toMatch(/library-top:[\s\S]*?default: "10"/);
		// figma keeps its opt-in default but documents "auto".
		expect(yml).toMatch(/figma:[\s\S]*?auto[\s\S]*?default: "false"/);
	});

	it("figma: auto runs the Figma checks only when FIGMA_TOKEN is set", async () => {
		const yml = await readFile(actionPath, "utf8");
		expect(yml).toContain('"$FIGMA" = "auto"');
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal bash parameter expansion in the action YAML
		expect(yml).toContain('-n "${FIGMA_TOKEN:-}"');
		expect(yml).toContain('--library-top "$LIBRARY_TOP"');
	});

	it("adds a site mode that renders without recording or publishing", async () => {
		const yml = await readFile(actionPath, "utf8");
		expect(yml).toMatch(/record \| check \| site/);
		expect(yml).toContain('node "$root/scripts/ci-mode.mjs"');
		// The record step is skipped in site mode; publishing stays record-only.
		expect(yml).toMatch(/if: steps\.ctx\.outputs\.mode != 'site'/);
		expect(yml).toMatch(
			/Publish history[\s\S]*?if: steps\.ctx\.outputs\.mode == 'record'/,
		);
	});

	it("renders the dashboard site and the manager digest into site-dir", async () => {
		const yml = await readFile(actionPath, "utf8");
		expect(yml).toContain('--format site --out "$SITE_DIR"');
		expect(yml).toContain(
			'digest "$PROJECT" --audience manager --since "$DIGEST_SINCE" --format html --out "$SITE_DIR/digest.html"',
		);
		expect(yml).toContain('--out "$SITE_DIR/digest.md"');
		expect(yml).toMatch(/inputs\.site-dir != ''/);
		// Pages deployment needs workflow permissions — never done by the action.
		expect(yml).not.toContain("deploy-pages");
	});
});

describe("examples/ds-bridge-record.yml — schedule (F8)", () => {
	it("adds weekly + monthly crons and a manual trigger", async () => {
		const yml = await readFile(examplePath, "utf8");
		expect(yml).toContain("schedule:");
		expect(yml).toContain('- cron: "0 6 * * 1"');
		expect(yml).toContain('- cron: "0 7 1 * *"');
		expect(yml).toContain("workflow_dispatch:");
		// Figma checks on scheduled/manual runs only, when the secret exists.
		expect(yml).toMatch(
			/figma: \$\{\{ \(github\.event_name == 'schedule'[^\n]*'auto' \|\| 'false' \}\}/,
		);
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression in the workflow YAML
		expect(yml).toContain("FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}");
	});

	it("deploys the site + monthly manager digest from a separate least-privilege pages job", async () => {
		const yml = await readFile(examplePath, "utf8");
		expect(yml).toMatch(/\n {2}pages:/);
		expect(yml).toContain("needs: record");
		expect(yml).toContain("mode: site");
		expect(yml).toContain('digest: "true"');
		expect(yml).toContain("site-dir: site");
		expect(yml).toContain("github.event.schedule == '0 7 1 * *'");
		expect(yml).toContain("pages: write");
		expect(yml).toContain("id-token: write");
		expect(yml).toContain("actions/upload-pages-artifact@v3");
		expect(yml).toContain("actions/deploy-pages@v4");
	});
});

describe("docs/ci-recording.md — schedule (F8)", () => {
	it("documents the schedule, figma auto, the top-N and the digest page", async () => {
		const md = await readFile(docPath, "utf8");
		expect(md).toContain("schedule");
		expect(md).toContain('figma: "auto"');
		expect(md).toContain("FIGMA_TOKEN");
		expect(md).toContain("library-top");
		expect(md).toContain("digest --audience manager");
		expect(md).toContain("digest.html");
		expect(md).toContain("site-dir");
	});
});

// ---------- H15 — the sample workflow pins the release that ships the action ----------

describe("examples/ds-bridge-record.yml — release pin (H15)", () => {
	it("pins every ds-bridge-record use to @v<package.json version>", async () => {
		const yml = await readFile(examplePath, "utf8");
		const pkg = JSON.parse(
			await readFile(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };
		const pins = [
			...yml.matchAll(
				/lucksy\/ds-bridge\/\.github\/actions\/ds-bridge-record@(\S+)/g,
			),
		].map((m) => m[1]);
		expect(pins.length).toBeGreaterThan(0);
		for (const pin of pins) expect(pin).toBe(`v${pkg.version}`);
	});

	it("keeps package.json and .claude-plugin/plugin.json on the same version", async () => {
		const pkg = JSON.parse(
			await readFile(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };
		const plugin = JSON.parse(
			await readFile(join(repoRoot, ".claude-plugin", "plugin.json"), "utf8"),
		) as { version: string };
		expect(plugin.version).toBe(pkg.version);
	});

	it("is a release that ships the action (>= 1.12.0; v1.11.0 predates it)", async () => {
		const pkg = JSON.parse(
			await readFile(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };
		const [major = 0, minor = 0] = pkg.version.split(".").map(Number);
		expect(major * 1000 + minor).toBeGreaterThanOrEqual(1012);
	});
});
