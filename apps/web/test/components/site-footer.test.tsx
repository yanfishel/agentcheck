import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";
import { LEGAL } from "@/content/legal";

describe("SiteFooter", () => {
	it("links the legal pages, the source, npm, the author and the contact", () => {
		const html = renderToStaticMarkup(<SiteFooter />);
		for (const href of [
			"/privacy",
			"/terms",
			LEGAL.repo,
			"https://www.npmjs.com/package/agentcheck-dev",
			"https://fishart.co.il",
			`mailto:${LEGAL.email}`,
		]) {
			expect(html).toContain(`href="${href}`);
		}
	});

	it("links the landing's sections, each to an id the landing has", () => {
		const html = renderToStaticMarkup(<SiteFooter />);
		const landing = [
			"how-it-works",
			"categories",
			"cli-block",
			"badge-block",
			"faq",
		]
			.map((name) =>
				readFileSync(
					fileURLToPath(
						new URL(
							`../../src/components/landing/${name}.tsx`,
							import.meta.url,
						),
					),
					"utf8",
				),
			)
			.join("\n");
		for (const id of ["how", "guide", "cli", "badge", "faq"]) {
			expect(html).toContain(`href="/#${id}"`);
			expect(landing).toContain(`id="${id}"`);
		}
	});

	it("is rendered once, by the root layout, so every page has it", () => {
		const layout = readFileSync(
			fileURLToPath(new URL("../../src/app/layout.tsx", import.meta.url)),
			"utf8",
		);
		expect(layout).toContain("<SiteFooter />");
	});
});
