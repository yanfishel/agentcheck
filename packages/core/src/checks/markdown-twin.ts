import { type HttpResult, isTextResource } from "../http.ts";
import type { AuditContext, Check, CheckOutcome } from "../types.ts";

/** Same-origin candidate URLs: advertised alternates first, then the `.md` convention. */
function candidates(ctx: AuditContext): URL[] {
	const { targetUrl } = ctx;
	const urls: URL[] = [];
	ctx.$("link[href][type]").each((_, el) => {
		const rels = (ctx.$(el).attr("rel") ?? "").toLowerCase().split(/\s+/);
		const type = (ctx.$(el).attr("type") ?? "")
			.split(";")[0]
			?.trim()
			.toLowerCase();
		if (!rels.includes("alternate") || type !== "text/markdown") return;
		try {
			urls.push(new URL(ctx.$(el).attr("href") ?? "", targetUrl));
		} catch {
			// Ignore hrefs that are not valid URLs.
		}
	});

	const path = targetUrl.pathname.replace(/\/+$/, "");
	urls.push(new URL(`${path === "" ? "/index" : path}.md`, targetUrl.origin));

	const seen = new Set<string>();
	return urls.filter((url) => {
		url.hash = "";
		if (url.origin !== targetUrl.origin || seen.has(url.href)) return false;
		seen.add(url.href);
		return true;
	});
}

function describeProblem(res: HttpResult): string {
	if (res.kind === "error") return `could not be fetched (${res.error})`;
	if (res.status !== 200) return `HTTP ${res.status}`;
	if (res.body.trim() === "") return "empty";
	return "served as HTML";
}

export const markdownTwin: Check = {
	id: "markdown-twin",
	category: "ai-manifests",
	title: "Markdown version of the page",
	weight: 20,
	async run(ctx): Promise<CheckOutcome> {
		const details: string[] = [];
		for (const url of candidates(ctx)) {
			const res = await ctx.get(url.href);
			if (isTextResource(res)) {
				return {
					status: "pass",
					message: `Markdown version available at ${url.href}`,
				};
			}
			details.push(`${url.href}: ${describeProblem(res)}`);
		}
		return {
			status: "fail",
			message: "No markdown version of this page found",
			details,
			remediation:
				'Serve a markdown version of the page (e.g. <page>.md) and advertise it with <link rel="alternate" type="text/markdown">.',
		};
	},
};
