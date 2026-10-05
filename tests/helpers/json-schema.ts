// E3 — test-only JSON Schema validator for the draft 2020-12 SUBSET the
// committed schemas use (SPEC-analytics-export §1.6: no new dependency).
// Supported keywords: $ref (local "#/$defs/…"), type (string or array), enum,
// const, properties, required, additionalProperties (boolean or schema), items,
// minimum, maximum, anyOf, oneOf. Any other keyword in a schema is reported as
// an error so the schema cannot silently rely on an unsupported rule.
//
// Strict mode (E7): the PUBLISHED schema is open (no additionalProperties:false,
// so additive v1 changes keep validating for consumers); in-repo tests pass
// `{strict: true}` to treat every object schema that lists `properties` without
// an `additionalProperties` keyword as closed — the exhaustiveness check.

export type JsonSchema = Record<string, unknown>;

export interface ValidateOptions {
	/** Treat `properties` without `additionalProperties` as closed. */
	strict?: boolean;
}

const SUPPORTED = new Set([
	"$schema",
	"$id",
	"$defs",
	"$ref",
	"$comment",
	"title",
	"description",
	"type",
	"enum",
	"const",
	"properties",
	"required",
	"additionalProperties",
	"items",
	"minimum",
	"maximum",
	"anyOf",
	"oneOf",
]);

function typeOf(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
	switch (type) {
		case "integer":
			return typeof value === "number" && Number.isInteger(value);
		case "number":
			return typeof value === "number" && Number.isFinite(value);
		default:
			return typeOf(value) === type;
	}
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema {
	if (!ref.startsWith("#/")) throw new Error(`unsupported $ref ${ref}`);
	let node: unknown = root;
	for (const part of ref.slice(2).split("/")) {
		node = (node as Record<string, unknown>)[part];
		if (node === undefined) throw new Error(`unresolved $ref ${ref}`);
	}
	return node as JsonSchema;
}

function check(
	root: JsonSchema,
	schema: JsonSchema,
	value: unknown,
	path: string,
	errors: string[],
	strict: boolean,
): void {
	for (const key of Object.keys(schema)) {
		if (!SUPPORTED.has(key)) errors.push(`${path}: unsupported keyword ${key}`);
	}
	if (typeof schema.$ref === "string") {
		check(root, resolveRef(root, schema.$ref), value, path, errors, strict);
	}
	if (schema.type !== undefined) {
		const types = Array.isArray(schema.type) ? schema.type : [schema.type];
		if (!types.some((t) => matchesType(value, String(t)))) {
			errors.push(`${path}: expected ${types.join("|")}, got ${typeOf(value)}`);
			return;
		}
	}
	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
		errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
	}
	if ("const" in schema && schema.const !== value) {
		errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
	}
	if (typeof value === "number") {
		if (typeof schema.minimum === "number" && value < schema.minimum) {
			errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
		}
		if (typeof schema.maximum === "number" && value > schema.maximum) {
			errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
		}
	}
	if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
		const branches = (schema.anyOf ?? schema.oneOf) as JsonSchema[];
		const passing = branches.filter((b) => {
			const sub: string[] = [];
			check(root, b, value, path, sub, strict);
			return sub.length === 0;
		}).length;
		if (Array.isArray(schema.oneOf) ? passing !== 1 : passing === 0) {
			errors.push(
				`${path}: matched ${passing} of ${branches.length} ${Array.isArray(schema.oneOf) ? "oneOf" : "anyOf"} branches`,
			);
		}
	}
	if (typeOf(value) === "object") {
		const obj = value as Record<string, unknown>;
		const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
		const closed =
			schema.additionalProperties === false ||
			(strict &&
				schema.additionalProperties === undefined &&
				schema.properties !== undefined);
		for (const req of (schema.required ?? []) as string[]) {
			if (!(req in obj)) errors.push(`${path}: missing required ${req}`);
		}
		for (const [key, child] of Object.entries(obj)) {
			const childPath = `${path}.${key}`;
			if (props[key] !== undefined) {
				check(root, props[key], child, childPath, errors, strict);
			} else if (closed) {
				errors.push(`${childPath}: additional property not allowed`);
			} else if (
				typeof schema.additionalProperties === "object" &&
				schema.additionalProperties !== null
			) {
				check(
					root,
					schema.additionalProperties as JsonSchema,
					child,
					childPath,
					errors,
					strict,
				);
			}
		}
	}
	if (Array.isArray(value) && typeof schema.items === "object") {
		value.forEach((item, i) => {
			check(
				root,
				schema.items as JsonSchema,
				item,
				`${path}[${i}]`,
				errors,
				strict,
			);
		});
	}
}

/** Validate `value` against `schema`; returns the error list (empty = valid). */
export function validateJsonSchema(
	schema: JsonSchema,
	value: unknown,
	options: ValidateOptions = {},
): string[] {
	const errors: string[] = [];
	check(schema, schema, value, "$", errors, options.strict === true);
	return errors;
}
