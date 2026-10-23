import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
	isLlmsTxtLink,
	isMarkdownAlternate,
	pageLinks,
	parseLinkHeader,
} from "../src/links.ts";

const BASE = new URL("https://example.com/docs/page");

describe("parseLinkHeader", () => {
	it("reads several entries with quoted and bare parameters", () => {
		const links = parseLinkHeader(
			'</docs/page.md>; rel="alternate"; type="text/markdown; charset=utf-8", <https://example.com/llms.txt>; rel=describedby',
			BASE,
		);
		expect(links.map((l) => [l.href.href, l.rels, l.type, l.from])).toEqual([
			[
				"https://example.com/docs/page.md",
				["alternate"],
				"text/markdown",
				"header",
			],
			["https://example.com/llms.txt", ["describedby"], "", "header"],
		]);
	});

	it("keeps a comma inside the URL and splits multi-token rels", () => {
		const [link] = parseLinkHeader('</a,b.md>; REL="Alternate Me"', BASE);
		expect(link?.href.pathname).toBe("/a,b.md");
		expect(link?.rels).toEqual(["alternate", "me"]);
	});

	it("returns nothing for an empty or missing header", () => {
		expect(parseLinkHeader(null, BASE)).toEqual([]);
		expect(parseLinkHeader("garbage", BASE)).toEqual([]);
	});
});

describe("pageLinks", () => {
	it("lists tags before header entries and the predicates match them", () => {
		const $ = load(
			'<link rel="alternate" type="text/markdown" href="page.md"><link rel="stylesheet" href="/s.css">',
		);
		const links = pageLinks(
			$,
			new Headers({ link: '</llms.txt>; rel="describedby"' }),
			BASE,
		);
		expect(links.map((l) => l.from)).toEqual(["tag", "tag", "header"]);
		expect(links.filter(isMarkdownAlternate).map((l) => l.href.href)).toEqual([
			"https://example.com/docs/page.md",
		]);
		expect(links.some((l) => isLlmsTxtLink(l, BASE.origin))).toBe(true);
	});
});
