#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);
import {
  readPathAliases
} from "./chunk-L55B4Z4L.mjs";
import {
  require_ts_morph
} from "./chunk-ZZB7XIWQ.mjs";
import {
  __toESM
} from "./chunk-VL4BT7E7.mjs";

// src/engines/impact/usage.ts
var import_ts_morph = __toESM(require_ts_morph(), 1);
import { isAbsolute, relative, resolve, sep } from "path";
function normalizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function toForwardSlashes(path) {
  return sep === "/" ? path : path.split(sep).join("/");
}
function resolveFigmaName(registry, figmaName) {
  const normalized = normalizeName(figmaName);
  for (const match of registry.matches) {
    if (match.figmaName === figmaName) return { kind: "matched", match };
  }
  if (normalized.length > 0) {
    for (const match of registry.matches) {
      if (normalizeName(match.figmaName) === normalized) {
        return { kind: "matched", match };
      }
    }
  }
  for (const entry of registry.unmatchedFigma) {
    if (entry.name === figmaName) return { kind: "unmatched" };
  }
  if (normalized.length > 0) {
    for (const entry of registry.unmatchedFigma) {
      if (normalizeName(entry.name) === normalized)
        return { kind: "unmatched" };
    }
  }
  return { kind: "not-in-registry" };
}
function buildProject(root) {
  const project = new import_ts_morph.Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      jsx: 4,
      allowJs: true,
      strict: true,
      noEmit: true,
      ...readPathAliases(root)
    }
  });
  try {
    project.addSourceFilesAtPaths([
      toForwardSlashes(`${root}/**/*.{ts,tsx}`),
      `!${toForwardSlashes(`${root}/**/*.d.ts`)}`,
      `!${toForwardSlashes(`${root}/**/node_modules/**`)}`
    ]);
  } catch {
  }
  return project;
}
function resolveImportTarget(importLine) {
  let target;
  try {
    target = importLine.getModuleSpecifierSourceFile();
  } catch {
    return void 0;
  }
  return target?.getFilePath();
}
function declaredIn(named, root, targetImportPath) {
  try {
    const symbol = named.getNameNode().getSymbol();
    const resolved = symbol?.getAliasedSymbol() ?? symbol;
    for (const decl of resolved?.getDeclarations() ?? []) {
      const file = decl.getSourceFile().getFilePath();
      if (toForwardSlashes(relative(root, file)) === targetImportPath) {
        return true;
      }
    }
  } catch {
  }
  return false;
}
function isPackageSpecifier(importPath) {
  return !/\.(?:tsx?|jsx?|mjs|cjs)$/.test(importPath) && !importPath.startsWith(".");
}
function scanUsages(project, root, codeName, targetImportPath) {
  const sites = [];
  const fromPackage = isPackageSpecifier(targetImportPath);
  for (const sourceFile of project.getSourceFiles()) {
    const absPath = sourceFile.getFilePath();
    const relPath = isAbsolute(absPath) ? relative(root, absPath) : absPath;
    const file = toForwardSlashes(relPath);
    let imports;
    try {
      imports = sourceFile.getImportDeclarations();
    } catch {
      continue;
    }
    for (const importDecl of imports) {
      if (fromPackage) {
        const specifier = importDecl.getModuleSpecifierValue();
        if (specifier !== targetImportPath) continue;
        const named = importDecl.getNamedImports().find((n) => n.getName() === codeName);
        if (named === void 0) continue;
        sites.push({
          file,
          line: importDecl.getStartLineNumber(),
          importName: named.getAliasNode()?.getText() ?? codeName
        });
        continue;
      }
      const resolvedTarget = resolveImportTarget(importDecl);
      if (resolvedTarget === void 0) continue;
      const resolvedRel = toForwardSlashes(relative(root, resolvedTarget));
      const direct = resolvedRel === targetImportPath;
      let importName;
      for (const named of importDecl.getNamedImports()) {
        const alias = named.getAliasNode()?.getText();
        const local = alias ?? named.getName();
        if (local !== codeName && named.getName() !== codeName) continue;
        if (!direct && !declaredIn(named, root, targetImportPath)) continue;
        importName = local;
        break;
      }
      if (!direct && importName === void 0) continue;
      if (importName === void 0) {
        const def = importDecl.getDefaultImport()?.getText();
        if (def === codeName) importName = def;
      }
      if (importName === void 0) continue;
      sites.push({
        file,
        line: importDecl.getStartLineNumber(),
        importName
      });
    }
  }
  sites.sort(
    (a, b) => a.file !== b.file ? a.file < b.file ? -1 : 1 : a.line - b.line
  );
  return sites;
}
function mapUsage(input) {
  const { registry, changedFigmaNames, projectDir } = input;
  const root = resolve(projectDir);
  const seen = /* @__PURE__ */ new Set();
  const names = [];
  for (const name of changedFigmaNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  let project;
  const results = [];
  for (const figmaName of names) {
    const resolution = resolveFigmaName(registry, figmaName);
    if (resolution.kind !== "matched") {
      results.push({
        figmaName,
        resolution: resolution.kind,
        usages: [],
        count: 0
      });
      continue;
    }
    if (project === void 0) project = buildProject(root);
    const usages = scanUsages(
      project,
      root,
      resolution.match.codeName,
      resolution.match.importPath
    );
    results.push({
      figmaName,
      codeName: resolution.match.codeName,
      importPath: resolution.match.importPath,
      resolution: "matched",
      usages,
      count: usages.length
    });
  }
  return results;
}
function mapCodeUsage(input) {
  const { registry, projectDir } = input;
  const root = resolve(projectDir);
  const entries = [
    ...(Array.isArray(registry?.matches) ? registry.matches : []).map((m) => ({
      codeName: m.codeName,
      importPath: m.importPath
    })),
    ...(Array.isArray(registry?.unmatchedCode) ? registry.unmatchedCode : []).map((u) => ({ codeName: u.name, importPath: u.importPath }))
  ];
  if (entries.length === 0) return [];
  const project = buildProject(root);
  return entries.map(({ codeName, importPath }) => {
    const usages = scanUsages(project, root, codeName, importPath);
    return { codeName, importPath, usages, count: usages.length };
  });
}
export {
  mapCodeUsage,
  mapUsage
};
