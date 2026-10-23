import { type HttpResult, isTextResource } from "../http.ts";
import { isMarkdownAlternate, pageLinks, parseLinkHeader } from "../links.ts";
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

/** Ends the warn for a twin nothing points to; head.html fixes it with a link tag. */
export const UNADVERTISED = "but the page does not advertise it";
/** Ends the warn for a twin without a canonical Link header; a server setting fixes it. */
export const NO_CANONICAL =
	'but its response has no Link header with rel="canonical"';

/** A same-origin `Link: <page>; rel="canonical"` on the twin's response, pointing away from the twin. */
function pointsBack(res: HttpResult, twin: URL): boolean {
	if (res.kind !== "response") return false;
	return parseLinkHeader(res.headers.get("link"), twin).some(
		(link) =>
			link.rels.includes("canonical") &&
			link.href.origin === twin.origin &&
			link.href.href !== twin.href,
	);
}

/** Rough token count: about four characters per token for English text and markup. */
function tokens(text: string): number {
	return Math.round(text.length / 4);
}

function formatTokens(count: number): string {
	return count < 1000 ? String(count) : `${(count / 1000).toFixed(1)}k`;
}

/** "Markdown is 89% smaller than the HTML (about 1.4k vs 12.1k tokens)", when it is smaller. */
export function tokenSavings(html: string, markdown: string): string[] {
	const before = tokens(html);
	const after = tokens(markdown);
	if (before === 0 || after >= before) return [];
	const percent = Math.round((1 - after / before) * 100);
	return [
		`Markdown is ${percent}% smaller than the HTML (about ${formatTokens(after)} vs ${formatTokens(before)} tokens)`,
	];
}

/**
 * Passes for a markdown version an agent can discover: advertised by a link
 * tag or header, or served for `Accept: text/markdown`. One found only at the
 * `<page>.md` convention warns: nothing tells an agent it is there. A twin at
 * its own URL also needs `Link: <page>; rel="canonical"` on its response, or
 * search and agents take it for a duplicate page (warn); a negotiated answer
 * shares the page's URL and needs none.
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
			if (isTextResource(res) && res.kind === "response") {
				if (!pointsBack(res, url)) {
					return {
						status: "warn",
						message: `Markdown version advertised at ${url.href}, ${NO_CANONICAL}`,
						remediation: `Send Link: <${ctx.targetUrl.href}>; rel="canonical" with the markdown response, so it is not taken for a duplicate of the page.`,
					};
				}
				return {
					status: "pass",
					message: `Markdown version advertised at ${url.href}`,
					details: tokenSavings(ctx.page.body, res.body),
				};
			}
			details.push(`${url.href}: ${describeProblem(res)}`);
		}

		const negotiated = await negotiatedMarkdown(ctx);
		if (negotiated.ok) {
			return {
				status: "pass",
				message: "Markdown version served for Accept: text/markdown",
				details: tokenSavings(ctx.page.body, negotiated.body),
			};
		}
		details.push(`Accept: text/markdown: ${negotiated.problem}`);

		const guess = conventional(ctx.targetUrl);
		if (!links.some((url) => url.href === guess.href)) {
			const res = await ctx.get(guess.href);
			if (isTextResource(res)) {
				return {
					status: "warn",
					message: `Markdown version at ${guess.href}, ${UNADVERTISED}`,
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
