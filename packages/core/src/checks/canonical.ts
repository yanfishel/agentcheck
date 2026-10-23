import { pageLinks } from "../links.ts";
import type { Check } from "../types.ts";

function withoutHash(url: URL): string {
	const copy = new URL(url);
	copy.hash = "";
	return copy.href;
}

export const canonical: Check = {
	id: "canonical",
	category: "content-semantics",
	title: "Canonical URL",
	weight: 10,
	async run(ctx) {
		const hrefs = ctx
			.$("link[href]")
			.filter((_, el) =>
				(ctx.$(el).attr("rel") ?? "")
					.toLowerCase()
					.split(/\s+/)
					.includes("canonical"),
			)
			.map((_, el) => ctx.$(el).attr("href") ?? "")
			.get();
		const header = pageLinks(ctx.$, ctx.page.headers, ctx.targetUrl).filter(
			(l) => l.from === "header" && l.rels.includes("canonical"),
		);
		if (hrefs.length === 0 && header.length === 0) {
			return {
				status: "fail",
				message: "No canonical URL on the page",
				remediation: `Add <link rel="canonical" href="${ctx.targetUrl.href}"> inside <head> (the page's preferred URL).`,
			};
		}

		const urls = new Set<string>();
		for (const href of hrefs) {
			try {
				urls.add(withoutHash(new URL(href.trim(), ctx.targetUrl)));
			} catch {
				return {
					status: "warn",
					message: `The canonical link is not a valid URL: ${href.slice(0, 200)}`,
					remediation:
						'Give <link rel="canonical"> an absolute http(s) URL of the page.',
				};
			}
		}
		for (const link of header) urls.add(withoutHash(link.href));
		if (urls.size > 1) {
			return {
				status: "warn",
				message: "The page names more than one canonical URL",
				details: [...urls],
				remediation: "Keep a single canonical URL for the page.",
			};
		}

		const url = new URL([...urls][0] as string);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return {
				status: "warn",
				message: `The canonical URL is not http(s): ${url.href}`,
				remediation: "Point the canonical link at the page's http(s) URL.",
			};
		}
		if (url.hostname !== ctx.targetUrl.hostname) {
			return {
				status: "warn",
				message: `The canonical URL points to another host: ${url.href}`,
				remediation:
					"Point the canonical link at this site, unless the content really lives elsewhere.",
			};
		}
		if (url.href !== withoutHash(ctx.targetUrl)) {
			const res = await ctx.get(url.href);
			if (res.kind === "error" || res.status !== 200) {
				return {
					status: "warn",
					message: `The canonical URL ${url.href} ${res.kind === "error" ? `could not be fetched (${res.error})` : `answers HTTP ${res.status}`}`,
					remediation: "Point the canonical link at a URL that answers 200.",
				};
			}
		}
		return { status: "pass", message: `Canonical URL: ${url.href}` };
	},
};
