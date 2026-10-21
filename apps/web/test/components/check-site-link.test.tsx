import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckSiteLink } from "@/components/check-site-link";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

describe("CheckSiteLink", () => {
	beforeEach(() => {
		navigation.pathname = "/";
	});

	it("is absent on the landing, whose hero holds the form", () => {
		expect(renderToStaticMarkup(<CheckSiteLink className="x" />)).toBe("");
	});

	it("leads to the start form from any other page", () => {
		navigation.pathname = "/audits/abc";
		const html = renderToStaticMarkup(<CheckSiteLink className="x" />);
		expect(html).toContain('href="/#start"');
		// The label stays for screen readers when a phone shows only the icon.
		expect(html).toContain(
			'<span class="sr-only sm:not-sr-only">Check a site</span>',
		);
	});
});
