import type { AuditResult } from "@agentcheck/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { headline } from "@/components/report/headline";
import { PagesSection, WaitingPages } from "@/components/report/pages-section";

type Crawl = NonNullable<AuditResult["crawl"]>;

const crawl: Crawl = {
	score: 70,
	grade: "C",
	pages: [
		{
			url: "https://example.com/",
			status: "audited",
			score: 80,
			grade: "B",
			problems: [],
		},
		{
			url: "https://example.com/docs?x=1",
			status: "audited",
			score: 60,
			grade: "D",
			problems: [
				{
					id: "canonical",
					title: "Canonical URL",
					status: "fail",
					message: "No canonical",
				},
			],
		},
		{ url: "https://example.com/gone", status: "failed", error: "HTTP 404" },
		{
			url: "https://example.com/slow",
			status: "skipped",
			reason: "Not checked within 40 s",
		},
	],
	issues: [{ id: "canonical", title: "Canonical URL", fail: 1, warn: 0 }],
};

describe("PagesSection", () => {
	const html = renderToStaticMarkup(
		<PagesSection crawl={crawl} pageScore={80} heading="h2" />,
	);

	it("leads with the site score and names the page's own", () => {
		expect(html).toContain("Site score: the average of 2 pages; this page 80");
		expect(html).toContain("70/100");
	});

	it("counts the problems across the audited pages", () => {
		expect(html).toContain("Canonical URL");
		expect(html).toContain("fail on 1 of 2 pages");
	});

	it("lists each page by its path, with failures and skips explained", () => {
		expect(html).toContain('href="https://example.com/docs?x=1"');
		expect(html).toContain(">/docs?x=1<");
		expect(html).toContain("60/100");
		expect(html).toContain("HTTP 404");
		expect(html).toContain("Not checked within 40 s");
	});

	it("has a waiting row while a full check runs", () => {
		const waiting = renderToStaticMarkup(<WaitingPages heading="h2" />);
		expect(waiting).toContain("Checking other pages of the site");
		expect(waiting).toContain('aria-busy="true"');
	});
});

describe("headline", () => {
	const base = {
		score: 80,
		grade: "B",
	} as unknown as AuditResult;

	it("is the page's score without a crawl and the site's with one", () => {
		expect(headline(base)).toEqual({ score: 80, grade: "B", pages: null });
		expect(headline({ ...base, crawl })).toEqual({
			score: 70,
			grade: "C",
			pages: 2,
		});
	});
});
