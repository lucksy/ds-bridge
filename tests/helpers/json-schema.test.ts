// E3 — the test-only JSON Schema subset validator must itself be trustworthy:
// every keyword it claims to support rejects a violating value.
import { describe, expect, it } from "vitest";
import { validateJsonSchema } from "./json-schema.js";

describe("validateJsonSchema", () => {
	const schema = {
		$defs: {
			Point: {
				type: "object",
				additionalProperties: false,
				required: ["date", "pct"],
				properties: {
					date: { type: "string" },
					pct: { type: "number", minimum: 0, maximum: 100 },
				},
			},
		},
		type: "object",
		additionalProperties: false,
		required: ["v", "points"],
		properties: {
			v: { const: 1 },
			kind: { enum: ["a", "b"] },
			n: { type: "integer" },
			maybe: { type: ["string", "null"] },
			points: { type: "array", items: { $ref: "#/$defs/Point" } },
			either: { oneOf: [{ type: "string" }, { type: "number" }] },
			any: { anyOf: [{ type: "boolean" }, { type: "null" }] },
			free: { type: "object", additionalProperties: { type: "number" } },
		},
	};

	it("accepts a conforming value", () => {
		expect(
			validateJsonSchema(schema, {
				v: 1,
				kind: "a",
				n: 3,
				maybe: null,
				points: [{ date: "2026-01-01", pct: 50 }],
				either: 2,
				any: true,
				free: { x: 1 },
			}),
		).toEqual([]);
	});

	it.each([
		["const", { v: 2, points: [] }],
		["required", { v: 1 }],
		["enum", { v: 1, points: [], kind: "c" }],
		["integer", { v: 1, points: [], n: 1.5 }],
		["type union", { v: 1, points: [], maybe: 3 }],
		["additionalProperties false", { v: 1, points: [], extra: 1 }],
		["$ref + items", { v: 1, points: [{ date: "d" }] }],
		["maximum", { v: 1, points: [{ date: "d", pct: 101 }] }],
		["minimum", { v: 1, points: [{ date: "d", pct: -1 }] }],
		["oneOf", { v: 1, points: [], either: true }],
		["anyOf", { v: 1, points: [], any: "x" }],
		["additionalProperties schema", { v: 1, points: [], free: { x: "s" } }],
	])("rejects a %s violation", (_name, value) => {
		expect(validateJsonSchema(schema, value)).not.toEqual([]);
	});

	describe("strict mode (exhaustiveness checks on open published schemas)", () => {
		const open = {
			type: "object",
			properties: {
				a: { type: "number" },
				nested: { type: "object", properties: { b: { type: "string" } } },
				map: { type: "object", additionalProperties: { type: "number" } },
			},
		};
		const value = { a: 1, nested: { b: "x", extra: 2 }, map: { k: 1 }, top: 1 };

		it("an open schema accepts additive properties by default", () => {
			expect(validateJsonSchema(open, value)).toEqual([]);
		});

		it("strict treats `properties` without additionalProperties as closed, at every depth", () => {
			const errors = validateJsonSchema(open, value, { strict: true });
			expect(errors).toContain("$.top: additional property not allowed");
			expect(errors).toContain(
				"$.nested.extra: additional property not allowed",
			);
			expect(errors).toHaveLength(2);
		});

		it("strict leaves map schemas (additionalProperties: schema) alone", () => {
			expect(
				validateJsonSchema(open, { map: { k: 1, j: 2 } }, { strict: true }),
			).toEqual([]);
		});
	});

	it("reports an unsupported keyword instead of ignoring it", () => {
		expect(
			validateJsonSchema({ type: "string", pattern: "^a" }, "b").join(),
		).toContain("unsupported keyword pattern");
	});
});
