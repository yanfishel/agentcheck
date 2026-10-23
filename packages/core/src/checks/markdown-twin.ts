import { type HttpResult, isTextResource } from "../http.ts";
import { isMarkdownAlternate, pageLinks } from "../links.ts";
import type { AuditContext, Check, CheckOutcome } from "../types.ts";
import { negotiatedMarkdown } from "./markdown-negotiation.ts";

/** Same-origin markdown alternates from `<link>` tags and the `Link` header. */
function advertised(ctx: AuditContext): URL[] {
	const { targetUrl } = ctx;
	const seen = new Set<string>();
	return pageLinks(ctx.$, ctx.page.headers, targetUrl)
		.filter(isMarkdownAlternate)
		.map((link) => link.href)
		.filter((url) => {
			if (url.origin !== targetUrl.origin || seen.has(url.href)) return false;
			seen.add(url.href);
			return true;
		});
}

/** The `<page>.md` convention: `/index.md` for the root. */
function conventional(targetUrl: URL): URL {
	const path = targetUrl.pathname.replace(/\/+$/, "");
	return new URL(`${path === "" ? "/index" : path}.md`, targetUrl.origin);
}

function describeProblem(res: HttpResult): string {
	if (res.kind === "error") return `could not be fetched (${res.error})`;
	if (res.status !== 200) return `HTTP ${res.status}`;
	if (res.body.trim() === "") return "empty";
	return "served as HTML";
}

const ADVERTISE =
	'<link rel="alternate" type="text/markdown" href="…"> inside <head> (or the same rel and type in a Link header)';

/**
 * Passes for a markdown version an agent can discover: advertised by a link
 * tag or header, or served for `Accept: text/markdown`. One found only at the
 * `<page>.md` convention warns: nothing tells an agent it is there.
 */
export const markdownTwin: Check = {
	id: "markdown-twin",
	category: "ai-manifests",
	title: "Markdown version of the page",
	weight: 20,
	async run(ctx): Promise<CheckOutcome> {
		const details: string[] = [];
		const links = advertised(ctx);
		for (const url of links) {
			const res = await ctx.get(url.href);
			if (isTextResource(res)) {
				return {
					status: "pass",
					message: `Markdown version advertised at ${url.href}`,
				};
			}
			details.push(`${url.href}: ${describeProblem(res)}`);
		}

		const negotiated = await negotiatedMarkdown(ctx);
		if (negotiated.ok) {
			return {
				status: "pass",
				message: "Markdown version served for Accept: text/markdown",
			};
		}
		details.push(`Accept: text/markdown: ${negotiated.problem}`);

		const guess = conventional(ctx.targetUrl);
		if (!links.some((url) => url.href === guess.href)) {
			const res = await ctx.get(guess.href);
			if (isTextResource(res)) {
				return {
					status: "warn",
					message: `Markdown version at ${guess.href}, but the page does not advertise it`,
					details,
					remediation: `Advertise it with ${ADVERTISE.replace("…", guess.pathname)}.`,
				};
			}
			details.push(`${guess.href}: ${describeProblem(res)}`);
		}
		return {
			status: "fail",
			message: "No markdown version of this page found",
			details,
			remediation: `Serve a markdown version of the page (e.g. <page>.md) and advertise it with ${ADVERTISE}.`,
		};
	},
};
