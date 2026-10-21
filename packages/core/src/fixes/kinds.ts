import type { AuditResult, CategoryResult, CheckResult } from "../types.ts";
import type { FixKind } from "./types.ts";

const FIXED_BY: Record<FixKind, string[]> = {
	robots: ["ai-bots-allowed"],
	llms: ["llms-txt", "llms-txt-format"],
	"llms-full": ["llms-full-txt"],
	markdown: ["markdown-twin"],
	head: ["opengraph", "structured-data"],
};

export const FIX_KIND_ORDER: FixKind[] = [
	"robots",
	"llms",
	"llms-full",
	"markdown",
	"head",
];

function needsFix(check: CheckResult): boolean {
	if (check.status !== "warn" && check.status !== "fail") return false;
	// ai-bots-allowed without details: robots.txt could not be read, nothing to rewrite.
	if (check.id === "ai-bots-allowed") return (check.details?.length ?? 0) > 0;
	// Only a missing twin calls for one (the check has no warn today; a future one would not mean "missing").
	if (check.id === "markdown-twin") return check.status === "fail";
	return true;
}

/** The fix files an audit result calls for, always in the order of `FIX_KIND_ORDER`. */
export function fixKindsFor(
	result: Pick<AuditResult, "categories">,
): FixKind[] {
	const failing = new Set(
		result.categories
			.flatMap((category) => category.checks)
			.filter(needsFix)
			.map((check) => check.id),
	);
	return FIX_KIND_ORDER.filter((kind) =>
		FIXED_BY[kind].some((id) => failing.has(id)),
	);
}

/**
 * True once every check that decides a fix kind is among the given
 * categories, so `fixKindsFor` on them can no longer grow.
 */
export function fixKindsSettled(
	categories: Pick<CategoryResult, "checks">[],
): boolean {
	const have = new Set(
		categories.flatMap((category) => category.checks).map((check) => check.id),
	);
	return Object.values(FIXED_BY).every((ids) =>
		ids.every((id) => have.has(id)),
	);
}
