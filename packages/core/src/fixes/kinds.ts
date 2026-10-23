import type { AuditResult, CategoryResult, CheckResult } from "../types.ts";
import type { FixKind } from "./types.ts";

type Needs = (check: CheckResult) => boolean;

const failing: Needs = (check) =>
	check.status === "warn" || check.status === "fail";

/** Per kind: the checks it fixes and when a result of each calls for it. */
const FIXED_BY: Record<FixKind, Record<string, Needs>> = {
	robots: {
		// Without details robots.txt could not be read: nothing to rewrite.
		"ai-bots-allowed": (c) => failing(c) && (c.details?.length ?? 0) > 0,
		// Only a missing signal: a warn is an unreadable robots.txt or the owner's own "no".
		"content-signals": (c) => c.status === "fail",
	},
	llms: { "llms-txt": failing, "llms-txt-format": failing },
	"llms-full": { "llms-full-txt": failing },
	// A missing twin; one that exists but is not advertised needs only a link.
	markdown: { "markdown-twin": (c) => c.status === "fail" },
	head: {
		opengraph: failing,
		"structured-data": failing,
		"markdown-twin": (c) => c.status === "warn",
		"llms-txt-link": (c) => c.status === "fail",
	},
};

export const FIX_KIND_ORDER: FixKind[] = [
	"robots",
	"llms",
	"llms-full",
	"markdown",
	"head",
];

/** The fix files an audit result calls for, always in the order of `FIX_KIND_ORDER`. */
export function fixKindsFor(
	result: Pick<AuditResult, "categories">,
): FixKind[] {
	const checks = result.categories.flatMap((category) => category.checks);
	return FIX_KIND_ORDER.filter((kind) =>
		checks.some((check) => FIXED_BY[kind][check.id]?.(check) ?? false),
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
	return Object.values(FIXED_BY).every((needs) =>
		Object.keys(needs).every((id) => have.has(id)),
	);
}
