import { load } from "cheerio";
import type { HttpResult } from "../http.ts";
import { isSitemapXml, sitemapLines } from "../sitemaps.ts";
import type { AuditContext, Check } from "../types.ts";

/** Sitemap documents read at most (listed ones plus the children of an index). */
const MAX_READS = 10;
/** Listed URLs requested at most, spread evenly over the sitemap. */
export const MAX_CHECKED = 30;
const WORKERS = 4;
/** The whole check (sitemap reads and URL requests) stays within this, so a slow site cannot run the audit out of time. */
export const SITEMAP_BUDGET_MS = 20_000;

interface Entry {
	url: URL;
	lastmod: boolean;
}

/** `<url>` entries on the site's host and `<sitemap>` children of an index. */
function parseSitemap(
	xml: string,
	root: URL,
): { entries: Entry[]; children: URL[] } {
	const $ = load(xml, { xml: true });
	const sameHost = (text: string): URL | null => {
		try {
			const url = new URL(text.trim(), root);
			return url.host === root.host &&
				(url.protocol === "http:" || url.protocol === "https:")
				? url
				: null;
		} catch {
			return null;
		}
	};
	const entries: Entry[] = [];
	$("urlset > url").each((_, el) => {
		const url = sameHost($(el).children("loc").first().text());
		if (!url) return;
		const lastmod = $(el).children("lastmod").first().text().trim() !== "";
		entries.push({ url, lastmod });
	});
	const children: URL[] = [];
	$("sitemapindex > sitemap > loc").each((_, el) => {
		const url = sameHost($(el).text());
		if (url) children.push(url);
	});
	return { entries, children };
}

/** Up to `max` items picked evenly from the list, first and last included. */
export function spread<T>(items: T[], max: number): T[] {
	if (items.length <= max) return items;
	// One pick has no spacing to divide: take the first.
	if (max <= 1) return items.slice(0, Math.max(0, max));
	const step = (items.length - 1) / (max - 1);
	return Array.from(
		{ length: max },
		(_, i) => items[Math.round(i * step)] as T,
	);
}

function problem(res: HttpResult): string | null {
	if (res.kind === "error") return `could not be fetched (${res.error})`;
	return res.status === 200 ? null : `HTTP ${res.status}`;
}

export async function readSitemaps(
	ctx: AuditContext,
	signal: AbortSignal,
): Promise<{ found: URL[]; entries: Entry[] }> {
	const root = new URL(ctx.targetUrl.origin);
	const robots = await ctx.robots();
	const listed = robots.kind === "found" ? sitemapLines(robots.body, root) : [];
	const top = listed.length > 0 ? listed : [new URL("/sitemap.xml", root)];
	// An index is followed one level: children of a child are not read.
	const queue = top.map((url) => ({ url, child: false }));
	const found: URL[] = [];
	const entries: Entry[] = [];
	const seen = new Set<string>();
	let reads = 0;
	while (queue.length > 0 && reads < MAX_READS && !signal.aborted) {
		const { url, child } = queue.shift() as { url: URL; child: boolean };
		if (seen.has(url.href)) continue;
		seen.add(url.href);
		reads++;
		const res = await ctx.get(url.href, { signal });
		if (res.kind !== "response" || res.status !== 200) continue;
		if (!isSitemapXml(res.body)) continue;
		found.push(url);
		const doc = parseSitemap(res.body, root);
		entries.push(...doc.entries);
		if (!child) {
			queue.push(...doc.children.map((c) => ({ url: c, child: true })));
		}
	}
	return { found, entries };
}

/** The check with its time budget; tests pass a short one. */
export function sitemapCheck(budgetMs: number): Check {
	return {
		id: "sitemap",
		category: "bot-access",
		scope: "site",
		title: "Sitemap lists live pages",
		weight: 15,
		async run(ctx) {
			const budget = AbortSignal.timeout(budgetMs);
			const { found, entries } = await readSitemaps(ctx, budget);
			if (found.length === 0) {
				return {
					status: "fail",
					message: budget.aborted
						? `No sitemap read within ${budgetMs / 1000} s (robots.txt Sitemap lines, else /sitemap.xml)`
						: "No sitemap found (robots.txt Sitemap lines, else /sitemap.xml)",
					remediation:
						"Publish a sitemap.xml with every public page and its <lastmod>, and name it in robots.txt with a Sitemap: line.",
				};
			}
			const unique = [...new Map(entries.map((e) => [e.url.href, e])).values()];
			if (unique.length === 0) {
				return {
					status: "fail",
					message: `The sitemap at ${found[0]?.href} lists no pages of this site`,
					remediation:
						"List the site's public pages in the sitemap, one <url><loc> each, on the site's own host.",
				};
			}

			const sample = spread(unique, MAX_CHECKED);
			const broken: string[] = [];
			let done = 0;
			let next = 0;
			const worker = async () => {
				while (!budget.aborted) {
					const entry = sample[next++];
					if (!entry) return;
					const res = await ctx.get(entry.url.href, { signal: budget });
					// Cut off by the budget: not checked, not broken.
					if (res.kind === "error" && budget.aborted) return;
					done++;
					const bad = problem(res);
					if (bad) broken.push(`${entry.url.href}: ${bad}`);
				}
			};
			await Promise.all(Array.from({ length: WORKERS }, worker));
			broken.sort();

			const undated = unique.filter((e) => !e.lastmod).length;
			const checked = `${done} of ${unique.length} URLs checked${done < sample.length ? ` within ${budgetMs / 1000} s` : ""}`;
			const issues: string[] = [];
			if (done === 0) {
				issues.push(`no listed URL answered within ${budgetMs / 1000} s`);
			}
			if (broken.length > 0) {
				issues.push(
					`${broken.length} of ${done} checked URLs do not answer 200`,
				);
			}
			if (undated > 0) {
				issues.push(`${undated} of ${unique.length} entries have no <lastmod>`);
			}
			if (issues.length === 0) {
				return {
					status: "pass",
					message: `Sitemap lists ${unique.length} URLs with <lastmod>; ${checked}, all answer 200`,
				};
			}
			const fixes = [
				...(done === 0 ? ["list pages that answer quickly"] : []),
				...(broken.length > 0
					? ["remove or fix the URLs that do not answer 200"]
					: []),
				...(undated > 0 ? ["give every entry a <lastmod>"] : []),
			];
			return {
				status: "warn",
				message: `Sitemap: ${issues.join("; ")}`,
				details: broken,
				remediation: `In the sitemap, ${fixes.join(" and ")}.`,
			};
		},
	};
}

export const sitemap = sitemapCheck(SITEMAP_BUDGET_MS);
