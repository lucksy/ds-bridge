// T5.1 — component scanner (Code Connect replacement, code side). Maps code
// components to a shape the figma↔code matcher and parity engine can consume.
//
// Unlike the pure engines under src/engines/**, this module necessarily reads
// .tsx files via ts-morph to perform structural type resolution — the AST/type
// graph IS the domain logic here, so it lives with the registry engine. It is
// still side-effect-free beyond reading the supplied root and NEVER throws:
// weird/unreadable files are skipped, never fatal.
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Node, Project, type Type, ts } from "ts-morph";
import { readPathAliases } from "../../io/tsconfig-paths.js";

/** A single component prop, as resolved from its props type. */
export interface CodeProp {
	/** Property name, as declared. */
	name: string;
	/** Rendered type text, e.g. '"primary" | "secondary" | "ghost"' or 'boolean'. */
	type: string;
	/** True when the prop has no `?` and is not `| undefined`. */
	required: boolean;
}

/** An exported, code-side component the registry can match to Figma. */
export interface CodeComponent {
	/** Exported identifier, e.g. "Button". */
	name: string;
	/** Path relative to the scan root, forward slashes, e.g. "components/button.tsx". */
	importPath: string;
	/** Props in declaration order. */
	props: CodeProp[];
	/**
	 * Props whose (non-nullable) type is a union of string literals, mapped to
	 * the literal values in union order, e.g. `{ variant: ["primary", …] }`.
	 */
	variants: Record<string, string[]>;
}

export interface ScanCodeOptions {
	/** Optional tsconfig to drive resolution. Resolution works without one. */
	tsconfigPath?: string;
}

/** Convert an OS path to forward-slash form for stable, portable importPaths. */
function toForwardSlashes(path: string): string {
	return sep === "/" ? path : path.split(sep).join("/");
}

/**
 * Resolve the props type for a component declaration: the first parameter of
 * the declaration's first call signature. Returns undefined when the value is
 * not callable (i.e. not a component) — the caller then skips it.
 */
function resolvePropsType(decl: Node): Type | undefined {
	let type: Type;
	try {
		type = decl.getType();
	} catch {
		return undefined;
	}

	const signatures = type.getCallSignatures();
	if (signatures.length === 0) return undefined;

	// Prefer the last signature: forwardRef/HOC wrappers expose the rendered
	// component signature there; for plain functions there is only one.
	const signature = signatures[signatures.length - 1];
	if (signature === undefined) return undefined;

	const params = signature.getParameters();
	const first = params[0];
	if (first === undefined) return undefined;

	try {
		return first.getTypeAtLocation(decl);
	} catch {
		return undefined;
	}
}

/** Heuristic: does this declaration look like a renderable component? */
function looksLikeComponent(decl: Node): boolean {
	let type: Type;
	try {
		type = decl.getType();
	} catch {
		return false;
	}
	// Components are callable. (Plain types/interfaces/consts that are not
	// functions have no call signatures and are excluded.)
	return type.getCallSignatures().length > 0;
}

/** A resolved type text longer than this reads better as written (`ReactNode`). */
const LONG_TYPE_TEXT = 80;

/** The prop's type as written in its declaration, without `| undefined`. */
function writtenType(declNode: Node): string | undefined {
	if (!Node.isPropertySignature(declNode)) return undefined;
	const text = declNode.getTypeNode()?.getText();
	if (text === undefined) return undefined;
	const trimmed = text.replace(/\s*\|\s*undefined\s*$/, "").trim();
	return trimmed === "" || trimmed === "any" ? undefined : trimmed;
}

/**
 * Render the rendered type text for a prop. Optional props have their trailing
 * `| undefined` stripped so unions read cleanly; `unknown` is preserved as-is
 * (its non-nullable form degenerates to `{}`, which we never want to surface).
 * A resolved type that balloons (`ReactNode`'s ~400-char union) or collapses
 * to `any` (types not installed) falls back to the type as written.
 */
function renderPropType(
	propType: Type,
	declNode: Node,
	optional: boolean,
): string {
	if (propType.isUnknown()) return "unknown";
	const base = optional ? propType.getNonNullableType() : propType;
	let resolved: string;
	try {
		resolved = base.getText(declNode);
	} catch {
		resolved = base.getText();
	}
	if (
		resolved === "any" ||
		resolved.length > LONG_TYPE_TEXT ||
		resolved.includes("import(")
	) {
		return writtenType(declNode) ?? resolved;
	}
	return resolved;
}

/**
 * Extract the string-literal values when (the non-nullable form of) a prop type
 * is a union of only string literals, preserving union order. Returns undefined
 * otherwise (including for `boolean`, whose non-nullable form is a union of
 * `false | true`).
 */
function stringLiteralVariants(propType: Type): string[] | undefined {
	const base = propType.getNonNullableType();
	if (base.isBoolean()) return undefined;
	if (!base.isUnion()) return undefined;

	const members = base.getUnionTypes();
	const values: string[] = [];
	for (const member of members) {
		if (!member.isStringLiteral()) return undefined;
		const literal = member.getLiteralValue();
		if (typeof literal !== "string") return undefined;
		values.push(literal);
	}
	return values.length > 0 ? values : undefined;
}

/**
 * Names bound by an object-destructuring first parameter
 * (`function X({ a, b = 1, ...rest })` → a, b), following a const's arrow or
 * function initializer. Empty when the parameter is not destructured.
 */
function destructuredPropNames(decl: Node): Set<string> {
	const names = new Set<string>();
	let fn: Node | undefined = decl;
	if (Node.isVariableDeclaration(decl)) fn = decl.getInitializer();
	if (
		fn === undefined ||
		!(
			Node.isFunctionDeclaration(fn) ||
			Node.isArrowFunction(fn) ||
			Node.isFunctionExpression(fn)
		)
	) {
		return names;
	}
	const pattern = fn.getParameters()[0]?.getNameNode();
	if (pattern === undefined || !Node.isObjectBindingPattern(pattern)) {
		return names;
	}
	for (const element of pattern.getElements()) {
		if (element.getDotDotDotToken() !== undefined) continue;
		const key = element.getPropertyNameNode() ?? element.getNameNode();
		names.add(key.getText());
	}
	return names;
}

/** Resolve props + variants for one component declaration. */
function readComponent(
	name: string,
	importPath: string,
	decl: Node,
	/** A package component: keep props declared in this package's own typings. */
	ownPackage?: string,
): CodeComponent {
	const props: CodeProp[] = [];
	const variants: Record<string, string[]> = {};

	const propsType = resolvePropsType(decl);
	const destructured = destructuredPropNames(decl);
	if (propsType !== undefined) {
		for (const symbol of propsType.getProperties()) {
			// Props declared only in compiled declarations (@types/react's HTML
			// attributes behind React.ComponentProps<"button">) are inherited, not
			// the component's API — keeping them buried shadcn-style components
			// under ~280 props and turned `autoCapitalize`-style unions into
			// variant axes no Figma component has.
			// An inherited prop the component destructures by name (shadcn's
			// `{ orientation = "horizontal", ...props }` over a radix type) IS
			// part of its API, so it stays.
			const declarations = symbol.getDeclarations();
			const ownTypings = (d: Node) =>
				ownPackage !== undefined &&
				toForwardSlashes(d.getSourceFile().getFilePath()).includes(
					`/node_modules/${ownPackage}/`,
				);
			if (
				declarations.length > 0 &&
				declarations.every(
					(d) => d.getSourceFile().isDeclarationFile() && !ownTypings(d),
				) &&
				!destructured.has(symbol.getName())
			) {
				continue;
			}
			const propDecl =
				symbol.getValueDeclaration() ?? symbol.getDeclarations()[0] ?? decl;
			let propType: Type;
			try {
				propType = symbol.getTypeAtLocation(propDecl);
			} catch {
				continue;
			}
			const required = !symbol.isOptional();
			props.push({
				name: symbol.getName(),
				type: renderPropType(propType, propDecl, !required),
				required,
			});

			const literals = stringLiteralVariants(propType);
			if (literals !== undefined) variants[symbol.getName()] = literals;
		}
	}

	return { name, importPath, props, variants };
}

/**
 * Scan `rootDir` for exported React components (`.tsx`), returning a
 * deterministic, name-sorted list. Function declarations, typed const arrows,
 * `React.FC<P>`, `forwardRef<T, P>`, HOC-wrapped exports whose inner signature
 * is resolvable, and `styled` template exports are all recognised through their
 * call signature. Non-callable exports (types, helpers, constants) and
 * non-PascalCase exports (cva helpers, hooks, `default`) are skipped; props
 * inherited from compiled `.d.ts` types (React's HTML attributes) are dropped.
 *
 * Never throws: a missing root, unreadable file, or unparseable source yields
 * whatever was resolvable (possibly an empty array).
 */
export function scanCodeComponents(
	rootDir: string,
	options?: ScanCodeOptions,
): CodeComponent[] {
	const root = resolve(rootDir);

	let project: Project;
	try {
		project =
			options?.tsconfigPath !== undefined
				? new Project({
						tsConfigFilePath: options.tsconfigPath,
						skipAddingFilesFromTsConfig: true,
						compilerOptions: { jsx: 4, allowJs: true, noEmit: true },
					})
				: new Project({
						skipAddingFilesFromTsConfig: true,
						// jsx: 4 === Preserve; enables .tsx parsing without a real React dep.
						compilerOptions: {
							jsx: 4,
							allowJs: true,
							strict: true,
							noEmit: true,
							// Resolve imports the way the project's bundler does, through its
							// tsconfig `paths` aliases: an unresolved `import { X } from
							// "utils"` turns every type built on X into `any`, and the
							// component loses all its props (Figma's SDS Button).
							module: ts.ModuleKind.ESNext,
							moduleResolution: ts.ModuleResolutionKind.Bundler,
							...projectAliases(root),
						},
					});
	} catch {
		return [];
	}

	try {
		project.addSourceFilesAtPaths([
			toForwardSlashes(`${root}/**/*.tsx`),
			`!${toForwardSlashes(`${root}/**/node_modules/**`)}`,
		]);
	} catch {
		return [];
	}

	const components: CodeComponent[] = [];

	for (const sourceFile of project.getSourceFiles()) {
		const absPath = sourceFile.getFilePath();
		const rel = isAbsolute(absPath) ? relative(root, absPath) : absPath;
		const importPath = toForwardSlashes(rel);

		let exports: ReadonlyMap<string, Node[]>;
		try {
			exports = sourceFile.getExportedDeclarations();
		} catch {
			continue;
		}

		for (const [name, decls] of exports) {
			// React components are PascalCase; callable lower-case exports are
			// helpers (cva's buttonVariants, hooks, utils) and `default`.
			if (!/^[A-Z]/.test(name)) continue;
			const decl = decls[0];
			if (decl === undefined) continue;
			try {
				if (!looksLikeComponent(decl)) continue;
				components.push(readComponent(name, importPath, decl));
			} catch {
				// Per the documented fallback, never guess: skip on resolution
				// failure rather than emit wrong-props.
			}
		}
	}

	components.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return components;
}

/**
 * The `paths` / `baseUrl` of the nearest tsconfig at or above `root` (the scan
 * often starts in a design-system folder such as `src/ui`), stopping at the
 * package root. `{}` when there is none.
 */
function projectAliases(root: string): {
	paths?: ts.MapLike<string[]>;
	baseUrl?: string;
} {
	for (let dir = root; ; ) {
		if (existsSync(join(dir, "tsconfig.json"))) return readPathAliases(dir);
		if (existsSync(join(dir, "package.json"))) return {};
		const parent = dirname(dir);
		if (parent === dir) return {};
		dir = parent;
	}
}

/** Strip non-alphanumerics and lowercase — how names are compared across tools. */
function normalizeComponentName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** The package a bare module specifier names: `@scope/pkg` or `pkg`. */
function packageOf(specifier: string): string {
	const parts = specifier.split("/");
	return specifier.startsWith("@")
		? parts.slice(0, 2).join("/")
		: (parts[0] as string);
}

/**
 * Components the project imports from installed packages
 * (`import { Button } from "@primer/react"`) whose normalized name is in
 * `wanted` — the Figma library's components no local file implements. Each
 * reads its props from the package's own typings (inherited React HTML
 * attributes dropped), so parity compares real variant axes. Imports that
 * resolve inside the project (relative, or a tsconfig alias like `@/ui`) and
 * React itself are not packages. Name-sorted, one entry per name + package;
 * never throws.
 */
export function scanPackageComponents(
	rootDir: string,
	wanted: ReadonlySet<string>,
	options?: ScanCodeOptions,
): CodeComponent[] {
	if (wanted.size === 0) return [];
	const root = resolve(rootDir);
	let project: Project;
	try {
		project = new Project({
			...(options?.tsconfigPath !== undefined
				? { tsConfigFilePath: options.tsconfigPath }
				: {}),
			skipAddingFilesFromTsConfig: true,
			compilerOptions: {
				jsx: 4,
				allowJs: true,
				strict: true,
				noEmit: true,
				skipLibCheck: true,
				esModuleInterop: true,
				moduleResolution: 100, // Bundler: package `exports` + `types`
				module: 99, // ESNext
			},
		});
		project.addSourceFilesAtPaths([
			toForwardSlashes(`${root}/**/*.{ts,tsx}`),
			`!${toForwardSlashes(`${root}/**/node_modules/**`)}`,
			`!${toForwardSlashes(`${root}/**/*.d.ts`)}`,
		]);
	} catch {
		return [];
	}

	const found = new Map<string, CodeComponent>();
	for (const sourceFile of project.getSourceFiles()) {
		for (const declaration of sourceFile.getImportDeclarations()) {
			const specifier = declaration.getModuleSpecifierValue();
			if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
			const pkg = packageOf(specifier);
			if (pkg === "react" || pkg === "react-dom") continue;
			for (const named of declaration.getNamedImports()) {
				const name = named.getName();
				if (!/^[A-Z]/.test(name)) continue;
				if (!wanted.has(normalizeComponentName(name))) continue;
				const key = `${specifier}\u0000${name}`;
				if (found.has(key)) continue;
				try {
					const symbol = named.getNameNode().getSymbol();
					const target = symbol?.getAliasedSymbol() ?? symbol;
					const decl = target?.getDeclarations()[0];
					if (decl === undefined) continue;
					const file = toForwardSlashes(decl.getSourceFile().getFilePath());
					if (!file.includes("/node_modules/")) continue; // a local alias
					if (!looksLikeComponent(decl)) continue;
					found.set(key, readComponent(name, specifier, decl, pkg));
				} catch {
					// Unresolvable typings: skip rather than guess the props.
				}
			}
		}
	}
	return [...found.values()].sort((a, b) =>
		a.name < b.name
			? -1
			: a.name > b.name
				? 1
				: a.importPath < b.importPath
					? -1
					: 1,
	);
}
