// M11.2 — guard the GitHub Pages publishing workflow. The renderer is
// path-agnostic + self-contained, so publishing reuses only the CI primitives
// (setup-node, upload-pages-artifact, deploy-pages). This test pins the
// load-bearing fields so a future edit can't silently break the deploy.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const workflowPath = join(
	repoRoot,
	".github",
	"workflows",
	"dashboard-pages.yml",
);

describe(".github/workflows/dashboard-pages.yml (M11.2)", () => {
	it("declares the Pages OIDC permissions + single-flight concurrency", async () => {
		const yml = await readFile(workflowPath, "utf8");
		expect(yml).toContain("pages: write");
		expect(yml).toContain("id-token: write");
		expect(yml).toContain("contents: read");
		expect(yml).toContain("group: pages");
	});

	it("renders the site then uploads + deploys it", async () => {
		const yml = await readFile(workflowPath, "utf8");
		expect(yml).toContain("report . --format site --out site/");
		expect(yml).toContain("actions/upload-pages-artifact@v3");
		expect(yml).toContain("actions/deploy-pages@v4");
		// The artifact path is the rendered site directory.
		expect(yml).toContain("path: site");
	});

	it("documents the per-repo Pages URL", async () => {
		const yml = await readFile(workflowPath, "utf8");
		expect(yml).toContain("github.io");
	});
});
