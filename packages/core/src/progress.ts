import { CHECKS } from "./registry.ts";
import { buildCategoryResults, CATEGORIES } from "./scoring.ts";
import type { CategoryId, CategoryResult, CheckResult } from "./types.ts";

/** A check result as it settles, tagged with the category it belongs to. */
export type FinishedCheck = CheckResult & { category: CategoryId };

/**
 * The categories whose every registry check is present, scored like the final
 * result and in CATEGORIES order. Incomplete categories are omitted.
 */
export function completeCategories(checks: FinishedCheck[]): CategoryResult[] {
	const have = new Set(checks.map((c) => c.id));
	const complete = new Set<CategoryId>(
		CATEGORIES.filter(({ id }) =>
			CHECKS.filter((c) => c.category === id).every((c) => have.has(c.id)),
		).map(({ id }) => id),
	);
	return buildCategoryResults(
		checks.filter((c) => complete.has(c.category)),
	).filter((c) => complete.has(c.id));
}
