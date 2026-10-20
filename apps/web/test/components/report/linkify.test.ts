import { describe, expect, it } from "vitest";
import { linkify } from "@/components/report/linkify";

describe("linkify", () => {
	it("links a bare domain and leaves the sentence punctuation", () => {
		expect(linkify("link lists to your key pages (see llmstxt.org).")).toEqual([
			"link lists to your key pages (see ",
			{ text: "llmstxt.org", href: "https://llmstxt.org" },
			").",
		]);
	});

	it("links full URLs to themselves", () => {
		expect(linkify("https://codeframe.pro/index.md: served as HTML")).toEqual([
			{
				text: "https://codeframe.pro/index.md",
				href: "https://codeframe.pro/index.md",
			},
			": served as HTML",
		]);
	});

	it("keeps paths, file names and e-mail addresses as text", () => {
		for (const text of [
			"Publish /llms.txt as plain text",
			"robots.txt blocks GPTBot",
			"Serve index.md next to the page",
			"Write to a@b.org",
			"follow the llmstxt.org format",
		]) {
			const parts = linkify(text);
			const links = parts.filter((part) => typeof part !== "string");
			if (text.includes("llmstxt.org")) {
				expect(links).toEqual([
					{ text: "llmstxt.org", href: "https://llmstxt.org" },
				]);
			} else {
				expect(parts).toEqual([text]);
			}
		}
	});

	it("links a host with a country domain", () => {
		expect(linkify("NEWS.SamplePortal.co.uk :: Politics")[0]).toEqual({
			text: "NEWS.SamplePortal.co.uk",
			href: "https://NEWS.SamplePortal.co.uk",
		});
	});
});
