import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
	type FixOptions,
	generateFixFiles,
	guardedFixOptions,
} from "../../src/fixes/generate.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";

const ORIGIN = "https://codeframe.pro";
const HOME = readFileSync(
	new URL("../fixtures/fixes/home.html", import.meta.url),
	"utf8",
);

function html(title: string, description = "", extraHead = ""): Route {
	return {
		status: 200,
		contentType: "text/html; charset=utf-8",
		body: `<!doctype html><html><head><title>${title}</title>${
			description ? `<meta name="description" content="${description}">` : ""
		}${extraHead}</head><body><h1>${title}</h1></body></html>`,
	};
}

function sitemap(paths: string[]): Route {
	return {
		status: 200,
		contentType: "application/xml",
		body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
			.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`)
			.join("")}</urlset>`,
	};
}

const ROBOTS: Route = {
	status: 200,
	contentType: "text/plain",
	body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n",
};

function site(overrides: Record<string, Route> = {}) {
	return mockRoutes(ORIGIN, {
		"/": { status: 200, contentType: "text/html", body: HOME },
		"/robots.txt": ROBOTS,
		"/sitemap.xml": sitemap(["/", "/editor", "/pricing", "/docs"]),
		"/editor": html("Editor | CodeFrame", "The editor."),
		"/pricing": html("Pricing | CodeFrame", "Plans and prices."),
		"/docs": html("Docs | CodeFrame"),
		...overrides,
	});
}

const BASE: FixOptions = { userAgent: "test-agent", toolVersion: "9.9.9" };

describe("generateFixFiles", () => {
	it("builds the requested files from the site", async () => {
		const progress: [number, number][] = [];
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["head", "robots", "llms"] },
			{
				...BASE,
				dispatcher: site(),
				onProgress: (read, planned) => progress.push([read, planned]),
			},
		);
		expect(out.files.map((f) => f.name)).toEqual([
			"robots.txt",
			"llms.txt",
			"head.html",
		]);
		expect(out.pagesRead).toBe(4);
		expect(out.pagesFailed).toBe(0);
		expect(out.skipped).toEqual([]);
		expect(out.toolVersion).toBe("9.9.9");
		expect(Number.isNaN(Date.parse(out.generatedAt))).toBe(false);
		expect(progress.at(-1)).toEqual([4, 4]);

		const robots = out.files[0];
		expect(robots?.target).toBe("Replace /robots.txt at the site root");
		expect(robots?.fixes).toEqual(["ai-bots-allowed", "content-signals"]);
		expect(robots?.content).toContain("User-agent: GPTBot # AgentCheck");
		expect(robots?.content).toContain("Disallow: /admin");

		const llms = out.files[1]?.content ?? "";
		expect(llms.startsWith("# CodeFrame\n")).toBe(true);
		expect(llms).toContain("(https://codeframe.pro/editor): The editor.");
		expect(llms).toContain(
			"(https://codeframe.pro/pricing): Plans and prices.",
		);
		expect(llms).toContain("(https://codeframe.pro/docs)");

		const head = out.files[2];
		expect(head?.target).toBe("Add inside <head> of https://codeframe.pro/");
		// The fixture page has og:title but no og:image, and a usable JSON-LD block.
		expect(head?.fixes).toEqual(["llms-txt-link", "opengraph"]);
		expect(head?.content).toContain(
			'<link rel="describedby" href="/llms.txt">',
		);
		expect(head?.content).toContain('property="og:description"');
		expect(head?.content).not.toContain("ld+json");
	});

	it("fetches only what the kinds need", async () => {
		const robots = vi.fn();
		const map = vi.fn();
		const page = vi.fn();
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["head"] },
			{
				...BASE,
				dispatcher: site({
					"/robots.txt": { ...ROBOTS, onRequest: robots },
					"/sitemap.xml": { ...sitemap(["/editor"]), onRequest: map },
					"/editor": { ...html("Editor"), onRequest: page },
				}),
			},
		);
		expect(out.files.map((f) => f.name)).toEqual(["head.html"]);
		expect(out.pagesRead).toBe(1);
		expect(robots).not.toHaveBeenCalled();
		expect(map).not.toHaveBeenCalled();
		expect(page).not.toHaveBeenCalled();
	});

	it("reads llms.txt pages from the root when the audited page is not the root", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/pricing`, kinds: ["llms", "head"] },
			{
				...BASE,
				dispatcher: site({
					"/pricing": html(
						"Pricing",
						"Plans and prices.",
						'<meta property="og:site_name" content="Pricing Site">',
					),
				}),
			},
		);
		const [llms, head] = out.files;
		expect(llms?.content.startsWith("# CodeFrame\n")).toBe(true);
		expect(head?.target).toBe(
			"Add inside <head> of https://codeframe.pro/pricing",
		);
		expect(head?.content).toContain(
			'<meta property="og:url" content="https://codeframe.pro/pricing">',
		);
		// Audited page, root and the two other pages, each read once.
		expect(out.pagesRead).toBe(4);
	});

	it("caps llms.txt at 30 pages", async () => {
		const paths = Array.from({ length: 50 }, (_, i) => `/p${i}`);
		const routes: Record<string, Route> = {
			"/": html("Home | CodeFrame", "Home page."),
			"/sitemap.xml": sitemap(paths),
		};
		for (const p of paths) routes[p] = html(`Page ${p}`, `About ${p}.`);
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["llms"] },
			{ ...BASE, dispatcher: mockRoutes(ORIGIN, routes) },
		);
		const llms = out.files[0]?.content ?? "";
		expect(llms.split("\n").filter((l) => l.startsWith("- ["))).toHaveLength(
			30,
		);
		expect(out.pagesRead).toBe(31);
	});

	it("builds llms-full.txt and the twin from the same reads", async () => {
		const hits: Record<string, number> = {};
		const counted = (path: string, route: Route): Route => ({
			...route,
			onRequest: () => {
				hits[path] = (hits[path] ?? 0) + 1;
			},
		});
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/pricing`, kinds: ["markdown", "llms-full", "llms"] },
			{
				...BASE,
				dispatcher: site({
					"/": counted("/", {
						status: 200,
						contentType: "text/html",
						body: HOME,
					}),
					"/editor": counted(
						"/editor",
						html("Editor | CodeFrame", "The editor."),
					),
					"/pricing": counted(
						"/pricing",
						html("Pricing | CodeFrame", "Plans."),
					),
					"/docs": counted("/docs", html("Docs | CodeFrame")),
				}),
			},
		);
		expect(out.files.map((f) => f.name)).toEqual([
			"llms.txt",
			"llms-full.txt",
			"pricing.md",
		]);
		expect(hits).toEqual({ "/": 1, "/editor": 1, "/pricing": 1, "/docs": 1 });
		expect(out.pagesRead).toBe(4);

		const full = out.files[1];
		expect(full?.kind).toBe("llms-full");
		const sources = [
			...(full?.content ?? "").matchAll(/^Source: (\S+)$/gm),
		].map((m) => m[1]);
		expect(sources).toEqual([
			`${ORIGIN}/`,
			`${ORIGIN}/editor`,
			`${ORIGIN}/pricing`,
			`${ORIGIN}/docs`,
		]);
		expect(full?.content).toContain("### Code screenshots");
		expect(full?.content).toContain("### Editor | CodeFrame");

		const twin = out.files[2];
		expect(twin?.kind).toBe("markdown");
		// The page's only content is an h1 equal to its title: dropped, so a TODO is left.
		expect(twin?.content).toBe(
			"# Pricing | CodeFrame\n\n<!-- TODO: add the text of /pricing -->\n",
		);
		expect(twin?.target).toContain('href="/pricing.md"');
	});

	it("llms-full alone reads the sitemap listed only in robots.txt", async () => {
		const robots = vi.fn();
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["llms-full"] },
			{
				...BASE,
				dispatcher: mockRoutes(ORIGIN, {
					"/": html("Home | CodeFrame", "Home page."),
					"/robots.txt": {
						status: 200,
						contentType: "text/plain",
						body: `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/maps/site.xml\n`,
						onRequest: robots,
					},
					"/maps/site.xml": sitemap(["/guide", "/faq"]),
					"/guide": html("Guide", "The guide."),
					"/faq": html("FAQ", "Questions."),
				}),
			},
		);
		expect(robots).toHaveBeenCalledTimes(1);
		expect(out.files.map((f) => f.name)).toEqual(["llms-full.txt"]);
		const content = out.files[0]?.content ?? "";
		expect(content).toContain(`Source: ${ORIGIN}/guide\n`);
		expect(content).toContain(`Source: ${ORIGIN}/faq\n`);
		expect(out.pagesRead).toBe(3);
	});

	it("llms-full alone still reads the pages", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["llms-full"] },
			{ ...BASE, dispatcher: site() },
		);
		expect(out.files.map((f) => f.name)).toEqual(["llms-full.txt"]);
		expect(out.pagesRead).toBe(4);
		const content = out.files[0]?.content ?? "";
		expect(content.startsWith("# CodeFrame\n")).toBe(true);
		for (const path of ["/", "/editor", "/pricing", "/docs"]) {
			expect(content).toContain(`Source: ${ORIGIN}${path}\n`);
		}
	});

	it("the twin alone reads only the audited page", async () => {
		const page = vi.fn();
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["markdown"] },
			{
				...BASE,
				dispatcher: site({ "/editor": { ...html("Editor"), onRequest: page } }),
			},
		);
		expect(out.files.map((f) => f.name)).toEqual(["index.md"]);
		expect(out.files[0]?.content).toBe(
			"# CodeFrame - code screenshots\n\n## Code screenshots\n",
		);
		expect(out.pagesRead).toBe(1);
		expect(page).not.toHaveBeenCalled();
	});

	it("skips llms-full.txt when the homepage cannot be read", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/pricing`, kinds: ["llms", "llms-full"] },
			{ ...BASE, dispatcher: site({ "/": { status: 500, body: "x" } }) },
		);
		expect(out.files).toEqual([]);
		expect(out.skipped).toEqual([
			{
				kind: "llms",
				reason: "the homepage could not be read (HTTP 500)",
				error: true,
			},
			{
				kind: "llms-full",
				reason: "the homepage could not be read (HTTP 500)",
				error: true,
			},
		]);
	});

	it("stops at the budget and still returns files", async () => {
		const paths = Array.from({ length: 12 }, (_, i) => `/slow${i}`);
		const routes: Record<string, Route> = {
			"/": html("Home | CodeFrame", "Home page."),
			"/sitemap.xml": sitemap(paths),
		};
		for (const p of paths) {
			routes[p] = { ...html(`Slow ${p}`, "Slow."), delayMs: 200 };
		}
		let planned = 0;
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["llms"] },
			{
				...BASE,
				dispatcher: mockRoutes(ORIGIN, routes),
				budgetMs: 300,
				onProgress: (_read, total) => {
					planned = total;
				},
			},
		);
		expect(out.files.map((f) => f.name)).toEqual(["llms.txt"]);
		expect(planned).toBe(13);
		expect(out.pagesRead).toBeGreaterThan(1);
		expect(out.pagesRead).toBeLessThan(planned);
	});

	it("skips robots.txt when it cannot be read", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["robots", "head"] },
			{
				...BASE,
				dispatcher: site({ "/robots.txt": { status: 503, body: "down" } }),
			},
		);
		expect(out.files.map((f) => f.name)).toEqual(["head.html"]);
		expect(out.skipped).toEqual([
			{
				kind: "robots",
				reason: "robots.txt could not be read (HTTP 503)",
				error: true,
			},
		]);
	});

	it("skips a robots.txt cut at the size cap instead of replacing it", async () => {
		const huge = `User-agent: GPTBot\nDisallow: /\n${"# filler\n".repeat(130_000)}`;
		expect(huge.length).toBeGreaterThan(1_048_576);
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["robots"] },
			{
				...BASE,
				dispatcher: site({
					"/robots.txt": {
						status: 200,
						contentType: "text/plain",
						body: huge,
					},
				}),
			},
		);
		expect(out.files).toEqual([]);
		expect(out.skipped).toEqual([
			{
				kind: "robots",
				reason: "robots.txt could not be read (larger than 1 MB)",
				error: true,
			},
		]);
	});

	it("reads menu links against the homepage's final URL when the root redirects", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/pricing`, kinds: ["llms"] },
			{
				...BASE,
				dispatcher: site({
					"/": { status: 301, headers: { location: "/en/" } },
					"/en/": {
						status: 200,
						contentType: "text/html",
						body: '<html><head><title>CodeFrame | Home</title><meta name="description" content="Home."></head><body><nav><a href="editor">Editor</a></nav></body></html>',
					},
					"/en/editor": html("Editor EN", "The English editor."),
					"/sitemap.xml": sitemap([]),
				}),
			},
		);
		expect(out.files[0]?.content).toContain(
			"## Main pages\n\n- [Editor EN](https://codeframe.pro/en/editor): The English editor.",
		);
	});

	it("keeps menu links when the root redirects to another host", async () => {
		const agent = site({
			"/": { status: 301, headers: { location: "https://www.codeframe.pro/" } },
			"/sitemap.xml": sitemap([]),
		});
		mockRoutes(
			"https://www.codeframe.pro",
			{
				"/": {
					status: 200,
					contentType: "text/html",
					body: '<html><head><title>CodeFrame | Home</title></head><body><nav><a href="/docs">Docs</a></nav></body></html>',
				},
				"/docs": html("Docs page", "All the docs."),
				"/sitemap.xml": sitemap([]),
			},
			agent,
		);
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/pricing`, kinds: ["llms"] },
			{ ...BASE, dispatcher: agent },
		);
		expect(out.files[0]?.content).toContain(
			"- [Docs page](https://www.codeframe.pro/docs): All the docs.",
		);
	});

	it("offers a minimal robots.txt when the site has none", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["robots"] },
			{
				...BASE,
				dispatcher: site({ "/robots.txt": { status: 404, body: "" } }),
			},
		);
		const robots = out.files[0];
		expect(robots?.target).toBe("New file at /robots.txt");
		expect(robots?.content).toContain(
			"User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n",
		);
		expect(robots?.content).toContain(
			"Sitemap: https://codeframe.pro/sitemap.xml",
		);
	});

	it("follows the robots.txt Sitemap line and a sitemap index one level", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["llms"] },
			{
				...BASE,
				dispatcher: site({
					"/robots.txt": {
						status: 200,
						contentType: "text/plain",
						body: "User-agent: *\nAllow: /\nSitemap: /maps/index.xml\n",
					},
					"/maps/index.xml": {
						status: 200,
						contentType: "application/xml",
						body: readFileSync(
							new URL("../fixtures/fixes/sitemap-index.xml", import.meta.url),
							"utf8",
						),
					},
					"/sitemap-pages.xml": sitemap(["/docs"]),
				}),
			},
		);
		expect(out.files[0]?.content).toContain("(https://codeframe.pro/docs)");
	});

	it("ignores Sitemap lines on another host and falls back to /sitemap.xml", async () => {
		const offHost = vi.fn();
		const agent = site({
			"/robots.txt": {
				status: 200,
				contentType: "text/plain",
				body: "User-agent: *\nAllow: /\nSitemap: https://evil.example/huge.xml\n",
			},
		});
		mockRoutes(
			"https://evil.example",
			{ "/huge.xml": { ...sitemap(["/x"]), onRequest: offHost } },
			agent,
		);
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["llms"] },
			{ ...BASE, dispatcher: agent },
		);
		expect(offHost).not.toHaveBeenCalled();
		// /docs is only in /sitemap.xml, so the fallback was read.
		expect(out.files[0]?.content).toContain("(https://codeframe.pro/docs)");
	});

	it("leaves out a page that redirects to another host", async () => {
		const agent = site({
			"/docs": {
				status: 301,
				headers: { location: "https://other.example/docs" },
			},
		});
		mockRoutes("https://other.example", { "/docs": html("Elsewhere") }, agent);
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["llms"] },
			{ ...BASE, dispatcher: agent },
		);
		expect(out.pagesRead).toBe(3);
		expect(out.pagesFailed).toBe(1);
		expect(out.files[0]?.content).not.toContain("other.example");
		expect(out.files[0]?.content).not.toContain("Elsewhere");
	});

	it("skips robots.txt when it already allows the AI crawlers and declares signals", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["robots"] },
			{
				...BASE,
				dispatcher: site({
					"/robots.txt": {
						status: 200,
						contentType: "text/plain",
						body: "User-agent: *\nContent-Signal: search=yes\nDisallow: /admin\n",
					},
				}),
			},
		);
		expect(out.files).toEqual([]);
		expect(out.skipped).toEqual([
			{
				kind: "robots",
				reason:
					"robots.txt already allows the AI crawlers on / and declares content signals",
			},
		]);
	});

	it("adds only the content signal when the AI crawlers are already allowed", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["robots"] },
			{
				...BASE,
				dispatcher: site({
					"/robots.txt": {
						status: 200,
						contentType: "text/plain",
						body: "User-agent: *\nDisallow: /admin\n",
					},
				}),
			},
		);
		expect(out.files[0]?.fixes).toEqual(["content-signals"]);
		expect(out.files[0]?.content).toContain(
			"User-agent: *\nDisallow: /admin\nContent-Signal: search=yes, ai-input=yes, ai-train=no # AgentCheck: declare content signals\n",
		);
	});

	it("skips head.html when the page has its og tags and usable JSON-LD", async () => {
		const complete = html(
			"Complete",
			"Done.",
			[
				'<meta property="og:title" content="T">',
				'<meta property="og:description" content="D">',
				'<meta property="og:image" content="https://codeframe.pro/i.png">',
				'<meta property="og:url" content="https://codeframe.pro/complete">',
				'<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"C"}</script>',
				'<link rel="describedby" href="/llms.txt">',
			].join(""),
		);
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/complete`, kinds: ["head"] },
			{ ...BASE, dispatcher: site({ "/complete": complete }) },
		);
		expect(out.files).toEqual([]);
		expect(out.skipped).toEqual([
			{
				kind: "head",
				reason:
					"the page already has its OpenGraph tags, usable JSON-LD and every link head.html would add",
			},
		]);
	});

	it("links an existing but unadvertised markdown version in head.html", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/pricing`, kinds: ["head"] },
			{
				...BASE,
				dispatcher: site({
					"/pricing.md": {
						status: 200,
						contentType: "text/markdown",
						body: "# Pricing\n",
					},
				}),
			},
		);
		const head = out.files[0];
		expect(head?.fixes).toContain("markdown-twin");
		expect(head?.content).toContain(
			'<link rel="alternate" type="text/markdown" href="/pricing.md">',
		);
	});

	it("counts non-HTML pages as failed", async () => {
		const out = await generateFixFiles(
			{ url: `${ORIGIN}/`, kinds: ["llms"] },
			{
				...BASE,
				dispatcher: site({
					"/docs": {
						status: 200,
						contentType: "application/pdf",
						body: "%PDF",
					},
				}),
			},
		);
		expect(out.pagesRead).toBe(3);
		expect(out.pagesFailed).toBe(1);
		expect(out.files[0]?.content).not.toContain("/docs");
	});

	it("fails when the audited page cannot be read", async () => {
		await expect(
			generateFixFiles(
				{ url: `${ORIGIN}/gone`, kinds: ["head"] },
				{ ...BASE, dispatcher: site() },
			),
		).rejects.toThrow("HTTP 404");
	});

	it("refuses a custom dispatcher with blockPrivate", async () => {
		await expect(
			generateFixFiles(
				{ url: `${ORIGIN}/`, kinds: ["head"] },
				{ ...BASE, network: { blockPrivate: true }, dispatcher: site() },
			),
		).rejects.toThrow("blockPrivate");
	});

	it("guardedFixOptions turns the guard on", () => {
		const opts = guardedFixOptions({ userAgent: "ua", toolVersion: "1.0.0" });
		expect(Object.keys(opts).sort()).toEqual([
			"network",
			"toolVersion",
			"userAgent",
		]);
		expect(opts.network).toEqual({ blockPrivate: true });
	});
});
