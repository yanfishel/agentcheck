import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { menuLinks, pageMeta, sitemapUrls } from "../../src/fixes/extract.ts";

const fixture = (name: string) =>
	readFileSync(new URL(`../fixtures/fixes/${name}`, import.meta.url), "utf8");
const base = new URL("https://codeframe.pro/");

describe("fix extractors", () => {
	it("reads title, description, site name, og and logo", () => {
		const meta = pageMeta(load(fixture("home.html")), base);
		expect(meta.title).toBe("CodeFrame | Code screenshots");
		expect(meta.siteName).toBe("CodeFrame");
		expect(meta.description).toBe("Turn code into beautiful screenshots.");
		expect(meta.og["og:title"]).toBe("CodeFrame - code screenshots");
		expect(meta.logo).toBe("https://codeframe.pro/logo.png");
		expect(meta.canonical).toBe("https://codeframe.pro/");
		expect(meta.h1).toBe("Code screenshots");
		expect(meta.jsonLd).toMatchObject({ present: true, usable: true });
	});

	it("keeps only same-host http(s) links, normalised", () => {
		const links = menuLinks(load(fixture("home.html")), base);
		expect(links.map((u) => u.href)).toEqual([
			"https://codeframe.pro/editor",
			"https://codeframe.pro/pricing",
		]);
	});

	it("reads menu links from header, nav and [role=navigation] in document order", () => {
		const html = `<html><body>
<div role="navigation"><a href="/first">First</a></div>
<header><a href="/second">Second</a></header>
<ul role="navigation"><li><a href="/third">Third</a></li><li><a href="/second">Again</a></li></ul>
<nav><a href="/fourth">Fourth</a></nav>
<main><a href="/not-menu">Body link</a></main>
</body></html>`;
		expect(menuLinks(load(html), base).map((u) => u.pathname)).toEqual([
			"/first",
			"/second",
			"/third",
			"/fourth",
		]);
	});

	it("reads a sitemap and a sitemap index", () => {
		const map = sitemapUrls(fixture("sitemap.xml"), base);
		expect(map.pages.map((u) => u.href)).toEqual([
			"https://codeframe.pro/",
			"https://codeframe.pro/editor",
			"https://codeframe.pro/pricing",
		]);
		expect(map.sitemaps).toEqual([]);
		const index = sitemapUrls(fixture("sitemap-index.xml"), base);
		expect(index.pages).toEqual([]);
		expect(index.sitemaps.map((u) => u.href)).toEqual([
			"https://codeframe.pro/sitemap-pages.xml",
		]);
	});

	it("falls back to the title before the first separator for the site name", () => {
		const html =
			"<html><head><title>CodeFrame | Code screenshots</title></head><body></body></html>";
		expect(pageMeta(load(html), base).siteName).toBe("CodeFrame");
	});

	it("falls back to the host without a separator", () => {
		const html = "<html><head><title>Hello</title></head></html>";
		const meta = pageMeta(load(html), base);
		expect(meta.siteName).toBe("codeframe.pro");
		expect(meta.siteNameFromPage).toBe(false);
	});

	it("marks a site name taken from the page", () => {
		expect(pageMeta(load(fixture("home.html")), base).siteNameFromPage).toBe(
			true,
		);
		const titled =
			"<html><head><title>CodeFrame | Code screenshots</title></head></html>";
		expect(pageMeta(load(titled), base).siteNameFromPage).toBe(true);
	});

	it("takes a header image as the logo only when its alt or file name says logo", () => {
		const plain =
			'<html><body><header><img alt="Team photo" src="/team.jpg"></header></body></html>';
		expect(pageMeta(load(plain), base).logo).toBe("");
		const byAlt =
			'<html><body><header><img alt="Team photo" src="/team.jpg"><img alt="Site LOGO" src="/brand.svg"></header></body></html>';
		expect(pageMeta(load(byAlt), base).logo).toBe(
			"https://codeframe.pro/brand.svg",
		);
		const byFile =
			'<html><body><header><img alt="" src="/img/Main-Logo.png"></header></body></html>';
		expect(pageMeta(load(byFile), base).logo).toBe(
			"https://codeframe.pro/img/Main-Logo.png",
		);
		const outside =
			'<html><body><main><img alt="logo" src="/logo.png"></main></body></html>';
		expect(pageMeta(load(outside), base).logo).toBe("");
	});
});
