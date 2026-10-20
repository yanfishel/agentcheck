import { describe, expect, it } from "vitest";
import {
	buildCategoryResults,
	CATEGORIES,
	gradeFor,
	overallScore,
} from "../src/scoring.ts";
import type {
	CategoryId,
	CategoryResult,
	CheckResult,
	Status,
} from "../src/types.ts";

function result(
	category: CategoryId,
	status: Status,
	weight: number,
	id = `${category}-${status}-${weight}`,
): CheckResult & { category: CategoryId } {
	return { id, title: id, weight, status, message: "", category };
}

function category(id: CategoryId, score: number | null): CategoryResult {
	const weights: Record<CategoryId, number> = {
		"ai-manifests": 30,
		"bot-access": 20,
		"content-semantics": 25,
		"agentic-actionability": 25,
	};
	const base = { id, title: id, weight: weights[id], checks: [] };
	return score === null
		? { ...base, status: "skipped", score: null, skipReason: "skipped" }
		: { ...base, status: "scored", score };
}

describe("gradeFor", () => {
	it.each([
		[95, "A+"],
		[94, "A"],
		[90, "A"],
		[89, "B"],
		[80, "B"],
		[70, "C"],
		[60, "D"],
		[59, "F"],
	] as const)("maps %i to %s", (score, grade) => {
		expect(gradeFor(score)).toBe(grade);
	});
});

describe("CATEGORIES", () => {
	it("defines the four categories with short titles and weights", () => {
		expect(CATEGORIES).toEqual([
			{ id: "ai-manifests", title: "AI Manifests", weight: 30 },
			{ id: "bot-access", title: "Bot Access", weight: 20 },
			{ id: "content-semantics", title: "Content & Semantics", weight: 25 },
			{
				id: "agentic-actionability",
				title: "Agentic Actionability",
				weight: 25,
			},
		]);
	});
});

describe("buildCategoryResults", () => {
	it("scores pass/warn/fail/skip with warn at half weight and skip excluded", () => {
		const categories = buildCategoryResults([
			result("ai-manifests", "pass", 40, "a"),
			result("ai-manifests", "warn", 20, "b"),
			result("ai-manifests", "fail", 20, "c"),
			result("ai-manifests", "skip", 20, "d"),
		]);
		const manifests = categories.find((c) => c.id === "ai-manifests");
		expect(manifests?.status).toBe("scored");
		expect(manifests?.score).toBe(63);
		expect(manifests?.checks).toHaveLength(4);
	});

	it("skips a category with only skipped checks", () => {
		const categories = buildCategoryResults([
			{ ...result("bot-access", "skip", 10), message: "X" },
		]);
		const bots = categories.find((c) => c.id === "bot-access");
		expect(bots?.status).toBe("skipped");
		expect(bots?.score).toBeNull();
		expect(bots?.status === "skipped" && bots.skipReason).toBe("X");
	});

	it("uses the first skip message when skipped checks differ", () => {
		const categories = buildCategoryResults([
			{ ...result("bot-access", "skip", 10, "a"), message: "X" },
			{ ...result("bot-access", "skip", 10, "b"), message: "Y" },
		]);
		const bots = categories.find((c) => c.id === "bot-access");
		expect(bots?.status === "skipped" && bots.skipReason).toBe("X");
	});

	it("always returns all four categories in order, skipping empty ones", () => {
		const categories = buildCategoryResults([]);
		expect(categories.map((c) => c.id)).toEqual([
			"ai-manifests",
			"bot-access",
			"content-semantics",
			"agentic-actionability",
		]);
		expect(categories.map((c) => c.weight)).toEqual([30, 20, 25, 25]);
		for (const c of categories) {
			expect(c.status).toBe("skipped");
			expect(c.score).toBeNull();
			expect(c.status === "skipped" && c.skipReason).toBe(
				"No checks available yet",
			);
		}
	});
});

describe("overallScore", () => {
	it("renormalizes weights over scored categories", () => {
		const categories = [
			category("ai-manifests", 80),
			category("bot-access", 100),
			category("content-semantics", 100),
			category("agentic-actionability", null),
		];
		expect(overallScore(categories)).toBe(92);
	});

	it("rounds the weighted mean", () => {
		const categories = [
			category("ai-manifests", 0),
			category("bot-access", 95),
			category("content-semantics", 40),
			category("agentic-actionability", null),
		];
		expect(overallScore(categories)).toBe(39);
	});

	it("throws when no category is scored", () => {
		expect(() => overallScore(buildCategoryResults([]))).toThrow();
	});
});
