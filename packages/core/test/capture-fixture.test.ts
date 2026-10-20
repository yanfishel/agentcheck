import { describe, expect, it } from "vitest";
import {
	fileNameFor,
	findMarkdownAlternates,
	findPrivateData,
	sanitize,
} from "../scripts/capture-fixture.ts";

const BASE = "https://example.com/";

describe("findMarkdownAlternates", () => {
	it("finds links in either attribute order and quote style", () => {
		const html = `<head>
			<link rel="alternate" type="text/markdown" href="/llms.txt" title="x">
			<link href='/a.md' type='text/markdown' rel='alternate'/>
			<LINK REL=alternate TYPE=text/markdown HREF=/b.md>
			<link rel="alternate" type="text/markdown" href="https://example.com/c.md?x=1">
		</head>`;
		expect(findMarkdownAlternates(html, BASE)).toEqual([
			"/llms.txt",
			"/a.md",
			"/b.md",
			"/c.md?x=1",
		]);
	});

	it("ignores other alternates, other rels and other origins", () => {
		const html = `
			<link rel="alternate" type="application/rss+xml" href="/feed.xml">
			<link rel="stylesheet" type="text/markdown" href="/s.md">
			<link rel="alternate" type="text/markdown" href="https://other.com/x.md">
			<link rel="alternate" type="text/markdown">`;
		expect(findMarkdownAlternates(html, BASE)).toEqual([]);
	});
});

describe("fileNameFor", () => {
	it("maps paths to flat file names", () => {
		expect(fileNameFor("/")).toBe("index.html");
		expect(fileNameFor("/docs/page.md")).toBe("docs__page.md");
	});
});

describe("privacy guard", () => {
	it("replaces emails and international phone numbers with placeholders", () => {
		const text = "Call +12-345-6789012 or mail jane.doe@mail.test";
		expect(sanitize(text)).toBe(
			"Call +000-00-0000000 or mail owner@example.com",
		);
		expect(findPrivateData(sanitize(text))).toEqual([]);
	});

	it("keeps allowlisted addresses and digit runs without a plus", () => {
		const text =
			'team@example.org +000-00-0000000 <path d="M12 345 678 901 2">';
		expect(sanitize(text)).toBe(text);
	});

	it("flags emails and phone-like numbers outside the allowlist", () => {
		expect(
			findPrivateData(
				"x@real.org +49 170 1234567 owner@example.com +000-00-0000000",
			),
		).toEqual(["x@real.org", "+49 170 1234567"]);
	});
});
