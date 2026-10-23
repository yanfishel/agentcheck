import { isTextResource } from "../http.ts";
import { isLlmsTxtLink, pageLinks } from "../links.ts";
import type { Check } from "../types.ts";

export const llmsTxtLink: Check = {
	id: "llms-txt-link",
	category: "ai-manifests",
	title: "Page links to llms.txt",
	weight: 10,
	async run(ctx) {
		// Without an llms.txt there is nothing to link to; llms-txt already fails.
		if (!isTextResource(await ctx.get("/llms.txt"))) {
			return { status: "skip", message: "No llms.txt to link to" };
		}
		const { origin } = ctx.targetUrl;
		const link = pageLinks(ctx.$, ctx.page.headers, ctx.targetUrl).find((l) =>
			isLlmsTxtLink(l, origin),
		);
		if (link) {
			return {
				status: "pass",
				message: `The page links to /llms.txt (rel="describedby" ${link.from === "tag" ? "link tag" : "Link header"})`,
			};
		}
		return {
			status: "fail",
			message: "The page does not link to /llms.txt",
			remediation:
				'Add <link rel="describedby" href="/llms.txt"> inside <head> (or a Link: </llms.txt>; rel="describedby" header).',
		};
	},
};
