#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);
import {
  require_ts_morph
} from "./chunk-ZZB7XIWQ.mjs";
import {
  __toESM
} from "./chunk-VL4BT7E7.mjs";

// src/engines/registry/scan-code.ts
var import_ts_morph = __toESM(require_ts_morph(), 1);
import { isAbsolute, relative, resolve, sep } from "path";
function toForwardSlashes(path) {
  return sep === "/" ? path : path.split(sep).join("/");
}
function resolvePropsType(decl) {
  let type;
  try {
    type = decl.getType();
  } catch {
    return void 0;
  }
  const signatures = type.getCallSignatures();
  if (signatures.length === 0) return void 0;
  const signature = signatures[signatures.length - 1];
  if (signature === void 0) return void 0;
  const params = signature.getParameters();
  const first = params[0];
  if (first === void 0) return void 0;
  try {
    return first.getTypeAtLocation(decl);
  } catch {
    return void 0;
  }
}
function looksLikeComponent(decl) {
  let type;
  try {
    type = decl.getType();
  } catch {
    return false;
  }
  return type.getCallSignatures().length > 0;
}
function renderPropType(propType, declNode, optional) {
  if (propType.isUnknown()) return "unknown";
  const base = optional ? propType.getNonNullableType() : propType;
  try {
    return base.getText(declNode);
  } catch {
    return base.getText();
  }
}
function stringLiteralVariants(propType) {
  const base = propType.getNonNullableType();
  if (base.isBoolean()) return void 0;
  if (!base.isUnion()) return void 0;
  const members = base.getUnionTypes();
  const values = [];
  for (const member of members) {
    if (!member.isStringLiteral()) return void 0;
    const literal = member.getLiteralValue();
    if (typeof literal !== "string") return void 0;
    values.push(literal);
  }
  return values.length > 0 ? values : void 0;
}
function readComponent(name, importPath, decl) {
  const props = [];
  const variants = {};
  const propsType = resolvePropsType(decl);
  if (propsType !== void 0) {
    for (const symbol of propsType.getProperties()) {
      const propDecl = symbol.getValueDeclaration() ?? symbol.getDeclarations()[0] ?? decl;
      let propType;
      try {
        propType = symbol.getTypeAtLocation(propDecl);
      } catch {
        continue;
      }
      const required = !symbol.isOptional();
      props.push({
        name: symbol.getName(),
        type: renderPropType(propType, propDecl, !required),
        required
      });
      const literals = stringLiteralVariants(propType);
      if (literals !== void 0) variants[symbol.getName()] = literals;
    }
  }
  return { name, importPath, props, variants };
}
function scanCodeComponents(rootDir, options) {
  const root = resolve(rootDir);
  let project;
  try {
    project = options?.tsconfigPath !== void 0 ? new import_ts_morph.Project({
      tsConfigFilePath: options.tsconfigPath,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { jsx: 4, allowJs: true, noEmit: true }
    }) : new import_ts_morph.Project({
      skipAddingFilesFromTsConfig: true,
      // jsx: 4 === Preserve; enables .tsx parsing without a real React dep.
      compilerOptions: {
        jsx: 4,
        allowJs: true,
        strict: true,
        noEmit: true
      }
    });
  } catch {
    return [];
  }
  try {
    project.addSourceFilesAtPaths([
      toForwardSlashes(`${root}/**/*.tsx`),
      `!${toForwardSlashes(`${root}/**/node_modules/**`)}`
    ]);
  } catch {
    return [];
  }
  const components = [];
  for (const sourceFile of project.getSourceFiles()) {
    const absPath = sourceFile.getFilePath();
    const rel = isAbsolute(absPath) ? relative(root, absPath) : absPath;
    const importPath = toForwardSlashes(rel);
    let exports;
    try {
      exports = sourceFile.getExportedDeclarations();
    } catch {
      continue;
    }
    for (const [name, decls] of exports) {
      const decl = decls[0];
      if (decl === void 0) continue;
      try {
        if (!looksLikeComponent(decl)) continue;
        components.push(readComponent(name, importPath, decl));
      } catch {
      }
    }
  }
  components.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return components;
}
export {
  scanCodeComponents
};
