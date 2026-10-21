import { describe, expect, it } from "vitest";
import { completeCategories, type FinishedCheck } from "../src/progress.ts";
import { CHECKS } from "../src/registry.ts";
import { buildCategoryResults } from "../src/scoring.ts";

const finished = (
	category: string,
	status: FinishedCheck["status"] = "pass",
): FinishedCheck[] =>
	CHECKS.filter((c) => c.category === category).map((c) => ({
		id: c.id,
		title: c.title,
		weight: c.weight,
		category: c.category,
		status,
		message: "m",
	}));

describe("completeCategories", () => {
	it("omits a category until all its checks are in", () => {
		const checks = finished("ai-manifests").slice(0, -1);
		expect(completeCategories(checks)).toEqual([]);
		expect(completeCategories([])).toEqual([]);
	});

	it("scores a complete category like buildCategoryResults", () => {
		const checks = finished("ai-manifests").map((c, i) => ({
			...c,
			status: (["pass", "warn", "fail"] as const)[
				i % 3
			] as FinishedCheck["status"],
		}));
		const [only, ...rest] = completeCategories(checks);
		expect(rest).toEqual([]);
		expect(only).toEqual(
			buildCategoryResults(checks).find((c) => c.id === "ai-manifests"),
		);
		expect(only?.status).toBe("scored");
	});

	it("keeps CATEGORIES order", () => {
		const checks = [
			...finished("content-semantics"),
			...finished("ai-manifests"),
			...finished("bot-access"),
		];
		expect(completeCategories(checks).map((c) => c.id)).toEqual([
			"ai-manifests",
			"bot-access",
			"content-semantics",
		]);
	});

	it("a quick audit's skipped category is complete", () => {
		const [cat] = completeCategories(finished("agentic-actionability", "skip"));
		expect(cat?.id).toBe("agentic-actionability");
		expect(cat?.status).toBe("skipped");
	});
});
