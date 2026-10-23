import { describe, expect, it } from "vitest";
import { runAudit } from "../src/audit.ts";
import { createAuditContext } from "../src/context.ts";
import { CRAWL_BROWSER_REASON, discoverPages } from "../src/crawl.ts";
import { createFetcher } from "../src/http.ts";
import { renderHtml } from "../src/reporters/html.ts";
import { renderTerminal } from "../src/reporters/terminal.ts";
import type { Check } from "../src/types.ts";
import { mockRoutes, type Route } from "./helpers/mock-site.ts";

const ORIGIN = "https://example.com";
const html = (body: string): Route => ({
	status: 200,
	contentType: "text/html",
	body: `<html><head></head><body>${body}</body></html>`,
});
const sitemap = (paths: string[]): Route => ({
	status: 200,
	contentType: "application/xml",
	body: `<urlset>${paths.map((p) => `<url><loc>${p.startsWith("http") ? p : ORIGIN + p}</loc></url>`).join("")}</urlset>`,
});

async function context(routes: Record<string, Route>) {
	const fetcher = createFetcher({
		userAgent: "test",
		dispatcher: mockRoutes(ORIGIN, routes),
	});
	return createAuditContext(`${ORIGIN}/`, fetcher);
}

describe("discoverPages", () => {
	it("takes the sitemap's same-host pages, never the page itself", async () => {
		const ctx = await context({
			"/": html(""),
			"/sitemap.xml": sitemap(["/", "/a", "/b", "https://other.example/c"]),
		});
		expect((await discoverPages(ctx, 9)).map((u) => u.pathname)).toEqual([
			"/a",
			"/b",
		]);
	});

	it("spreads a long sitemap and falls back to the menu without one", async () => {
		const many = Array.from({ length: 20 }, (_, i) => `/p${i}`);
		const spread = await discoverPages(
			await context({ "/": html(""), "/sitemap.xml": sitemap(many) }),
			3,
		);
		expect(spread.map((u) => u.pathname)).toEqual(["/p0", "/p10", "/p19"]);
		const menu = await discoverPages(
			await context({
				"/": html(
					'<nav><a href="/">Home</a><a href="/docs">Docs</a><a href="https://x.example/">X</a></nav>',
				),
			}),
			5,
		);
		expect(menu.map((u) => u.pathname)).toEqual(["/docs"]);
	});

	it("returns nothing for a limit of one page", async () => {
		const ctx = await context({
			"/": html(""),
			"/sitemap.xml": sitemap(["/a"]),
		});
		expect(await discoverPages(ctx, 0)).toEqual([]);
	});
});

describe("crawl in runAudit", () => {
	// A site check counts its runs; a page check fails where the page says "bad".
	let siteRuns = 0;
	const siteCheck: Check = {
		id: "site-thing",
		category: "ai-manifests",
		scope: "site",
		title: "Site thing",
		weight: 10,
		async run() {
			siteRuns++;
			return { status: "pass", message: "ok" };
		},
	};
	const pageCheck: Check = {
		id: "page-thing",
		category: "ai-manifests",
		title: "Page thing",
		weight: 10,
		async run(ctx) {
			return ctx.page.body.includes("bad")
				? { status: "fail", message: "bad page", remediation: "fix" }
				: { status: "pass", message: "good page" };
		},
	};
	const browserCheck: Check = {
		id: "browser-thing",
		category: "content-semantics",
		title: "Browser thing",
		weight: 10,
		async run(ctx) {
			const outcome = await ctx.rendered();
			return outcome.kind === "unavailable"
				? { status: "skip", message: outcome.reason }
				: { status: "pass", message: "rendered" };
		},
	};

	async function crawl(limit = 10) {
		siteRuns = 0;
		return runAudit(`${ORIGIN}/`, {
			userAgent: "test",
			checks: [siteCheck, pageCheck, browserCheck],
			dispatcher: mockRoutes(ORIGIN, {
				"/": html("good"),
				"/sitemap.xml": sitemap(["/", "/ok", "/bad", "/gone"]),
				"/ok": html("good"),
				"/bad": html("bad"),
			}),
			crawl: { limit },
		});
	}

	it("runs site checks once, audits the other pages, averages the audited ones", async () => {
		const result = await crawl();
		expect(siteRuns).toBe(1);
		expect(result.crawl?.pages).toEqual([
			{
				url: `${ORIGIN}/`,
				status: "audited",
				score: 100,
				grade: "A+",
				problems: [],
			},
			{
				url: `${ORIGIN}/ok`,
				status: "audited",
				score: 100,
				grade: "A+",
				problems: [],
			},
			{
				url: `${ORIGIN}/bad`,
				status: "audited",
				score: 50,
				grade: "F",
				problems: [
					{
						id: "page-thing",
						title: "Page thing",
						status: "fail",
						message: "bad page",
					},
				],
			},
			{
				url: `${ORIGIN}/gone`,
				status: "failed",
				error: expect.stringContaining("HTTP 404"),
			},
		]);
		expect(result.crawl?.score).toBe(83);
		expect(result.crawl?.grade).toBe("B");
		expect(result.crawl?.issues).toEqual([
			{ id: "page-thing", title: "Page thing", fail: 1, warn: 0 },
		]);
		// The page's own result is unchanged by the crawl.
		expect(result.score).toBe(100);
	});

	it("respects the limit, the page itself included", async () => {
		const result = await crawl(2);
		expect(result.crawl?.pages).toHaveLength(2);
	});

	it("leaves crawl out without the option", async () => {
		const result = await runAudit(`${ORIGIN}/`, {
			userAgent: "test",
			checks: [pageCheck],
			dispatcher: mockRoutes(ORIGIN, { "/": html("good") }),
		});
		expect(result).not.toHaveProperty("crawl");
	});

	it("names why the other pages had no browser", () => {
		expect(CRAWL_BROWSER_REASON).toBe(
			"The browser runs on the first page only",
		);
	});

	it("the reporters lead with the site score and list the pages", async () => {
		const result = await crawl();
		const text = renderTerminal(result, { color: false });
		expect(text).toContain("Pages (4)");
		expect(text).toContain(` 50  F   ${ORIGIN}/bad`);
		expect(text).toContain("Page thing: fail on 1 of 3 pages");
		expect(text).toContain(
			"SITE AI SCORE: 83 / 100 [B] (average of 3 pages; this page 100 [A+])",
		);
		const page = renderHtml(result);
		expect(page).toContain("<strong>83</strong>");
		expect(page).toContain("Site AI-readiness report");
		expect(page).toContain("<li>Page thing: fail on 1 of 3 pages</li>");
		expect(page).not.toContain(`href="${ORIGIN}/bad"`);
	});
});
