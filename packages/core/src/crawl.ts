import { disabledRenderer } from "./browser/types.ts";
import { readSitemaps, spread } from "./checks/sitemap.ts";
import { createAuditContext } from "./context.ts";
import { menuLinks } from "./fixes/extract.ts";
import type { Fetcher } from "./http.ts";
import type { FinishedCheck } from "./progress.ts";
import { runChecks } from "./run-checks.ts";
import { buildCategoryResults, gradeFor, overallScore } from "./scoring.ts";
import type {
	AuditContext,
	Check,
	CrawledPage,
	CrawlIssue,
	CrawlResult,
} from "./types.ts";

export const CRAWL_LIMIT_DEFAULT = 10;
export const CRAWL_LIMIT_MAX = 50;
/** Pages audited at once. */
const WORKERS = 3;
/** Time for finding the pages (sitemap reads). */
const DISCOVERY_BUDGET_MS = 15_000;
export const CRAWL_BROWSER_REASON = "The browser runs on the first page only";

function withoutHash(url: URL): string {
	const copy = new URL(url);
	copy.hash = "";
	return copy.href;
}

/**
 * Up to `max` other pages of the site: the sitemap's (spread evenly over
 * it), else the links of the page's menus. Same host only, never the page
 * itself.
 */
export async function discoverPages(
	ctx: AuditContext,
	max: number,
): Promise<URL[]> {
	if (max <= 0) return [];
	const self = withoutHash(ctx.targetUrl);
	const host = ctx.targetUrl.host;
	const { entries } = await readSitemaps(
		ctx,
		AbortSignal.timeout(DISCOVERY_BUDGET_MS),
	);
	const listed =
		entries.length > 0
			? entries.map((e) => e.url)
			: menuLinks(ctx.$, ctx.targetUrl);
	const seen = new Set<string>([self]);
	const candidates = listed.filter((url) => {
		const href = withoutHash(url);
		if (url.host !== host || seen.has(href)) return false;
		seen.add(href);
		return true;
	});
	return spread(candidates, max);
}

type Problem = Extract<CrawledPage, { status: "audited" }>["problems"][number];

function problemsOf(
	results: FinishedCheck[],
	pageChecks: Set<string>,
): Problem[] {
	return results.flatMap((r) =>
		pageChecks.has(r.id) && (r.status === "warn" || r.status === "fail")
			? [{ id: r.id, title: r.title, status: r.status, message: r.message }]
			: [],
	);
}

/**
 * Audits the other pages of the site with the page checks (no browser) and
 * the site checks' results from the first page, then sums it up: the mean
 * score of the audited pages, and how many pages each page check warns or
 * fails on. A page that cannot be read is listed as failed, outside the mean.
 */
export async function crawlSite(
	ctx: AuditContext,
	input: {
		fetcher: Fetcher;
		checks: Check[];
		/** The audited page: its URL, score and check results. */
		first: { url: string; score: number; results: FinishedCheck[] };
		limit: number;
	},
): Promise<CrawlResult> {
	const siteIds = new Set(
		input.checks.filter((c) => c.scope === "site").map((c) => c.id),
	);
	const pageChecks = input.checks.filter((c) => c.scope !== "site");
	const pageIds = new Set(pageChecks.map((c) => c.id));
	const siteResults = input.first.results.filter((r) => siteIds.has(r.id));
	const limit = Math.min(Math.max(1, input.limit), CRAWL_LIMIT_MAX);
	const others = await discoverPages(ctx, limit - 1);

	const audit = async (url: URL): Promise<CrawledPage> => {
		let page: AuditContext;
		try {
			page = await createAuditContext(
				url.href,
				input.fetcher,
				disabledRenderer(CRAWL_BROWSER_REASON),
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { url: url.href, status: "failed", error: message };
		}
		if (page.targetUrl.host !== ctx.targetUrl.host) {
			return {
				url: url.href,
				status: "failed",
				error: `redirected to another host (${page.targetUrl.host})`,
			};
		}
		const results = [...(await runChecks(page, pageChecks)), ...siteResults];
		const score = overallScore(buildCategoryResults(results));
		return {
			url: url.href,
			status: "audited",
			score,
			grade: gradeFor(score),
			problems: problemsOf(results, pageIds),
		};
	};

	const audited: CrawledPage[] = new Array(others.length);
	let next = 0;
	const worker = async () => {
		for (;;) {
			const index = next++;
			const url = others[index];
			if (!url) return;
			audited[index] = await audit(url);
		}
	};
	await Promise.all(Array.from({ length: WORKERS }, worker));

	const pages: CrawledPage[] = [
		{
			url: input.first.url,
			status: "audited",
			score: input.first.score,
			grade: gradeFor(input.first.score),
			problems: problemsOf(input.first.results, pageIds),
		},
		...audited,
	];
	const scored = pages.flatMap((p) => (p.status === "audited" ? [p] : []));
	const score = Math.round(
		scored.reduce((sum, p) => sum + p.score, 0) / scored.length,
	);

	const counts = new Map<string, CrawlIssue>();
	for (const page of scored) {
		for (const problem of page.problems) {
			const issue = counts.get(problem.id) ?? {
				id: problem.id,
				title: problem.title,
				fail: 0,
				warn: 0,
			};
			issue[problem.status]++;
			counts.set(problem.id, issue);
		}
	}
	const issues = [...counts.values()].sort(
		(a, b) => b.fail + b.warn - (a.fail + a.warn) || b.fail - a.fail,
	);
	return { score, grade: gradeFor(score), pages, issues };
}
