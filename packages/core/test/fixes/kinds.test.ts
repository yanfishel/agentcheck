import { describe, expect, it } from "vitest";
import { fixKindsFor } from "../../src/fixes/kinds.ts";
import type { AuditResult, CheckResult, Status } from "../../src/types.ts";

function check(id: string, status: Status, details?: string[]): CheckResult {
	return {
		id,
		title: id,
		weight: 10,
		status,
		message: id,
		...(details ? { details } : {}),
	};
}

function result(checks: CheckResult[]): Pick<AuditResult, "categories"> {
	return {
		categories: [
			{
				id: "ai-manifests",
				title: "AI Manifests",
				weight: 30,
				status: "scored",
				score: 50,
				checks: checks.filter(
					(c) => c.id.startsWith("llms") || c.id === "markdown-twin",
				),
			},
			{
				id: "bot-access",
				title: "Bot Access",
				weight: 20,
				status: "scored",
				score: 50,
				checks: checks.filter((c) => c.id === "ai-bots-allowed"),
			},
			{
				id: "content-semantics",
				title: "Content",
				weight: 25,
				status: "scored",
				score: 50,
				checks: checks.filter(
					(c) => c.id === "opengraph" || c.id === "structured-data",
				),
			},
		],
	};
}

describe("fixKindsFor", () => {
	it("returns robots, llms, head in that order", () => {
		expect(
			fixKindsFor(
				result([
					check("structured-data", "fail"),
					check("llms-txt", "fail"),
					check("ai-bots-allowed", "fail", ["GPTBot"]),
				]),
			),
		).toEqual(["robots", "llms", "head"]);
	});

	it("includes robots for a blocked crawler", () => {
		expect(
			fixKindsFor(result([check("ai-bots-allowed", "warn", ["GPTBot"])])),
		).toEqual(["robots"]);
	});

	it("excludes robots when robots.txt could not be read", () => {
		expect(fixKindsFor(result([check("ai-bots-allowed", "warn")]))).toEqual([]);
	});

	it("includes llms for a failed llms-txt-format", () => {
		expect(fixKindsFor(result([check("llms-txt-format", "fail")]))).toEqual([
			"llms",
		]);
	});

	it("includes head for a structured-data warn", () => {
		expect(fixKindsFor(result([check("structured-data", "warn")]))).toEqual([
			"head",
		]);
	});

	it("includes head for a failed opengraph", () => {
		expect(fixKindsFor(result([check("opengraph", "fail")]))).toEqual(["head"]);
	});

	it("includes llms-full for an llms-full-txt warn or fail", () => {
		expect(fixKindsFor(result([check("llms-full-txt", "warn")]))).toEqual([
			"llms-full",
		]);
		expect(fixKindsFor(result([check("llms-full-txt", "fail")]))).toEqual([
			"llms-full",
		]);
	});

	it("includes markdown for a failed markdown-twin only", () => {
		expect(fixKindsFor(result([check("markdown-twin", "fail")]))).toEqual([
			"markdown",
		]);
		expect(fixKindsFor(result([check("markdown-twin", "warn")]))).toEqual([]);
	});

	it("orders robots, llms, llms-full, markdown, head", () => {
		expect(
			fixKindsFor(
				result([
					check("opengraph", "fail"),
					check("markdown-twin", "fail"),
					check("llms-full-txt", "fail"),
					check("llms-txt", "fail"),
					check("ai-bots-allowed", "fail", ["GPTBot"]),
				]),
			),
		).toEqual(["robots", "llms", "llms-full", "markdown", "head"]);
	});

	it("returns nothing when everything passes or is skipped", () => {
		expect(
			fixKindsFor(
				result([
					check("ai-bots-allowed", "pass"),
					check("llms-txt", "pass"),
					check("llms-txt-format", "skip"),
					check("opengraph", "pass"),
					check("structured-data", "pass"),
				]),
			),
		).toEqual([]);
	});
});
