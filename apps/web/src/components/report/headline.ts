import type { AuditResult } from "@agentcheck/core";

type Grade = AuditResult["grade"];

/**
 * The score a report leads with: a crawl's site score (the mean of its
 * audited pages), else the page's own. `pages` is the number of audited
 * pages, null without a crawl.
 */
export function headline(result: AuditResult): {
	score: number;
	grade: Grade;
	pages: number | null;
} {
	if (!result.crawl) {
		return { score: result.score, grade: result.grade, pages: null };
	}
	const pages = result.crawl.pages.filter(
		(page) => page.status === "audited",
	).length;
	return { score: result.crawl.score, grade: result.crawl.grade, pages };
}
