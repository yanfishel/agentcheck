import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pagination, pageHref } from "@/components/ui";

describe("pageHref", () => {
	it("keeps the list's query and leaves page 1 out", () => {
		expect(pageHref("/admin/audits", { status: "done" }, 3)).toBe(
			"/admin/audits?status=done&page=3",
		);
		expect(pageHref("/admin/audits", { status: "done" }, 1)).toBe(
			"/admin/audits?status=done",
		);
		expect(pageHref("/history", { status: undefined }, 1)).toBe("/history");
	});
});

describe("Pagination", () => {
	it("renders nothing for a single page", () => {
		expect(
			renderToStaticMarkup(<Pagination page={1} pages={1} path="/history" />),
		).toBe("");
	});

	it("links both ways in the middle", () => {
		const html = renderToStaticMarkup(
			<Pagination
				page={2}
				pages={7}
				path="/admin/audits"
				query={{ status: "failed" }}
			/>,
		);
		expect(html).toContain('aria-label="Pagination"');
		expect(html).toContain(">Page 2 of 7<");
		expect(html).toContain('href="/admin/audits?status=failed"');
		expect(html).toContain('href="/admin/audits?status=failed&amp;page=3"');
		expect(html).toContain('rel="prev"');
		expect(html).toContain('rel="next"');
		expect(html).not.toContain("aria-disabled");
	});

	it("links to the first and last page from three pages on", () => {
		const html = renderToStaticMarkup(
			<Pagination page={3} pages={7} path="/history" />,
		);
		expect(html).toMatch(/<a aria-label="First page"[^>]*href="\/history"/);
		expect(html).toContain('href="/history?page=7"');
		expect(html).toMatch(
			/<a aria-label="Last page"[^>]*href="\/history\?page=7"/,
		);
		const two = renderToStaticMarkup(
			<Pagination page={1} pages={2} path="/history" />,
		);
		expect(two).not.toContain("First page");
		expect(two).not.toContain("Last page");
	});

	it("disables First and Previous on the first page, Next and Last on the last", () => {
		const first = renderToStaticMarkup(
			<Pagination page={1} pages={3} path="/history" />,
		);
		expect(first).not.toContain('rel="prev"');
		expect(first).toContain('href="/history?page=2"');
		expect(first).toContain('href="/history?page=3"');
		expect(first.match(/aria-disabled="true"/g)).toHaveLength(2);
		const last = renderToStaticMarkup(
			<Pagination page={3} pages={3} path="/history" />,
		);
		expect(last).not.toContain('rel="next"');
		expect(last).toContain('href="/history?page=2"');
		expect(last).toContain('href="/history"');
		expect(last.match(/aria-disabled="true"/g)).toHaveLength(2);
	});
});
