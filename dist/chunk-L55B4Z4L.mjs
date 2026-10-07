#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);
import {
  require_ts_morph
} from "./chunk-ZZB7XIWQ.mjs";
import {
  __toESM
} from "./chunk-VL4BT7E7.mjs";

// src/io/tsconfig-paths.ts
var import_ts_morph = __toESM(require_ts_morph(), 1);
import { existsSync } from "fs";
import { dirname, relative, resolve, sep } from "path";
function readTsconfig(configPath) {
  const read = import_ts_morph.ts.readConfigFile(configPath, import_ts_morph.ts.sys.readFile);
  if (read.error !== void 0) return void 0;
  const parsed = import_ts_morph.ts.parseJsonConfigFileContent(
    read.config,
    import_ts_morph.ts.sys,
    dirname(configPath),
    void 0,
    configPath
  );
  const references = (parsed.projectReferences ?? []).map(
    (ref) => ref.path.endsWith(".json") ? ref.path : resolve(ref.path, "tsconfig.json")
  );
  return { options: parsed.options, references };
}
function readPathAliases(root) {
  const rootConfig = resolve(root, "tsconfig.json");
  if (!existsSync(rootConfig)) return {};
  const queue = [rootConfig];
  const seen = /* @__PURE__ */ new Set();
  try {
    while (queue.length > 0) {
      const configPath = queue.shift();
      if (seen.has(configPath) || !existsSync(configPath)) continue;
      seen.add(configPath);
      const config = readTsconfig(configPath);
      if (config === void 0) continue;
      const { paths, baseUrl } = config.options;
      if (paths !== void 0) {
        return { paths, baseUrl: baseUrl ?? dirname(configPath) };
      }
      queue.push(...config.references);
    }
  } catch {
  }
  return {};
}
var SOURCE_EXTENSION = /\.(?:tsx|ts|jsx|js|mjs|cjs)$/;
function aliasSpecifier(root, relPath) {
  const { paths, baseUrl } = readPathAliases(root);
  if (paths === void 0 || baseUrl === void 0) return void 0;
  const target = resolve(root, relPath).replace(SOURCE_EXTENSION, "").replace(/[\\/]index$/, "");
  for (const [pattern, mappings] of Object.entries(paths)) {
    for (const mapping of mappings) {
      const base = resolve(baseUrl, mapping);
      if (!pattern.includes("*")) {
        if (base.replace(SOURCE_EXTENSION, "") === target) return pattern;
        continue;
      }
      const [prefix = "", suffix = ""] = base.split("*");
      if (!target.startsWith(prefix) || !target.endsWith(suffix)) continue;
      const middle = target.slice(prefix.length, target.length - suffix.length);
      return pattern.replace("*", middle.split(sep).join("/"));
    }
  }
  return void 0;
}
function resolveAliasDir(root, specifier) {
  const { paths, baseUrl } = readPathAliases(root);
  if (paths === void 0 || baseUrl === void 0) return void 0;
  for (const [pattern, mappings] of Object.entries(paths)) {
    const mapping = mappings[0];
    if (mapping === void 0) continue;
    let target;
    if (pattern.includes("*")) {
      const [prefix = "", suffix = ""] = pattern.split("*");
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
        continue;
      }
      const middle = specifier.slice(
        prefix.length,
        specifier.length - suffix.length
      );
      target = resolve(baseUrl, mapping.replace("*", middle));
    } else if (pattern === specifier) {
      target = resolve(baseUrl, mapping);
    }
    if (target !== void 0) {
      return relative(root, target).split(sep).join("/");
    }
  }
  return void 0;
}

export {
  readPathAliases,
  aliasSpecifier,
  resolveAliasDir
};
