import { describe, expect, it } from "vitest";
import {
	MAX_CHECKED,
	sitemap,
	sitemapCheck,
	spread,
} from "../../src/checks/sitemap.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const ORIGIN = "https://example.com";
const PAGE: Route = {
	status: 200,
	contentType: "text/html",
	body: "<html><body><p>Hi</p></body></html>",
};

const xml = (body: string): Route => ({
	status: 200,
	contentType: "application/xml",
	body: `<?xml version="1.0" encoding="UTF-8"?>${body}`,
});

const urlset = (paths: string[], lastmod = true) =>
	xml(
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
			.map(
				(p) =>
					`<url><loc>${ORIGIN}${p}</loc>${lastmod ? "<lastmod>2026-10-01</lastmod>" : ""}</url>`,
			)
			.join("")}</urlset>`,
	);

const run = (routes: Record<string, Route>) =>
	runCheck(sitemap, mockRoutes(ORIGIN, { "/": PAGE, ...routes }), `${ORIGIN}/`);

describe("sitemap", () => {
	it("has the expected metadata", () => {
		expect(sitemap.id).toBe("sitemap");
		expect(sitemap.weight).toBe(15);
		expect(sitemap.category).toBe("bot-access");
	});

	it("passes for /sitemap.xml with lastmod whose pages answer 200", async () => {
		const out = await run({
			"/sitemap.xml": urlset(["/", "/about"]),
			"/about": PAGE,
		});
		expect(out.status).toBe("pass");
		expect(out.message).toBe(
			"Sitemap lists 2 URLs with <lastmod>; 2 of 2 URLs checked, all answer 200",
		);
	});

	it("follows the robots.txt Sitemap line and an index one level", async () => {
		const out = await run({
			"/robots.txt": {
				status: 200,
				contentType: "text/plain",
				body: "User-agent: *\nAllow: /\nSitemap: /maps/index.xml\n",
			},
			"/maps/index.xml": xml(
				`<sitemapindex><sitemap><loc>${ORIGIN}/maps/a.xml</loc></sitemap></sitemapindex>`,
			),
			"/maps/a.xml": xml(
				`<sitemapindex><sitemap><loc>${ORIGIN}/maps/deep.xml</loc></sitemap></sitemapindex><urlset><url><loc>${ORIGIN}/</loc><lastmod>2026-10-01</lastmod></url></urlset>`,
			),
			"/maps/deep.xml": urlset(["/deep"]),
		});
		expect(out.status).toBe("pass");
		expect(out.message).toContain("Sitemap lists 1 URLs");
	});

	it("warns and lists the URLs that do not answer 200", async () => {
		const out = await run({
			"/sitemap.xml": urlset(["/", "/de/about", "/fr/about"]),
		});
		expect(out.status).toBe("warn");
		expect(out.message).toBe("Sitemap: 2 of 3 checked URLs do not answer 200");
		expect(out.details).toEqual([
			`${ORIGIN}/de/about: HTTP 404`,
			`${ORIGIN}/fr/about: HTTP 404`,
		]);
	});

	it("warns on entries without lastmod", async () => {
		const out = await run({ "/sitemap.xml": urlset(["/"], false) });
		expect(out.status).toBe("warn");
		expect(out.message).toBe("Sitemap: 1 of 1 entries have no <lastmod>");
	});

	it("fails without a sitemap", async () => {
		const out = await run({});
		expect(out.status).toBe("fail");
	});

	it("fails on a sitemap that is not a sitemap", async () => {
		const out = await run({
			"/sitemap.xml": { ...PAGE, body: "<html>nope</html>" },
		});
		expect(out.status).toBe("fail");
	});

	it("fails when the sitemap lists only other hosts", async () => {
		const out = await run({
			"/sitemap.xml": xml(
				"<urlset><url><loc>https://other.example/</loc></url></urlset>",
			),
		});
		expect(out.status).toBe("fail");
		expect(out.message).toContain("lists no pages of this site");
	});

	it(`checks at most ${MAX_CHECKED} URLs, spread over the list`, async () => {
		const hits: string[] = [];
		const paths = Array.from({ length: 100 }, (_, i) => `/p${i}`);
		const routes: Record<string, Route> = { "/sitemap.xml": urlset(paths) };
		for (const p of paths) {
			routes[p] = { ...PAGE, onRequest: () => hits.push(p) };
		}
		const out = await run(routes);
		expect(out.status).toBe("pass");
		expect(hits).toHaveLength(MAX_CHECKED);
		expect(hits).toContain("/p0");
		expect(hits).toContain("/p99");
	});
});

describe("spread", () => {
	it("keeps short lists and picks evenly from long ones", () => {
		expect(spread([1, 2, 3], 5)).toEqual([1, 2, 3]);
		expect(spread([0, 1, 2, 3, 4, 5, 6, 7, 8], 3)).toEqual([0, 4, 8]);
	});
});

describe("sitemap time budget", () => {
	it("counts URLs cut off by the budget as not checked, not broken", async () => {
		const out = await runCheck(
			sitemapCheck(300),
			mockRoutes(ORIGIN, {
				"/": PAGE,
				"/sitemap.xml": urlset(["/", "/slow"]),
				"/slow": { ...PAGE, delayMs: 2000 },
			}),
			`${ORIGIN}/`,
		);
		expect(out.status).toBe("pass");
		expect(out.message).toBe(
			"Sitemap lists 2 URLs with <lastmod>; 1 of 2 URLs checked within 0.3 s, all answer 200",
		);
	});

	it("warns when no listed URL answers within the budget", async () => {
		const out = await runCheck(
			sitemapCheck(300),
			mockRoutes(ORIGIN, {
				"/": PAGE,
				"/sitemap.xml": urlset(["/slow"]),
				"/slow": { ...PAGE, delayMs: 2000 },
			}),
			`${ORIGIN}/`,
		);
		expect(out.status).toBe("warn");
		expect(out.message).toBe("Sitemap: no listed URL answered within 0.3 s");
	});
});
