// T2.1 — smoke spec guarding the seeded-violation contract for the lint engine.
// The fixture project (tests/fixtures/sample-project/) is the acceptance data for
// T2.2/T2.3. This spec protects expected-findings.json from drifting away from the
// actual fixture source: every claimed finding must point at a real file, a real
// line, and the raw literal must actually appear there. It also proves the seeded
// near-miss is genuinely within deltaE 2.5 and the off-system color genuinely is not.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { differenceCiede2000 } from "culori";
import { describe, expect, it } from "vitest";

const projectRoot = join(
	import.meta.dirname,
	"..",
	"..",
	"fixtures",
	"sample-project",
);

type FindingKind = "exact" | "near" | "off-system";

interface ExpectedFinding {
	file: string;
	line: number;
	col: number;
	raw: string;
	property: string;
	kind: FindingKind;
	expectedToken?: string;
	expectedCandidates?: string[];
}

function loadFindings(): ExpectedFinding[] {
	const text = readFileSync(
		join(projectRoot, "expected-findings.json"),
		"utf8",
	);
	return JSON.parse(text) as ExpectedFinding[];
}

function fileLines(relPath: string): string[] {
	return readFileSync(join(projectRoot, relPath), "utf8").split("\n");
}

describe("sample-project fixture — tokens.json", () => {
	it("is a byte-identical copy of the W3C golden tokens fixture", () => {
		const fixtureCopy = readFileSync(join(projectRoot, "tokens.json"), "utf8");
		const golden = readFileSync(
			join(
				import.meta.dirname,
				"..",
				"..",
				"fixtures",
				"tokens",
				"w3c",
				"tokens.json",
			),
			"utf8",
		);
		expect(fixtureCopy).toBe(golden);
	});
});

describe("sample-project fixture — expected-findings.json contract", () => {
	const findings = loadFindings();

	it("loads as a non-empty array", () => {
		expect(Array.isArray(findings)).toBe(true);
		expect(findings.length).toBeGreaterThan(0);
	});

	it("seeds exactly the documented violations (7)", () => {
		expect(findings.length).toBe(7);
	});

	it("every referenced fixture file exists", () => {
		for (const finding of findings) {
			expect(existsSync(join(projectRoot, finding.file))).toBe(true);
		}
	});

	it("every line number is within its file's line count", () => {
		for (const finding of findings) {
			const lines = fileLines(finding.file);
			expect(finding.line).toBeGreaterThanOrEqual(1);
			expect(finding.line).toBeLessThanOrEqual(lines.length);
		}
	});

	it("the raw literal actually appears at the claimed line", () => {
		for (const finding of findings) {
			const lineContent = fileLines(finding.file)[finding.line - 1];
			expect(lineContent).toBeDefined();
			expect(lineContent ?? "").toContain(finding.raw);
		}
	});

	it("the raw literal actually appears at the claimed 1-based column", () => {
		for (const finding of findings) {
			const lineContent = fileLines(finding.file)[finding.line - 1] ?? "";
			const at = lineContent.slice(
				finding.col - 1,
				finding.col - 1 + finding.raw.length,
			);
			expect(at).toBe(finding.raw);
		}
	});

	it("kinds carry the right expectation shape", () => {
		for (const finding of findings) {
			if (finding.kind === "exact") {
				expect(typeof finding.expectedToken).toBe("string");
			} else if (finding.kind === "near") {
				expect(Array.isArray(finding.expectedCandidates)).toBe(true);
				expect(finding.expectedCandidates?.length ?? 0).toBeGreaterThan(0);
			} else {
				expect(finding.expectedToken).toBeUndefined();
				expect(finding.expectedCandidates).toBeUndefined();
			}
		}
	});
});

describe("sample-project fixture — seed validity via culori deltaE", () => {
	const deltaE = differenceCiede2000();

	it("the near-miss #3a81f5 is within deltaE 2.5 of color.brand.primary #3b82f6", () => {
		expect(deltaE("#3a81f5", "#3b82f6")).toBeLessThan(2.5);
	});

	it("the off-system #ff00aa is NOT within deltaE 2.5 of any token color", () => {
		const tokenColors = ["#3b82f6", "#f3f4f6", "#111827", "#ffffff"];
		for (const tokenColor of tokenColors) {
			expect(deltaE("#ff00aa", tokenColor)).toBeGreaterThan(2.5);
		}
	});
});
