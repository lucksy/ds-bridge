#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);
import {
  resolveAliasDir
} from "./chunk-L55B4Z4L.mjs";
import "./chunk-ZZB7XIWQ.mjs";
import "./chunk-VL4BT7E7.mjs";

// src/io/component-paths.ts
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
function shadcnUiAlias(root) {
  const file = join(root, "components.json");
  if (!existsSync(file)) return void 0;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const { ui, components } = parsed.aliases ?? {};
    if (typeof ui === "string" && ui !== "") return ui;
    if (typeof components === "string" && components !== "") {
      return `${components}/ui`;
    }
  } catch {
  }
  return void 0;
}
function resolveComponentPaths(root, configured) {
  if (configured !== void 0 && configured.length > 0) {
    return { paths: configured, source: "component_paths" };
  }
  const alias = shadcnUiAlias(root);
  if (alias === void 0) return void 0;
  const dir = resolveAliasDir(root, alias);
  if (dir === void 0 || !isDirectory(join(root, dir))) return void 0;
  return { paths: [dir], source: "components.json" };
}
export {
  resolveComponentPaths
};
