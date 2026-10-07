#!/usr/bin/env node
// Assemble the trimmed plugin payload published to the `release` branch.
//
// Claude Code installs a plugin by copying its whole source, and has no ignore
// file, so installing from `main` shipped src/, tests/ and node_modules/. The
// marketplace instead points at the `release` branch, which holds only what
// runs. This script builds that tree from the current checkout — in CI, a
// release tag, where dist/ is committed (the release contract).
//
// Usage: node scripts/build-release.mjs <out-dir> [--from <checkout>]
//   --from: the tree to package (default: this repository). CI checks out the
//   release tag there and runs this script from main, so tags cut before the
//   script existed can still be published.
//   Exit 0 built · 1 incomplete payload (a runtime path is missing) · 2 usage.
//
// <out-dir> must be absent, empty, or a previous output (it carries
// .ds-bridge-release.json); anything else is refused, never cleared.
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
const fromArg = fromIndex === -1 ? undefined : args[fromIndex + 1];
if (fromIndex !== -1) args.splice(fromIndex, 2);
const root = resolve(
	fromArg ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
);
const MARKER = ".ds-bridge-release.json";

/** Exact files and directory prefixes (tracked files under them) that run. */
const FILES = [
	".claude-plugin/plugin.json",
	".mcp.json",
	"README.md",
	"LICENSE",
	// The insights mod (hooks/insights/text-charts.ts) imports this directly.
	"src/render/terminal/blocks.ts",
];
const DIRS = [
	"commands/",
	"agents/",
	"skills/",
	"hooks/",
	"schemas/",
	"types/",
];
/** Runtime scripts: the hooks and the slash-command adapter. */
const SCRIPT = /^scripts\/(?:hook-[\w-]+|run-cli)\.mjs$/;

function fail(code, message) {
	process.stderr.write(`build-release: ${message}\n`);
	process.exit(code);
}

/** Tracked files (so stray local files never ship); a plain walk outside git. */
function sourceFiles() {
	try {
		return execFileSync("git", ["ls-files", "-z"], {
			cwd: root,
			encoding: "utf8",
		})
			.split("\0")
			.filter((path) => path !== "" && existsSync(join(root, path)));
	} catch {
		const files = [];
		const walk = (dir) => {
			for (const entry of readdirSync(join(root, dir), {
				withFileTypes: true,
			})) {
				if (entry.name === "node_modules" || entry.name === ".git") continue;
				const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
				if (entry.isDirectory()) walk(path);
				else files.push(path);
			}
		};
		walk("");
		return files;
	}
}

function prepareOut(out) {
	if (existsSync(out)) {
		const entries = readdirSync(out);
		if (entries.length > 0 && !entries.includes(MARKER)) {
			fail(
				2,
				`${out} is not empty and is not a previous release build — refusing to clear it.`,
			);
		}
		rmSync(out, { recursive: true, force: true });
	}
	mkdirSync(out, { recursive: true });
}

function copy(path, out) {
	const target = join(out, path);
	mkdirSync(dirname(target), { recursive: true });
	cpSync(join(root, path), target);
}

/** Relative imports in the shipped mod sources that do not resolve in `out`. */
function unresolvedImports(out) {
	const missing = [];
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (![".ts", ".tsx"].includes(extname(entry.name))) continue;
			const text = readFileSync(full, "utf8");
			for (const match of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
				const spec = match[1];
				const base = resolve(dirname(full), spec);
				const stem = base.replace(/\.(?:js|mjs|ts|tsx)$/, "");
				const candidates = [
					base,
					`${stem}.ts`,
					`${stem}.tsx`,
					`${stem}.js`,
					`${stem}.d.ts`,
					join(base, "index.ts"),
					join(base, "index.d.ts"),
				];
				if (!candidates.some((c) => existsSync(c) && statSync(c).isFile())) {
					missing.push(`${relative(out, full)} → ${spec}`);
				}
			}
		}
	};
	walk(join(out, "hooks"));
	return missing;
}

/** `${CLAUDE_PLUGIN_ROOT}/…` paths named by hooks.json and the commands. */
function unresolvedPluginRootPaths(out) {
	const sources = [join(out, "hooks", "hooks.json")];
	for (const name of readdirSync(join(out, "commands"))) {
		sources.push(join(out, "commands", name));
	}
	const missing = [];
	for (const file of sources) {
		const text = readFileSync(file, "utf8");
		for (const match of text.matchAll(
			/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g,
		)) {
			if (!existsSync(join(out, match[1]))) {
				missing.push(`${relative(out, file)} → ${match[1]}`);
			}
		}
	}
	return missing;
}

if (fromIndex !== -1 && (fromArg === undefined || !existsSync(fromArg))) {
	fail(2, "--from needs an existing checkout directory.");
}
const outArg = args[0];
if (outArg === undefined || outArg === "") {
	fail(
		2,
		"usage: node scripts/build-release.mjs <out-dir> [--from <checkout>]",
	);
}
const out = resolve(outArg);
if (out === root || root.startsWith(`${out}/`)) {
	fail(2, "the output directory cannot contain the repository.");
}
if (!existsSync(join(root, "dist", "cli.mjs"))) {
	fail(
		1,
		"dist/cli.mjs is missing — run `npm run build` (release tags commit dist/).",
	);
}

prepareOut(out);

for (const path of sourceFiles()) {
	if (
		FILES.includes(path) ||
		DIRS.some((d) => path.startsWith(d)) ||
		SCRIPT.test(path)
	) {
		copy(path, out);
	}
}
// dist/ is copied as built: chunk names change per build, so the working tree
// (not the index) is the truth for it.
cpSync(join(root, "dist"), join(out, "dist"), { recursive: true });

// The CLI and the history writer read package.json for the tool version; ship
// a trimmed one — no dependency lists, nothing is installed from it.
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const runtimePkg = {};
for (const key of [
	"name",
	"version",
	"description",
	"type",
	"private",
	"license",
	"engines",
]) {
	if (pkg[key] !== undefined) runtimePkg[key] = pkg[key];
}
writeFileSync(
	join(out, "package.json"),
	`${JSON.stringify(runtimePkg, null, "\t")}\n`,
);

const missingFiles = FILES.filter((path) => !existsSync(join(out, path)));
const missing = [
	...missingFiles.map((path) => `required file ${path}`),
	...unresolvedImports(out),
	...unresolvedPluginRootPaths(out),
];
if (missing.length > 0) {
	fail(1, `incomplete payload:\n  ${missing.join("\n  ")}`);
}

const manifest = JSON.parse(
	readFileSync(join(out, ".claude-plugin", "plugin.json"), "utf8"),
);
let commit = "unknown";
try {
	commit = execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).trim();
} catch {
	// Not a git checkout: provenance stays "unknown".
}
writeFileSync(
	join(out, MARKER),
	`${JSON.stringify({ version: manifest.version, sourceCommit: commit }, null, "\t")}\n`,
);
process.stdout.write(
	`Built ds-bridge ${manifest.version} release payload in ${out}\n`,
);
