import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListSearch, SEARCH_MAX } from "@/components/ui";

describe("ListSearch", () => {
	it("is a GET form to the list that keeps the filter and clears to it", () => {
		const html = renderToStaticMarkup(
			<ListSearch
				path="/admin/audits"
				q="shop"
				query={{ status: "failed", other: undefined }}
				placeholder="Search URL or email"
				label="Search audits"
			/>,
		);
		expect(html).toContain("<search");
		expect(html).toContain('action="/admin/audits"');
		expect(html).toContain('method="get"');
		expect(html).toContain('type="hidden" name="status" value="failed"');
		expect(html).not.toContain('name="other"');
		expect(html).toContain('name="q"');
		expect(html).toContain('value="shop"');
		expect(html).toContain(`maxLength="${SEARCH_MAX}"`);
		expect(html).toContain('aria-label="Search audits"');
		expect(html).toMatch(
			/<a aria-label="Clear search"[^>]*href="\/admin\/audits\?status=failed"/,
		);
	});

	it("has no Clear without a search", () => {
		const html = renderToStaticMarkup(
			<ListSearch
				path="/admin"
				placeholder="Search email"
				label="Search users"
			/>,
		);
		expect(html).not.toContain("Clear search");
		expect(html).not.toContain('type="hidden"');
	});
});
